// 站点的规则（纯函数，不碰数据库）。
//
// 一个谷歌账号下有好几个网站，后台以前只认其中一个。「站点」= 一个网站 + 它在 Search Console 里的资源 +
// 它的 GA4 媒体资源（存在 google_projects 表里，那张表早就有，只是一直没有界面能往里加）。
// 广告是账户级的：几个站共用一个 Ads 账户，按系列区分 —— 所以同步广告是「每个账户一次」，不是「每个站一次」。
//
// 这里定三件事：一条站点记录合不合格、每天该同步哪些（站点 × 数据源）、补历史时一次取多少天。

// 询盘上的「公司」（询价通过哪家来的）和站点所属的公司是同一份名单：routes/inquiries.js 也从这里取
export const COMPANIES = ['贝孚特', '费尔瑞'];

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
const fail = (error, detail) => ({ ok: false, error, detail });

// 'https://www.Example.com/path' / 'sc-domain:example.com' / 'example.com' → 'example.com'；认不出来是 ''
export function normalizeDomain(raw) {
  let t = String(raw || '').trim().toLowerCase();
  if (!t) return '';
  t = t.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '');
  return DOMAIN_RE.test(t) ? t : '';
}

/* 一个网址是哪个站点的：主机名等于站点域名，或是它的子域名（www.、shop. …）。认不出来是 null。
   用在：表单线索的落地页 → 站点；手填来源的落地页 → 站点；任务 / 外链关联的页面 → 站点。 */
export function siteOfUrl(url, sites) {
  let host = '';
  try { host = new URL(String(url || '')).hostname.toLowerCase(); } catch (e) { return null; }
  if (!host) return null;
  // 域名长的先比：example.com 和 shop.example.com 都登记了的话，shop 下的网址归 shop 那个站
  const sorted = (sites || []).filter((s) => s.domain).sort((a, b) => b.domain.length - a.domain.length);
  return sorted.find((s) => host === s.domain || host.endsWith('.' + s.domain)) || null;
}

// Search Console 的资源只有两种写法：网域资源 sc-domain:example.com，或网址前缀资源 https://www.example.com/
function gscProperty(raw) {
  const t = String(raw || '').trim();
  if (!t) return '';
  if (/^sc-domain:/i.test(t)) { const d = normalizeDomain(t); return d ? 'sc-domain:' + d : null; }
  if (/^https?:\/\//i.test(t)) { return normalizeDomain(t) ? (t.endsWith('/') ? t : t + '/') : null; }
  return null;
}

/* 校验一条完整的站点记录。修改时由调用方先把「原来的值 + 这次传的值」合成一条再来校验 ——
   这样只改资源不改域名时，两者对不对得上照样会查。
   判断「传没传」用 `字段 in body`：传 null / 空串是「清空」，也是一次修改，不能当成没传。 */
export function validateSite(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('bad_site', '请求内容不合法');
  const out = {};
  const has = (k) => k in body;

  {
    const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
    if (!name) return fail('site_name_required', '站点要有个名字（比如「贝孚特-管件」）');
    if (name.length > 60) return fail('bad_site', '站点名字太长（最多 60 字）');
    out.name = name;
  }
  if (has('gsc_site_url')) {
    const p = gscProperty(body.gsc_site_url);
    if (p === null) return fail('bad_gsc_property', 'Search Console 资源要写成 sc-domain:example.com（网域资源）或 https://www.example.com/（网址前缀资源）');
    out.gsc_site_url = p;
  }
  if (has('ga4_property_id')) {
    const id = String(body.ga4_property_id ?? '').trim().replace(/^properties\//, '');
    if (id && !/^\d{5,15}$/.test(id)) return fail('bad_ga4_property', 'GA4 媒体资源编号是一串数字（在 GA4 的媒体资源列表里，名字下面那一行）');
    out.ga4_property_id = id;
  }
  if (has('ads_customer_id')) {
    const id = String(body.ads_customer_id ?? '').replace(/[-\s]/g, '');
    if (id && !/^\d{8,12}$/.test(id)) return fail('bad_ads_customer', 'Ads 客户编号是 10 位数字（可以带横线）');
    out.ads_customer_id = id;
  }
  {
    // 没单独填域名：从 Search Console 资源里取
    const domain = normalizeDomain(has('domain') && String(body.domain || '').trim() ? body.domain : (out.gsc_site_url || ''));
    if (!domain) return fail('bad_domain', '需要站点的域名（比如 example.com）。填了 Search Console 资源的话会自动带出');
    out.domain = domain;
  }
  if (has('company')) {
    if (body.company != null && body.company !== '' && !COMPANIES.includes(body.company)) return fail('bad_company', '公司只能是：' + COMPANIES.join(' / '));
    out.company = body.company || null;
  }
  if (has('is_default')) {
    if (typeof body.is_default !== 'boolean') return fail('bad_site', 'is_default 需要是 true / false');
    out.is_default = body.is_default;
  }
  // 资源和域名对不上，多半是选错了行：同步来的是别的站的数据，却记在这个站名下
  const effectiveGsc = 'gsc_site_url' in out ? out.gsc_site_url : null;
  if (effectiveGsc && out.domain && normalizeDomain(effectiveGsc) !== out.domain) {
    return fail('domain_mismatch', `域名（${out.domain}）和 Search Console 资源（${effectiveGsc}）不是同一个站`);
  }
  return { ok: true, value: out };
}

/* 每天要同步哪些。sites = 启用中的站点；一个站点都没登记时，沿用服务器配置里的那一个站（project_id 为 null）。
   GSC / GA4：每个配了对应资源的站点各一次。
   Ads：账户级 —— 同一个客户编号只同步一次（挑第一个带这个编号的站点当「名义上的发起者」）。 */
export function syncPlan(sites) {
  if (!sites || !sites.length) return ['gsc', 'ga4', 'ads'].map((provider) => ({ provider, project_id: null, label: '服务器配置的站点' }));
  const plan = [];
  for (const s of sites) {
    if (s.gsc_site_url) plan.push({ provider: 'gsc', project_id: s.id, label: s.name });
    if (s.ga4_property_id) plan.push({ provider: 'ga4', project_id: s.id, label: s.name });
  }
  const seen = new Set();
  for (const s of sites) {
    if (!s.ads_customer_id || seen.has(s.ads_customer_id)) continue;
    seen.add(s.ads_customer_id);
    plan.push({ provider: 'ads', project_id: s.id, label: 'Ads 账户 ' + s.ads_customer_id });
  }
  return plan;
}

export const BACKFILL_MAX_DAYS = 480;   // Search Console 最多留 16 个月
export const BACKFILL_CHUNK_DAYS = 30;

/* 补历史：把「最近 N 天」切成一段一段，从近到远。
   一次取太长，明细行数会撞上接口的单次上限；分段之后每一段都取得全，中途失败也只丢那一段。
   endDate = 最后一天（YYYY-MM-DD）。 */
export function backfillChunks(days, endDate, chunkDays = BACKFILL_CHUNK_DAYS) {
  const total = Math.max(1, Math.min(BACKFILL_MAX_DAYS, Math.floor(Number(days) || 0)));
  const iso = (d) => d.toISOString().slice(0, 10);
  const chunks = [];
  let end = new Date(endDate + 'T00:00:00Z');
  let left = total;
  while (left > 0) {
    const span = Math.min(chunkDays, left);
    const start = new Date(end.getTime() - (span - 1) * 86400000);
    chunks.push({ start_date: iso(start), end_date: iso(end) });
    end = new Date(start.getTime() - 86400000);
    left -= span;
  }
  return chunks;
}
