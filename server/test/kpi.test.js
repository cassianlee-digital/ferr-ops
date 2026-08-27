// KPI 评分：整个后台「公司分/李分/陈分」的权威算法。达成率、反向指标、权重、封顶都要守住。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ratio, blockRate, grade, computeScores, computeAssessment, leadQualityIndex, cpviPatch, leadMixByChannel, computeExecutionRate } from '../src/services/kpi.js';

test('ratio(正向 r)：达成率 = actual/target，封顶 1', () => {
  assert.equal(ratio({ mode: 'r', target: 100, actual: 50 }), 0.5);
  assert.equal(ratio({ mode: 'r', target: 100, actual: 200 }), 1); // 超额封顶
  assert.equal(ratio({ mode: 'r', target: 0, actual: 50 }), 0);    // 目标 0 → 0（不除零）
});

test('ratio(反向 i：越小越好)：达成率 = target/actual，封顶 1', () => {
  assert.equal(ratio({ mode: 'i', target: 50, actual: 100 }), 0.5); // 实际超标一倍
  assert.equal(ratio({ mode: 'i', target: 100, actual: 50 }), 1);   // 优于目标 → 封顶
  assert.equal(ratio({ mode: 'i', target: 50, actual: 0 }), 0);     // 0 是未形成有效观测，不得凭空满分
  assert.equal(ratio({ mode: 'i', target: 50, actual: null }), 0);  // 缺失值不得参与评分
});

test('blockRate：按权重加权平均达成率', () => {
  const rows = [
    { mode: 'r', target: 100, actual: 100, weight: 2 }, // ratio 1
    { mode: 'r', target: 100, actual: 0, weight: 1 },   // ratio 0
  ];
  assert.equal(blockRate(rows), 2 / 3); // (1*2 + 0*1)/3
  assert.equal(blockRate([]), 0);
  assert.equal(blockRate([{ mode: 'r', target: 100, actual: 100, weight: 0 }]), 0); // 权重和 0 不除零
});

test('grade：分档边界 90/75/60', () => {
  assert.equal(grade(90), '优秀');
  assert.equal(grade(89.9), '合格');
  assert.equal(grade(75), '合格');
  assert.equal(grade(74.9), '警告');
  assert.equal(grade(60), '警告');
  assert.equal(grade(59.9), '整改');
});

test('computeScores：李=总*0.5+SEO*0.5，陈=总*0.5+SEM*0.5，公司=均值', () => {
  const rows = [
    { grp: 'total', mode: 'r', target: 100, actual: 50, weight: 1 }, // tR=0.5
    { grp: 'seo', mode: 'r', target: 100, actual: 100, weight: 1 },  // seoR=1
    { grp: 'sem', mode: 'r', target: 100, actual: 0, weight: 1 },    // semR=0
  ];
  const { scores } = computeScores(rows);
  assert.equal(scores.li, 75);      // (0.5*0.5 + 1*0.5)*100
  assert.equal(scores.chen, 25);    // (0.5*0.5 + 0*0.5)*100
  assert.equal(scores.company, 50); // (75+25)/2
  assert.equal(scores.grade, '整改');
});

/* ===== 评分引擎 v2（绩效重构·硬化）：六态 + 覆盖率=valid/eligible + 块级状态 + CONFIG_INCOMPLETE ===== */
const cfg = (o = {}) => ({
  min_coverage_to_grade: 0.6, metric_score_cap: 1.0, final_score_cap: 1.0,
  blocks: { total: { required: true, na: false }, seo: { required: true, na: false }, sem: { required: true, na: false } },
  ...o,
});
const CFG = cfg();
const CFG0 = cfg({ min_coverage_to_grade: 0 });
// 把指定块显式标 NOT_APPLICABLE（管理员声明本期不考），返回一份 blocks 配置。
const naBlocks = (...grps) => { const b = cfg().blocks; for (const g of grps) b[g] = { required: true, na: true }; return b; };
// 构造一条 kpi_targets 风格的行；默认 performance、scorable、数据可用。
const M = (grp, name, weight, target, actual, mode, o = {}) => ({
  grp, name, weight, target, actual, mode,
  scorable: o.scorable ?? 1, data_status: o.ds ?? null,
  actual_available: o.avail ?? (actual != null), target_type: mode === 'i' ? 'lower' : 'higher',
  category: o.cat || 'performance', perf_group: o.pg || null,
  sample_size: o.sample ?? null, min_sample: o.min ?? null,
});
const fullRows = () => [
  M('total', 'A级询盘数', 35, 10, 8, 'r'),
  M('total', '有效询盘成本', 25, 2000, 1500, 'i'),
  M('total', '闭环执行度', 15, 5, 5, 'r'),
  M('seo', '加权搜索可见度', 60, 100, 70, 'r', { pg: 'visibility' }),
  M('seo', '有效页面率', 40, 80, 60, 'r', { pg: 'asset' }),
  M('seo', '跳出率', 10, 55, 50, 'i', { scorable: 0, cat: 'diagnostic' }),
];

