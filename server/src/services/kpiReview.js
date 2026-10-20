/* 月度绩效考核（老板《2026 运营部绩效考核表》口径）—— 评分引擎。
 *
 * 为什么另起一套而不是改 services/kpi.js：
 *   v2 引擎考的是「每个渠道各自的过程质量」（可见度/质量指数/CPVI…），老板这张表考的是
 *   「部门这个月带回来多少 A/B 询价、花了多少钱、该做的复盘整改做没做」。两者口径、量纲、
 *   出分范围（v2 封顶 100；老板表封顶 120 且带绩效系数）都不同，硬塞进一个引擎只会两边都拧巴。
 *   v2 的结算快照（kpi_period_snapshots）与既有测试因此一行不动。
 *
 * 老板亲定口径（2026-09-20 对话，别自作主张改）：
 *   · A/B 询价数量是 SEM 与 SEO **共同产出**，按部门整体算一次，不按渠道拆到个人。
 *     理由不是偷懒：后台询盘全是人工录入，channel 字段没有任何机器证据（见 memory
 *     inquiry-channel-attribution-dead-end），按它拆 = 用手填字段决定谁的钱。
 *   · 「直接 / 其他」渠道的询盘**全部计入部门总量** —— 老板说这些多半也是自家渠道带来的，
 *     只是当时没留来源。同时把「未归因占比」如实回出去，长期太高说明录入要改进。
 *   · 广告成本类指标按部门口径算一次；落到 SEO 个人时标 NOT_APPLICABLE、权重在其余指标间
 *     重新归一，**绝不给李编一个 0 分**。
 *   · SEM / SEO 的过程数据（CPC、排名、跳出率…）本期先不计入考核。
 *
 * 纯计算全在 computeReview()，DB 访问只在 buildReview()，便于单测。
 */
import * as inqRepo from '../db/repositories/inquiries.js';
import * as fixRepo from '../db/repositories/fixes.js';
import * as loopRepo from '../db/repositories/loopItems.js';
import * as weeklyRepo from '../db/repositories/weeklyReports.js';
import * as kpiRepo from '../db/repositories/kpi.js';
import * as targetRepo from '../db/repositories/kpiReviewTargets.js';
import * as sopRepo from '../db/repositories/sop.js';
import { resolveSemSpend } from './kpiLedger.js';
import { classify } from './attribution.js';

export const SCOPES = ['department', 'seo', 'sem'];
export const SCOPE_LABEL = { department: '运营部（部门）', seo: '李 · SEO', sem: '陈 · SEM' };
const SCOPE_DEPT = { seo: 'SEO', sem: 'SEM' };

/* 指标状态。只有 VALID 计分。
   NOT_APPLICABLE  本岗位/本期不适用 → 移出分母，权重在其余指标间重新归一。
   NO_TARGET       目标没设 → 留在分母拉低覆盖率，并把整份考核标成「配置未完成」。
   MISSING_DATA    有目标但没数据 → 留在分母拉低覆盖率。缺数据不等于 0 分。
   NO_BASELINE     完成率类指标本区间分母为 0（例如区间内一条整改都没有）→ 移出分母。
                   「没有整改任务」不该被读成「整改闭环率 0%」。 */
export const REVIEW_STATUS = {
  VALID: 'VALID', NOT_APPLICABLE: 'NOT_APPLICABLE', NO_TARGET: 'NO_TARGET',
  MISSING_DATA: 'MISSING_DATA', NO_BASELINE: 'NO_BASELINE',
};
const OUT_OF_DENOMINATOR = new Set([REVIEW_STATUS.NOT_APPLICABLE, REVIEW_STATUS.NO_BASELINE]);

const r1 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10);
const r4 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10000) / 10000);
const money = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

