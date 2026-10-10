// 任务完成前后的数据对比。要守住的是口径：窗口等长、完成当天不算、没数据不冒充成 0、给出全站参照。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { businessDate, compare, delta, effectWindow, itemStatus } from '../src/services/taskEffect.js';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-effect-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite'); // 必须在动态 import 之前：connection.js 在 import 期就开库

const { buildApp } = await import('../src/index.js');
const { db } = await import('../src/db/connection.js');
const app = await buildApp();
// 外链台账的 created_by 外键指向 users(id)；测试令牌用 id=1，库里得真有这个人
db.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, name, role) VALUES (1, 'effect-test', 'x', '测试', 'boss')").run();

test.after(async () => {
  await app.close();
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

const auth = (role) => ({ cookie: `ferr_token=${app.jwt.sign({ id: 1, username: 't', name: 't', role })}` });
const call = (method, url, payload) => app.inject({ method, url, headers: auth('seo'), payload });

/* ---------- 规则（纯函数） ---------- */

test('完成时刻按北京时间归日：UTC 前一天深夜 = 北京当天早上', () => {
  assert.equal(businessDate('2026-10-09 23:30:00'), '2026-10-10', '北京 07:30 勾完成，不能算成 9 号');
  assert.equal(businessDate('2026-10-10 15:59:59'), '2026-10-10');
  assert.equal(businessDate('2026-10-10 16:00:00'), '2026-10-11');
  assert.equal(businessDate(null), null);
  assert.equal(businessDate('不是时间'), null);
});

test('窗口：前后等长，完成当天两边都不算', () => {
  const w = effectWindow('2026-10-10', 7, '2026-10-30');
  assert.equal(w.status, 'OK');
  assert.deepEqual(w.before, { start_date: '2026-10-03', end_date: '2026-10-09' });
  assert.deepEqual(w.after, { start_date: '2026-10-11', end_date: '2026-10-17' });
});

test('窗口：完成后数据还没满时，两边一起缩短，绝不拿长窗口比短窗口', () => {
  const w = effectWindow('2026-10-10', 14, '2026-10-15'); // 完成后只有 5 天数据
  assert.equal(w.status, 'PARTIAL');
  assert.equal(w.days, 5);
  assert.equal(w.wanted_days, 14);
  assert.deepEqual(w.before, { start_date: '2026-10-05', end_date: '2026-10-09' });
  assert.deepEqual(w.after, { start_date: '2026-10-11', end_date: '2026-10-15' });
  assert.equal(w.full_date, '2026-10-24', '告诉人哪天之后才凑得齐');
});

test('窗口：完成后一天数据都没有 = 待数据；数据源从没同步过 = 未同步', () => {
  assert.equal(effectWindow('2026-10-10', 14, '2026-10-10').status, 'PENDING');
  assert.equal(effectWindow('2026-10-10', 14, '2026-10-08').status, 'PENDING', 'GSC 有延迟，最新数据可能还在完成日之前');
  assert.equal(effectWindow('2026-10-10', 14, '2026-10-10').before, null);
  assert.equal(effectWindow('2026-10-10', 14, null).status, 'NOT_SYNCED');
});

test('变化量：基数为 0 时不给百分比（除零没有意义），只给绝对值', () => {
  assert.deepEqual(delta(10, 15), { abs: 5, pct: 0.5 });
  assert.deepEqual(delta(0, 8), { abs: 8, pct: null });
  assert.deepEqual(delta(20, 5), { abs: -15, pct: -0.75 });
  assert.equal(delta(null, 5), null);
});

test('指标整形：Ads 金额从 micros 换算；零转化时每转化成本为空，不是无穷大也不是 0', () => {
  const r = compare('ads', { costMicros: 50_000_000, clicks: 20, conversions: 0 }, { costMicros: 60_000_000, clicks: 30, conversions: 3 });
  assert.deepEqual(r.before, { cost: 50, clicks: 20, conversions: 0, cpa: null });
  assert.deepEqual(r.after, { cost: 60, clicks: 30, conversions: 3, cpa: 20 });
  assert.equal(r.delta.cpa, null, '之前没有转化，就没有可比的每转化成本');
  assert.deepEqual(r.delta.conversions, { abs: 3, pct: null });
  const g = compare('gsc', { clicks: 4, impressions: 100, position: 12.34 }, { clicks: 9, impressions: 180, position: 8.06 });
  assert.equal(g.after.position, 8.1);
  assert.deepEqual(g.delta.position, { abs: -4.2, pct: -0.3415 });
});

test('单项状态：两个窗口都没有任何数据 = 无数据，不画一排 0 → 0 假装测过', () => {
  assert.equal(itemStatus({ status: 'OK' }, 0, 0), 'NO_DATA');
  assert.equal(itemStatus({ status: 'OK' }, 3, 0), 'OK', '之前有、之后没了，是真实的下跌');
  assert.equal(itemStatus({ status: 'PARTIAL' }, 0, 2), 'PARTIAL');
  assert.equal(itemStatus({ status: 'PENDING' }, 0, 0), 'PENDING');
});

/* ---------- 路由：真实取数 ---------- */

const SITE = 'sc-domain:ferr.com';
const PAGE = 'https://ferr.com/valves';
function seedGsc(date, { pageClicks, pageImpr, pagePos, siteClicks }) {
  db.prepare('INSERT INTO gsc_daily (date, site_url, clicks, impressions, position) VALUES (?,?,?,?,?)').run(date, SITE, siteClicks, siteClicks * 20, 15);
  if (pageImpr) {
    db.prepare('INSERT INTO gsc_query_daily (date, site_url, query, page, clicks, impressions, position) VALUES (?,?,?,?,?,?,?)')
      .run(date, SITE, 'gate valve', PAGE + '/', pageClicks, pageImpr, pagePos); // 库里带尾斜杠，任务里不带
  }
}
function seedAds(date, { cost, clicks, conv }) {
  db.prepare('INSERT INTO google_ads_campaign_daily (date, customer_id, campaign_id, campaign_name, cost_micros, clicks, conversions) VALUES (?,?,?,?,?,?,?)')
    .run(date, 'c1', '777', 'Valves-EU', cost * 1e6, clicks, conv);
}
const ymd = (d) => new Date(Date.UTC(2026, 8, d)).toISOString().slice(0, 10); // 2026-09-<d>，d 可以超过 30

test('路由：页面 / 关键词 / 系列各自对比，并带出全站与全账户参照', async () => {
  // 完成日 2026-09-15。GSC 数据到 09-22（后 7 天齐），Ads 数据只到 09-18（后 3 天）
  for (let d = 8; d <= 14; d++) seedGsc(ymd(d), { pageClicks: 2, pageImpr: 50, pagePos: 14, siteClicks: 100 });
  seedGsc(ymd(15), { pageClicks: 99, pageImpr: 999, pagePos: 1, siteClicks: 9999 }); // 完成当天：不该被算进任何一边
  for (let d = 16; d <= 22; d++) seedGsc(ymd(d), { pageClicks: 5, pageImpr: 80, pagePos: 9, siteClicks: 110 });
  for (let d = 8; d <= 14; d++) seedAds(ymd(d), { cost: 10, clicks: 5, conv: 0 });
  for (let d = 16; d <= 18; d++) seedAds(ymd(d), { cost: 12, clicks: 8, conv: 1 });

  const task = (await call('POST', '/api/loop-items', {
    kind: 'task', dept: 'SEO', content: '重写阀门落地页',
    links: [{ type: 'page', ref: PAGE }, { type: 'keyword', ref: 'Gate Valve' }, { type: 'campaign', ref: '777' }, { type: 'kpi', ref: 'a_count' }],
  })).json().item;
  db.prepare("UPDATE loop_items SET state='done', status='done', result='已上线', done_at='2026-09-15 03:00:00' WHERE id=?").run(task.id);

  const res = await call('GET', `/api/loop-items/${task.id}/effect?days=7`);
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.done_date, '2026-09-15');
  assert.equal(body.windows.gsc.status, 'OK');
  assert.equal(body.windows.ads.status, 'PARTIAL');
  assert.equal(body.windows.ads.days, 3);

  const page = body.items.find((i) => i.type === 'page');
  assert.equal(page.status, 'OK');
  assert.deepEqual(page.before, { clicks: 14, impressions: 350, position: 14 });
  assert.deepEqual(page.after, { clicks: 35, impressions: 560, position: 9 }, '完成当天那条 99 点击没被算进来；尾斜杠不同也对上了');
  assert.deepEqual(page.delta.clicks, { abs: 21, pct: 1.5 });

  const kw = body.items.filter((i) => i.type === 'keyword');
  assert.equal(kw.length, 1, 'Ads 里没有这个词的数据，就不多列一行空的');
  assert.equal(kw[0].source, 'gsc');
  assert.equal(kw[0].after.clicks, 35);

  const camp = body.items.find((i) => i.type === 'campaign');
  assert.equal(camp.status, 'PARTIAL');
  assert.deepEqual(camp.before, { cost: 30, clicks: 15, conversions: 0, cpa: null }, 'Ads 只有后 3 天，前窗口也只取 3 天');
  assert.deepEqual(camp.after, { cost: 36, clicks: 24, conversions: 3, cpa: 12 });

  assert.equal(body.items.find((i) => i.type === 'kpi').status, 'DECLARED');
  // 参照：全站点击 700 → 770（+10%），页面是 +150% —— 这个差距才是值得看的
  assert.deepEqual(body.baseline.gsc.before.clicks, 700);
  assert.deepEqual(body.baseline.gsc.delta.clicks, { abs: 70, pct: 0.1 });
  assert.equal(body.baseline.ads.after.cost, 36);
  assert.match(body.note, /不能证明/);
});

test('路由：没数据的对象标「无数据」；没完成的任务没有对比原点；窗口天数只收固定档位', async () => {
  const t = (await call('POST', '/api/loop-items', { kind: 'task', dept: 'SEO', content: '新页面', links: [{ type: 'page', ref: 'https://ferr.com/brand-new' }] })).json().item;
  const notDone = (await call('GET', `/api/loop-items/${t.id}/effect`)).json();
  assert.equal(notDone.status, 'NOT_DONE');
  assert.deepEqual(notDone.items, []);

  db.prepare("UPDATE loop_items SET state='done', status='done', result='已上线', done_at='2026-09-15 03:00:00' WHERE id=?").run(t.id);
  const done = (await call('GET', `/api/loop-items/${t.id}/effect?days=7`)).json();
  assert.equal(done.items[0].status, 'NO_DATA');

  assert.equal((await call('GET', `/api/loop-items/${t.id}/effect?days=5`)).statusCode, 400);
  assert.equal((await call('GET', '/api/loop-items/999999/effect')).statusCode, 404);
  const plan = (await call('POST', '/api/loop-items', { kind: 'plan', content: '计划' })).json().item;
  assert.equal((await call('GET', `/api/loop-items/${plan.id}/effect`)).statusCode, 404, '只有任务才有前后对比');
});

test('外链的前后对比：原点是上线日，看它指向的页面；与任务同一套口径', async () => {
  // 复用上面灌的 GSC 数据：PAGE 在 09-15 前后各 7 天的点击是 14 → 35
  const made = await call('POST', '/api/backlinks', { source_url: 'https://blog.example.com/valve-guide', target_url: PAGE, acquired_date: '2026-09-15', method: '客座投稿' });
  assert.equal(made.statusCode, 201);
  const res = await call('GET', `/api/backlinks/${made.json().item.id}/effect?days=7`);
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.status, 'OK');
  assert.equal(body.done_date, '2026-09-15');
  assert.equal(body.items.length, 1);
  assert.deepEqual(body.items[0].delta.clicks, { abs: 21, pct: 1.5 });
  assert.ok(body.baseline.gsc, '参照行在外链这里同样要有');
  assert.match(body.note, /外链起效通常要几周/);

  // 没填指向页面 / 没填上线日：没有对比的原点，原因要说清
  const noTarget = (await call('POST', '/api/backlinks', { source_url: 'https://x.example.com/a', acquired_date: '2026-09-15' })).json().item;
  const r1 = (await call('GET', `/api/backlinks/${noTarget.id}/effect`)).json();
  assert.equal(r1.status, 'NO_ORIGIN');
  assert.match(r1.message, /指向/);
  const noDate = (await call('POST', '/api/backlinks', { source_url: 'https://y.example.com/a', target_url: PAGE })).json().item;
  assert.match((await call('GET', `/api/backlinks/${noDate.id}/effect`)).json().message, /上线日期/);
  assert.equal((await call('GET', '/api/backlinks/999999/effect')).statusCode, 404);
  assert.equal((await call('GET', `/api/backlinks/${noDate.id}/effect?days=3`)).statusCode, 400);
});