test('v2：诊断/汇总(scorable=0)不进评分', () => {
  const a = computeAssessment(fullRows(), CFG);
  assert.equal(a.diagnostics.length, 1);
  assert.equal(a.diagnostics[0].name, '跳出率');
  assert.equal(a.blocks.seo.metrics.length, 2); // 跳出率不在可评分明细内
});

test('v2：李/陈只看自己可归因指标，不继承共享 KPI（点1/3/5）', () => {
  // seo/sem 本期声明 NOT_APPLICABLE → 公司只承接共享；李/陈 各自块被剔除 → NO_METRICS，绝不继承公司分
  const rows = [M('total', 'A级询盘数', 35, 10, 9, 'r'), M('total', '闭环执行度', 15, 5, 5, 'r')];
  const a = computeAssessment(rows, cfg({ blocks: naBlocks('seo', 'sem') }));
  assert.equal(a.scores.li.score, null);
  assert.equal(a.scores.li.status, 'NO_METRICS');
  assert.equal(a.scores.chen.status, 'NO_METRICS');
  assert.notEqual(a.scores.company.score, null); // 公司承接共享
});

test('v2：Company/SEO/SEM 覆盖率各自独立（点2）', () => {
  const rows = [M('total', 'A级询盘数', 35, 10, 8, 'r'), M('seo', '加权搜索可见度', 100, 100, 70, 'r', { pg: 'visibility' })];
  const a = computeAssessment(rows, cfg({ blocks: naBlocks('sem') }));
  assert.equal(a.scores.li.coverage, 1);        // SEO 自身全覆盖
  assert.equal(a.scores.chen.status, 'NO_METRICS'); // SEM 本期不适用
  assert.equal(a.scores.li.status, 'GRADED');
});

// Test A：coverage<阈值 → score=null + provisionalScore≠null + INSUFFICIENT_COVERAGE（点1/6）
test('Test A：覆盖率不足 → 官方分 null、给参考分', () => {
  const rows = [M('total', 'A级询盘数', 35, 10, 8, 'r'), M('total', '有效询盘成本', 25, 2000, null, 'i', { avail: false })];
  const c = computeAssessment(rows, cfg({ blocks: naBlocks('seo', 'sem') })).scores.company; // 仅共享块 coverage=35/60=0.583<0.6
  assert.equal(c.status, 'INSUFFICIENT_COVERAGE');
  assert.equal(c.score, null);
  assert.equal(c.gradable, false);
  assert.notEqual(c.provisionalScore, null);
});

test('Test B：整块 NOT_APPLICABLE → NO_METRICS', () => {
  const rows = [M('seo', '加权搜索可见度', 60, 100, 70, 'r', { ds: 'NOT_APPLICABLE', pg: 'visibility' })];
  const s = computeAssessment(rows, CFG0).scores.li;
  assert.equal(s.status, 'NO_METRICS');
  assert.equal(s.coverage, 0);
});

test('Test C：全部 MISSING_DATA → NO_VALID_DATA, coverage=0', () => {
  const rows = [M('seo', '加权搜索可见度', 60, 100, null, 'r', { avail: false, pg: 'visibility' })];
  const s = computeAssessment(rows, CFG0).scores.li;
  assert.equal(s.status, 'NO_VALID_DATA');
  assert.equal(s.coverage, 0);
  assert.equal(s.score, null);
});

test('Test D：真实 0 计入评分，不当缺失', () => {
  const rows = [M('seo', '加权搜索可见度', 100, 100, 0, 'r', { avail: true, pg: 'visibility' })];
  const s = computeAssessment(rows, CFG0);
  assert.equal(s.blocks.seo.metrics[0].data_status, 'VALID');
  assert.equal(s.blocks.seo.metrics[0].included, true);
  assert.equal(s.blocks.seo.rate, 0);
  assert.equal(s.scores.li.status, 'GRADED');
});

