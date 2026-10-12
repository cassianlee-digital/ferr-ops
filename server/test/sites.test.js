// 多站点：一个谷歌账号下的几个网站各是一个「站点」。要守住的是：加站点不会让看板悄悄换成别的站的数据；
// 每个站点都真的被同步；同一份数据不会记在两个站点名下；补历史取得全。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKFILL_MAX_DAYS, backfillChunks, normalizeDomain, syncPlan, validateSite } from '../src/services/sites.js';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-sites-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite'); // 必须在动态 import 之前：connection.js 在 import 期就开库
process.env.SETTINGS_SECRET = 'test-settings-secret-for-sites';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'FAKE_CLIENT_SECRET';
process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost/google/callback';
// 服务器配置里原本在用的那一个站
process.env.GSC_SITE_URL = 'sc-domain:ferrcasting.com';
process.env.GA4_PROPERTY_ID = '435505484';
process.env.GOOGLE_ADS_CUSTOMER_ID = '123-456-7890';
process.env.SYNC_AUTO = 'false';

const { buildApp } = await import('../src/index.js');
const { db } = await import('../src/db/connection.js');
const repo = await import('../src/db/repositories/googleSync.js');
const { syncAllSites, staleTargets, syncSite } = await import('../src/sync/syncSites.js');
const { syncGsc } = await import('../src/sync/gsc.js');
const app = await buildApp();
for (const provider of ['gsc', 'ga4']) {
  repo.saveToken(provider, { access_token: 'FAKE_ACCESS_TOKEN', refresh_token: 'FAKE_REFRESH_TOKEN', expiry_date_ms: Date.now() + 3_600_000 });
}

test.after(async () => { await app.close(); db.close(); rmSync(tmpDir, { recursive: true, force: true }); });

const as = (role) => ({ cookie: `ferr_token=${app.jwt.sign({ id: 1, username: 't', name: 't', role })}` });
const call = (role, method, url, payload) => app.inject({ method, url, headers: as(role), payload });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
async function withFetch(fake, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = fake;
  try { return await fn(); } finally { globalThis.fetch = original; }
}

test('规则：域名归一、资源写法、域名和资源要是同一个站', () => {
  assert.equal(normalizeDomain('https://www.BestFlowFitting.com/products?x=1'), 'bestflowfitting.com');
  assert.equal(normalizeDomain('sc-domain:ferrcasting.com'), 'ferrcasting.com');
  assert.equal(normalizeDomain('不是域名'), '');
  const ok = validateSite({ name: ' 贝孚特-管件 ', gsc_site_url: 'sc-domain:BestFlowFitting.com', ga4_property_id: 'properties/508026067', company: '贝孚特' });
  assert.deepEqual(ok.value, { name: '贝孚特-管件', gsc_site_url: 'sc-domain:bestflowfitting.com', ga4_property_id: '508026067', domain: 'bestflowfitting.com', company: '贝孚特' });
  assert.equal(validateSite({ name: 'x', gsc_site_url: 'https://www.ferrcasting.com' }).value.gsc_site_url, 'https://www.ferrcasting.com/', '网址前缀资源以 / 结尾，和 Search Console 里的写法一致');
  assert.equal(validateSite({ gsc_site_url: 'sc-domain:a.com' }).error, 'site_name_required');
  assert.equal(validateSite({ name: 'x', gsc_site_url: 'bestflowfitting.com' }).error, 'bad_gsc_property', '光写域名不是合法的资源写法');
  assert.equal(validateSite({ name: 'x', domain: 'a.com', ga4_property_id: 'G-ABC123' }).error, 'bad_ga4_property', '填成了衡量 ID');
  assert.equal(validateSite({ name: 'x', domain: 'a.com', company: '别家' }).error, 'bad_company');
  assert.equal(validateSite({ name: 'x' }).error, 'bad_domain', '既没有资源也没有域名，认不出是哪个站');
  assert.equal(validateSite({ name: 'x', domain: 'ferrcasting.com', gsc_site_url: 'sc-domain:bestflowvalve.com' }).error, 'domain_mismatch', '选错了行：数据会记到别的站名下');
});

test('每天同步哪些：GSC / GA4 每个站各一次，Ads 同一个账户只一次；没登记站点时沿用服务器配置的那一个', () => {
  assert.deepEqual(syncPlan([]).map((t) => [t.provider, t.project_id]), [['gsc', null], ['ga4', null], ['ads', null]]);
  const plan = syncPlan([
    { id: 1, name: 'A', gsc_site_url: 'sc-domain:a.com', ga4_property_id: '11111', ads_customer_id: '1234567890' },
    { id: 2, name: 'B', gsc_site_url: 'sc-domain:b.com', ga4_property_id: '', ads_customer_id: '1234567890' },
    { id: 3, name: 'C', gsc_site_url: '', ga4_property_id: '33333', ads_customer_id: '9999999999' },
  ]);
  assert.deepEqual(plan.map((t) => [t.provider, t.project_id]), [['gsc', 1], ['ga4', 1], ['gsc', 2], ['ga4', 3], ['ads', 1], ['ads', 3]]);
});

