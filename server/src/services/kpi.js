// KPI 评分（后端权威）+ 由运营数据回写实际值。
import * as kpiRepo from '../db/repositories/kpi.js';
import * as seoRepo from '../db/repositories/seoWeeks.js';
import * as semRepo from '../db/repositories/semWeeks.js';
import * as inqRepo from '../db/repositories/inquiries.js';
import * as loopRepo from '../db/repositories/loopItems.js';
import { seoWow } from './derive.js';
import { computeAttribution, classify } from './attribution.js';
import * as execRepo from '../db/repositories/executionLoops.js';
import * as snapRepo from '../db/repositories/kpiSnapshots.js';
import { periodRange } from '../lib/kpiPeriod.js';

// 单指标达成率：反向(i)指标越小越好
export function ratio(k) {
  const target = Number(k.target);
  const actual = Number(k.actual);
  if (!Number.isFinite(target) || !Number.isFinite(actual) || target <= 0 || actual <= 0) return 0;
  if (k.mode === 'i') {
    return Math.min(target / actual, 1);
  }
  return Math.min(actual / target, 1);
}

export function blockRate(rows) {
  const wsum = rows.reduce((s, k) => s + k.weight, 0);
  if (!wsum) return 0;
  return rows.reduce((s, k) => s + ratio(k) * k.weight, 0) / wsum;
}

export function grade(score) {
  if (score >= 90) return '优秀';
  if (score >= 75) return '合格';
  if (score >= 60) return '警告';
  return '整改';
}

// 计算公司/李/陈 分数；返回带 rows 的快照，供前端渲染
export function computeScores(rows = kpiRepo.list()) {
  // 仅统计可评分指标（诊断/汇总 scorable=0 不进旧算法），避免绩效重构后诊断污染 overview 的 legacy 分。
  const scored = rows.filter((r) => r.scorable !== 0);
  const total = scored.filter((r) => r.grp === 'total');
  const seo = scored.filter((r) => r.grp === 'seo');
  const sem = scored.filter((r) => r.grp === 'sem');
  const tR = blockRate(total), seoR = blockRate(seo), semR = blockRate(sem);
  const liScore = (tR * 0.5 + seoR * 0.5) * 100;
  const chenScore = (tR * 0.5 + semR * 0.5) * 100;
  const company = (liScore + chenScore) / 2;
  return {
    rows,
    scores: {
      li: Math.round(liScore * 10) / 10,
      chen: Math.round(chenScore * 10) / 10,
      company: Math.round(company),
      grade: grade(company),
    },
  };
}

function setRangeActual(rows, grp, name, actual, source) {
  const row = rows.find((item) => item.grp === grp && item.name === name);
  if (!row) return;
  row.actual = actual == null || !Number.isFinite(Number(actual)) ? null : Number(actual);
  row.actual_available = row.actual != null;
  row.actual_source = source;
}

// 富赋值：可同时写 data_status / forced_ratio / display_value / reason / sample_size / min_sample（CPVI 边界、质量样本）。
function setRangeMetric(rows, grp, name, patch) {
  const row = rows.find((item) => item.grp === grp && item.name === name);
  if (!row) return;
  if ('actual' in patch) { row.actual = patch.actual == null || !Number.isFinite(Number(patch.actual)) ? null : Number(patch.actual); row.actual_available = row.actual != null; }
  for (const k of ['data_status', 'forced_ratio', 'display_value', 'reason', 'sample_size', 'min_sample', 'actual_source']) {
    if (k in patch) row[k] = patch[k];
  }
}

// Execution 影响权重（配置化）。缺失 impact 默认按 MEDIUM 计（防止靠不填 impact 逃避）。
function impactWeight(level, cfg) {
  if (level === 'HIGH') return cfg.exec_impact_high;
  if (level === 'LOW') return cfg.exec_impact_low;
  return cfg.exec_impact_medium; // MEDIUM 或缺失
}
/* Verified Execution Rate（点6/7/17）——纯函数，records 已按 channel + 到期落在区间过滤。
   Eligible = 未被管理员批准排除的记录（CANCELLED 但未批准仍在分母，防刷；点10）。
   Verified = status===VERIFIED（含 NEGATIVE 结果，只要完整验证；点5/11）。
   0 Eligible → INSUFFICIENT_DATA，绝不 0/0=100%（点17）。actual 以百分比表达（target=100 → ratio=rate）。 */
