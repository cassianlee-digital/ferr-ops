// 运营总账（业务结果漏斗）：花了多少钱 → 带来多少询盘 → 多少优质(A/B) → 多少成交 → 效率如何。
//
// 定位：**只读业务视图，不参与 KPI 绩效评分**。评分引擎（services/kpi.js 的 computeScores /
// deriveRangeRows / recomputeActuals）本文件一行不碰，成交数据只进总账、不进分数。
// 纯计算集中在 computeLedger()，DB 访问只在 buildLedger()，便于单测。
import * as inqRepo from '../db/repositories/inquiries.js';
import * as semRepo from '../db/repositories/semWeeks.js';
import * as kpiRepo from '../db/repositories/kpi.js';
import { classify } from './attribution.js';

// 渠道口径与前端 renderInqDonuts / services/attribution.js 完全一致
export const LEDGER_CHANNELS = [
  { key: 'SEO', label: 'SEO 自然' },
  { key: 'SEM', label: 'SEM 付费' },
  { key: 'direct', label: '直接' },
  { key: 'other', label: '其他' },
];
// 目前只有 SEM 有可归集的媒体花费（sem_weeks.cost）；其余渠道是人力成本，本视图不臆造金额
const PAID_CHANNELS = new Set(['SEM']);
export const DEAL_WON = '已成交';
export const DEAL_LOST = '未成交';
const KNOWN_DEALS = new Set([DEAL_WON, DEAL_LOST]);

const money = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
const rate = (num, den) => (den > 0 ? Math.round((num / den) * 10000) / 10000 : null);

function emptyBucket(key, label) {
  return {
    key, label,
    inquiries: 0, a: 0, b: 0, c: 0, ungraded: 0,
    quality: 0,            // 优质 = A + B（与「有效询盘」同口径）
    deals: 0,              // 该渠道成交数（全等级）
    qualityDeals: 0,       // 成交且等级为 A/B
    dealStatusMissing: 0,  // 老数据没标是否成交 —— 不算作未成交，单独暴露
  };
}

// 花费口径：只有付费渠道才有金额；付费渠道无花费记录 = 缺数据，不是 0
function spendCell(key, raw) {
  if (!PAID_CHANNELS.has(key)) {
    return { value: null, status: 'NOT_APPLICABLE', note: '自然/直接渠道无媒体花费口径（人力成本未计入本表）' };
  }
  if (raw == null || !Number.isFinite(Number(raw))) {
    return { value: null, status: 'MISSING_DATA', note: '所选区间无 SEM 周报花费记录（sem_weeks.cost）' };
  }
  return { value: money(Number(raw)), status: 'VALID', note: null };
}

// 单位成本：分母为 0 时返回 null + 原因，绝不写 Infinity（「有花费零成交」是结论，不是数字错误）
function unitCost(spend, count, zeroReason) {
  if (spend.status !== 'VALID') return { value: null, status: spend.status, reason: null };
  if (spend.value === 0) return { value: null, status: 'NO_SPEND', reason: 'ZERO_SPEND' };
  if (count > 0) return { value: money(spend.value / count), status: 'VALID', reason: null };
  return { value: null, status: 'SPEND_WITH_ZERO_RESULT', reason: zeroReason };
}

/**
 * 纯函数：按渠道汇总业务总账。
 * @param inquiryRows [{ channel, grade, deal_status }]
 * @param options.spendByChannel { SEM: number|null } —— 区间内该渠道花费；缺省/null = 无记录
 */
