// 外链存活核查：去外链所在的页面上看一眼，指向我们的那条链接还在不在、是什么属性。
//
// 这是后台里唯一一处「服务器按用户填的网址主动发请求」的代码，所以大半篇幅在防 SSRF ——
// 不设防的话，登录用户填一个内网地址（云厂商的元数据接口、本机的管理端口）就能让服务器替他去访问。
// 防线（每一条都有测试）：
//   1. 只允许 http / https，且只允许默认端口（80 / 443）—— 不给扫内网端口的机会；
//   2. 域名解析出的**每一个**地址都必须是公网地址，有一个不是就整个拒绝；
//   3. 连接时用的就是刚才校验过的那个地址（自定义 lookup），不给「校验时解析到公网、连接时解析到内网」的空子；
//   4. 跳转最多 3 次，每一跳重新过上面三条；
//   5. 8 秒无响应超时 + 16 秒总时限、1.5MB 上限（按解压后算）、不带任何 cookie；
//      页面内容不回给调用方，只回「找到 / 没找到」的结论。
//
// 结论只有三种，且第三种很常见：found 找到了 / not_found 页面拿到了但里面没有 / unreachable 页面没拿到。
// 很多站会拦掉非浏览器的请求，也有页面是用脚本后加载链接的 —— 所以 not_found 和 unreachable 都**不等于**外链失效，
// 这里绝不替人把状态改成「失效」，只记下自动核查看到了什么，由人判断。
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import zlib from 'node:zlib';

export const MAX_BYTES = 1_500_000;
export const TIMEOUT_MS = 8000;
export const MAX_REDIRECTS = 3;
const USER_AGENT = 'ferr-ops-linkcheck/1.0 (+internal backlink audit)';

/* ---------- 地址是否公网 ---------- */
function ipv4Public(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b, c] = p;
  if (a === 0 || a === 10 || a === 127) return false;            // 本网络 / 私网 / 回环
  if (a === 100 && b >= 64 && b <= 127) return false;            // 运营商级 NAT；阿里云的元数据地址 100.100.100.200 也在这段
  if (a === 169 && b === 254) return false;                      // 链路本地；AWS / GCP 的元数据地址 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return false;             // 私网
  if (a === 192 && b === 168) return false;                      // 私网
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // 192.0.0.0/24 协议保留、192.0.2.0/24 文档（只拦这两个 /24：192.0.x 里还有正常的公网托管）
  if (a === 198 && (b === 18 || b === 19)) return false;         // 基准测试
  if (a === 198 && b === 51 && c === 100) return false;          // 198.51.100.0/24 文档
  if (a === 203 && b === 0 && c === 113) return false;           // 203.0.113.0/24 文档
  if (a >= 224) return false;                                    // 组播 / 保留 / 广播
  return true;
}

export function isPublicAddress(ip) {
  const kind = net.isIP(String(ip || ''));
  if (kind === 4) return ipv4Public(ip);
  if (kind !== 6) return false;
  const lower = ip.toLowerCase();
  // IPv4 映射 / 兼容地址（::ffff:10.0.0.1）：按里面的 IPv4 判，否则私网地址换个写法就过了
  const mapped = lower.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Public(mapped[1]);
  const first = parseInt(lower.split(':')[0] || '0', 16);
  if (Number.isNaN(first)) return false;
  // 只放行全球单播 2000::/3；:: / ::1 / fc00::/7 私网 / fe80::/10 链路本地 / ff00::/8 组播 都不在这段里
  if ((first & 0xe000) !== 0x2000) return false;
  if (lower.startsWith('2001:db8:') || lower.startsWith('2001:0db8:')) return false; // 文档
  if (first === 0x2002) return false; // 6to4：里面包着一个 IPv4，不值得为它再写一套解析，直接不放行
  return true;
}

