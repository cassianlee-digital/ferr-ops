// 任务完成前后的数据对比（纯函数，不碰数据库）。
//
// 经理 2026-10-10：「我们不是要知道上周写了几篇文章，是要知道这些里面哪些产生了可以验证的数据变化、证据在哪。」
// 任务关联了页面 / 广告系列 / 关键词之后（task_links），这里拿它完成日前后各 N 天的同步数据做对比。
//
// 三条诚实规矩，都有测试：
//   1. 两个窗口永远等长。完成才 5 天就只比「前 5 天 vs 后 5 天」，并标「数据未满」——
//      拿 14 天的前窗口去比 5 天的后窗口，任何任务看起来都是下跌的。
//   2. 完成当天不算进任何一边：那天一半是改之前、一半是改之后。
//   3. 只说「之后变了」，不说「因此变了」。同时给出全站 / 全账户同期的变化当参照：
//      全站都涨了 30% 的时候，这个页面涨 30% 不是这条任务的功劳。

export const EFFECT_DAYS = [7, 14, 28];
export const DEFAULT_EFFECT_DAYS = 14;
const DAY_MS = 86400000;

const toDate = (ymd) => new Date(ymd + 'T00:00:00Z');
const toYmd = (d) => d.toISOString().slice(0, 10);
export const addDays = (ymd, n) => toYmd(new Date(toDate(ymd).getTime() + n * DAY_MS));
const diffDays = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY_MS);

/* 完成时刻（SQLite datetime('now')，UTC）→ 业务日期。
   团队在北京时间办公：早上 7 点勾完成的任务在 UTC 还是前一天，直接取 UTC 日期会让窗口整体错开一天。
   与 hermes 的日期口径一致，统一按 Asia/Shanghai。 */
export function businessDate(doneAt) {
  if (!doneAt) return null;
  const d = new Date(String(doneAt).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(doneAt) ? '' : 'Z'));
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/* 对比窗口。latestDate = 该数据源已同步到的最后一天（GSC 有约 2 天延迟，Ads 基本到昨天）。
   status: OK 窗口满 N 天 / PARTIAL 后窗口还没满，两边一起缩短 / PENDING 完成后还一天数据都没有 / NOT_SYNCED 这个数据源压根没有数据 */
export function effectWindow(doneDate, days, latestDate) {
  if (!latestDate) return { status: 'NOT_SYNCED', days: 0, wanted_days: days, before: null, after: null };
  const available = Math.min(days, diffDays(doneDate, latestDate)); // 完成日之后已经有几天数据
  if (available <= 0) return { status: 'PENDING', days: 0, wanted_days: days, before: null, after: null, ready_date: addDays(doneDate, 1) };
  return {
    status: available === days ? 'OK' : 'PARTIAL',
    days: available,
    wanted_days: days,
    before: { start_date: addDays(doneDate, -available), end_date: addDays(doneDate, -1) },
    after: { start_date: addDays(doneDate, 1), end_date: addDays(doneDate, available) },
    full_date: addDays(doneDate, days), // 哪天之后才凑得齐完整窗口
  };
}

const round = (n, d = 2) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

// 单个指标的变化。before 为 0 时百分比没有意义（除零），留空，只给绝对值。
export function delta(before, after) {
  if (before == null || after == null) return null;
  return { abs: round(after - before), pct: before ? round((after - before) / Math.abs(before), 4) : null };
}

/* 指标目录：key → 展示名、越高越好还是越低越好（界面据此上色；neutral = 不上色，比如花费本身没有好坏）。 */
export const METRICS = {
  gsc: [
    { key: 'clicks', label: '点击', better: 'higher' },
    { key: 'impressions', label: '曝光', better: 'higher' },
    { key: 'position', label: '平均排名', better: 'lower' },
  ],
  ads: [
    { key: 'cost', label: '花费', better: 'neutral' },
    { key: 'clicks', label: '点击', better: 'higher' },
    { key: 'conversions', label: '转化', better: 'higher' },
    { key: 'cpa', label: '每转化成本', better: 'lower' },
  ],
};

// 库里的聚合行 → 对外的指标对象（Ads 的 micros 换成账户币种的金额；零转化时 CPA 为空而不是无穷大）
export function shapeMetrics(source, row) {
  if (!row) return null;
  if (source === 'gsc') {
    return { clicks: row.clicks || 0, impressions: row.impressions || 0, position: round(row.position, 1) };
  }
  const cost = (row.costMicros || 0) / 1e6;
  const conversions = row.conversions || 0;
  return { cost: round(cost), clicks: row.clicks || 0, conversions: round(conversions), cpa: conversions > 0 ? round(cost / conversions) : null };
}

export function compare(source, beforeRow, afterRow) {
  const before = shapeMetrics(source, beforeRow);
  const after = shapeMetrics(source, afterRow);
  const deltas = {};
  for (const m of METRICS[source]) deltas[m.key] = delta(before?.[m.key], after?.[m.key]);
  return { before, after, delta: deltas };
}

/* 单个关联对象的结论状态。rows = 两个窗口里各有多少行数据。
   GSC/Ads 只回有曝光的行，所以「一行都没有」在已同步的窗口里就是真实的 0，不是缺数据 ——
   但两边都是 0 时没有任何东西可比，单独标 NO_DATA，免得界面画出一排 0 → 0 像是测过了。 */
export function itemStatus(window, rowsBefore, rowsAfter) {
  if (window.status === 'NOT_SYNCED' || window.status === 'PENDING') return window.status;
  if (!rowsBefore && !rowsAfter) return 'NO_DATA';
  return window.status; // OK | PARTIAL
}
