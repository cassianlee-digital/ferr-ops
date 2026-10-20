// 按站点看「花了多少广告费、带来几条询盘」。要守住的是：花费只按人指定的归属落到站点，
// 没归属的、没标站点的都单列出来，不摊、不猜；算不出的成本是「算不出」，不是 0 也不是无穷大。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeSiteReturns } from '../src/services/siteReturns.js';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-site-returns-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite'); // 必须在动态 import 之前：connection.js 在 import 期就开库
process.env.INQUIRY_INTAKE_SECRET = 'FAKE_INTAKE_SECRET_0123456789abcdef';
process.env.SYNC_AUTO = 'false';

const { buildApp } = await import('../src/index.js');
const { db } = await import('../src/db/connection.js');
const googleRepo = await import('../src/db/repositories/googleSync.js');
const app = await buildApp();
db.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, name, role) VALUES (1, 'sret-test', 'x', '测试', 'boss')").run();

test.after(async () => { await app.close(); db.close(); rmSync(tmpDir, { recursive: true, force: true }); });

const as = (role) => ({ cookie: `ferr_token=${app.jwt.sign({ id: 1, username: 't', name: 't', role })}` });
const call = (role, method, url, payload) => app.inject({ method, url, headers: as(role), payload });

test('规则：花费按归属落到站点；没归属的系列、没标站点的询盘单列；算不出的成本带原因', () => {
  const r = computeSiteReturns({
    sites: [{ id: 1, name: '管件站' }, { id: 2, name: '铸件站' }, { id: 3, name: '电力站' }],
    campaigns: [
      { campaignId: '11', campaignName: '管件-搜索', costMicros: 300_000_000 },
      { campaignId: '12', campaignName: '管件-西语', costMicros: 100_000_000 },
      { campaignId: '21', campaignName: '铸件', costMicros: 50_000_000 },
      { campaignId: '99', campaignName: '还没归', costMicros: 70_000_000 },
    ],
    mapping: new Map([['11', 1], ['12', 1], ['21', 2]]),
    inquiries: [
      { site_id: 1, channel: 'SEM付费', grade: 'A' }, { site_id: 1, channel: 'SEM付费', grade: 'B' }, { site_id: 1, channel: 'SEM付费', grade: 'C' },
      { site_id: 1, channel: 'SEO自然', grade: 'A' },
      { site_id: 2, channel: 'SEO自然', grade: 'B' },
      { site_id: null, channel: 'SEM付费', grade: 'A' }, { site_id: null, channel: '直接', grade: 'C' },
    ],
    evidence: [{ campaign_id: '99', site_id: 3, n: 4 }, { campaign_id: '21', site_id: 2, n: 1 }, { campaign_id: '11', site_id: 1, n: 2 }, { campaign_id: '11', site_id: 2, n: 1 }],
  });
  const [fitting, casting, power] = r.sites;
  assert.deepEqual([fitting.campaigns, fitting.costMicros, fitting.inquiries, fitting.effective, fitting.sem_effective], [2, 400_000_000, 4, 3, 2]);
  assert.equal(fitting.cost_per_sem_effective, 200_000_000, '400 花费 ÷ 2 条 SEM 渠道的 A/B；SEO 来的那条 A 不算进分母');
  assert.deepEqual([casting.costMicros, casting.sem_effective, casting.cost_per_sem_effective, casting.cost_reason], [50_000_000, 0, null, 'spent_no_effective'], '花了钱、没有 SEM 有效询盘：算不出，不是 0 也不是无穷大');
  assert.deepEqual([power.campaigns, power.costMicros, power.cost_reason], [0, null, 'no_campaigns'], '没有归过系列的站点没有花费口径，不是 0 元');
  assert.deepEqual(r.unassigned, { campaigns: 1, costMicros: 70_000_000 }, '没归属的系列花费不摊给任何站');
  assert.deepEqual(r.unlabeled, { inquiries: 2, effective: 1, sem_effective: 1 }, '没标站点的询盘不按公司去猜');
  // 建议：证据全指向一个站才建议；已经归对了的不重复建议；两边都有的不猜
  const byId = Object.fromEntries(r.campaigns.map((c) => [c.id, c]));
  assert.deepEqual(byId['99'].suggestion, { site_id: 3, site_name: '电力站', leads: 4 });
  assert.equal(byId['21'].suggestion, null);
  assert.deepEqual([byId['11'].suggestion, byId['11'].conflicting_evidence], [null, true]);
  // 没有同步到任何系列：synced = false，界面据此说「没有数据」而不是 0
  assert.equal(computeSiteReturns({ sites: [{ id: 1, name: 'a' }] }).synced, false);
});