export const DEFAULT_REVIEW_CONFIG = {
  // sop_quota 默认 0：老板那张表的 8 项权重合计正好 100，是他亲定的口径。
  // SOP 周配额完成率的算法、覆盖率和诚实口径都已就位，但给不给分、给几分由老板在设置页决定；
  // 这里先挂 0 —— 代码就位、分数一分不动，是唯一不越权的接法。
  weights: { a: 40, b: 20, cost_a: 10, cost_ab: 10, a_ratio: 5, weekly: 5, fix: 5, test: 5, sop_quota: 0 },
  metricCap: 1.2,
  minCoverage: 0.6,
  budgetTolerance: 0.1,
  bands: [
    { min: 110, label: '超额优秀', coef: 1.2, note: '超额完成核心目标，可作为年底额外奖励的重要依据' },
    { min: 100, label: '达成目标', coef: 1.0, note: '正常全额绩效' },
    { min: 90, label: '良好', coef: 0.9, note: '部分未达标' },
    { min: 80, label: '达标', coef: 0.8, note: '基本达标，需关注短板' },
    { min: 0, label: '未达标', coef: 0.6, note: '进入整改 / 专项复盘' },
  ],
};

// 从 kpi_config（KV）读出考核参数。任何一项解析不了都回退默认值，绝不因为一个脏值让整页打不开。
export function getReviewConfig(raw = {}) {
  let bands = DEFAULT_REVIEW_CONFIG.bands;
  try {
    const parsed = JSON.parse(raw.review_bands);
    if (Array.isArray(parsed) && parsed.length) {
      bands = parsed
        .map((b) => ({ min: num(b.min, 0), label: String(b.label || ''), coef: num(b.coef, 1), note: b.note || null }))
        .sort((x, y) => y.min - x.min);
    }
  } catch (e) { /* 脏 JSON → 用默认分档，界面照常出分 */ }
  return {
    weights: {
      a: num(raw.review_weight_a, 40), b: num(raw.review_weight_b, 20),
      cost_a: num(raw.review_weight_cost_a, 10), cost_ab: num(raw.review_weight_cost_ab, 10),
      a_ratio: num(raw.review_weight_a_ratio, 5), weekly: num(raw.review_weight_weekly, 5),
      fix: num(raw.review_weight_fix, 5), test: num(raw.review_weight_test, 5),
      sop_quota: num(raw.review_weight_sop_quota, 0),
    },
    metricCap: num(raw.review_metric_cap, 1.2),
    minCoverage: num(raw.review_min_coverage, 0.6),
    budgetTolerance: num(raw.review_budget_tolerance, 0.1),
    bands,
  };
}

export function bandFor(score, bands) {
  if (score == null) return null;
  for (const b of bands) if (score >= b.min) return b;
  return bands.length ? bands[bands.length - 1] : null;
}

/* 单条指标。ratio 按老板表的两种公式：
     正向(higher)  实际 ÷ 目标
     反向(lower)   目标 ÷ 实际   （成本越低越好）
   两者都封顶 metricCap（老板表：最高按 120% 计分）。 */
function metric({ key, label, weight, direction, actual, target, status, unit, note, displayValue, forcedRatio, currency, evidence }) {
  let st = status || REVIEW_STATUS.VALID;
  if (st === REVIEW_STATUS.VALID && forcedRatio == null) {
    if (target == null || !Number.isFinite(target) || target <= 0) st = REVIEW_STATUS.NO_TARGET;
    else if (actual == null || !Number.isFinite(actual)) st = REVIEW_STATUS.MISSING_DATA;
  }
  let ratio = null;
  if (st === REVIEW_STATUS.VALID) {
    if (forcedRatio != null) ratio = forcedRatio;
    else if (direction === 'lower') ratio = actual > 0 ? target / actual : 0;
    else ratio = actual > 0 ? actual / target : 0;
  }
  return {
    key, label, weight, direction, unit: unit ?? null, note: note ?? null,
    actual: actual == null ? null : (unit === '¥' ? money(actual) : r4(actual)),
    target: target == null ? null : r4(target),
    currency: currency ?? null,
    display_value: displayValue ?? null,
    evidence: evidence ?? null,
    status: st,
    ratio: null, score: null,   // 由 computeReview 填（要先知道 cap）
    raw_ratio: ratio == null ? null : r4(ratio),
  };
}

/* 完成率类指标（周复盘 / 整改闭环 / 实验测试）。
   分母为 0 → NO_BASELINE：本区间压根没有这类任务，不该判 0 分，也不该算进分母。 */