/* ---------- 网址是否允许去取 ---------- */
export function checkTargetUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch (e) { return { ok: false, reason: '不是合法网址' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: '只支持 http / https' };
  if (u.username || u.password) return { ok: false, reason: '网址里不能带账号密码' };
  if (u.port && !((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443'))) {
    return { ok: false, reason: '只支持默认端口' };
  }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && !isPublicAddress(host)) return { ok: false, reason: '不是公网地址' };
  return { ok: true, url: u };
}

// 解析域名并要求所有地址都是公网的；返回第一个地址（连接就用它）
async function resolvePublic(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) {
    if (!isPublicAddress(host)) throw Object.assign(new Error('不是公网地址'), { code: 'BLOCKED_ADDRESS' });
    return { address: host, family: net.isIP(host) };
  }
  const list = await dns.promises.lookup(host, { all: true });
  if (!list.length) throw Object.assign(new Error('域名解析不到地址'), { code: 'ENOTFOUND' });
  if (!list.every((a) => isPublicAddress(a.address))) throw Object.assign(new Error('域名解析到了非公网地址'), { code: 'BLOCKED_ADDRESS' });
  return list[0];
}

const timeoutError = () => Object.assign(new Error('请求超时'), { code: 'ETIMEDOUT' });

// 我们声明了只收不压缩的内容，但有的服务器照样压缩了再发。不解开的话整页是乱码，
// 会得出「没找到链接」这个错误结论。上限按解压后的字节数算（调用方在数），压缩炸弹撑不大。
function bodyStream(res) {
  const enc = String(res.headers['content-encoding'] || '').toLowerCase().trim();
  if (!enc || enc === 'identity') return res;
  const unzip = (enc === 'gzip' || enc === 'x-gzip') ? zlib.createGunzip()
    : enc === 'deflate' ? zlib.createInflate()
    : enc === 'br' ? zlib.createBrotliDecompress() : null;
  if (!unzip) throw Object.assign(new Error('对方返回了读不了的压缩格式（' + enc.slice(0, 20) + '）'), { code: 'UNSUPPORTED_ENCODING' });
  return res.pipe(unzip);
}

// 链接本身是 ASCII，按什么编码读都找得到；但锚文本会记进台账，GBK 页面按 UTF-8 读出来是乱码。
// 编码名先看响应头，没有再看页面开头的 <meta>；不认识的名字按 UTF-8 读。
function decodeBody(buf, contentType) {
  const named = /charset\s*=\s*["']?([\w-]+)/i.exec(String(contentType || ''))
    || /<meta[^>]{0,200}charset\s*=\s*["']?([\w-]+)/i.exec(buf.subarray(0, 2048).toString('latin1'));
  if (named && !/^utf-?8$/i.test(named[1])) {
    try { return new TextDecoder(named[1]).decode(buf); } catch (e) { /* 不认识的编码名 */ }
  }
  return buf.toString('utf8');
}

/* 发一次请求，连接固定用 pinned 这个地址。**它自己不校验地址** —— 业务代码一律走 fetchPage，
   导出只为让测试能对着本机起的服务验证超时 / 解压 / 截断。 */
export function requestPinned(url, pinned, msLeft = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    let out = null; // 响应体的流（可能套了一层解压），超时要一并掐掉
    const done = (fn, v) => { clearTimeout(hard); fn(v); };
    const req = lib.request(url, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity' },
      // 关键：连接用的就是校验过的地址，不再重新解析
      lookup: (_host, opts, cb) => (opts && opts.all ? cb(null, [pinned]) : cb(null, pinned.address, pinned.family)),
      timeout: TIMEOUT_MS,
    }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) { res.resume(); done(resolve, { status, location: res.headers.location }); return; }
      try { out = bodyStream(res); } catch (e) { res.destroy(); done(reject, e); return; }
      const chunks = []; let size = 0;
      const finish = (truncated) => done(resolve, { status, body: decodeBody(Buffer.concat(chunks), res.headers['content-type']), truncated });
      out.on('data', (c) => {
        size += c.length;
        if (size > MAX_BYTES) { res.destroy(); out.destroy(); finish(true); return; }
        chunks.push(c);
      });
      out.on('end', () => finish(false));
      out.on('error', (e) => done(reject, e));
      if (out !== res) res.on('error', (e) => done(reject, e));
    });
    // 总时限。上面的 timeout 只管「多久没动静」：对方每隔几秒吐一个字节，它永远不会触发，连接就一直挂着
    const hard = setTimeout(() => { done(reject, timeoutError()); req.destroy(); if (out) out.destroy(); }, Math.max(1, msLeft));
    req.on('timeout', () => req.destroy(timeoutError()));
    req.on('error', (e) => done(reject, e));
    req.end();
  });
}