export function computeExecutionRate(records, cfg) {
  const eligible = records.filter((r) => Number(r.exclude_from_assessment) !== 1);
  const w = (r) => impactWeight(r.impact_level, cfg);
  const bucket = { HIGH: { v: 0, e: 0 }, MEDIUM: { v: 0, e: 0 }, LOW: { v: 0, e: 0 } };
  let eligibleWeight = 0, verifiedWeight = 0;
  for (const r of eligible) {
    const wt = w(r), lvl = r.impact_level === 'HIGH' || r.impact_level === 'LOW' ? r.impact_level : 'MEDIUM';
    eligibleWeight += wt; bucket[lvl].e += 1;
    if (r.status === 'VERIFIED') { verifiedWeight += wt; bucket[lvl].v += 1; }
  }
  if (eligibleWeight === 0) {
    return { actual: null, data_status: 'INSUFFICIENT_DATA', sample_size: 0, eligible_weight: 0, verified_weight: 0, buckets: bucket };
  }
  const rate = verifiedWeight / eligibleWeight;
  return { actual: Math.round(rate * 1000) / 10, data_status: 'VALID', sample_size: eligible.length, eligible_weight: eligibleWeight, verified_weight: verifiedWeight, buckets: bucket };
}
// 查询 + 计算某渠道本区间的 Execution Rate（DB 依赖薄封装）。
export function deriveExecutionRate(channel, range, cfg = getKpiConfig()) {
  const records = execRepo.list({ channel, range, dueInRange: true });
  return computeExecutionRate(records, cfg);
}

// CPVI 零分母处理（点5/6）。纯函数，便于单测。
// spend>0 & eff>0 → 正常 VALID；spend>0 & eff=0 → 强制最差分(VALID score 0)，绝不逃出评分；spend=0 → MISSING_DATA。
export function cpviPatch(spend, effective, source) {
  if (spend > 0 && effective > 0) return { actual: spend / effective, data_status: 'VALID', actual_source: source };
  if (spend > 0 && effective === 0) return { actual: null, forced_ratio: 0, data_status: 'VALID', display_value: '无有效询盘', reason: 'SPEND_WITH_ZERO_VALID_LEADS', actual_source: source };
  return { actual: null, data_status: 'MISSING_DATA', actual_source: source }; // spend=0：无花费≠效率无限好
}

// 按渠道拆 A/B/C（与 attribution.classify 同口径）。C = total - effective。
export function leadMixByChannel(inquiryRows) {
  const mk = () => ({ A: 0, B: 0, C: 0 });
  const ch = { SEO: mk(), SEM: mk(), direct: mk(), other: mk() };
  for (const r of inquiryRows) {
    const k = classify(r.channel);
    if (r.grade === 'A') ch[k].A++; else if (r.grade === 'B') ch[k].B++; else if (r.grade === 'C') ch[k].C++;
  }
  for (const k of Object.keys(ch)) { const c = ch[k]; c.total = c.A + c.B + c.C; c.effective = c.A + c.B; }
  return ch;
}
// Lead Quality Index（点3）：(A·wa + B·wb + C·wc) / ((A+B+C)·wa)，范围 0~1，衡量 Lead 质量结构而非数量。
export function leadQualityIndex(m, cfg) {
  const n = m.A + m.B + m.C, wa = cfg.lead_weight_a;
  if (n === 0 || !(wa > 0)) return null;
  return (m.A * wa + m.B * cfg.lead_weight_b + m.C * cfg.lead_weight_c) / (n * wa);
}
// 把「有效询盘数量(Volume) + 质量指数(Quality) + CPVI」写进 rows（deriveRangeRows / recomputeActuals 共用逻辑）。
function applyLeadMetrics(rows, grp, mix, cfg, minSample) {
  const vol = grp === 'seo' ? 'SEO 有效询盘数量' : 'SEM 有效询盘数量';
  const qi = grp === 'seo' ? 'SEO 询盘质量指数' : 'SEM 询盘质量指数';
  // Volume：真实结果，含真实 0 → VALID（0 得 0 分，非缺失）。
  setRangeMetric(rows, grp, vol, { actual: mix.effective, data_status: 'VALID', actual_source: 'inquiries.channel/grade' });
  // Quality Index：样本不足 → INSUFFICIENT_DATA（不硬算），与 Volume 的真实 0 严格区分（点4）。
  const q = leadQualityIndex(mix, cfg);
  if (mix.total < minSample) {
    setRangeMetric(rows, grp, qi, { actual: q, data_status: 'INSUFFICIENT_DATA', sample_size: mix.total, min_sample: minSample, actual_source: 'inquiries.channel/grade' });
  } else {
    setRangeMetric(rows, grp, qi, { actual: q, data_status: 'VALID', sample_size: mix.total, min_sample: minSample, actual_source: 'inquiries.channel/grade' });
  }
}