function rateMetric(key, label, weight, done, total, unitNote) {
  if (!(total > 0)) {
    return metric({
      key, label, weight, direction: 'higher', actual: null, target: 1, unit: '%',
      status: REVIEW_STATUS.NO_BASELINE, displayValue: '本区间无此类任务',
      note: unitNote, evidence: { done: done || 0, total: 0 },
    });
  }
  return metric({
    key, label, weight, direction: 'higher', actual: done / total, target: 1, unit: '%',
    displayValue: `${done} / ${total}`, note: unitNote, evidence: { done, total },
  });
}

/**
 * 纯函数：算一个考核范围的绩效。
 * @param input.scope     'department' | 'seo' | 'sem'
 * @param input.leads     { a, b, c, total, ungraded, byChannel }
 * @param input.spend     { value, status, source, currency }  区间内广告投入
 * @param input.process   { weekly:{done,total}, fix:{done,total}, test:{done,total} }
 * @param input.targets   kpi_review_targets 解析后的目标行
 */
export function computeReview(input, cfg = DEFAULT_REVIEW_CONFIG) {
  const scope = SCOPES.includes(input.scope) ? input.scope : 'department';
  const w = cfg.weights;
  const leads = input.leads || { a: 0, b: 0, c: 0, total: 0, ungraded: 0 };
  const t = input.targets || {};
  const spend = input.spend || { value: null, status: 'MISSING_DATA' };
  const proc = input.process || {};
  const effective = leads.a + leads.b;          // A+B 有效询价（老板口径：C 级不计）
  const spendOk = spend.status === 'VALID' && Number.isFinite(Number(spend.value));
  const spendValue = spendOk ? Number(spend.value) : null;

  /* 成本类指标。三件事必须分清，否则会把「没花钱」和「花钱没结果」混成同一个分：
       · SEO 个人视角 → NOT_APPLICABLE（他没有媒体预算，权重让给别的指标）
       · 区间内查不到花费数据 → MISSING_DATA（拉低覆盖率，不是 0 分）
       · 花了钱但一个 A 级都没有 → 强制 0 分且**仍然计分**，这正是该被扣分的情形 */
  const costMetric = (key, label, weight, count, target, zeroNote) => {
    if (scope === 'seo') {
      return metric({
        key, label, weight, direction: 'lower', actual: null, target, unit: '¥',
        status: REVIEW_STATUS.NOT_APPLICABLE, displayValue: 'SEO 无媒体花费口径',
        note: '自然渠道无广告投入，本指标不计入个人考核，权重已在其余指标间重新归一',
      });
    }
    if (!spendOk) {
      return metric({
        key, label, weight, direction: 'lower', actual: null, target, unit: '¥',
        status: REVIEW_STATUS.MISSING_DATA,
        note: '所选区间既无 Google Ads 同步花费，也无 SEM 周报录入 —— 缺数据不等于成本为 0',
      });
    }
    if (spendValue === 0) {
      return metric({
        key, label, weight, direction: 'lower', actual: null, target, unit: '¥',
        status: REVIEW_STATUS.NO_BASELINE, displayValue: '区间内零广告投入',
        note: '没有花费就没有获客成本可言，本指标不计分', evidence: { spend: 0, count },
      });
    }
    if (count > 0) {
      return metric({
        key, label, weight, direction: 'lower', actual: spendValue / count, target, unit: '¥',
        currency: spend.currency ?? null, evidence: { spend: money(spendValue), count, source: spend.source },
      });
    }
    // 花了钱、一个都没带回来：这不是除零错误，是结论。强制 0 分，绝不让它逃出评分。
    return metric({
      key, label, weight, direction: 'lower', actual: null, target, unit: '¥',
      currency: spend.currency ?? null, forcedRatio: 0, displayValue: zeroNote,
      evidence: { spend: money(spendValue), count: 0, source: spend.source },
      note: '有广告投入但该等级询价为 0，按最差分计入',
    });
  };

  const metrics = [
    metric({
      key: 'a_count', label: 'A 级询价数量', weight: w.a, direction: 'higher',
      actual: leads.a, target: t.a_target ?? null, unit: '封',
      note: scope === 'department' ? 'SEM + SEO 共同产出，含直接/其他渠道' : '部门共同产出，不按渠道拆分到个人',
      evidence: { a: leads.a, source: 'inquiries.grade=A（全渠道，已排除归档）' },
    }),
    metric({
      key: 'b_count', label: 'B 级询价数量', weight: w.b, direction: 'higher',
      actual: leads.b, target: t.b_target ?? null, unit: '封',
      note: scope === 'department' ? 'SEM + SEO 共同产出，含直接/其他渠道' : '部门共同产出，不按渠道拆分到个人',
      evidence: { b: leads.b, source: 'inquiries.grade=B（全渠道，已排除归档）' },
    }),
    costMetric('cost_a', 'A 级询价成本', w.cost_a, leads.a, t.cost_a_target ?? null, '有花费 · 零 A 级询价'),
    costMetric('cost_ab', 'A+B 有效询价成本', w.cost_ab, effective, t.cost_ab_target ?? null, '有花费 · 零有效询价'),
    effective > 0
      ? metric({
          key: 'a_ratio', label: 'A 级询价占比', weight: w.a_ratio, direction: 'higher',
          actual: leads.a / effective, target: t.a_ratio_target ?? null, unit: '%',
          displayValue: `${leads.a} / ${effective}`, note: '质量指标：A ÷ (A+B)',
          evidence: { a: leads.a, effective },
        })
      : metric({
          key: 'a_ratio', label: 'A 级询价占比', weight: w.a_ratio, direction: 'higher',
          actual: null, target: t.a_ratio_target ?? null, unit: '%',
          status: REVIEW_STATUS.NO_BASELINE, displayValue: '本区间无有效询价',
          note: '分母为 0，占比无意义；数量本身已在上面两项被计分',
        }),
    rateMetric('weekly', '周复盘 / 数据分析完成率', w.weekly, proc.weekly?.done ?? 0, proc.weekly?.total ?? 0,
      '每周按时提交周报并写出问题与分析 · 数据来源 weekly_reports'),
    rateMetric('fix', '问题整改闭环率', w.fix, proc.fix?.done ?? 0, proc.fix?.total ?? 0,
      '整改台账中状态已推到「已改」的占比（「放弃」不计入分母）· 数据来源 fixes'),
    rateMetric('test', '实验测试完成率', w.test, proc.test?.done ?? 0, proc.test?.total ?? 0,
      '测试登记中状态「已完成」的占比 · 数据来源 loop_items(kind=test)'),
    // SOP 周配额：老板两份 SOP 文档里「周目标 × 单位」那一列的兑现率。
    // 分母是区间内**完整 ISO 周**的周目标之和，单周超额不替其它周补课（见 sopQuotaProgress）。
    rateMetric('sop_quota', 'SOP 周配额完成率', w.sop_quota, proc.sop?.done ?? 0, proc.sop?.total ?? 0,
      '按 SOP 的周/日目标数量累计 · 周目标只算完整的 ISO 周、日目标一天一格 · SOP 创建之前的不算 · 单周/单日超额不补他期 · 数据来源 sop_logs'),
  ];

  // 打分 + 权重归一
  let eligibleWeight = 0, validWeight = 0, acc = 0;
  for (const m of metrics) {
    const weight = Number(m.weight) || 0;
    if (!OUT_OF_DENOMINATOR.has(m.status)) eligibleWeight += weight;
    if (m.status === REVIEW_STATUS.VALID) {
      const ratio = Math.min(m.raw_ratio ?? 0, cfg.metricCap);
      m.ratio = r4(ratio);
      m.score = r1(ratio * weight);
      validWeight += weight;
      acc += ratio * weight;
    }
  }
  const rate = validWeight > 0 ? acc / validWeight : null;                 // 0~metricCap
  const raw = rate == null ? null : r1(Math.min(rate, cfg.metricCap) * 100);
  const coverage = eligibleWeight > 0 ? r4(validWeight / eligibleWeight) : 0;
  const configIncomplete = metrics.some((m) => m.status === REVIEW_STATUS.NO_TARGET);

  let status, score = null, provisionalScore = null;
  if (validWeight === 0) status = 'NO_VALID_DATA';
  else if (configIncomplete) { status = 'CONFIG_INCOMPLETE'; provisionalScore = raw; }
  else if (coverage < cfg.minCoverage) { status = 'INSUFFICIENT_COVERAGE'; provisionalScore = raw; }
  else { status = 'GRADED'; score = raw; }

  const band = bandFor(score, cfg.bands);
  const provisionalBand = score == null ? bandFor(provisionalScore, cfg.bands) : null;

  // 广告投入：老板表里它只做预算对照（±10%），**不计分**。超/欠预算是要解释的事，不是扣分项。
  const budget = t.ad_budget ?? null;
  const budgetDeviation = spendOk && budget > 0 ? r4(spendValue / budget - 1) : null;
  const adSpend = {
    value: spendValue == null ? null : money(spendValue),
    status: spend.status, source: spend.source ?? null, currency: spend.currency ?? null,
    budget, tolerance: cfg.budgetTolerance,
    deviation: budgetDeviation,
    within_tolerance: budgetDeviation == null ? null : Math.abs(budgetDeviation) <= cfg.budgetTolerance,
    scored: false,
    note: '广告投入只做预算对照（±' + Math.round(cfg.budgetTolerance * 100) + '%），不计入得分',
  };

  return {
    scope, scope_label: SCOPE_LABEL[scope],
    metrics, adSpend,
    leads: {
      ...leads, effective,
      aRatio: effective > 0 ? r4(leads.a / effective) : null,
      validRate: leads.total > 0 ? r4(effective / leads.total) : null,
    },
    score, provisionalScore, coverage, status,
    gradable: status === 'GRADED',
    band, provisionalBand,
    coefficient: band ? band.coef : null,
    weights: { eligible: r1(eligibleWeight), valid: r1(validWeight), nominal: r1(Object.values(w).reduce((s, x) => s + x, 0)) },
    maxScore: r1(cfg.metricCap * 100),
    config: { metricCap: cfg.metricCap, minCoverage: cfg.minCoverage, bands: cfg.bands },
  };
}