/* 取一个页面。返回 { status, body, finalUrl }；任何一步不合规就抛错（message 是给人看的原因）。 */
export async function fetchPage(rawUrl) {
  let current = rawUrl;
  const deadline = Date.now() + TIMEOUT_MS * 2;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const checked = checkTargetUrl(current);
    if (!checked.ok) throw Object.assign(new Error(checked.reason), { code: 'BLOCKED_URL' });
    if (Date.now() > deadline) throw timeoutError();
    // 域名解析走系统解析器，卡住时不归上面的时限管，单独给它套一个
    let timer;
    const pinned = await Promise.race([
      resolvePublic(checked.url.hostname),
      new Promise((_, reject) => { timer = setTimeout(() => reject(timeoutError()), TIMEOUT_MS); }),
    ]).finally(() => clearTimeout(timer));
    const res = await requestPinned(checked.url, pinned, deadline - Date.now());
    if (res.location == null) return { status: res.status, body: res.body, finalUrl: checked.url.href, truncated: res.truncated };
    current = new URL(res.location, checked.url).href; // 相对跳转；下一轮循环重新校验
  }
  throw Object.assign(new Error('跳转次数过多'), { code: 'TOO_MANY_REDIRECTS' });
}

/* ---------- 在页面里找指向我们的链接（纯函数） ---------- */
const hostKey = (h) => String(h || '').toLowerCase().replace(/^www\./, '');
const pathKey = (p) => { const s = String(p || '/'); return s.length > 1 && s.endsWith('/') ? s.slice(0, -1) : s; };
// 属性名前面必须是空白或上一个属性的收尾引号。只写 \b 的话 data-rel="nofollow"（灯箱插件常这么写）会被读成 rel，
// data-href 会被读成 href —— 前者误报「属性与台账不符」，后者把真链接漏掉。
const attrRe = (name) => new RegExp('[\\s"\']' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i');
const HREF = attrRe('href'); const REL = attrRe('rel');
function attr(tag, re) {
  const m = tag.match(re);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}
const MAX_TAG = 4096; // 正常的 <a …> 远小于这个数；超过的不看（见 findBacklink 的说明）
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#x2f;/gi, '/').replace(/&#47;/g, '/').replace(/&quot;/g, '"');
const stripTags = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/* 逐个 <a> 扫描，线性时间。不用「<a…>…</a>」这种正则：对方页面是不可信输入，
   一堆没闭合的 <a 会让惰性匹配退化成平方复杂度，等于让别人的网页拖垮我们的服务
   （这个函数是同步的，卡住的是整个后台，不只是这一次请求）。
   手写扫描同样要防两处：① 下一个「>」的位置记下来复用，否则几万个 <a 后面只跟一个 > 时每次都要重扫到底；
   ② 「指向了我们的站但不是登记页面」的链接只取第一条的锚文本，否则每条都要去找一次 </a。
   返回 { found, match: 'exact' | 'domain', rel, anchor, href }：
     exact  = 链接指向的正是台账里登记的那个页面
     domain = 指向了我们的站，但不是登记的那个页面（值得知道：可能对方改了链接） */
export function findBacklink(html, pageUrl, targetUrl) {
  let target;
  try { target = new URL(targetUrl); } catch (e) { return { found: false }; }
  const wantHost = hostKey(target.hostname); const wantPath = pathKey(target.pathname);
  const lower = html.toLowerCase();
  let best = null;
  let tagEnd = -1;
  for (let i = lower.indexOf('<a'); i !== -1; i = lower.indexOf('<a', i + 2)) {
    const next = lower.charCodeAt(i + 2);
    if (!(next === 32 || next === 9 || next === 10 || next === 13)) continue; // <abbr>、<article> 不是 <a>
    if (tagEnd < i) tagEnd = lower.indexOf('>', i);
    if (tagEnd === -1) break;
    if (tagEnd - i > MAX_TAG) continue;
    const tag = html.slice(i, tagEnd + 1);
    const hrefRaw = attr(tag, HREF);
    if (!hrefRaw) continue;
    let href;
    try { href = new URL(decode(hrefRaw.trim()), pageUrl); } catch (e) { continue; }
    if (hostKey(href.hostname) !== wantHost) continue;
    const match = pathKey(href.pathname) === wantPath ? 'exact' : 'domain';
    if (match === 'domain' && best) continue;
    const close = lower.indexOf('</a', tagEnd);
    const anchor = stripTags(html.slice(tagEnd + 1, close === -1 ? tagEnd + 1 : Math.min(close, tagEnd + 1 + 2000))).slice(0, 200);
    const hit = { found: true, match, rel: (attr(tag, REL) || '').toLowerCase().trim(), anchor, href: href.href };
    if (match === 'exact') return hit;
    best = hit;
  }
  return best || { found: false };
}

// 页面上的 rel → 台账里的四种属性。没写 rel 就是 dofollow。
export function relKind(rel) {
  const r = String(rel || '');
  if (/\bsponsored\b/.test(r)) return 'sponsored';
  if (/\bugc\b/.test(r)) return 'ugc';
  if (/\bnofollow\b/.test(r)) return 'nofollow';
  return 'dofollow';
}

// 网络层的错误码 → 给人看的话。系统原始报错（getaddrinfo ENOTFOUND …）对运营没有意义。
const FAILURE_TEXT = {
  ENOTFOUND: '域名解析不到（域名可能已失效）', EAI_AGAIN: '域名解析超时，稍后再试', ECONNREFUSED: '对方服务器拒绝连接',
  ECONNRESET: '连接被对方中断', ETIMEDOUT: '请求超时', EHOSTUNREACH: '对方服务器不可达', ENETUNREACH: '网络不可达',
  CERT_HAS_EXPIRED: '对方站点的证书已过期', DEPTH_ZERO_SELF_SIGNED_CERT: '对方站点用的是自签证书',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: '对方站点的证书无法验证', ERR_TLS_CERT_ALTNAME_INVALID: '对方站点的证书与域名不符',
  Z_DATA_ERROR: '对方返回的压缩内容解不开', Z_BUF_ERROR: '对方返回的压缩内容不完整',
};
const fetchFailure = (e) => FAILURE_TEXT[e && e.code] || (e && e.message) || '请求失败';
// 状态码的含义：403 / 429 多半是对方拦了非浏览器请求，不代表外链没了；404 / 410 则是页面本身没了
const STATUS_HINT = {
  403: '（多半是对方拦了自动访问，不代表外链没了）', 429: '（对方限制了访问频率，不代表外链没了）',
  404: '（页面不存在了，外链很可能已经失效，请人工确认）', 410: '（页面已被对方删除，外链很可能已经失效，请人工确认）',
};

/* 核查一条外链。fetcher 可注入（测试不走真实网络）。返回要写回台账的字段，不抛错 ——
   拿不到页面本身就是一种核查结果。 */
export async function checkBacklink(row, fetcher = fetchPage) {
  if (!row.target_url) return { auto_status: 'unreachable', auto_detail: '没有填「指向我们的哪个页面」，不知道该找哪条链接', auto_rel: null, auto_anchor: null };
  let page;
  try {
    page = await fetcher(row.source_url);
  } catch (e) {
    return { auto_status: 'unreachable', auto_detail: '页面没取到：' + fetchFailure(e), auto_rel: null, auto_anchor: null };
  }
  if (page.status < 200 || page.status >= 300) {
    // 403 / 429 多半是对方拦了非浏览器请求，不代表页面或外链没了
    return { auto_status: 'unreachable', auto_detail: '页面返回 HTTP ' + page.status + (STATUS_HINT[page.status] || ''), auto_rel: null, auto_anchor: null };
  }
  const hit = findBacklink(page.body || '', page.finalUrl || row.source_url, row.target_url);
  if (!hit.found) {
    return { auto_status: 'not_found', auto_detail: '页面取到了，但源码里没有指向我们的链接（如果对方用脚本加载链接，这里看不到）' + (page.truncated ? '；页面过大只看了前一部分' : ''), auto_rel: null, auto_anchor: null };
  }
  const kind = relKind(hit.rel);
  const notes = [hit.match === 'exact' ? '链接在，指向登记的页面' : '链接在，但指向的是 ' + hit.href + '，不是登记的页面'];
  if (row.rel && row.rel !== kind) notes.push('属性与台账不一致：台账记的是 ' + row.rel + '，页面上是 ' + kind);
  return { auto_status: 'found', auto_detail: notes.join('；'), auto_rel: kind, auto_anchor: hit.anchor || null };
}