// 日期筛选只生成一次性的 KPI 快照，不回写 kpi_targets.actual。
// 这样不同用户查看不同区间时，不会互相覆盖共享的 KPI 实际值。
export function deriveRangeRows(range) {
  const rows = kpiRepo.list().map((row) => ({
    ...row,
    actual: null,
    actual_available: false,
    actual_source: 'selected_range_no_evidence',
  }));

  const cfg = getKpiConfig();
  const inquiryRows = inqRepo.list(range);
  const inquiryStats = inqRepo.stats(range);
  const mix = leadMixByChannel(inquiryRows);
  const minSample = cfg.lead_quality_min_sample;

  // 汇总（summary，仅展示不评分）
  setRangeActual(rows, 'total', '询盘总量', inquiryStats.total, 'inquiries.date');
  setRangeActual(rows, 'total', 'A级询盘数', inquiryStats.a, 'inquiries.date');

  // SEO / SEM Business Contribution / Lead Value（VALID·真实渠道归因）：Volume + Quality
  applyLeadMetrics(rows, 'seo', mix.SEO, cfg, minSample);
  applyLeadMetrics(rows, 'sem', mix.SEM, cfg, minSample);

  // 诊断（不评分，仅展示健康趋势）：SEO/SEM 周报最新一周
  const seoWeeks = seoRepo.list(range);
  const latestSeo = seoWeeks.at(-1);
  const previousSeo = seoWeeks.at(-2);
  if (latestSeo) {
    if (previousSeo) setRangeActual(rows, 'seo', '自然流量环比', seoWow(latestSeo.clicks, previousSeo.clicks), 'seo_weeks.week_date');
    setRangeActual(rows, 'seo', '核心词 Top10 占比', latestSeo.top10_ratio, 'seo_weeks.week_date');
    setRangeActual(rows, 'seo', '关键词覆盖/长尾', latestSeo.coverage, 'seo_weeks.week_date');
    setRangeActual(rows, 'seo', '新增收录页面', latestSeo.indexed_pages, 'seo_weeks.week_date');
    setRangeActual(rows, 'seo', '跳出率', latestSeo.bounce_rate, 'seo_weeks.week_date');
    setRangeActual(rows, 'seo', '页面停留时长', latestSeo.dwell_seconds, 'seo_weeks.week_date');
  }
  const semWeeks = semRepo.list(range);
  const latestSem = semWeeks.at(-1);
  if (latestSem) {
    setRangeActual(rows, 'sem', 'CPC', latestSem.cpc, 'sem_weeks.week_date');
    setRangeActual(rows, 'sem', 'CTR', latestSem.ctr, 'sem_weeks.week_date');
    setRangeActual(rows, 'sem', '质量分', latestSem.quality_score, 'sem_weeks.week_date');
    setRangeActual(rows, 'sem', 'ROAS', latestSem.roas, 'sem_weeks.week_date');
    setRangeActual(rows, 'sem', '转化次数', latestSem.conversions, 'sem_weeks.week_date');
    setRangeActual(rows, 'sem', '每次转化费用', latestSem.cost_per_conv, 'sem_weeks.week_date');
  }

  // SEM Acquisition Efficiency — 每有效询盘成本 (CPVI)。零分母边界（点5/6）：
  const spend = semWeeks.reduce((sum, row) => sum + (Number(row.cost) || 0), 0);
  setRangeMetric(rows, 'sem', '每有效询盘成本', cpviPatch(spend, mix.SEM.effective, 'sem_weeks.cost / inquiries(SEM,A/B)'));

  // Execution 验证闭环（Phase 5A）：到期落在区间的问题，按 Impact 加权的已验证率。
  const seoExec = deriveExecutionRate('seo', range, cfg);
  const semExec = deriveExecutionRate('sem', range, cfg);
  setRangeMetric(rows, 'seo', 'SEO 优化验证闭环', { actual: seoExec.actual, data_status: seoExec.data_status, sample_size: seoExec.sample_size, actual_source: 'execution_loops(seo)' });
  setRangeMetric(rows, 'sem', 'SEM 优化验证闭环', { actual: semExec.actual, data_status: semExec.data_status, sample_size: semExec.sample_size, actual_source: 'execution_loops(sem)' });

  return rows;
}

