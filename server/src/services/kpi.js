// KPI 评分（后端权威）+ 由运营数据回写实际值。
import * as kpiRepo from '../db/repositories/kpi.js';
import * as seoRepo from '../db/repositories/seoWeeks.js';
import * as semRepo from '../db/repositories/semWeeks.js';
import * as inqRepo from '../db/repositories/inquiries.js';
import * as loopRepo from '../db/repositories/loopItems.js';
import { seoWow } from './derive.js';
import { computeAttribution } from './attribution.js';

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
  const total = rows.filter((r) => r.grp === 'total');
  const seo = rows.filter((r) => r.grp === 'seo');
  const sem = rows.filter((r) => r.grp === 'sem');
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

// 日期筛选只生成一次性的 KPI 快照，不回写 kpi_targets.actual。
// 这样不同用户查看不同区间时，不会互相覆盖共享的 KPI 实际值。
export function deriveRangeRows(range) {
  const rows = kpiRepo.list().map((row) => ({
    ...row,
    actual: null,
    actual_available: false,
    actual_source: 'selected_range_no_evidence',
  }));

  const inquiryRows = inqRepo.list(range);
  const inquiryStats = inqRepo.stats(range);
  setRangeActual(rows, 'total', '询盘总量', inquiryStats.total, 'inquiries.date');
  setRangeActual(rows, 'total', 'A级询盘数', inquiryStats.a, 'inquiries.date');
  setRangeActual(rows, 'total', '闭环执行度', loopRepo.completedTaskCount(range), 'loop_items.done_at');

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

    const cost = semWeeks.reduce((sum, row) => sum + (Number(row.cost) || 0), 0);
    const attribution = computeAttribution(inquiryRows, { costMicros: Math.round(cost * 1_000_000) });
    setRangeActual(rows, 'total', '有效询盘成本', attribution.sem.costPerEffective, 'sem_weeks.cost + inquiries.channel/grade');
  }

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
  // TOTAL：询盘总量 / A级数 来自询盘表
  const s = inqRepo.stats();
  kpiRepo.setActual('total', '询盘总量', s.total);
  kpiRepo.setActual('total', 'A级询盘数', s.a);
}