test('接口：指定归属只认经理 / 老板，只收同步过的系列和启用中的站点；结果随归属变', async () => {
  const fitting = googleRepo.createProject({ name: '贝孚特-管件', gsc_site_url: 'sc-domain:bestflowfitting.com', domain: 'bestflowfitting.com', is_default: true });
  const casting = googleRepo.createProject({ name: 'FERR-OEM五金件', gsc_site_url: 'sc-domain:ferrcasting.com', domain: 'ferrcasting.com' });
  const ad = db.prepare('INSERT INTO google_ads_campaign_daily (date, customer_id, campaign_id, campaign_name, cost_micros, impressions, clicks, conversions) VALUES (?,?,?,?,?,?,?,?)');
  ad.run('2026-10-05', '1234567890', '11', '管件-搜索', 300_000_000, 1000, 50, 2);
  ad.run('2026-10-06', '1234567890', '11', '管件-搜索', 100_000_000, 500, 20, 1);
  ad.run('2026-10-05', '1234567890', '21', '铸件', 80_000_000, 300, 10, 0);
  await call('seo', 'POST', '/api/inquiries', { date: '2026-10-06', channel: 'SEM付费', product: '阀门', grade: 'A', site_id: fitting.id });
  await call('seo', 'POST', '/api/inquiries', { date: '2026-10-06', channel: 'SEM付费', product: '阀门', grade: 'B' });
  const url = '/api/sites/returns?start_date=2026-10-01&end_date=2026-10-10';

  // 还没指定任何归属：花费全在「未归属」，站点的花费是 null
  let r = (await call('seo', 'GET', url)).json();
  assert.equal(r.synced, true);
  assert.equal(r.currency, 'ADS_ACCOUNT');
  assert.deepEqual(r.unassigned, { campaigns: 2, costMicros: 480_000_000 });
  assert.deepEqual(r.sites.map((s) => [s.name, s.costMicros, s.inquiries]), [['贝孚特-管件', null, 1], ['FERR-OEM五金件', null, 0]]);
  assert.deepEqual(r.unlabeled, { inquiries: 1, effective: 1, sem_effective: 1 });

  const put = (role, id, body) => call(role, 'PUT', '/api/sites/campaigns/' + id, body);
  assert.equal((await put('seo', '11', { site_id: fitting.id })).statusCode, 403);
  assert.equal((await put('manager', '404404', { site_id: fitting.id })).json().error, 'unknown_campaign', '手敲的系列编号对不上任何花费');
  assert.equal((await put('manager', '11', { site_id: 99999 })).json().error, 'unknown_site');
  assert.equal((await put('manager', '11', {})).json().error, 'site_required');
  assert.equal((await put('manager', '11', { site_id: fitting.id })).statusCode, 200);
  assert.equal((await put('boss', '21', { site_id: casting.id })).statusCode, 200);

  r = (await call('seo', 'GET', url)).json();
  assert.deepEqual(r.sites.map((s) => [s.name, s.campaigns, s.costMicros, s.sem_effective, s.cost_per_sem_effective]), [
    ['贝孚特-管件', 1, 400_000_000, 1, 400_000_000],
    ['FERR-OEM五金件', 1, 80_000_000, 0, null],
  ]);
  assert.deepEqual(r.unassigned, { campaigns: 0, costMicros: 0 });
  // 区间外没有广告数据：不是 0，是没同步
  assert.equal((await call('seo', 'GET', '/api/sites/returns?start_date=2026-08-01&end_date=2026-08-10')).json().synced, false);

  // 改归属、取消归属
  await put('manager', '21', { site_id: fitting.id });
  assert.equal((await call('seo', 'GET', url)).json().sites[0].costMicros, 480_000_000);
  await put('manager', '21', { site_id: null });
  assert.deepEqual((await call('seo', 'GET', url)).json().unassigned, { campaigns: 1, costMicros: 80_000_000 });

  // 站点停用后：它名下的系列和花费照样列出来（标明已停用），不会凭空消失
  await put('manager', '21', { site_id: casting.id });
  googleRepo.deleteProject(casting.id);
  r = (await call('seo', 'GET', url)).json();
  assert.deepEqual(r.sites.map((s) => [s.name, s.active, s.costMicros]), [['贝孚特-管件', true, 400_000_000], ['FERR-OEM五金件（已停用）', false, 80_000_000]]);
});

test('建议只来自表单证据：手工填的系列和站点是人的主张，不拿来给自己作证', async () => {
  const fitting = googleRepo.listProjects()[0];
  // 手工录入：自己填了系列 11 和站点
  const manual = await call('seo', 'POST', '/api/inquiries', { date: '2026-10-07', channel: 'SEM付费', product: '阀门', grade: 'A', site_id: fitting.id, src_campaign_id: '21' });
  assert.equal(manual.statusCode, 201, manual.body);
  await call('manager', 'PUT', '/api/sites/campaigns/21', { site_id: null });
  const url = '/api/sites/returns?start_date=2026-10-01&end_date=2026-10-10';
  let c21 = (await call('seo', 'GET', url)).json().campaigns.find((c) => c.id === '21');
  assert.equal(c21.suggestion, null);
  // 表单线索带着系列 21 落在管件站
  const intake = await app.inject({ method: 'POST', url: '/api/inquiry-intake', headers: { 'x-intake-token': process.env.INQUIRY_INTAKE_SECRET },
    payload: { submission_id: 'ff-9-1', email: 'a@b.example', message: 'hi', campaign_id: '21', landing_page: 'https://www.bestflowfitting.com/elbow/?campaign_id=21' } });
  const lead = (await call('seo', 'GET', '/api/inquiry-leads?state=new')).json().items.find((l) => l.submission_id === 'ff-9-1');
  assert.equal(intake.statusCode, 201);
  await call('seo', 'POST', '/api/inquiries', { date: '2026-10-08', channel: 'SEM付费', product: '阀门', grade: 'B', lead_id: lead.id });
  c21 = (await call('seo', 'GET', url)).json().campaigns.find((c) => c.id === '21');
  assert.deepEqual(c21.suggestion, { site_id: fitting.id, site_name: '贝孚特-管件', leads: 1 });
});