export function computeScoresForRange(range) {
  return {
    ...computeScores(deriveRangeRows(range)),
    range,
    targetBasis: 'configured_monthly_target_unprorated',
  };
}

// 由最新周报 + 询盘汇总回写 kpi_targets.actual
export function recomputeActuals() {
  // SEO：取最新一周（自然流量环比需要上一周）
  const seoWeeks = seoRepo.latestTwo(); // [最新, 次新]
  if (seoWeeks.length) {
    const last = seoWeeks[0], prev = seoWeeks[1];
    if (prev) kpiRepo.setActual('seo', '自然流量环比', seoWow(last.clicks, prev.clicks));
    kpiRepo.setActual('seo', '核心词 Top10 占比', last.top10_ratio);
    kpiRepo.setActual('seo', '关键词覆盖/长尾', last.coverage);
    kpiRepo.setActual('seo', '新增收录页面', last.indexed_pages);
    kpiRepo.setActual('seo', '跳出率', last.bounce_rate);
    kpiRepo.setActual('seo', '页面停留时长', last.dwell_seconds);
  }
  // SEM：取最新一周
  const sem = semRepo.latest();
  if (sem) {
    kpiRepo.setActual('sem', 'CPC', sem.cpc);
    kpiRepo.setActual('sem', 'CTR', sem.ctr);
    kpiRepo.setActual('sem', '质量分', sem.quality_score);
    kpiRepo.setActual('sem', 'ROAS', sem.roas);
    kpiRepo.setActual('sem', '转化次数', sem.conversions);
    kpiRepo.setActual('sem', '每次转化费用', sem.cost_per_conv);
  }
  // TOTAL：询盘总量 / A级数（现为 summary，仅展示）
  const s = inqRepo.stats();
  kpiRepo.setActual('total', '询盘总量', s.total);
  kpiRepo.setActual('total', 'A级询盘数', s.a);

  // 新绩效指标（全时口径，供 legacy/stored 视图；KPI 页用 range 实时算带完整状态）。
  // 注意：stored 路径只写 actual，样本不足/CPVI 零分母等细状态由 range 路径承担。
  const cfg = getKpiConfig();
  const mix = leadMixByChannel(inqRepo.list());
  kpiRepo.setActual('seo', 'SEO 有效询盘数量', mix.SEO.effective);
  kpiRepo.setActual('sem', 'SEM 有效询盘数量', mix.SEM.effective);
  const qSeo = leadQualityIndex(mix.SEO, cfg), qSem = leadQualityIndex(mix.SEM, cfg);
  if (qSeo != null) kpiRepo.setActual('seo', 'SEO 询盘质量指数', qSeo);
  if (qSem != null) kpiRepo.setActual('sem', 'SEM 询盘质量指数', qSem);
  const spend = semRepo.list().reduce((sum, row) => sum + (Number(row.cost) || 0), 0);
  if (spend > 0 && mix.SEM.effective > 0) kpiRepo.setActual('sem', '每有效询盘成本', spend / mix.SEM.effective);
}

