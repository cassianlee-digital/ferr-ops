// 外链存活核查。这是后台唯一一处「服务器按用户填的网址主动发请求」的代码，
// 测试的重心是 SSRF 防线：内网 / 回环 / 元数据地址一个都不能放过去，哪怕换一种写法。
// 其余测的是「在别人的页面里找我们的链接」这件事对各种烂 HTML 的容忍度，以及结论绝不改人工状态。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { MAX_BYTES, checkBacklink, checkTargetUrl, fetchPage, findBacklink, isPublicAddress, relKind, requestPinned } from '../src/services/linkCheck.js';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-linkcheck-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite'); // 必须在动态 import 之前：connection.js 在 import 期就开库

const { buildApp } = await import('../src/index.js');
const { db } = await import('../src/db/connection.js');
const { setPageFetcher } = await import('../src/routes/spend.js');
const app = await buildApp();
db.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, name, role) VALUES (1, 'lc-test', 'x', '测试', 'boss')").run();

test.after(async () => {
  setPageFetcher(null);
  await app.close();
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

const auth = { cookie: `ferr_token=${app.jwt.sign({ id: 1, username: 't', name: 't', role: 'seo' })}` };
const call = (method, url, payload) => app.inject({ method, url, headers: auth, payload });

/* ---------- SSRF 防线 ---------- */

test('地址判断：私网 / 回环 / 链路本地 / 各家云的元数据地址一律不算公网', () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.100.100.200',
    '0.0.0.0', '224.0.0.1', '255.255.255.255', '192.0.2.10', '198.51.100.7', '203.0.113.9', '198.18.0.1']) {
    assert.equal(isPublicAddress(ip), false, `${ip} 不该被当成公网`);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '192.0.78.9', '198.51.99.1', '203.0.112.1', '100.63.0.1', '100.128.0.1']) {
    assert.equal(isPublicAddress(ip), true, `${ip} 是正常的公网地址，不该被误拦`);
  }
});

test('地址判断：IPv6 的回环 / 私网 / 链路本地，以及「把私网 IPv4 包在 IPv6 里」的写法', () => {
  for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:169.254.169.254', '2001:db8::1', '2002:7f00:1::']) {
    assert.equal(isPublicAddress(ip), false, `${ip} 不该被当成公网`);
  }
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  assert.equal(isPublicAddress('::ffff:8.8.8.8'), true);
  assert.equal(isPublicAddress('not-an-ip'), false);
  assert.equal(isPublicAddress(''), false);
});

test('网址判断：只收 http(s)、只收默认端口、不带账号密码、不收内网 IP 字面量', () => {
  assert.equal(checkTargetUrl('https://example.com/a').ok, true);
  assert.equal(checkTargetUrl('http://example.com:80/a').ok, true);
  for (const bad of ['ftp://example.com/', 'file:///etc/passwd', 'javascript:alert(1)', 'gopher://example.com/', 'http://example.com:8080/',
    'https://example.com:22/', 'http://user:pass@example.com/', 'http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data/',
    'http://100.100.100.200/latest/meta-data/', 'http://10.0.0.1:80/', '不是网址', '']) {
    assert.equal(checkTargetUrl(bad).ok, false, `${bad} 不该被允许`);
  }
});

test('真去取一个本机地址：被拦在发请求之前（本机起一个真的服务，确认它一次请求都没收到）', async () => {
  let hits = 0;
  const server = http.createServer((_req, res) => { hits++; res.end('<a href="https://ferr.com/">x</a>'); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    await assert.rejects(fetchPage(`http://127.0.0.1:${port}/`), /默认端口|公网/);
    await assert.rejects(fetchPage('http://127.0.0.1/'), /公网/);
    await assert.rejects(fetchPage('http://localhost/'), /公网/, 'localhost 解析到回环地址，同样要拦');
    assert.equal(hits, 0, '防线必须在连接之前生效');
  } finally { server.close(); }
});

/* ---------- 取页面：对着本机起的服务验证（requestPinned 自己不校验地址，所以能连本机） ---------- */

async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = new URL(`http://127.0.0.1:${server.address().port}/`);
  try { return await run((ms) => requestPinned(url, { address: '127.0.0.1', family: 4 }, ms)); }
  finally { server.closeAllConnections(); server.close(); }
}