test('补历史分段：首尾相接、不重不漏、从近到远，天数有上限', () => {
  const chunks = backfillChunks(75, '2026-10-10');
  assert.deepEqual(chunks, [
    { start_date: '2026-09-11', end_date: '2026-10-10' },
    { start_date: '2026-08-12', end_date: '2026-09-10' },
    { start_date: '2026-07-28', end_date: '2026-08-11' },
  ]);
  const days = chunks.reduce((n, c) => n + (Date.parse(c.end_date) - Date.parse(c.start_date)) / 86400000 + 1, 0);
  assert.equal(days, 75);
  assert.equal(backfillChunks(99999, '2026-10-10').length, Math.ceil(BACKFILL_MAX_DAYS / 30));
  assert.deepEqual(backfillChunks(1, '2026-10-10'), [{ start_date: '2026-10-10', end_date: '2026-10-10' }]);
});

test('第一次加站点：原来在用的那个站先登记成默认站点 —— 看板不会一声不响换成新站的数据', async () => {
  // 登记站点之前留下的同步记录
  db.prepare("INSERT INTO google_sync_runs (provider, project_id, status, finished_at, rows_written) VALUES ('gsc', NULL, 'success', datetime('now'), 42)").run();
  const before = (await call('seo', 'GET', '/api/google/projects')).json();
  assert.deepEqual(before.sites, []);
  assert.equal(before.env_site.gsc_site_url, 'sc-domain:ferrcasting.com', '没登记站点时，界面看得见后台实际在用的是哪个站');
  assert.deepEqual(before.companies, ['贝孚特', '费尔瑞']);

  const body = { name: '贝孚特-管件', gsc_site_url: 'sc-domain:bestflowfitting.com', ga4_property_id: '508026067', company: '贝孚特' };
  assert.equal((await call('seo', 'POST', '/api/google/projects', body)).statusCode, 403, '加站点只认经理 / 老板');
  const made = await call('manager', 'POST', '/api/google/projects', body);
  assert.equal(made.statusCode, 201);
  assert.equal(made.json().project.is_default, false);
  assert.equal(made.json().project.ads_customer_id, '1234567890', '广告是账户级的：没单独填就沿用现在的账户');

  const after = (await call('seo', 'GET', '/api/google/projects')).json();
  assert.deepEqual(after.sites.map((s) => [s.domain, s.is_default]), [['ferrcasting.com', true], ['bestflowfitting.com', false]]);
  assert.equal(after.defaultProject.gsc_site_url, 'sc-domain:ferrcasting.com');
  assert.equal(after.env_site, null);
  assert.equal(after.sites[0].runs.gsc.rows_written, 42, '原来的同步记录归到原来那个站名下，不会显示成「没同步过」');
  assert.equal(after.sites[1].runs.gsc, null, '新站点还没同步过就是空，不借别的站的');
});