test('没有原点时由后端给出原因（前端不再自己写一份文案）；日计划回放的任务带着关联键', async () => {
  const t = (await call('POST', '/api/loop-items', { kind: 'task', dept: 'SEO', content: '回放里要看到关联', start_date: '2026-09-20', task_date: '2026-09-20', links: [{ type: 'keyword', ref: 'gate valve' }] })).json().item;
  assert.match((await call('GET', `/api/loop-items/${t.id}/effect`)).json().message, /没有完成时刻/);
  const replay = (await call('GET', '/api/daily-plan?day=2026-09-20')).json();
  const row = replay.tasks.find((x) => x.id === t.id);
  assert.deepEqual(row.links, [{ type: 'keyword', ref: 'gate valve', label: null }]);
  assert.equal(typeof row.is_important, 'boolean');
});

test('GA4 落地页：同一页面的各种写法归并到一起，路径相近的别的页面不混进来', async () => {
  const ins = db.prepare("INSERT INTO ga4_dimension_daily (date, property_id, dimension_type, dimension_value, sessions, key_events) VALUES (?, 'p1', ?, ?, ?, ?)");
  const day = db.prepare("INSERT INTO ga4_daily (date, property_id, sessions, key_events) VALUES (?, 'p1', ?, ?)");
  for (let d = 8; d <= 22; d++) {
    const date = ymd(d); const after = d > 15;
    day.run(date, 200, 4);
    ins.run(date, 'landing_page', '/ga-page', after ? 6 : 2, after ? 1 : 0);                 // 不带尾斜杠
    ins.run(date, 'landing_page', '/ga-page/', 1, 0);                                         // 带尾斜杠
    ins.run(date, 'landing_page', '/ga-page/?gclid=abc' + d, after ? 3 : 1, 0);               // 广告参数把它拆成了另一行
    ins.run(date, 'landing_page', '/ga-page-old', 50, 9);                                     // 只是前缀相同的另一个页面
    ins.run(date, 'landing_page', '/gaXpage', 70, 9);                                         // 路径里没有通配符时不该被 LIKE 误伤
    ins.run(date, 'source_medium', '/ga-page', 999, 99);                                      // 别的维度里长得一样的值
  }
  const task = (await call('POST', '/api/loop-items', { kind: 'task', dept: 'SEO', content: '改 GA 页', links: [{ type: 'page', ref: 'https://ferr.com/ga-page/' }] })).json().item;
  db.prepare("UPDATE loop_items SET state='done', status='done', result='已上线', done_at='2026-09-15 03:00:00' WHERE id=?").run(task.id);

  const body = (await call('GET', `/api/loop-items/${task.id}/effect?days=7`)).json();
  const ga4 = body.items.find((i) => i.source === 'ga4');
  assert.ok(ga4, '这个页面在 GA4 里有数据，应当多列一行');
  assert.equal(ga4.type, 'page');
  assert.deepEqual(ga4.before, { sessions: 28, keyEvents: 0 }, '7 天 ×（2 + 1 + 1）；前缀相同的 /ga-page-old 没被算进来');
  assert.deepEqual(ga4.after, { sessions: 70, keyEvents: 7 }, '7 天 ×（6 + 1 + 3）');
  assert.deepEqual(body.baseline.ga4.before, { sessions: 1400, keyEvents: 28 });
  assert.equal(body.windows.ga4.status, 'OK');
  assert.ok(body.metrics.ga4.some((m) => m.key === 'keyEvents'));
});

