// SOP 引擎 v2：执行流水（一次执行一行）+ 周配额口径。
//
// 存在理由：这块改的是「打卡」这条每天都走的路径，而且新加的配额口径有四条容易被想当然写错的规则
// （完整周、创建日、未来日、单周超额不补他周）。纯函数那半边用单测焊死，路由那半边走真实 app。
//
// 隔离：connection.js 在 import 期就打开 config.dbFile → DB_FILE 必须在动态 import 之前设好。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-sop-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite');

const { buildApp } = await import('../src/index.js');
const { sopQuotaProgress } = await import('../src/services/kpiReview.js');
const { canonicalUrl, findDuplicate } = await import('../src/services/sopDuplicate.js');
const app = await buildApp();

test.after(async () => {
  await app.close();
  const { db } = await import('../src/db/connection.js');
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

const auth = (role = 'manager') => ({ cookie: `ferr_token=${app.jwt.sign({ id: 1, username: 't', name: 't', role })}` });
const call = (method, url, payload, role) =>
  app.inject({ method, url, headers: auth(role), ...(payload ? { payload } : {}) });

/* ===================== 纯函数：周配额口径 ===================== */

// 2026-10 的周一：10-05 / 10-12 / 10-19 / 10-26
const def = (over = {}) => ({
  id: 1, dept: 'SEO', freq: 'weekly', target_qty: 5, active: 1,
  created_at: '2026-09-01 00:00:00', ...over,
});
const log = (day, qty = 1, sopId = 1) => ({ sop_id: sopId, day_key: day, qty });

test('周配额只算完整的 ISO 周：区间头尾的半周不进分母', () => {
  // 10-07(周三) ~ 10-25(周日)：完整周只有 10-12~10-18 和 10-19~10-25 两周
  const r = sopQuotaProgress([def()], [], { start_date: '2026-10-07', end_date: '2026-10-25' }, null, '2026-10-31');
  assert.equal(r.weeks, 2);
  assert.equal(r.total, 10);
  assert.equal(r.done, 0);
});

test('SOP 创建之前的周不算：本月才建的 SOP，上半月不是它漏的', () => {
  const r = sopQuotaProgress(
    [def({ created_at: '2026-10-14 09:00:00' })],
    [], { start_date: '2026-10-05', end_date: '2026-10-25' }, null, '2026-10-31',
  );
  // 起点推到 10-14（周三）→ 它所在的那周不完整，只剩 10-19~10-25 一周
  assert.equal(r.weeks, 1);
  assert.equal(r.total, 5);
});

test('未来的日子不算：today 之后的周不进分母', () => {
  const r = sopQuotaProgress([def()], [], { start_date: '2026-10-05', end_date: '2026-10-31' }, null, '2026-10-15');
  // today=10-15 → 只有 10-05~10-11 这一周是完整且已过去的
  assert.equal(r.weeks, 1);
  assert.equal(r.total, 5);
});

test('单周超额不替其它周补课：一周发 10 篇 + 一周挂零 ≠ 达标', () => {
  const logs = [log('2026-10-06', 10)]; // 第一周一次性记 10
  const r = sopQuotaProgress([def()], logs, { start_date: '2026-10-05', end_date: '2026-10-18' }, null, '2026-10-31');
  assert.equal(r.weeks, 2);
  assert.equal(r.total, 10);
  assert.equal(r.done, 5, '第一周封顶 5，第二周 0 → 总共 5，不是 10');
});

test('qty 按求和不按条数：一次补录 3 篇算 3', () => {
  const r = sopQuotaProgress([def()], [log('2026-10-06', 3)], { start_date: '2026-10-05', end_date: '2026-10-11' }, null, '2026-10-31');
  assert.equal(r.done, 3);
});

test('没有周目标 / 月度 / 停用 / 别的部门的条目都不进这项', () => {
  const range = { start_date: '2026-10-05', end_date: '2026-10-11' };
  const cases = [
    def({ target_qty: null }),
    def({ freq: 'monthly' }),
    def({ active: 0 }),
  ];
  for (const d of cases) {
    assert.equal(sopQuotaProgress([d], [], range, null, '2026-10-31').total, 0);
  }
  // dept 过滤：按 SEM 口径看，SEO 的条目不算
  assert.equal(sopQuotaProgress([def()], [], range, 'SEM', '2026-10-31').total, 0);
  assert.equal(sopQuotaProgress([def()], [], range, 'SEO', '2026-10-31').total, 5);
});

test('区间整个落在未来 / 倒挂时回零，不抛异常', () => {
  assert.deepEqual(
    sopQuotaProgress([def()], [], { start_date: '2027-01-04', end_date: '2027-01-10' }, null, '2026-10-20'),
    { done: 0, total: 0, weeks: 0, days: 0 },
  );
  assert.deepEqual(sopQuotaProgress([def()], [], null, null, '2026-10-20'), { done: 0, total: 0, weeks: 0, days: 0 });
});

/* ---- 日目标（文档里确实有「2 条/天」：SEO S9 社媒发布，2026-10-20 老板拍板按每天算）---- */

const daily = (over = {}) => def({ freq: 'daily', target_qty: 2, ...over });

test('日目标一天一格：区间多少天就是多少格，不折成周', () => {
  // 10-19(周一) ~ 10-23(周五)，5 天 × 2 = 10
  const r = sopQuotaProgress([daily()], [], { start_date: '2026-10-19', end_date: '2026-10-23' }, null, '2026-10-31');
  assert.equal(r.days, 5);
  assert.equal(r.weeks, 0, '日目标不走周口径');
  assert.equal(r.total, 10);
});

test('日目标：当天超额不替别的天补课', () => {
  const logs = [log('2026-10-19', 10)]; // 周一一口气发 10 条
  const r = sopQuotaProgress([daily()], logs, { start_date: '2026-10-19', end_date: '2026-10-23' }, null, '2026-10-31');
  assert.equal(r.total, 10);
  assert.equal(r.done, 2, '周一封顶 2，其余四天 0 —— 这正是「每天都要发」和「一周发够就行」的区别');
});

test('日目标：端点那天是完整的，不像周那样切掉', () => {
  const r = sopQuotaProgress([daily()], [], { start_date: '2026-10-21', end_date: '2026-10-21' }, null, '2026-10-31');
  assert.equal(r.days, 1);
  assert.equal(r.total, 2);
});

test('日目标同样遵守「创建前不算」「未来不算」', () => {
  const range = { start_date: '2026-10-19', end_date: '2026-10-23' };
  const created = sopQuotaProgress([daily({ created_at: '2026-10-22 10:00:00' })], [], range, null, '2026-10-31');
  assert.equal(created.days, 2, '10-22、10-23 两天');
  const future = sopQuotaProgress([daily()], [], range, null, '2026-10-20');
  assert.equal(future.days, 2, 'today=10-20 → 只算 10-19、10-20');
});

test('周目标与日目标可以同时存在，各算各的再相加', () => {
  const range = { start_date: '2026-10-19', end_date: '2026-10-25' }; // 完整一周
  const r = sopQuotaProgress(
    [def({ id: 1 }), daily({ id: 2 })], // 周 5 + 日 2×7
    [log('2026-10-20', 5, 1), log('2026-10-20', 2, 2)],
    range, null, '2026-10-31',
  );
  assert.equal(r.weeks, 1);
  assert.equal(r.days, 7);
  assert.equal(r.total, 5 + 14);
  assert.equal(r.done, 5 + 2, '周目标那条满了；日目标只有 10-20 这一天发了');
});

test('社媒发布只有一条，落在社媒赛道、按每天 2 条考（S9 已并入，不在 SEO 侧重复记）', async () => {
  const { default: catalog } = await import('../src/db/sopCatalog.json', { with: { type: 'json' } });
  const posting = catalog.items.filter((i) => i.freq !== 'monthly'
    && (/社媒发布/.test(i.title) || /适配发布/.test(i.title)));
  assert.equal(posting.length, 1, '发布量只该有一个记账口，否则同一批帖子会被记两遍');
  const [p] = posting;
  assert.equal(p.track, '社媒');
  assert.equal(p.freq, 'daily');
  assert.equal(p.target_qty, 2);
  assert.ok(p._override && p._override.length > 10, '偏离原文的条目必须就地写明理由，不能静默改数');
  // SEO 赛道不该再有任何「发帖数量」类的配额条目
  assert.deepEqual(
    catalog.items.filter((i) => i.track === 'SEO' && /社媒|发帖/.test(i.title)).map((i) => i.title),
    [],
  );
});

test('偏离原文的条目一律要有 _override，且不能偷偷多出来', async () => {
  const { default: catalog } = await import('../src/db/sopCatalog.json', { with: { type: 'json' } });
  const overridden = catalog.items.filter((i) => i._override).map((i) => `${i.track} ${i.code} ${i.title}`);
  // 清单是从老板的 xlsx 生成的；每多一条人工改动都该是一次明确的决定，不是随手改
  assert.deepEqual(overridden, ['社媒 P1 LinkedIn / Facebook 适配发布']);
});

/* ===================== 路由：执行流水 ===================== */

async function makeSop(over = {}) {
  const res = await call('POST', '/api/sop', {
    dept: 'SEO', freq: 'weekly', title: '测试条目 ' + Math.random().toString(36).slice(2, 8), ...over,
  });
  assert.equal(res.statusCode, 201, res.body);
  return res.json().item;
}

test('带 subject_label 的 SOP 必须写清做了哪个对象，否则 400', async () => {
  const sop = await makeSop({ target_qty: 5, unit: '篇', subject_label: '哪篇文章' });
  const bad = await call('POST', '/api/sop/logs', { sop_id: sop.id, period_key: '2026-W43', day_key: '2026-10-20' });
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.json().error, 'subject_required');

  const ok = await call('POST', '/api/sop/logs', {
    sop_id: sop.id, period_key: '2026-W43', day_key: '2026-10-20', subject: 'manhole-steps 选型指南',
  });
  assert.equal(ok.statusCode, 201, ok.body);
  assert.equal(ok.json().item.subject, 'manhole-steps 选型指南');
});

test('没有 subject_label 的 SOP 可以直接记一条（周一看数那类）', async () => {
  const sop = await makeSop({ time_hint: '周一' });
  const res = await call('POST', '/api/sop/logs', { sop_id: sop.id, period_key: '2026-W43', day_key: '2026-10-20' });
  assert.equal(res.statusCode, 201, res.body);
});

test('进度按 SUM(qty) 聚合，不按条数', async () => {
  const sop = await makeSop({ target_qty: 5, unit: '条', subject_label: '哪一条' });
  for (const [subject, qty] of [['a', 2], ['b', 1]]) {
    const r = await call('POST', '/api/sop/logs', { sop_id: sop.id, period_key: '2026-W44', day_key: '2026-10-27', subject, qty });
    assert.equal(r.statusCode, 201, r.body);
  }
  const prog = await call('GET', '/api/sop/progress?weekly=2026-W44');
  const row = prog.json().items.find((x) => x.sop_id === sop.id);
  assert.equal(row.done_qty, 3, '2 + 1 = 3，不是 2 条记录');
  assert.equal(row.log_count, 2);
});

test('period_key 格式不合法一律拒绝：影子周期会让配额永远追不平', async () => {
  const sop = await makeSop();
  for (const pk of ['2026-W4', 'W43', '2026/10/20', '']) {
    const r = await call('POST', '/api/sop/logs', { sop_id: sop.id, period_key: pk, day_key: '2026-10-20' });
    assert.equal(r.statusCode, 400, `period_key=${pk} 应被拒绝`);
  }
});

test('撤销流水：还剩别的记录时完成勾不跟着消失，删到零才撤销', async () => {
  const sop = await makeSop({ target_qty: 2, unit: '条', subject_label: '哪一条' });
  const pk = '2026-W45';
  const ids = [];
  for (const subject of ['x', 'y']) {
    const r = await call('POST', '/api/sop/logs', { sop_id: sop.id, period_key: pk, day_key: '2026-11-03', subject });
    ids.push(r.json().item.id);
  }
  const doneNow = async () => (await call('GET', `/api/sop/completions?weekly=${pk}`)).json()
    .items.some((c) => c.sop_id === sop.id);
  assert.equal(await doneNow(), true, '记了流水就该有完成勾');

  await call('DELETE', `/api/sop/logs/${ids[0]}`);
  assert.equal(await doneNow(), true, '还剩一条流水 → 做过就是做过，勾不能消失');

  await call('DELETE', `/api/sop/logs/${ids[1]}`);
  assert.equal(await doneNow(), false, '流水删光 → 完成勾一并撤销');
});

test('不存在的 SOP 记流水回 404，不写脏数据', async () => {
  const r = await call('POST', '/api/sop/logs', { sop_id: 999999, period_key: '2026-W43', day_key: '2026-10-20' });
  assert.equal(r.statusCode, 404);
});

test('PATCH 定义只改传进来的字段，没传的不被清空', async () => {
  const sop = await makeSop({ why: '原因', how: '步骤', done_when: '判据', target_qty: 3 });
  const r = await call('PATCH', `/api/sop/${sop.id}`, { title: '改了标题' });
  assert.equal(r.statusCode, 200, r.body);
  const after = r.json().item;
  assert.equal(after.title, '改了标题');
  assert.equal(after.why, '原因', 'PATCH 只传标题不该把「为什么做」清空');
  assert.equal(after.how, '步骤');
  assert.equal(after.target_qty, 3);
});

/* ===================== 同一条证据被记两次的软提醒 ===================== */

test('链接规范化：去 www / 末尾斜杠 / 锚点 / 跟踪参数，查询参数排序后比', () => {
  const same = [
    'https://www.ferrcasting.com/blog/d400/',
    'http://ferrcasting.com/blog/d400',
    'https://ferrcasting.com/blog/d400?utm_source=linkedin&utm_medium=social',
    'ferrcasting.com/blog/d400#section-2',
    'https://FerrCasting.com/blog/d400?fbclid=abc',
  ].map(canonicalUrl);
  assert.equal(new Set(same).size, 1, `同一条帖子被算成了 ${new Set(same).size} 个：${[...new Set(same)].join(' | ')}`);
  // 真正不同的页面不能被压成一个
  assert.notEqual(canonicalUrl('https://ferrcasting.com/blog/d400'), canonicalUrl('https://ferrcasting.com/blog/c250'));
  // 非跟踪类的查询参数是身份的一部分，不能丢
  assert.notEqual(canonicalUrl('https://x.com/p?id=1'), canonicalUrl('https://x.com/p?id=2'));
  assert.equal(canonicalUrl(''), null);
  assert.equal(canonicalUrl(null), null);
});

test('别的 SOP 记过排在同一条 SOP 之前：一份工作算两份比自己灌水更该先说', () => {
  const rows = [
    { id: 1, sop_id: 7, day_key: '2026-10-18', evidence_url: 'https://a.com/p', title: '社媒发布', code: 'P1' },
    { id: 2, sop_id: 9, day_key: '2026-10-19', evidence_url: 'https://a.com/p?utm_source=li', title: '收录巡检', code: 'S1' },
  ];
  const d = findDuplicate(rows, 'https://www.a.com/p/', 7);
  assert.equal(d.sop_id, 9, '应该先报别的 SOP（id=9），而不是自己那条');
  assert.equal(d.same_sop, false);
  // 只有自己记过时照样报
  const self = findDuplicate([rows[0]], 'https://a.com/p', 7);
  assert.equal(self.same_sop, true);
  assert.equal(findDuplicate(rows, 'https://b.com/other', 7), null);
});

test('记流水时撞上同一条链接 → 照样记下（不拦），但回执带 duplicate', async () => {
  const a = await makeSop({ target_qty: 5, unit: '条', subject_label: '哪一条' });
  const b = await makeSop({ target_qty: 5, unit: '条', subject_label: '哪一条' });
  const url = 'https://ferrcasting.com/blog/manhole-steps';
  const first = await call('POST', '/api/sop/logs', {
    sop_id: a.id, period_key: '2026-W46', day_key: '2026-11-10', subject: '首发', evidence_url: url,
  });
  assert.equal(first.statusCode, 201);
  assert.equal(first.json().duplicate, null, '第一次记不该报重复');

  const second = await call('POST', '/api/sop/logs', {
    sop_id: b.id, period_key: '2026-W46', day_key: '2026-11-11', subject: '转推',
    evidence_url: url + '/?utm_source=linkedin',   // 带 UTM、带末尾斜杠，仍该认出是同一条
  });
  assert.equal(second.statusCode, 201, '是提醒不是拦截，必须照样写进去');
  const dup = second.json().duplicate;
  assert.equal(dup.sop_id, a.id);
  assert.equal(dup.same_sop, false);
  assert.equal(dup.day_key, '2026-11-10');
  // 真的落库了，没有因为重复而丢掉
  const prog = await call('GET', '/api/sop/progress?weekly=2026-W46');
  assert.equal(prog.json().items.find((x) => x.sop_id === b.id).done_qty, 1);
});

test('没填链接就不比对，回执的 duplicate 是 null', async () => {
  const sop = await makeSop({ target_qty: 3, unit: '条', subject_label: '哪一条' });
  const r = await call('POST', '/api/sop/logs', {
    sop_id: sop.id, period_key: '2026-W47', day_key: '2026-11-17', subject: '没链接',
  });
  assert.equal(r.json().duplicate, null);
});

/* ===================== 一键导入文档清单 ===================== */

test('dry-run 不写库；真导之后再导一次全是「无变化」（幂等）', async () => {
  const dry = await call('POST', '/api/sop/import-catalog?dry_run=1', {});
  assert.equal(dry.statusCode, 200, dry.body);
  const d = dry.json();
  assert.equal(d.dry_run, true);
  assert.ok(d.total > 50, '清单应该有几十条');
  const beforeCount = (await call('GET', '/api/sop?all=1')).json().items.length;

  const run = await call('POST', '/api/sop/import-catalog', {});
  assert.equal(run.statusCode, 200, run.body);
  assert.equal(run.json().inserted.length, d.inserted.length, 'dry-run 预告的新增数应与真导一致');
  const afterCount = (await call('GET', '/api/sop?all=1')).json().items.length;
  assert.equal(afterCount, beforeCount + d.inserted.length);

  const again = await call('POST', '/api/sop/import-catalog', {});
  const a = again.json();
  assert.equal(a.inserted.length, 0, '重导不该再新增');
  assert.equal(a.updated.length, 0, '重导不该有改动');
  assert.equal(a.unchanged.length, a.total);
});

test('停用过的条目重导不会被悄悄打开', async () => {
  const list = (await call('GET', '/api/sop?all=1')).json().items;
  const one = list.find((x) => x.source && x.active === 1);
  assert.ok(one, '导入后应有带 source 的条目');
  await call('DELETE', `/api/sop/${one.id}`);          // 软删 = active 0
  await call('POST', '/api/sop/import-catalog', {});
  const after = (await call('GET', '/api/sop?all=1')).json().items.find((x) => x.id === one.id);
  assert.equal(after.active, 0, '有人停用过就是有意停的，重导不能替他打开');
});

test('导入是经理 / 老板的事，普通运营调不动', async () => {
  const r = await call('POST', '/api/sop/import-catalog', {}, 'seo');
  assert.equal(r.statusCode, 403);
});
/* ===================== 路由：任务优先级 / 时刻 ===================== */

test('任务优先级只收 1-4，越界与脏值一律落 null（= 普通）', async () => {
  for (const [input, expect] of [[1, 1], [4, 4], [0, null], [5, null], ['high', null], ['2', 2]]) {
    const r = await call('POST', '/api/loop-items', { kind: 'task', dept: 'SEO', content: 'p', task_priority: input });
    assert.equal(r.statusCode, 201, r.body);
    assert.equal(r.json().item.task_priority, expect, `task_priority=${input}`);
  }
});

test('预计完成时刻只收 HH 或 HH:MM（15 分钟步进），脏值不入库', async () => {
  const cases = [['09', '09'], ['09:30', '09:30'], ['23:45', '23:45'], ['09:07', null], ['24:00', null], ['9', null], ['abc', null]];
  for (const [input, expect] of cases) {
    const r = await call('POST', '/api/loop-items', { kind: 'task', dept: 'SEO', content: 'h', task_hour: input });
    assert.equal(r.json().item.task_hour, expect, `task_hour=${input}`);
  }
});

test('PATCH 任务也走同一套校验，不能绕过', async () => {
  const created = await call('POST', '/api/loop-items', { kind: 'task', dept: 'SEO', content: 'x', task_hour: '10:00', task_priority: 2 });
  const id = created.json().item.id;
  const r = await call('PATCH', `/api/loop-items/${id}`, { task_hour: '10:07', task_priority: 9 });
  const after = r.json().item;
  assert.equal(after.task_hour, null, '脏时刻会让日程推算整列错位，必须在边界挡掉');
  assert.equal(after.task_priority, null);
});