test('Test E：NOT_APPLICABLE 不进 eligible 分母', () => {
  const rows = [
    M('seo', '加权搜索可见度', 80, 100, 70, 'r', { pg: 'visibility' }),
    M('seo', '实验闭环', 20, 100, null, 'r', { ds: 'NOT_APPLICABLE', pg: 'experiment' }),
  ];
  const b = computeAssessment(rows, CFG0).blocks.seo;
  assert.equal(b.eligibleWeight, 80);
  assert.equal(b.validWeight, 80);
  assert.equal(b.coverage, 1);
});

test('Test F：TRACKING_ERROR 进分母不进有效，拉低覆盖率', () => {
  const rows = [
    M('seo', '加权搜索可见度', 80, 100, 70, 'r', { pg: 'visibility' }),
    M('seo', '有效页面率', 20, 100, null, 'r', { ds: 'TRACKING_ERROR', pg: 'asset' }),
  ];
  const b = computeAssessment(rows, CFG0).blocks.seo;
  assert.equal(b.eligibleWeight, 100);
  assert.equal(b.validWeight, 80);
  assert.equal(b.coverage, 0.8);
});

test('Test G：Company summary Lead 不重复进评分（点7/8）', () => {
  const rows = [
    M('seo', 'SEO有效询盘', 100, 10, 3, 'r', { pg: 'business' }),
    M('sem', 'SEM有效询盘', 100, 10, 1, 'r', { pg: 'business' }),
    M('total', '公司总有效询盘', 100, 20, 4, 'r', { scorable: 0, cat: 'summary' }),
  ];
  const a = computeAssessment(rows, CFG0);
  assert.equal(a.blocks.total.metrics.length, 0);   // 汇总项不进可评分明细
  assert.equal(a.summaries.length, 1);              // 单列展示
  assert.equal(a.scores.li.score != null, true);    // SEO 正常评分
});

// Test H：required 块未配置 → CONFIG_INCOMPLETE（官方分 null，给参考分）（点5/14）
test('Test H：required 块 NOT_CONFIGURED → CONFIG_INCOMPLETE', () => {
  const rows = [M('total', 'A级询盘数', 100, 10, 10, 'r'), M('sem', 'SEM有效询盘', 100, 10, 5, 'r', { pg: 'business' })];
  const c = computeAssessment(rows, CFG).scores.company; // seo 无指标 + required → NOT_CONFIGURED
  assert.equal(c.blocks.seo.assessment_state, 'NOT_CONFIGURED');
  assert.equal(c.status, 'CONFIG_INCOMPLETE');
  assert.equal(c.score, null);
  assert.equal(c.gradable, false);
  assert.notEqual(c.provisionalScore, null);
});

// Test I：块显式 NOT_APPLICABLE → 允许从公司权重剔除并重归一 → 可 GRADED（点8/14）
test('Test I：显式 NOT_APPLICABLE 块可剔除重归一', () => {
  const rows = [M('total', 'A级询盘数', 100, 10, 10, 'r'), M('seo', '加权可见度', 100, 100, 80, 'r', { pg: 'visibility' })];
  const c = computeAssessment(rows, cfg({ blocks: naBlocks('sem') })).scores.company;
  assert.equal(c.blocks.sem.assessment_state, 'NOT_APPLICABLE');
  assert.equal(c.status, 'GRADED');
  assert.equal(c.score, 93.3); // total 2/3 + seo 1/3 → 1*2/3 + 0.8*1/3 = 0.933
});

// Test J：ACTIVE 块无 VALID（全 MISSING/TRACKING_ERROR）→ 不剔除，拉低公司 coverage（点8/14）
test('Test J：ACTIVE 无有效数据 → 不剔除、拉低覆盖率', () => {
  const rows = [
    M('total', 'A级询盘数', 100, 10, 10, 'r'),
    M('sem', 'SEM有效询盘', 100, 10, 10, 'r', { pg: 'business' }),
    M('seo', '加权可见度', 100, 100, null, 'r', { ds: 'TRACKING_ERROR', pg: 'visibility' }),
  ];
  const c = computeAssessment(rows, CFG).scores.company;
  assert.equal(c.blocks.seo.assessment_state, 'ACTIVE');   // 有指标就是 ACTIVE，非 NOT_CONFIGURED
  assert.notEqual(c.status, 'CONFIG_INCOMPLETE');
  assert.equal(c.coverage, 0.75); // total.5×1 + sem.25×1 + seo.25×0 = 0.75（seo 未被剔除）
});