test('同一份数据不能记在两个站点上；改默认站点、停用都有规矩', async () => {
  const sites = (await call('boss', 'GET', '/api/google/projects')).json().sites;
  const [casting, fitting] = sites;
  for (const dup of [
    { name: 'x', gsc_site_url: 'sc-domain:bestflowfitting.com' },
    { name: 'x', domain: 'ferrcasting.com' },
    { name: 'x', domain: 'other.com', ga4_property_id: '508026067' },
  ]) {
    const r = await call('boss', 'POST', '/api/google/projects', dup);
    assert.equal(r.statusCode, 409, JSON.stringify(dup));
    assert.match(r.json().detail, /已经登记在站点/);
  }
  const power = (await call('boss', 'POST', '/api/google/projects', { name: 'FERR-电力', gsc_site_url: 'sc-domain:ferrpowerfittings.com', ga4_property_id: '508207124', company: '费尔瑞' })).json().project;

  // 改一个字段，别的不动；清空也是改
  const cleared = await call('boss', 'PATCH', `/api/google/projects/${power.id}`, { ga4_property_id: '' });
  assert.equal(cleared.json().project.ga4_property_id, '');
  assert.equal(cleared.json().project.gsc_site_url, 'sc-domain:ferrpowerfittings.com');
  // 只换资源不换域名：两者对不上，拒绝
  assert.equal((await call('boss', 'PATCH', `/api/google/projects/${power.id}`, { gsc_site_url: 'sc-domain:bestflowvalve.com' })).json().error, 'domain_mismatch');
  assert.equal((await call('boss', 'PATCH', `/api/google/projects/${power.id}`, { gsc_site_url: 'sc-domain:ferrcasting.com', domain: 'ferrcasting.com' })).statusCode, 409);
  assert.equal((await call('seo', 'PATCH', `/api/google/projects/${power.id}`, { name: 'y' })).statusCode, 403);

  // 默认站点：不能直接取消、不能直接停用（否则「默认」会悄悄落到别的站上）
  assert.equal((await call('boss', 'PATCH', `/api/google/projects/${casting.id}`, { is_default: false })).json().error, 'default_site');
  assert.equal((await call('boss', 'DELETE', `/api/google/projects/${casting.id}`)).statusCode, 409);
  // 把另一个设为默认：原来那个自动让位
  await call('boss', 'PATCH', `/api/google/projects/${fitting.id}`, { is_default: true });
  let now = (await call('boss', 'GET', '/api/google/projects')).json();
  assert.deepEqual(now.sites.filter((s) => s.is_default).map((s) => s.domain), ['bestflowfitting.com']);
  await call('boss', 'PATCH', `/api/google/projects/${casting.id}`, { is_default: true });
  // 停用非默认的：从列表里消失，数据不动
  assert.equal((await call('boss', 'DELETE', `/api/google/projects/${power.id}`)).statusCode, 200);
  now = (await call('boss', 'GET', '/api/google/projects')).json();
  assert.deepEqual(now.sites.map((s) => s.domain), ['ferrcasting.com', 'bestflowfitting.com']);
  assert.equal((await call('boss', 'DELETE', '/api/google/projects/99999')).statusCode, 404);
});

test('自动同步：每个站点都同步到；一项失败不拖累别的；没授权的数据源跳过', async () => {
  const calls = [];
  const fake = (provider) => async (input) => {
    calls.push([provider, input.project_id ?? null]);
    if (provider === 'ga4' && input.project_id === 2) throw new Error('quota exceeded');
    return { rowsWritten: 5 };
  };
  const results = await syncAllSites({ syncers: { gsc: fake('gsc'), ga4: fake('ga4'), ads: fake('ads') } });
  assert.deepEqual(calls, [['gsc', 1], ['ga4', 1], ['gsc', 2], ['ga4', 2]], '两个站的 GSC 和 GA4 都跑了；Ads 没授权，不跑');
  assert.deepEqual(results.map((r) => [r.provider, r.project_id, r.status]), [
    ['gsc', 1, 'ok'], ['ga4', 1, 'ok'], ['gsc', 2, 'ok'], ['ga4', 2, 'failed'], ['ads', 1, 'skipped'],
  ]);
  assert.equal(results[3].detail, 'quota exceeded');
});

test('新鲜度按站点各看各的：一个站刚同步过，不能替另一个站「显得新鲜」', () => {
  db.prepare('DELETE FROM google_sync_runs').run();
  const ok = db.prepare("INSERT INTO google_sync_runs (provider, project_id, status, finished_at) VALUES (?, ?, 'success', datetime('now'))");
  ok.run('gsc', 1); ok.run('ga4', 1);
  assert.deepEqual(staleTargets().map((t) => [t.provider, t.project_id]), [['gsc', 2], ['ga4', 2]]);
  ok.run('gsc', 2); ok.run('ga4', 2);
  assert.deepEqual(staleTargets(), []);
  // 最近一次是失败的：仍然算不新鲜
  db.prepare("INSERT INTO google_sync_runs (provider, project_id, status, started_at, finished_at) VALUES ('gsc', 2, 'failed', datetime('now', '+1 minute'), datetime('now', '+1 minute'))").run();
  assert.deepEqual(staleTargets().map((t) => [t.provider, t.project_id]), [['gsc', 2]]);
});

test('GSC 明细翻页取全：以前只取第一页，区间一长后面的行就悄悄没了', async () => {
  const starts = [];
  const page = (n, offset) => Array.from({ length: n }, (_, i) => ({ keys: ['2026-09-01', 'q' + (offset + i), 'https://bestflowfitting.com/p'], clicks: 1, impressions: 10, ctr: 0.1, position: 5 }));
  const result = await withFetch(async (url, init) => {
    assert.match(String(url), /sites\/sc-domain%3Abestflowfitting\.com\/searchAnalytics/, '取的是这个站点自己的资源');
    const body = JSON.parse(init.body);
    if (body.dimensions.length === 1) return json({ rows: [{ keys: ['2026-09-01'], clicks: 25010, impressions: 250100, ctr: 0.1, position: 5 }] });
    starts.push(body.startRow);
    return json({ rows: body.startRow === 0 ? page(25000, 0) : page(10, 25000) });
  }, () => syncGsc({ project_id: 2, start_date: '2026-09-01', end_date: '2026-09-01' }));
  assert.deepEqual(starts, [0, 25000]);
  assert.equal(result.truncated, false);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM gsc_query_daily WHERE site_url = 'sc-domain:bestflowfitting.com'").get().n, 25010);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM gsc_query_daily WHERE site_url = 'sc-domain:ferrcasting.com'").get().n, 0, '没有记到别的站名下');
});