/* ============================================================
   KPI 评分引擎 v2（绩效重构）—— 与旧 computeScores 并存，不改旧契约。
   核心区别：① 只对 scorable=1 的指标评分（诊断指标 level 3 不计分）；
   ② 数据缺失/无效不按 0 分，而是「不计入」；③ 可评分权重覆盖率低于地板 → 不出总分；
   ④ 在有效指标间按权重归一化；⑤ 单指标达成率上限可配置（默认 1.0，不允许超额抵消）。
   ============================================================ */
// 指标数据状态枚举（文档点3/4）。只有 VALID 进入 validWeight 与评分。
// 覆盖率分母(eligibleWeight)排除 NOT_APPLICABLE；其余非 VALID 状态计入分母、拉低覆盖率。
export const METRIC_STATUS = {
  VALID: 'VALID', NOT_APPLICABLE: 'NOT_APPLICABLE', MISSING_DATA: 'MISSING_DATA',
  INSUFFICIENT: 'INSUFFICIENT_DATA', PENDING: 'PENDING', TRACKING_ERROR: 'TRACKING_ERROR',
};
const NON_VALID = new Set(['NOT_APPLICABLE', 'MISSING_DATA', 'INSUFFICIENT_DATA', 'PENDING', 'TRACKING_ERROR']);
const round3 = (n) => (n == null ? null : Math.round(n * 1000) / 1000);

export function getKpiConfig() {
  const raw = kpiRepo.getConfig();
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  // 块级配置：required 默认 true（该块按方案应存在）；na=显式声明本期不考（仅管理员可设）。
  const blk = (grp) => ({
    required: raw[`block_${grp}_required`] != null ? raw[`block_${grp}_required`] === '1' : true,
    na: raw[`block_${grp}_na`] === '1',
  });
  return {
    // 允许正式评分的最低覆盖率（旧名 score_floor，仅作兜底回退）
    min_coverage_to_grade: num(raw.min_coverage_to_grade ?? raw.score_floor, 0.6),
    metric_score_cap: num(raw.metric_score_cap ?? raw.score_cap, 1.0), // 单指标达成率上限
    final_score_cap: num(raw.final_score_cap, 1.0),                    // 最终分上限（×100 前的比率上限）
    lead_weight_a: num(raw.lead_weight_a, 3),
    lead_weight_b: num(raw.lead_weight_b, 1),
    lead_weight_c: num(raw.lead_weight_c, 0),
    lead_quality_min_sample: num(raw.lead_quality_min_sample, 3), // Lead Quality Index 最小样本；不足→INSUFFICIENT_DATA
    exec_impact_high: num(raw.exec_impact_high, 3),   // Execution 影响权重（配置化，不硬编码业务层）
    exec_impact_medium: num(raw.exec_impact_medium, 2),
    exec_impact_low: num(raw.exec_impact_low, 1),
    seo_period: raw.seo_period || 'quarter',
    sem_period: raw.sem_period || 'month',
    blocks: { total: blk('total'), seo: blk('seo'), sem: blk('sem') },
  };
}

