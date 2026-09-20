// 月度绩效考核（老板《2026 运营部绩效考核表》口径）评分引擎单测。
// 重点不是「算得对不对」这种加减法，而是**那些一旦错了就会冤枉人的边界**：
// 缺数据不能当 0 分、没目标不能悄悄出分、花了钱零结果必须扣分、SEO 不能因为没广告预算被判 0。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeReview, getReviewConfig, bandFor, DEFAULT_REVIEW_CONFIG, REVIEW_STATUS,
  fixProgress, testProgress, weeklyProgress, summarizeLeads, periodKeyFor,
} from '../src/services/kpiReview.js';

/* 基准夹具刻意调成「a=10 / b=30 / 花费 25000 时每一项都恰好等于目标」，
   这样任何一个 100 分的断言都只会被真正的评分逻辑打破，而不是被夹具里某项 83% 的噪声干扰。
   cost_a = 25000/10 = 2500、cost_ab = 25000/40 = 625、A 占比 = 10/40 = 0.25。 */
const TARGETS = {
  a_target: 10, b_target: 30, ad_budget: 30000,
  cost_a_target: 2500, cost_ab_target: 625, a_ratio_target: 0.25,
};
const FULL_PROCESS = {
  weekly: { done: 8, total: 8 }, fix: { done: 5, total: 5 }, test: { done: 2, total: 2 },
};
const SPEND = (value) => ({ value, status: 'VALID', source: 'google_ads', currency: null });
const byKey = (r, key) => r.metrics.find((m) => m.key === key);

test('目标达成即满分；老板表的 120% 上限确实封顶', () => {
  // 实际 = 目标 → 每项 ratio 1.0 → 总分 100
  const exact = computeReview({
    scope: 'department',
    leads: { a: 10, b: 30, c: 0, ungraded: 0, total: 40 },
    spend: SPEND(25000), process: FULL_PROCESS, targets: TARGETS,
  });
  assert.equal(exact.status, 'GRADED');
  assert.equal(byKey(exact, 'a_count').ratio, 1);

  // A 级翻三倍也只按 120% 计分，不允许单项超额把别的短板全抵掉
  const over = computeReview({
    scope: 'department',
    leads: { a: 30, b: 30, c: 0, ungraded: 0, total: 60 },
    spend: SPEND(25000), process: FULL_PROCESS, targets: TARGETS,
  });
  assert.equal(byKey(over, 'a_count').ratio, 1.2);
  assert.ok(over.score <= 120, '总分不得超过 120');
});

test('缺数据 ≠ 0 分：查不到广告花费时成本指标不计分，只拉低覆盖率', () => {
  const r = computeReview({
    scope: 'department',
    leads: { a: 10, b: 30, c: 5, ungraded: 0, total: 45 },
    spend: { value: null, status: 'MISSING_DATA' }, process: FULL_PROCESS, targets: TARGETS,
  });
  const costA = byKey(r, 'cost_a');
  assert.equal(costA.status, REVIEW_STATUS.MISSING_DATA);
  assert.equal(costA.score, null, '缺数据的指标绝不能落一个 0 分下去');
  assert.ok(r.coverage < 1 && r.coverage > 0, '缺的那部分权重要体现在覆盖率上');
  // 其余指标全达标 → 归一化后仍是满分，缺的两项没有把分数拖下水
  assert.equal(r.score, 100);
});

test('花了广告费却一个 A 级都没有 → 强制 0 分且仍然计分（这正是该扣分的情形）', () => {
  const r = computeReview({
    scope: 'department',
    leads: { a: 0, b: 6, c: 10, ungraded: 0, total: 16 },
    spend: SPEND(20000), process: FULL_PROCESS, targets: TARGETS,
  });
  const costA = byKey(r, 'cost_a');
  assert.equal(costA.status, REVIEW_STATUS.VALID, '不能靠除零逃出评分');
  assert.equal(costA.ratio, 0);
  assert.equal(costA.score, 0);
  assert.equal(costA.display_value, '有花费 · 零 A 级询价');
});

test('区间内零广告投入 → 成本指标不计分（没花钱就没有获客成本可言）', () => {
  const r = computeReview({
    scope: 'department',
    leads: { a: 10, b: 30, c: 0, ungraded: 0, total: 40 },
    spend: SPEND(0), process: FULL_PROCESS, targets: TARGETS,
  });
  assert.equal(byKey(r, 'cost_a').status, REVIEW_STATUS.NO_BASELINE);
  assert.equal(byKey(r, 'cost_ab').status, REVIEW_STATUS.NO_BASELINE);
  assert.equal(r.score, 100, '被移出分母的指标不该影响其余项的满分');
});