test('给一个站点补历史：分段取，逐段落库；某一段失败就停在那里并说明；天数不合法直接拒绝', async () => {
  const ranges = { gsc: [], ga4: [] };
  const r = await withFetch(async (url, init) => {
    const body = JSON.parse(init.body);
    if (String(url).includes('searchconsole')) {
      if (body.dimensions.length === 1) ranges.gsc.push([body.startDate, body.endDate]);
      return json({ rows: [] });
    }
    if (body.dimensions.length === 1) ranges.ga4.push([body.dateRanges[0].startDate, body.dateRanges[0].endDate]);
    // GA4 第二段开始失败
    if (ranges.ga4.length >= 2) return json({ error: { message: 'Quota exhausted' } }, 429);
    return json({ rows: [] });
  }, () => call('seo', 'POST', '/api/google/projects/2/sync', { days: 75 }));
  assert.equal(r.statusCode, 200);
  const [gsc, ga4] = r.json().results;
  assert.deepEqual([gsc.provider, gsc.status, gsc.chunks, gsc.chunks_done], ['gsc', 'ok', 3, 3]);
  assert.equal(ranges.gsc.length, 3);
  assert.ok(ranges.gsc[0][0] > ranges.gsc[1][0], '从近到远');
  assert.deepEqual([ga4.provider, ga4.status, ga4.chunks, ga4.chunks_done, ga4.error], ['ga4', 'failed', 3, 1, 'Quota exhausted']);

  assert.equal((await call('seo', 'POST', '/api/google/projects/99999/sync', {})).statusCode, 404);
  for (const days of [0, 1.5, 'abc', BACKFILL_MAX_DAYS + 1]) {
    assert.equal((await call('seo', 'POST', '/api/google/projects/2/sync', { days })).statusCode, 400, String(days));
  }
  // 这个接口每分钟最多 6 次（补历史一次要打很多次谷歌接口）：上面正好 6 次，第 7 次被挡下
  assert.equal((await call('seo', 'POST', '/api/google/projects/2/sync', { days: 0 })).statusCode, 429);
});

test('同步失败的原因要给人看得懂的话，不是内部代号', async () => {
  const site = { id: 2, gsc_site_url: 'sc-domain:bestflowfitting.com', ga4_property_id: '' };
  const missing = Object.assign(new Error('google_config_missing'), { missing: ['GOOGLE_OAUTH_CLIENT_ID'] });
  const [gsc, ga4] = await syncSite(site, { syncers: { gsc: async () => { throw missing; } } });
  assert.match(gsc.error, /还没配好.*GOOGLE_OAUTH_CLIENT_ID/);
  assert.equal(ga4.status, 'not_configured', '这个站没有 GA4 媒体资源：不是失败，是没配');
  const [unauth] = await syncSite(site, { syncers: { gsc: async () => { throw new Error('google_not_authorized'); } } });
  assert.match(unauth.error, /还没有授权/);
});

test('从账号里列出能选的资源：两个来源互不拖累，失败的那个带原因；已经被用了的标出来', async () => {
  const r = await withFetch(async (url) => {
    if (String(url).includes('webmasters/v3/sites')) {
      return json({ siteEntry: [
        { siteUrl: 'sc-domain:ferrpowerfittings.com', permissionLevel: 'siteOwner' },
        { siteUrl: 'sc-domain:bestflowfitting.com', permissionLevel: 'siteOwner' },
        { siteUrl: 'https://www.someoneelse.com/', permissionLevel: 'siteUnverifiedUser' },
      ] });
    }
    return json({ error: { message: 'Google Analytics Admin API has not been used in project 123 before or it is disabled.' } }, 403);
  }, () => call('manager', 'GET', '/api/google/discover'));
  const found = r.json();
  assert.deepEqual(found.gsc.items.map((i) => [i.site_url, i.domain, i.used_by]), [
    ['sc-domain:bestflowfitting.com', 'bestflowfitting.com', '贝孚特-管件'],
    ['sc-domain:ferrpowerfittings.com', 'ferrpowerfittings.com', null],
  ], '没验证所有权的取不到数据，不列');
  assert.equal(found.gsc.error, null);
  assert.deepEqual(found.ga4.items, []);
  assert.match(found.ga4.error, /Admin API/, '接口没开通：把谷歌给的原因原样带回，界面上照样可以手填编号');
  assert.equal((await call('seo', 'GET', '/api/google/discover')).statusCode, 403);
});