test('取页面：对方一点一点吐内容拖着不结束，到总时限就掐断（无响应超时管不到这种）', async () => {
  let timer;
  await withServer((_req, res) => { res.writeHead(200); timer = setInterval(() => res.write('x'), 30); }, async (get) => {
    const t0 = Date.now();
    await assert.rejects(get(300), { code: 'ETIMEDOUT' });
    assert.ok(Date.now() - t0 < 2000, `等了 ${Date.now() - t0}ms 才放手`);
  });
  clearInterval(timer);
});

test('取页面：对方不顾声明照样压缩了发回来，要解开再找；压缩炸弹按解压后的大小截断', async () => {
  const html = '<a href="https://ferr.com/valves" rel="nofollow">阀门</a>';
  await withServer((_req, res) => { res.writeHead(200, { 'Content-Encoding': 'gzip' }); res.end(zlib.gzipSync(html)); }, async (get) => {
    const page = await get(3000);
    assert.equal(findBacklink(page.body, 'https://b.example/', 'https://ferr.com/valves').anchor, '阀门');
  });
  // 20MB 的零压完只有 2 万字节上下：不设防的话一次核查就能吃掉 20MB 内存
  const bomb = zlib.gzipSync(Buffer.alloc(20_000_000));
  assert.ok(bomb.length < 100_000);
  await withServer((_req, res) => { res.writeHead(200, { 'Content-Encoding': 'gzip' }); res.end(bomb); }, async (get) => {
    const page = await get(5000);
    assert.equal(page.truncated, true);
    assert.ok(page.body.length <= MAX_BYTES);
  });
  await withServer((_req, res) => { res.writeHead(200, { 'Content-Encoding': 'gzip' }); res.end('不是压缩内容'); }, async (get) => {
    await assert.rejects(get(3000), { code: 'Z_DATA_ERROR' });
  });
  await withServer((_req, res) => { res.writeHead(200, { 'Content-Encoding': 'zstd' }); res.end('x'); }, async (get) => {
    await assert.rejects(get(3000), /读不了的压缩格式/);
  });
});

test('取页面：GBK 页面的锚文本不读成乱码（编码名在响应头或 <meta> 里都认）', async () => {
  // 「阀门」的 GBK 字节
  const gbk = (head) => Buffer.concat([Buffer.from(head + '<a href="https://ferr.com/valves">'), Buffer.from([0xb7, 0xa7, 0xc3, 0xc5]), Buffer.from('</a>')]);
  await withServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=GBK' }); res.end(gbk('')); }, async (get) => {
    assert.equal(findBacklink((await get(3000)).body, 'https://b.example/', 'https://ferr.com/valves').anchor, '阀门');
  });
  await withServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(gbk('<meta http-equiv="Content-Type" content="text/html; charset=gb2312">')); }, async (get) => {
    assert.equal(findBacklink((await get(3000)).body, 'https://b.example/', 'https://ferr.com/valves').anchor, '阀门');
  });
  // 编码名不认识：按 UTF-8 读，链接照样找得到
  await withServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=no-such-charset' }); res.end('<a href="https://ferr.com/valves">v</a>'); }, async (get) => {
    assert.equal(findBacklink((await get(3000)).body, 'https://b.example/', 'https://ferr.com/valves').found, true);
  });
});

/* ---------- 在页面里找链接 ---------- */

test('找链接：带不带 www、带不带尾斜杠都认；区分「正是登记的页面」和「只是指向了我们的站」', () => {
  const page = 'https://blog.example.com/post';
  const exact = findBacklink('<p>see <A HREF="https://www.ferr.com/valves/" rel="NoFollow sponsored">Gate <b>Valve</b>\n maker</A></p>', page, 'https://ferr.com/valves');
  assert.deepEqual(exact, { found: true, match: 'exact', rel: 'nofollow sponsored', anchor: 'Gate Valve maker', href: 'https://www.ferr.com/valves/' });
  const domain = findBacklink('<a href="https://ferr.com/about">about</a>', page, 'https://ferr.com/valves');
  assert.equal(domain.match, 'domain');
  // 同一页既有指向别的页面的、也有指向登记页面的：取登记的那条
  const both = findBacklink('<a href="https://ferr.com/">home</a><a href="https://ferr.com/valves">valves</a>', page, 'https://ferr.com/valves');
  assert.equal(both.match, 'exact');
  assert.equal(both.anchor, 'valves');
  assert.equal(findBacklink('<a href="https://other.com/valves">x</a>', page, 'https://ferr.com/valves').found, false);
  assert.equal(findBacklink('<a href="https://notferr.com/valves">x</a>', page, 'https://ferr.com/valves').found, false, '域名只是结尾相同不算');
});