test('SEO 个人视角：成本指标标不适用，权重重新归一，绝不给李编一个 0 分', () => {
  const seo = computeReview({
    scope: 'seo',
    leads: { a: 10, b: 30, c: 0, ungraded: 0, total: 40 },
    spend: SPEND(25000), process: FULL_PROCESS, targets: TARGETS,
  });
  assert.equal(byKey(seo, 'cost_a').status, REVIEW_STATUS.NOT_APPLICABLE);
  assert.equal(byKey(seo, 'cost_ab').status, REVIEW_STATUS.NOT_APPLICABLE);
  assert.equal(byKey(seo, 'cost_a').score, null);
  // 成本 20 分被移出分母 → 可评分权重 80，覆盖率仍是 100%
  assert.equal(seo.weights.eligible, 80);
  assert.equal(seo.coverage, 1);
  assert.equal(seo.status, 'GRADED');

  // 陈（SEM）拿到的是同一份部门 A/B 数量 —— 老板拍板「部门共担，不按渠道拆」
  const sem = computeReview({
    scope: 'sem',
    leads: { a: 10, b: 30, c: 0, ungraded: 0, total: 40 },
    spend: SPEND(25000), process: FULL_PROCESS, targets: TARGETS,
  });
  assert.equal(byKey(sem, 'a_count').actual, byKey(seo, 'a_count').actual);
  assert.equal(byKey(sem, 'cost_a').status, REVIEW_STATUS.VALID);
});

test('目标没设 → 整份考核标 CONFIG_INCOMPLETE，只给参考分，不出正式分', () => {
  const r = computeReview({
    scope: 'department',
    leads: { a: 10, b: 30, c: 0, ungraded: 0, total: 40 },
    spend: SPEND(25000), process: FULL_PROCESS, targets: { ...TARGETS, a_target: null },
  });
  assert.equal(byKey(r, 'a_count').status, REVIEW_STATUS.NO_TARGET);
  assert.equal(r.status, 'CONFIG_INCOMPLETE');
  assert.equal(r.score, null, '目标都没定就出正式分 = 凭空立 KPI');
  assert.ok(r.provisionalScore > 0, '参考分仍要给，否则设置目标前什么都看不见');
  assert.equal(r.gradable, false);
});

test('完成率类指标分母为 0 → 不判 0 分，移出分母', () => {
  const r = computeReview({
    scope: 'department',
    leads: { a: 10, b: 30, c: 0, ungraded: 0, total: 40 },
    spend: SPEND(25000),
    process: { weekly: { done: 0, total: 0 }, fix: { done: 0, total: 0 }, test: { done: 0, total: 0 } },
    targets: TARGETS,
  });
  for (const key of ['weekly', 'fix', 'test']) {
    assert.equal(byKey(r, key).status, REVIEW_STATUS.NO_BASELINE, key + ' 应移出分母');
  }
  assert.equal(r.weights.eligible, 85, '15 分的过程指标全部让出，剩 85 分进分母');
  assert.equal(r.score, 100);
});

test('A 级占比：有效询价为 0 时不算占比，但数量本身照常扣分', () => {
  const r = computeReview({
    scope: 'department',
    leads: { a: 0, b: 0, c: 12, ungraded: 0, total: 12 },
    spend: { value: null, status: 'MISSING_DATA' }, process: FULL_PROCESS, targets: TARGETS,
  });
  assert.equal(byKey(r, 'a_ratio').status, REVIEW_STATUS.NO_BASELINE);
  assert.equal(byKey(r, 'a_count').score, 0, '一封 A 级都没有就是 0 分，这个必须扣');
  assert.equal(byKey(r, 'b_count').score, 0);
});

test('覆盖率低于地板 → 不出正式分（数据太少时不给人下判语）', () => {
  const r = computeReview({
    scope: 'department',
    leads: { a: 10, b: 30, c: 0, ungraded: 0, total: 40 },
    spend: { value: null, status: 'MISSING_DATA' },
    process: { weekly: { done: 0, total: 0 }, fix: { done: 0, total: 0 }, test: { done: 0, total: 0 } },
    targets: { ...TARGETS, a_target: 10, b_target: null },
  });
  // b 没目标（NO_TARGET，留在分母）+ 成本缺数据 → 覆盖率被压低
  assert.ok(r.coverage < DEFAULT_REVIEW_CONFIG.minCoverage || r.status !== 'GRADED');
  assert.equal(r.score, null);
});

test('广告投入只做预算对照，永远不计分', () => {
  const r = computeReview({
    scope: 'department',
    leads: { a: 10, b: 30, c: 0, ungraded: 0, total: 40 },
    spend: SPEND(36000), process: FULL_PROCESS, targets: TARGETS,
  });
  assert.equal(r.adSpend.scored, false);
  assert.equal(r.adSpend.within_tolerance, false, '36000 超 30000 预算 20%，超出 ±10% 容忍带');
  assert.ok(!r.metrics.some((m) => m.key === 'ad_spend'), '广告投入不得作为计分指标出现');
  // 超预算本身不扣分，但多花的钱会如实体现在两项获客成本上——这是老板表的设计，不是重复惩罚
  const sameSpendAsTarget = computeReview({
    scope: 'department',
    leads: { a: 10, b: 30, c: 0, ungraded: 0, total: 40 },
    spend: SPEND(25000), process: FULL_PROCESS, targets: TARGETS,
  });
  assert.equal(sameSpendAsTarget.score, 100);
  assert.ok(r.score < 100, '多花了钱、结果没变多 → 获客成本变差，分数应当下降');
  assert.equal(byKey(r, 'cost_a').actual, 3600); // 36000 ÷ 10
});

