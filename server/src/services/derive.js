// 派生指标计算（后端权威）。前端只展示，不自己算。
export function round(n, d = 2) {
  if (n == null || !isFinite(n)) return null;
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

// SEM：CPC = 花费/点击；CTR = 点击/展现*100；每次转化费用 = 花费/转化
export function deriveSem({ cost = 0, clicks = 0, impressions = 0, conversions = 0 }) {
  return {
    cpc: clicks ? round(cost / clicks, 2) : null,
    ctr: impressions ? round((clicks / impressions) * 100, 1) : null,
    cost_per_conv: conversions ? round(cost / conversions, 0) : null,
  };
}

// SEO：自然流量环比 = (本周点击/上周点击 - 1) * 100
export function seoWow(lastClicks, prevClicks) {
  if (!prevClicks) return null;
  return round((lastClicks / prevClicks - 1) * 100, 1);
}