test('找链接：相对链接、实体编码、单引号 / 无引号属性都能读；<abbr> <article> 不是 <a>', () => {
  assert.equal(findBacklink("<a href='/valves'>v</a>", 'https://ferr.com/blog/x', 'https://ferr.com/valves').match, 'exact');
  assert.equal(findBacklink('<a href=https://ferr.com/valves>v</a>', 'https://b.example/', 'https://ferr.com/valves').found, true);
  assert.equal(findBacklink('<a href="https://ferr.com/valves?a=1&amp;b=2">v</a>', 'https://b.example/', 'https://ferr.com/valves').match, 'exact');
  assert.equal(findBacklink('<abbr href="https://ferr.com/valves">v</abbr><article href="https://ferr.com/valves"></article>', 'https://b.example/', 'https://ferr.com/valves').found, false);
  assert.equal(findBacklink('<a name="top">no href</a><a href="mailto:x@ferr.com">mail</a>', 'https://b.example/', 'https://ferr.com/valves').found, false);
  assert.equal(findBacklink('', 'https://b.example/', 'https://ferr.com/valves').found, false);
  assert.equal(findBacklink('<a href="https://ferr.com/valves">x</a>', 'https://b.example/', 'not a url').found, false);
});

test('找链接：对方页面是不可信输入 —— 几万个没闭合的 <a 也要很快扫完', () => {
  const hostile = '<a href="https://x.example/">'.repeat(40000) + '<a href="https://ferr.com/valves">ok</a>';
  const t0 = Date.now();
  const hit = findBacklink(hostile, 'https://b.example/', 'https://ferr.com/valves');
  assert.equal(hit.found, true);
  assert.ok(Date.now() - t0 < 2000, `扫描用了 ${Date.now() - t0}ms，疑似退化成平方复杂度`);
});

test('找链接：另外两种会拖垮扫描的页面形状（修之前分别要 6.5 秒和 1 秒，期间整个后台不响应）', () => {
  const shapes = {
    '几万个 <a 后面只跟一个 >': '<a '.repeat(40000) + 'x'.repeat(1_300_000) + '>',
    '几万条指向本站其它页面、都不闭合的链接': '<a href="https://ferr.com/other">x '.repeat(20000),
  };
  for (const [name, html] of Object.entries(shapes)) {
    const t0 = Date.now();
    findBacklink(html, 'https://b.example/', 'https://ferr.com/valves');
    assert.ok(Date.now() - t0 < 500, `${name}：扫描用了 ${Date.now() - t0}ms`);
  }
});

test('找链接：data-rel / data-href 不是 rel / href（灯箱插件常写 data-rel="nofollow"）', () => {
  const page = 'https://b.example/'; const target = 'https://ferr.com/valves';
  const a = findBacklink('<a data-rel="nofollow" href="https://ferr.com/valves" rel="noopener">v</a>', page, target);
  assert.equal(relKind(a.rel), 'dofollow', '读成 nofollow 就会误报「属性与台账不符」');
  assert.equal(findBacklink('<a data-rel="lightbox" href="https://ferr.com/valves">v</a>', page, target).rel, '');
  assert.equal(findBacklink('<a data-href="https://other.com/" href="https://ferr.com/valves">v</a>', page, target).match, 'exact', '读成 data-href 就把真链接漏掉了');
  assert.equal(findBacklink('<a class="x"href="https://ferr.com/valves"rel="nofollow">v</a>', page, target).rel, 'nofollow', '属性之间没空格也要读得到');
});

test('rel → 台账的四种属性：没写就是 dofollow', () => {
  assert.equal(relKind(''), 'dofollow');
  assert.equal(relKind('noopener noreferrer'), 'dofollow');
  assert.equal(relKind('nofollow'), 'nofollow');
  assert.equal(relKind('nofollow ugc'), 'ugc');
  assert.equal(relKind('sponsored nofollow'), 'sponsored');
});

/* ---------- 核查结论 ---------- */