test('绩效系数分档按老板表匹配', () => {
  const bands = DEFAULT_REVIEW_CONFIG.bands;
  assert.equal(bandFor(115, bands).coef, 1.2);
  assert.equal(bandFor(100, bands).coef, 1.0);
  assert.equal(bandFor(99.9, bands).label, '良好');
  assert.equal(bandFor(80, bands).label, '达标');
  assert.equal(bandFor(79.9, bands).coef, 0.6);
  assert.equal(bandFor(null, bands), null, '没出分就没有系数，不能默认给 0.6');
});

test('配置从 kpi_config 读；脏 JSON 不得让整页打不开', () => {
  const cfg = getReviewConfig({ review_weight_a: '50', review_metric_cap: '1.5', review_bands: '{坏JSON' });
  assert.equal(cfg.weights.a, 50);
  assert.equal(cfg.metricCap, 1.5);
  assert.deepEqual(cfg.bands, DEFAULT_REVIEW_CONFIG.bands, '坏 JSON 应静默回退默认分档');
  // 缺失键回退默认，不得变成 NaN 把分数污染成 null
  assert.equal(getReviewConfig({}).weights.b, 20);
});

/* ===== 区间归集口径 ===== */
const RANGE = { start_date: '2026-09-01', end_date: '2026-09-30' };

test('整改闭环率：「放弃」不进分母，截止日决定归哪个区间', () => {
  const rows = [
    { dept: 'SEO', status: '已改', due_date: '2026-09-10' },
    { dept: 'SEO', status: '进行中', due_date: '2026-09-20' },
    { dept: 'SEO', status: '放弃', due_date: '2026-09-21' },
    { dept: 'SEM', status: '已改', due_date: '2026-09-11' },
    { dept: 'SEO', status: '已改', due_date: '2026-08-31' }, // 区间外
  ];
  assert.deepEqual(fixProgress(rows, RANGE), { done: 2, total: 3 });
  assert.deepEqual(fixProgress(rows, RANGE, 'SEO'), { done: 1, total: 2 });
  // 没填截止日的退回创建日
  assert.deepEqual(fixProgress([{ dept: 'SEM', status: '已改', created_at: '2026-09-05 10:00:00' }], RANGE), { done: 1, total: 1 });
});

test('实验测试完成率按创建日归集（period 是自由文本，不可靠）', () => {
  const rows = [
    { dept: 'SEO', status: '已完成', created_at: '2026-09-02 08:00:00' },
    { dept: 'SEO', status: '进行中', created_at: '2026-09-03 08:00:00' },
    { dept: 'SEM', status: '已完成', created_at: '2026-10-01 08:00:00' },
  ];
  assert.deepEqual(testProgress(rows, RANGE), { done: 1, total: 2 });
  assert.deepEqual(testProgress(rows, RANGE, 'SEM'), { done: 0, total: 0 });
});

test('周报完成率：分母=区间周数×部门数，建了空行不算交', () => {
  // 2026-09 的周一：07 / 14 / 21 / 28 —— 共 4 周
  const rows = [
    { dept: 'SEO', week_key: '2026-09-07', summary: ['做了事'], problems: [], analysis: [], next_plan: [] },
    { dept: 'SEM', week_key: '2026-09-07', summary: [], problems: [], analysis: [], next_plan: [] }, // 空行
    { dept: 'SEO', week_key: '2026-09-14', summary: [], problems: ['有问题'], analysis: [], next_plan: [] },
  ];
  assert.deepEqual(weeklyProgress(rows, RANGE), { done: 2, total: 8 });
  assert.deepEqual(weeklyProgress(rows, RANGE, 'SEO'), { done: 2, total: 4 });
});

test('部门询盘汇总含直接/其他渠道（老板口径），未归因占比另算', () => {
  const rows = [
    { grade: 'A', channel: 'SEO自然' }, { grade: 'B', channel: 'SEM付费' },
    { grade: 'A', channel: '直接' }, { grade: 'C', channel: '其他' },
    { grade: null, channel: '直接' },
  ];
  const s = summarizeLeads(rows);
  assert.equal(s.a, 2, '直接渠道的 A 级同样计入部门总量');
  assert.equal(s.ungraded, 1, '没评级的单独计，不能默默算成 C');
  assert.equal(s.byChannel.direct, 2);
  assert.equal(s.byChannel.other, 1);
});

test('跨月区间回退通用目标，不挑一个月假装代表全区间', () => {
  assert.equal(periodKeyFor({ start_date: '2026-09-01', end_date: '2026-09-30' }), '2026-09');
  assert.equal(periodKeyFor({ start_date: '2026-08-15', end_date: '2026-09-14' }), null);
  assert.equal(periodKeyFor(null), null);
});