export function computeLedger(inquiryRows = [], options = {}) {
  const spendByChannel = options.spendByChannel || {};
  const buckets = new Map(LEDGER_CHANNELS.map((c) => [c.key, emptyBucket(c.key, c.label)]));

  for (const row of inquiryRows) {
    const bucket = buckets.get(classify(row && row.channel)) || buckets.get('other');
    bucket.inquiries++;
    const grade = row && row.grade;
    if (grade === 'A') bucket.a++;
    else if (grade === 'B') bucket.b++;
    else if (grade === 'C') bucket.c++;
    else bucket.ungraded++;
    if (grade === 'A' || grade === 'B') bucket.quality++;

    const deal = row && row.deal_status;
    if (!KNOWN_DEALS.has(deal)) bucket.dealStatusMissing++;
    if (deal === DEAL_WON) {
      bucket.deals++;
      if (grade === 'A' || grade === 'B') bucket.qualityDeals++;
    }
  }

  const channels = LEDGER_CHANNELS.map(({ key }) => {
    const b = buckets.get(key);
    const spend = spendCell(key, spendByChannel[key]);
    return {
      ...b,
      spend,
      qualityRate: rate(b.quality, b.inquiries),          // 优质率 = (A+B) / 询盘
      dealRate: rate(b.qualityDeals, b.quality),          // 成交率（主口径）= 优质成交 / 优质
      dealRateOverall: rate(b.deals, b.inquiries),        // 成交率（总口径）= 成交 / 询盘
      costPerQuality: unitCost(spend, b.quality, 'SPEND_WITH_ZERO_QUALITY'),
      cac: unitCost(spend, b.deals, 'SPEND_WITH_ZERO_DEAL'),
    };
  });

  const sum = (pick) => channels.reduce((s, c) => s + pick(c), 0);
  const validSpends = channels.filter((c) => c.spend.status === 'VALID');
  const totalSpend = validSpends.length
    ? {
        value: money(validSpends.reduce((s, c) => s + c.spend.value, 0)),
        status: 'VALID',
        note: '仅含 SEM 媒体花费；SEO/直接/其他为人力投入，未计入',
      }
    : { value: null, status: 'MISSING_DATA', note: '所选区间无任何渠道花费记录' };

  const t = {
    key: 'total', label: '合计',
    inquiries: sum((c) => c.inquiries), a: sum((c) => c.a), b: sum((c) => c.b),
    c: sum((c) => c.c), ungraded: sum((c) => c.ungraded),
    quality: sum((c) => c.quality), deals: sum((c) => c.deals),
    qualityDeals: sum((c) => c.qualityDeals), dealStatusMissing: sum((c) => c.dealStatusMissing),
    spend: totalSpend,
  };
  const totals = {
    ...t,
    qualityRate: rate(t.quality, t.inquiries),
    dealRate: rate(t.qualityDeals, t.quality),
    dealRateOverall: rate(t.deals, t.inquiries),
    // 合计行的单位成本是「混合口径」：分子只有 SEM 花费，分母是全渠道结果 → 只能当下限看
    costPerQuality: unitCost(totalSpend, t.quality, 'SPEND_WITH_ZERO_QUALITY'),
    cac: unitCost(totalSpend, t.deals, 'SPEND_WITH_ZERO_DEAL'),
    costBasis: 'blended_sem_spend_only',
  };

  return {
    channels,
    totals,
    notes: {
      deal: '成交为滞后结果 · 归因未审计（按询盘录入时标注的渠道归集，不代表广告直接促成）',
      spend: 'SEO/直接/其他渠道无媒体花费口径，人力成本未计入，故其单位成本恒为 —',
      quality: '优质 = 等级 A 或 B（与「有效询盘」同口径）',
      dealRate: '成交率主口径 = 优质成交 / 优质询盘；另给总口径 = 成交 / 全部询盘',
    },
    meta: {
      inquiryRows: t.inquiries,
      dealStatusMissing: t.dealStatusMissing,
      scoring: 'not_scored', // 本视图不进 KPI 绩效评分
    },
  };
}

// 目标 vs 当前：目标取 kpi_targets 里已有的行，没有对应目标就诚实标「目标待定」
const TARGET_MAP = [
  { key: 'inquiries', label: '询盘总量', grp: 'total', name: '询盘总量', unit: '封', pick: (l) => l.totals.inquiries },
  { key: 'quality', label: '优质询盘（A/B）', grp: null, name: null, unit: '封', pick: (l) => l.totals.quality },
  { key: 'a', label: 'A 级询盘数', grp: 'total', name: 'A级询盘数', unit: '封', pick: (l) => l.totals.a },
  { key: 'deals', label: '成交数', grp: null, name: null, unit: '单', pick: (l) => l.totals.deals },
  {
    key: 'cost_per_quality', label: 'SEM 每优质询盘成本', grp: 'total', name: '有效询盘成本', unit: '¥',
    pick: (l) => {
      const sem = l.channels.find((c) => c.key === 'SEM');
      return sem ? sem.costPerQuality.value : null;
    },
  },
];

export function buildTargetProgress(ledger, kpiRows = []) {
  return TARGET_MAP.map((m) => {
    const row = m.name ? kpiRows.find((r) => r.grp === m.grp && r.name === m.name) : null;
    const target = row && Number.isFinite(Number(row.target)) ? Number(row.target) : null;
    const actual = m.pick(ledger);
    const inverse = row ? row.mode === 'i' : false;
    let progress = null;
    if (target != null && target > 0 && actual != null && Number.isFinite(actual)) {
      const raw = inverse ? (actual > 0 ? Math.min(target / actual, 1) : null) : Math.min(actual / target, 1);
      progress = raw == null ? null : Math.round(raw * 10000) / 10000;
    }
    return {
      key: m.key, label: m.label, unit: m.unit,
      target, actual, inverse, progress,
      status: target == null ? 'NO_TARGET' : (actual == null ? 'NO_ACTUAL' : 'VALID'),
      // 目标是设置里的月度目标，不按区间折算 —— 与 KPI 页同一提示口径
      target_basis: target == null ? null : 'configured_monthly_target_unprorated',
    };
  });
}

// 带 DB 的组装：区间内询盘 + 区间内 SEM 周报花费 + 现有 KPI 目标
export function buildLedger(range) {
  const inquiryRows = inqRepo.list(range);
  const semWeeks = semRepo.list(range);
  const semCost = semWeeks.length
    ? semWeeks.reduce((s, w) => s + (Number(w.cost) || 0), 0)
    : null; // 没有周报 = 没数据，不是花了 0 元
  const ledger = computeLedger(inquiryRows, { spendByChannel: { SEM: semCost } });
  return {
    ...ledger,
    range: range || null,
    targets: buildTargetProgress(ledger, kpiRepo.list()),
    sources: {
      inquiries: 'inquiries.date / channel / grade / deal_status',
      spend: 'sem_weeks.cost（人工周报，未接 Ads 自动同步）',
      targets: 'kpi_targets.target（设置页月度目标，不按区间折算）',
    },
  };
}