const row = { source_url: 'https://blog.example.com/post', target_url: 'https://ferr.com/valves', rel: 'dofollow' };
const page = (body, status = 200) => async () => ({ status, body, finalUrl: row.source_url, truncated: false });

test('核查结论：找到 / 没找到 / 没取到三种，后两种都明说「不等于失效」的原因', async () => {
  const found = await checkBacklink(row, page('<a href="https://ferr.com/valves">gate valve</a>'));
  assert.deepEqual(found, { auto_status: 'found', auto_detail: '链接在，指向登记的页面', auto_rel: 'dofollow', auto_anchor: 'gate valve' });

  const changed = await checkBacklink(row, page('<a href="https://ferr.com/valves" rel="nofollow">v</a>'));
  assert.equal(changed.auto_status, 'found');
  assert.match(changed.auto_detail, /属性与台账不一致.*dofollow.*nofollow/, '买的是 dofollow、页面上却是 nofollow —— 这正是要查出来的');

  const moved = await checkBacklink(row, page('<a href="https://ferr.com/">home</a>'));
  assert.match(moved.auto_detail, /不是登记的页面/);

  const missing = await checkBacklink(row, page('<p>no links here</p>'));
  assert.equal(missing.auto_status, 'not_found');
  assert.match(missing.auto_detail, /脚本加载/);

  const blocked = await checkBacklink(row, page('', 403));
  assert.equal(blocked.auto_status, 'unreachable');
  assert.match(blocked.auto_detail, /HTTP 403.*不代表外链没了/);

  const gone = await checkBacklink(row, page('', 404));
  assert.match(gone.auto_detail, /HTTP 404.*很可能已经失效/, '页面都没了，这和被拦截是两回事，要提示人去确认');
  const dns = await checkBacklink(row, async () => { throw Object.assign(new Error('getaddrinfo ENOTFOUND x.invalid'), { code: 'ENOTFOUND' }); });
  assert.equal(dns.auto_detail, '页面没取到：域名解析不到（域名可能已失效）', '系统原始报错要翻成人话');

  const down = await checkBacklink(row, async () => { throw new Error('请求超时'); });
  assert.deepEqual(down, { auto_status: 'unreachable', auto_detail: '页面没取到：请求超时', auto_rel: null, auto_anchor: null });

  const noTarget = await checkBacklink({ source_url: 'https://a.example/' }, page('x'));
  assert.equal(noTarget.auto_status, 'unreachable');
});

test('路由：结果写进 auto_* 列；找到才更新核查日；人工填的状态一个字都不动', async () => {
  const created = (await call('POST', '/api/backlinks', { source_url: row.source_url, target_url: row.target_url, rel: 'dofollow', status: '有效', checked_date: '2026-09-01' })).json().item;

  setPageFetcher(page('<p>nothing</p>'));
  const miss = (await call('POST', `/api/backlinks/${created.id}/check`, {})).json().item;
  assert.equal(miss.auto_status, 'not_found');
  assert.equal(miss.status, '有效', '自动核查没找到，不能替人把状态改成失效');
  assert.equal(miss.checked_date, '2026-09-01', '没确认它还在，就不更新核查日');
  assert.ok(miss.auto_checked_at);

  setPageFetcher(page('<a href="https://ferr.com/valves/" rel="sponsored">Gate Valve</a>'));
  const hit = (await call('POST', `/api/backlinks/${created.id}/check`, {})).json().item;
  assert.equal(hit.auto_status, 'found');
  assert.equal(hit.auto_rel, 'sponsored');
  assert.equal(hit.auto_anchor, 'Gate Valve');
  assert.notEqual(hit.checked_date, '2026-09-01');
  assert.match(hit.checked_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(hit.status, '有效');

  // 源地址是内网地址的台账行：走真实取页函数，被防线拦下，记成「没取到」而不是 500
  setPageFetcher(null);
  const inner = (await call('POST', '/api/backlinks', { source_url: 'http://169.254.169.254/latest/meta-data/', target_url: row.target_url })).json().item;
  const res = await call('POST', `/api/backlinks/${inner.id}/check`, {});
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().item.auto_status, 'unreachable');
  assert.match(res.json().item.auto_detail, /公网/);
  assert.equal((await call('POST', '/api/backlinks/999999/check', {})).statusCode, 404);
});