// 单条指标的数据状态（文档点3/4）。显式状态优先；否则按可用性/样本量推导。
// 真实 0 视为 VALID（得 0 分）；默认「缺失」= MISSING_DATA（计入分母、拉低覆盖率）；
// NOT_APPLICABLE 必须显式标注（本周期/岗位/阶段不适用），不由缺失自动推导。
function metricStatus(r) {
  // forced_ratio：由 derive 层强制判定的达成率（如 CPVI「花钱零有效询盘」→最差分但仍 VALID），
  // 用于处理无法做除法但必须进评分的边界（点5），绝不因除零逃出评分。
  if (r.forced_ratio != null) return METRIC_STATUS.VALID;
  const explicit = r.data_status;
  if (explicit && explicit !== 'VALID' && NON_VALID.has(explicit)) return explicit;
  const avail = r.actual_available !== false && r.actual != null;
  if (!avail) return METRIC_STATUS.MISSING_DATA;
  if (r.min_sample != null && r.sample_size != null && Number(r.sample_size) < Number(r.min_sample)) return METRIC_STATUS.INSUFFICIENT;
  return METRIC_STATUS.VALID;
}

// 单指标达成率（带可配上限）。lower/i 越小越好；actual<=0 或非数 → 0。
function ratioCapped(r, cap) {
  if (r.forced_ratio != null) return Math.min(Number(r.forced_ratio), cap); // derive 层强制分（点5）
  const target = Number(r.target), actual = Number(r.actual);
  if (!Number.isFinite(target) || !Number.isFinite(actual) || target <= 0 || actual <= 0) return 0;
  const raw = (r.mode === 'i' || r.target_type === 'lower') ? target / actual : actual / target;
  return Math.min(raw, cap);
}

// 计算一个块（grp）的绩效数据。权重语义（文档点4）：
// nominalWeight=配置原始权重；eligibleWeight=Σ(status≠NOT_APPLICABLE)；validWeight=Σ(status===VALID)。
// coverage = validWeight/eligibleWeight（文档点5）；normalizedWeight=VALID 指标间归一。
function computeBlock(grp, bw, rows, cfg) {
  const scRows = rows.filter((r) => r.grp === grp && r.scorable);
  let eligibleWeight = 0, validWeight = 0, acc = 0;
  const staged = scRows.map((r) => {
    const status = metricStatus(r);
    const eligible = status !== METRIC_STATUS.NOT_APPLICABLE;
    const isValid = status === METRIC_STATUS.VALID;
    if (eligible) eligibleWeight += r.weight;
    if (isValid) { validWeight += r.weight; acc += r.weight * ratioCapped(r, cfg.metric_score_cap); }
    return { r, status, eligible, isValid };
  });
  const metrics = staged.map(({ r, status, isValid, eligible }) => ({
    id: r.id, name: r.name, grp: r.grp, category: r.category, perf_group: r.perf_group,
    weight: r.weight, nominalWeight: r.weight,
    eligibleWeight: eligible ? r.weight : 0, validWeight: isValid ? r.weight : 0,
    normalizedWeight: isValid && validWeight > 0 ? round3(r.weight / validWeight) : 0,
    ratio: isValid ? ratioCapped(r, cfg.metric_score_cap) : null, included: isValid,
    data_status: status, actual: r.actual, target: r.target, unit: r.unit, mode: r.mode,
    attribution_source: r.attribution_source || null,
    display_value: r.display_value ?? null, reason: r.reason ?? null, // derive 层解释（如 CPVI 无有效询盘）
  }));
  return {
    nominalWeight: bw, eligibleWeight, validWeight, hasMetrics: scRows.length > 0, applicable: eligibleWeight > 0,
    coverage: eligibleWeight > 0 ? round3(validWeight / eligibleWeight) : 0,
    rate: validWeight > 0 ? round3(acc / validWeight) : null,
    metrics,
  };
}

// 块级考核状态（文档点2/3/7）。NO_METRICS 绝不自动等同 NOT_APPLICABLE：
// NOT_APPLICABLE 只能由管理员显式声明(bcfg.na) 或整块指标全为 metric 级 NOT_APPLICABLE；
// 必需块无指标 → NOT_CONFIGURED（配置未完成，不得从公司权重剔除）。
function blockAssessmentState(blk, bcfg) {
  if (bcfg.na) return 'NOT_APPLICABLE';
  if (blk.hasMetrics && blk.eligibleWeight > 0) return 'ACTIVE';
  if (blk.hasMetrics && blk.eligibleWeight === 0) return 'NOT_APPLICABLE'; // 有指标但全 metric 级 NOT_APPLICABLE
  return bcfg.required ? 'NOT_CONFIGURED' : 'NOT_APPLICABLE';              // 无指标：必需→未配置；非必需→不适用
}