/* ================= DB 组装 ================= */

// ISO 日期（YYYY-MM-DD）落在区间内
function inRange(dateStr, range) {
  if (!range) return true;
  if (!dateStr) return false;
  const d = String(dateStr).slice(0, 10);
  return d >= range.start_date && d <= range.end_date;
}
// 区间跨了多少个「周一」= 该区间应交几期周报。周报 week_key 已统一为本周周一日期。
function mondayCount(range) {
  if (!range) return 0;
  const start = new Date(range.start_date + 'T00:00:00Z');
  const end = new Date(range.end_date + 'T00:00:00Z');
  if (isNaN(start) || isNaN(end) || end < start) return 0;
  let n = 0;
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() === 1) n++;
  }
  return n;
}
// 周报「交了」的判定：四段里任意一段有内容。建了空行不算交（ensureWeek 会给每周自动建空行）。
function weeklySubmitted(row) {
  return ['summary', 'problems', 'analysis', 'next_plan']
    .some((f) => Array.isArray(row[f]) ? row[f].length > 0 : !!row[f]);
}

const FIX_DONE = '已改';
const FIX_DROPPED = '放弃';
const TEST_DONE = '已完成';

// 整改台账：区间口径取「截止日落在区间」，没填截止日的退而用创建日。「放弃」不进分母。
export function fixProgress(rows, range, dept) {
  const scoped = rows.filter((r) => {
    if (dept && String(r.dept || '').toUpperCase() !== dept) return false;
    return inRange(r.due_date || r.created_at, range);
  });
  const eligible = scoped.filter((r) => r.status !== FIX_DROPPED);
  return { done: eligible.filter((r) => r.status === FIX_DONE).length, total: eligible.length };
}