// Test K：NO_METRICS ≠ NOT_APPLICABLE — required 空块保留权重、触发 CONFIG_INCOMPLETE（点1/7/14）
test('Test K：NO_METRICS 不自动等于 NOT_APPLICABLE', () => {
  const rows = [M('total', 'A级询盘数', 100, 10, 10, 'r'), M('sem', 'SEM有效询盘', 100, 10, 10, 'r', { pg: 'business' })];
  const c = computeAssessment(rows, CFG).scores.company; // seo required 空
  assert.equal(c.blocks.seo.assessment_state, 'NOT_CONFIGURED');
  assert.equal(c.status, 'CONFIG_INCOMPLETE');
  assert.equal(c.eligibleWeight, 1); // seo 权重未被剔除（total+seo+sem 全保留）
});

test('v2：真实 0 与缺失有别（块内 rate）', () => {
  const real0 = fullRows().map((r) => r.name === '加权搜索可见度' ? { ...r, actual: 0, avail: true } : r);
  const miss = fullRows().map((r) => r.name === '加权搜索可见度' ? { ...r, actual: null, avail: false } : r);
  assert.equal(computeAssessment(real0, CFG).blocks.seo.rate, 0.3);  // (0*60 + 0.75*40)/100
  assert.equal(computeAssessment(miss, CFG).blocks.seo.rate, 0.75);  // 仅有效页面率
});

test('v2：单指标 metric_score_cap 封顶（默认 1.0）', () => {
  const over = [M('total', 'A级询盘数', 100, 10, 50, 'r')];
  assert.equal(computeAssessment(over, CFG).blocks.total.rate, 1);
});

/* ===== Phase 4B：Volume/Quality 分离 + CPVI 零分母 + 动态覆盖率 ===== */
const LW = { lead_weight_a: 3, lead_weight_b: 1, lead_weight_c: 0 };

test('Lead Quality A：质量指数按 A/B/C 结构正确计算（点3）', () => {
  assert.equal(leadQualityIndex({ A: 10, B: 0, C: 0 }, LW), 1);          // 全 A → 1.0
  assert.equal(Math.round(leadQualityIndex({ A: 0, B: 10, C: 0 }, LW) * 1000) / 1000, 0.333); // 全 B → 0.333
  assert.equal(leadQualityIndex({ A: 0, B: 0, C: 10 }, LW), 0);          // 全 C → 0
  assert.equal(leadQualityIndex({ A: 0, B: 0, C: 0 }, LW), null);        // 无样本 → null
});

test('Lead Quality B：样本不足 → INSUFFICIENT_DATA（点4，不硬算质量绩效）', () => {
  // 质量指数行样本 2 < min 3 → INSUFFICIENT_DATA；同期 Volume 真实 2 仍 VALID
  const rows = [
    M('seo', 'SEO 有效询盘数量', 60, 15, 2, 'r', { pg: 'business' }),
    M('seo', 'SEO 询盘质量指数', 40, 0.5, 1, 'r', { pg: 'business', sample: 2, min: 3 }),
  ];
  const b = computeAssessment(rows, CFG0).blocks.seo;
  const vol = b.metrics.find((m) => m.name === 'SEO 有效询盘数量');
  const qi = b.metrics.find((m) => m.name === 'SEO 询盘质量指数');
  assert.equal(vol.data_status, 'VALID');           // Volume 真实结果，含真实值都算
  assert.equal(qi.data_status, 'INSUFFICIENT_DATA'); // Quality 样本不足不计
  assert.equal(qi.included, false);
});

test('CPVI A：spend>0 & 有效>0 → 正常计算 VALID', () => {
  const p = cpviPatch(1000, 5, 'src');
  assert.equal(p.actual, 200);
  assert.equal(p.data_status, 'VALID');
  assert.equal(p.forced_ratio, undefined);
});