/* 对一个「考核范围」评分。blockWeights:{ grp: 名义块权重 }。语义（文档点1/2/3/5/6/7/9）：
   · 块级归一化：只有 NOT_APPLICABLE 块可从权重剔除并在其余块间重新归一化；
     NOT_CONFIGURED（必需但未配置）与 ACTIVE 块都保留权重。
   · 存在 required && NOT_CONFIGURED 块 → CONFIG_INCOMPLETE：官方分 null，仅给 provisionalScore 参考。
   · ACTIVE 但无 VALID 数据 → 保留权重、拉低 coverage（不消失、不置 0）。
   · coverage < 阈值 → INSUFFICIENT_COVERAGE：官方分 null + provisionalScore。
   · 无任何 VALID → null（不置 0、不继承公司分）。 */
function scoreScope(blockWeights, rows, cfg) {
  const threshold = cfg.min_coverage_to_grade, fCap = cfg.final_score_cap;
  const blocks = {};
  const list = [];
  let totalBW = 0;
  for (const [grp, bw] of Object.entries(blockWeights)) {
    totalBW += bw;
    const blk = computeBlock(grp, bw, rows, cfg);
    const bcfg = (cfg.blocks && cfg.blocks[grp]) || { required: true, na: false };
    blk.id = grp; blk.grp = grp; blk.required = !!bcfg.required;
    blk.assessment_state = blockAssessmentState(blk, bcfg);
    blocks[grp] = blk;
    list.push({ bw, blk });
  }
  // 只有 NOT_APPLICABLE 剔除；ACTIVE + NOT_CONFIGURED 都保留权重（点7/8）。
  const kept = list.filter((b) => b.blk.assessment_state !== 'NOT_APPLICABLE');
  const eligBW = kept.reduce((s, b) => s + b.bw, 0);
  const hasUnconfigured = kept.some((b) => b.blk.assessment_state === 'NOT_CONFIGURED' && b.blk.required);

  let coverage = 0, rate = null, status, gradable = false, score = null, provisionalScore = null;
  if (eligBW === 0) {
    status = 'NO_METRICS';
  } else {
    let covAcc = 0, rateNum = 0, rateDen = 0;
    for (const b of kept) {
      const bwN = b.bw / eligBW;              // 在保留块间重新归一化（NOT_CONFIGURED 块 coverage=0 → 拉低）
      covAcc += bwN * b.blk.coverage;
      if (b.blk.rate != null) { rateNum += bwN * b.blk.coverage * b.blk.rate; rateDen += bwN * b.blk.coverage; }
    }
    coverage = round3(covAcc);
    rate = rateDen > 0 ? rateNum / rateDen : null;
    const raw = rate != null ? Math.min(Math.round(Math.min(rate, fCap) * 1000) / 10, 100) : null;
    if (hasUnconfigured) { status = 'CONFIG_INCOMPLETE'; provisionalScore = raw; }   // 配置未完成优先（点5）
    else if (coverage === 0) status = 'NO_VALID_DATA';
    else if (coverage < threshold) { status = 'INSUFFICIENT_COVERAGE'; provisionalScore = raw; }
    else { status = 'GRADED'; score = raw; gradable = true; }
  }
  const eligibleWeight = totalBW > 0 ? round3(eligBW / totalBW) : 0;
  return {
    score, provisionalScore, coverage, gradable, status,
    confidence: coverage, // temporary proxy —— 正式 Data Confidence 待接 tracking/attribution/sample/freshness/source health
    nominalWeight: round3(totalBW), eligibleWeight, validWeight: round3(coverage * eligibleWeight),
    blocks,
  };
}