// 测试登记：loop_items(kind='test')，按创建日归入区间（period 是自由文本，不可靠）。
export function testProgress(rows, range, dept) {
  const scoped = rows.filter((r) => {
    if (dept && String(r.dept || '').toUpperCase() !== dept) return false;
    return inRange(r.created_at, range);
  });
  return { done: scoped.filter((r) => r.status === TEST_DONE).length, total: scoped.length };
}

/* SOP 周配额：两份 SOP 文档里「周目标 × 单位」那一列的兑现率。
   三条诚实规则，和 /api/sop/stats 同向，不另立一套：
     ① 只算**完整的 ISO 周**（周一到周日都落在区间内）—— 区间头尾那半周要求全额配额，
        等于凭空给人记一笔漏；不完整的周直接不进分母。
     ② SOP 创建之前的周不算 —— 这周才建的 SOP，上个月不是它漏的。
     ③ 未来的日子不算 —— today 由调用方传，区间末尾超过今天的部分截掉。
   再加一条本项特有的：**单周超额不替其它周补课**（每周取 min(实际, 周目标)）。
   否则「某一周发 10 篇、其余三周挂零」会算成 100%，而文档要的是稳定输出。 */
const mondayOf = (ymd) => {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const addDays = (ymd, n) => {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export function sopQuotaProgress(defs, logs, range, dept, today) {
  const empty = { done: 0, total: 0, weeks: 0, days: 0 };
  if (!range || !range.start_date || !range.end_date) return empty;
  const end = today && today < range.end_date ? today : range.end_date;
  if (end < range.start_date) return empty;
  const byDef = new Map();
  for (const l of logs || []) {
    if (!byDef.has(l.sop_id)) byDef.set(l.sop_id, []);
    byDef.get(l.sop_id).push(l);
  }
  let done = 0, total = 0, weeks = 0, days = 0;
  for (const d of defs || []) {
    if (d.active === 0) continue;
    // 月度条目不进这项（和 /api/sop/stats 一样：月度放进周/日口径里算没意义）。
    // 每日条目要算 —— 文档里确实有「2 条/天」这种（SEO S9），
    // 把它折成周目标会丢掉「每天都要发」这层要求：周五一口气补 10 条照样满分。
    if (d.freq !== 'weekly' && d.freq !== 'daily') continue;
    const target = Number(d.target_qty);
    if (!(target > 0)) continue;                       // 没有数量目标的条目不在这项里考
    if (dept && String(d.dept || '').toUpperCase() !== dept) continue;
    const created = String(d.created_at || '').slice(0, 10);
    const start = created && created > range.start_date ? created : range.start_date;
    if (start > end) continue;
    const mine = byDef.get(d.id) || [];
    const sum = (from, to) => mine
      .filter((l) => l.day_key >= from && l.day_key <= to)
      .reduce((s, l) => s + (Number(l.qty) || 0), 0);
    if (d.freq === 'daily') {
      // 日度：一天一格，当天超额不替别的天补课。区间端点不用像周那样切半——
      // 「天」本来就是完整的，start/end 之间每一天都该做。
      for (let day = start; day <= end; day = addDays(day, 1)) {
        days++;
        total += target;
        done += Math.min(sum(day, day), target);
      }
      continue;
    }
    for (let m = mondayOf(start); m <= end; m = addDays(m, 7)) {
      if (m < start) continue;                         // 起点那周不完整
      const sunday = addDays(m, 6);
      if (sunday > end) break;                         // 终点那周不完整
      weeks++;
      total += target;
      done += Math.min(sum(m, sunday), target);
    }
  }
  return { done: r4(done), total: r4(total), weeks, days };
}

// 周报：分母 = 区间内的周数 ×(部门视角 2 个部门 / 个人视角 1 个)；分子 = 真正写了东西的期数。
export function weeklyProgress(rows, range, dept) {
  const weeks = mondayCount(range);
  const depts = dept ? [dept] : ['SEO', 'SEM'];
  const done = rows.filter((r) => depts.includes(String(r.dept || '').toUpperCase())
    && inRange(r.week_key, range) && weeklySubmitted(r)).length;
  return { done, total: weeks * depts.length };
}

// 区间内询盘按等级汇总（部门口径 = 全渠道）。byChannel 只做展示，不进分数。
export function summarizeLeads(rows) {
  const out = { a: 0, b: 0, c: 0, ungraded: 0, total: rows.length, byChannel: { SEO: 0, SEM: 0, direct: 0, other: 0 } };
  for (const r of rows) {
    if (r.grade === 'A') out.a++;
    else if (r.grade === 'B') out.b++;
    else if (r.grade === 'C') out.c++;
    else out.ungraded++;
    const k = classify(r.channel);
    if (out.byChannel[k] != null) out.byChannel[k]++;
  }
  return out;
}

// 区间落在哪个月 → 决定用哪一行目标。跨月区间一律回退 'default'，不挑一个月假装代表全区间。
export function periodKeyFor(range) {
  if (!range) return null;
  const a = String(range.start_date).slice(0, 7);
  const b = String(range.end_date).slice(0, 7);
  return a === b ? a : null;
}

export function buildReview(range, scope = 'department') {
  const cfg = getReviewConfig(kpiRepo.getConfig());
  const dept = SCOPE_DEPT[scope] || null;
  const inquiryRows = inqRepo.list(range);
  const leads = summarizeLeads(inquiryRows);
  const semSpend = resolveSemSpend(range);
  const spend = semSpend.value == null
    ? { value: null, status: 'MISSING_DATA', source: null, currency: null }
    : {
        value: semSpend.value, status: 'VALID', source: semSpend.source,
        // Ads 同步回来的是账户币种（同步未存币种字段）→ 不臆造符号；人工周报按人民币录入
        currency: semSpend.source === 'sem_weeks' ? 'CNY' : null,
      };
  const periodKey = periodKeyFor(range);
  const targets = targetRepo.resolve(periodKey);
  const process = {
    weekly: weeklyProgress(weeklyRepo.list(), range, dept),
    fix: fixProgress(fixRepo.list({ view: 'all' }), range, dept),
    test: testProgress(loopRepo.list('test', { view: 'all' }), range, dept),
    // today 用服务器本地日期：这个口径只用来把「还没到的日子」截掉，
    // 差一个时区最多少算半天，比让未来的周进分母要诚实得多。
    sop: range
      ? sopQuotaProgress(sopRepo.listDefs({ activeOnly: true }),
          sopRepo.logsBetween(range.start_date, range.end_date), range, dept,
          new Date().toLocaleDateString('sv-SE'))
      : { done: 0, total: 0, weeks: 0 },
  };

  const result = computeReview({ scope, leads, spend, process, targets }, cfg);
  return {
    ...result,
    range: range || null,
    period_key: periodKey,
    targets: { ...targets, resolved_for: periodKey },
    // 未归因占比：直接 + 其他 占全部询盘的比例。老板拍板把它们计入部门总量，
    // 但这个数字必须一直亮在看板上 —— 长期偏高说明录入来源这件事得改进，而不是默默接受。
    attribution: {
      unattributed: leads.byChannel.direct + leads.byChannel.other,
      unattributedRate: leads.total > 0 ? r4((leads.byChannel.direct + leads.byChannel.other) / leads.total) : null,
      byChannel: leads.byChannel,
      note: '「直接 / 其他」渠道按老板口径计入部门总量；此比例仅作录入质量提示，不影响得分',
    },
    sources: {
      leads: 'inquiries.date / grade（全渠道，已排除归档）',
      spend: semSpend.source === 'google_ads'
        ? 'google_ads_campaign_daily.cost_micros（Ads 同步，账户币种）'
        : (semSpend.source === 'sem_weeks' ? 'sem_weeks.cost（人工周报，人民币）' : '无花费数据源'),
      weekly: 'weekly_reports.week_key / dept',
      fix: 'fixes.due_date · status',
      test: 'loop_items(kind=test).created_at · status',
      targets: 'kpi_review_targets（' + (targets.source === 'period' ? '本月单独设定' : targets.source === 'default' ? '通用兜底目标' : '尚未设定') + '）',
    },
  };
}

// 三个范围一起算，供 KPI 页一次拉齐（部门是主角，李/陈是同一套口径下的个人视角）。
export function buildReviewAll(range) {
  return {
    range: range || null,
    department: buildReview(range, 'department'),
    seo: buildReview(range, 'seo'),
    sem: buildReview(range, 'sem'),
  };
}