test('CPVI B：spend>0 & 有效=0 → VALID + score 0（不逃出评分，点5）', () => {
  const p = cpviPatch(1000, 0, 'src');
  assert.equal(p.forced_ratio, 0);
  assert.equal(p.data_status, 'VALID');
  assert.equal(p.reason, 'SPEND_WITH_ZERO_VALID_LEADS');
  assert.notEqual(p.actual, 0); // 不能把 actual 写成 0（会被误读成成本 0）
  // 引擎侧：forced_ratio=0 的行进入评分并得 0 分
  const rows = [M('sem', '每有效询盘成本', 100, 2000, null, 'i', { pg: 'efficiency' })];
  rows[0].forced_ratio = 0; rows[0].data_status = 'VALID';
  const b = computeAssessment(rows, CFG0).blocks.sem;
  assert.equal(b.metrics[0].included, true);
  assert.equal(b.metrics[0].ratio, 0);
  assert.equal(b.rate, 0);
});

test('CPVI C：spend=0 & 有效=0 → MISSING_DATA（不显示 CPVI=0，点6）', () => {
  const p = cpviPatch(0, 0, 'src');
  assert.equal(p.data_status, 'MISSING_DATA');
  assert.equal(p.actual, null); // 不是 0
  assert.equal(p.forced_ratio, undefined);
});

test('Shared Execution：旧 total/闭环执行度(summary) 不再参与 performance score（点7/12）', () => {
  const rows = [
    M('total', '闭环执行度', 100, 5, 3, 'r', { scorable: 0, cat: 'summary' }),
    M('sem', 'SEM 有效询盘数量', 100, 10, 5, 'r', { pg: 'business' }),
  ];
  const a = computeAssessment(rows, cfg({ blocks: naBlocks('seo') }));
  assert.equal(a.blocks.total.metrics.length, 0);            // 闭环不在可评分明细
  assert.equal(a.summaries.some((x) => x.name === '闭环执行度'), true);
});

test('Coverage 动态：SEO≈43.96% INSUFFICIENT / SEM=65% GRADED（点1/13，不写死）', () => {
  // 按 catalog 扁平权重构造；GEO=NOT_APPLICABLE 不进分母，其余占位 MISSING
  const rows = [
    // SEO：Business VALID(24+16)，其余 MISSING，GEO NOT_APPLICABLE(9)
    M('seo', 'SEO 有效询盘数量', 24, 15, 8, 'r', { pg: 'business' }),
    M('seo', 'SEO 询盘质量指数', 16, 0.5, 0.6, 'r', { pg: 'business', sample: 10, min: 3 }),
    M('seo', '加权商业词可见度', 12, 100, null, 'r', { pg: 'visibility', ds: 'MISSING_DATA' }),
    M('seo', '高意图词可见度', 9, 100, null, 'r', { pg: 'visibility', ds: 'MISSING_DATA' }),
    M('seo', 'GEO/AI 可见度', 9, 100, null, 'r', { pg: 'visibility', ds: 'NOT_APPLICABLE' }),
    M('seo', '有效页面率', 15, 60, null, 'r', { pg: 'asset', ds: 'MISSING_DATA' }),
    M('seo', 'SEO 优化验证闭环', 10, 100, null, 'r', { pg: 'execution', ds: 'MISSING_DATA' }),
    M('seo', 'SEO 实验学习闭环', 5, 100, null, 'r', { pg: 'experiment', ds: 'MISSING_DATA' }),
    // SEM：Business(24+16) + CPVI(25) VALID = 65；其余 MISSING = 35
    M('sem', 'SEM 有效询盘数量', 24, 15, 6, 'r', { pg: 'business' }),
    M('sem', 'SEM 询盘质量指数', 16, 0.5, 0.5, 'r', { pg: 'business', sample: 8, min: 3 }),
    M('sem', '每有效询盘成本', 25, 2000, 1800, 'i', { pg: 'efficiency' }),
    M('sem', '无效流量消耗率', 15, 15, null, 'i', { pg: 'quality', ds: 'MISSING_DATA' }),
    M('sem', 'SEM 优化验证闭环', 10, 100, null, 'r', { pg: 'execution', ds: 'MISSING_DATA' }),
    M('sem', 'SEM 实验学习闭环', 10, 100, null, 'r', { pg: 'experiment', ds: 'MISSING_DATA' }),
  ];
  const a = computeAssessment(rows, cfg({ blocks: naBlocks('total') }));
  assert.equal(a.scores.li.coverage, 0.44);          // 40/91≈0.4396 → round3 0.44 < 0.6
  assert.equal(a.scores.li.status, 'INSUFFICIENT_COVERAGE');
  assert.equal(a.scores.chen.coverage, 0.65);        // 65/100 ≥ 0.6
  assert.equal(a.scores.chen.status, 'GRADED');
});