/* 组装公司/李/陈三个【独立】考核范围（文档点1/2/3/5/9）：
   · 李 = 仅 SEO 可归因指标（{seo:1}）；陈 = 仅 SEM（{sem:1}）——共享 KPI 不复制进个人。
   · 公司(overall) = {共享.5, SEO.25, SEM.25}，含块级归一化；共享只在此出现。
   · companyShared = 仅共享块。各 scope 独立；无 VALID→null，不继承、不置 0。 */
export function computeAssessment(rows = kpiRepo.list(), cfg = getKpiConfig()) {
  const seo = scoreScope({ seo: 1 }, rows, cfg);
  const sem = scoreScope({ sem: 1 }, rows, cfg);
  const companyShared = scoreScope({ total: 1 }, rows, cfg);
  const overall = scoreScope({ total: 0.5, seo: 0.25, sem: 0.25 }, rows, cfg);
  const nonScored = (role) => rows.filter((r) => !r.scorable && r.category === role).map((r) => ({
    id: r.id, grp: r.grp, name: r.name, actual: r.actual, target: r.target, unit: r.unit,
    mode: r.mode, category: r.category, data_status: metricStatus({ ...r, scorable: 1 }),
    available: r.actual_available !== false && r.actual != null,
  }));
  return {
    config: cfg,
    scores: { company: overall, li: seo, chen: sem, companyShared },
    blocks: { total: companyShared.blocks.total, seo: seo.blocks.seo, sem: sem.blocks.sem },
    grade: overall.gradable ? grade(overall.score) : null,
    diagnostics: nonScored('diagnostic'),   // 诊断（不评分）
    summaries: nonScored('summary'),        // 业务汇总（仅展示，不评分，避免与拆分后 Lead 重复计分）
  };
}

export function computeAssessmentForRange(range) {
  return { ...computeAssessment(deriveRangeRows(range)), range };
}

/* Phase 5C：结算并冻结一个考核期（§29）。计算该期区间的 assessment，取该 owner 的 scope，
   连同分数/覆盖率/证据快照进 kpi_period_snapshots。历史此后读快照、不再实时重算——改目标不动历史。
   owner: 'seo'(李,季度) | 'sem'(陈,月度) | 'company'(公司,季度)。 */
export function settlePeriod({ period_type, period_key, owner, settled_by = null, note = null }) {
  const range = periodRange(period_type, period_key); // 校验非法 key 会抛
  const a = computeAssessmentForRange(range);
  const scope = { seo: a.scores.li, sem: a.scores.chen, company: a.scores.company }[owner];
  if (!scope) throw new Error('invalid owner: ' + owner);
  const frozen = owner === 'company'
    ? { scope, blocks: a.blocks, config: a.config }
    : { scope, block: a.blocks[owner], config: a.config };
  return snapRepo.settle({
    period_type, period_key, owner,
    score: scope.score, provisional_score: scope.provisionalScore, coverage: scope.coverage,
    confidence: scope.confidence, gradable: scope.gradable ? 1 : 0, status: scope.status,
    range_start: range.start_date, range_end: range.end_date,
    rows_json: JSON.stringify(frozen), note, settled_by,
  });
}

// 当前期的「实时预览」（未冻结），供结算前查看。返回 {period_type, period_key, range, scope}
export function previewPeriod({ period_type, period_key, owner }) {
  const range = periodRange(period_type, period_key);
  const a = computeAssessmentForRange(range);
  const scope = { seo: a.scores.li, sem: a.scores.chen, company: a.scores.company }[owner];
  return { period_type, period_key, owner, range, scope };
}

// 迁移适配器（文档点7）：把 v2 assessment 投影成旧 {li,chen,company,grade} 形状，
// 供 overview 后续切换到单一评分真相时使用（null 不再伪装成 0）。当前未接线，仅预留。
export function assessmentToLegacyScores(a) {
  const pick = (s) => (s && s.score != null ? s.score : null);
  return {
    li: pick(a.scores.li),
    chen: pick(a.scores.chen),
    company: pick(a.scores.company),
    grade: a.grade,
  };
}