test('GA4 落地页：路径里的下划线按字面匹配（它在 LIKE 里是通配符）；GA4 里没有这个页面就不多列一行', async () => {
  const ins = db.prepare("INSERT INTO ga4_dimension_daily (date, property_id, dimension_type, dimension_value, sessions, key_events) VALUES (?, 'p1', 'landing_page', ?, ?, 0)");
  for (let d = 8; d <= 22; d++) {
    ins.run(ymd(d), '/a_b?x=1', 2);   // 目标页（带查询串）
    ins.run(ymd(d), '/aXb?x=1', 40);  // 下划线若被当通配符，这一行会被误算进来
  }
  const mk = async (ref) => {
    const t = (await call('POST', '/api/loop-items', { kind: 'task', dept: 'SEO', content: 'x', links: [{ type: 'page', ref }] })).json().item;
    db.prepare("UPDATE loop_items SET state='done', status='done', result='已上线', done_at='2026-09-15 03:00:00' WHERE id=?").run(t.id);
    return (await call('GET', `/api/loop-items/${t.id}/effect?days=7`)).json();
  };
  const under = (await mk('https://ferr.com/a_b')).items.find((i) => i.source === 'ga4');
  assert.deepEqual(under.before, { sessions: 14, keyEvents: 0 }, '只有 /a_b 自己的 7 × 2，没有 /aXb 的 40');
  const none = await mk('https://ferr.com/no-ga4-data-for-this-page');
  assert.equal(none.items.filter((i) => i.source === 'ga4').length, 0);
  assert.equal(none.baseline.ga4, undefined, '没有 GA4 行就不需要 GA4 的参照');
});