test('leadMixByChannel：按渠道拆 A/B/C 与 effective', () => {
  const mix = leadMixByChannel([
    { channel: 'SEO自然', grade: 'A' }, { channel: 'SEO自然', grade: 'B' }, { channel: 'SEO自然', grade: 'C' },
    { channel: 'SEM付费', grade: 'A' }, { channel: '直接', grade: 'A' },
  ]);
  assert.deepEqual({ A: mix.SEO.A, B: mix.SEO.B, C: mix.SEO.C, eff: mix.SEO.effective, tot: mix.SEO.total }, { A: 1, B: 1, C: 1, eff: 2, tot: 3 });
  assert.equal(mix.SEM.effective, 1);
});

/* ===== Phase 5A：Execution Verified Rate（records 已按 channel + 到期落区间过滤）===== */
const ECFG = { exec_impact_high: 3, exec_impact_medium: 2, exec_impact_low: 1 };
const R = (impact, status, o = {}) => ({ impact_level: impact, status, exclude_from_assessment: o.exclude ? 1 : 0, verification_result: o.result || null });

test('Exec 1：HIGH VERIFIED → 进分子与分母，rate=100%', () => {
  const r = computeExecutionRate([R('HIGH', 'VERIFIED')], ECFG);
  assert.equal(r.data_status, 'VALID');
  assert.equal(r.eligible_weight, 3);
  assert.equal(r.verified_weight, 3);
  assert.equal(r.actual, 100);
});

test('Exec 2：HIGH IMPLEMENTED 未验证 → 进分母不进分子', () => {
  const r = computeExecutionRate([R('HIGH', 'IMPLEMENTED')], ECFG);
  assert.equal(r.eligible_weight, 3);
  assert.equal(r.verified_weight, 0);
  assert.equal(r.actual, 0);
});

test('Exec 4：NEGATIVE 结果但完整 VERIFIED → 仍计入 verified（点5/11）', () => {
  const r = computeExecutionRate([R('HIGH', 'VERIFIED', { result: 'NEGATIVE' })], ECFG);
  assert.equal(r.verified_weight, 3);
  assert.equal(r.actual, 100);
});

test('Exec 5：FAILED/逾期未验证 → 进 eligible 不进 verified', () => {
  const r = computeExecutionRate([R('HIGH', 'FAILED')], ECFG);
  assert.equal(r.eligible_weight, 3);
  assert.equal(r.verified_weight, 0);
  assert.equal(r.actual, 0);
});

test('Exec 6：0 eligible → INSUFFICIENT_DATA，绝不 0/0=100%（点17）', () => {
  const r = computeExecutionRate([], ECFG);
  assert.equal(r.data_status, 'INSUFFICIENT_DATA');
  assert.equal(r.actual, null);
});

test('Exec 7：CANCELLED 未批准排除 → 不自动逃出分母（点10）', () => {
  const r = computeExecutionRate([R('HIGH', 'CANCELLED', { exclude: false })], ECFG);
  assert.equal(r.eligible_weight, 3);
  assert.equal(r.verified_weight, 0);
  assert.equal(r.data_status, 'VALID');
  assert.equal(r.actual, 0);
});

test('Exec 8：管理员批准 exclude_from_assessment → 允许排除', () => {
  const r = computeExecutionRate([R('HIGH', 'CANCELLED', { exclude: true })], ECFG);
  assert.equal(r.eligible_weight, 0);
  assert.equal(r.data_status, 'INSUFFICIENT_DATA'); // 排除后无 eligible
});

test('Exec 混合：HIGH verified + MEDIUM failed → 60%，且分桶正确（点18）', () => {
  const r = computeExecutionRate([R('HIGH', 'VERIFIED'), R('MEDIUM', 'FAILED')], ECFG);
  assert.equal(r.eligible_weight, 5);   // 3 + 2
  assert.equal(r.verified_weight, 3);
  assert.equal(r.actual, 60);
  assert.deepEqual(r.buckets.HIGH, { v: 1, e: 1 });
  assert.deepEqual(r.buckets.MEDIUM, { v: 0, e: 1 });
});
