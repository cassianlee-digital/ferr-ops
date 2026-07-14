// 询盘归因的纯计算：channel 分类 + 按渠道聚合 + SEM「真实每有效询盘成本」。
// 与前端 renderInqDonuts 同口径。无 DB 依赖，便于单测（数据由路由层查好后传入）。

// channel 文案 → 规范渠道（SEO自然 / SEM付费 / 直接 / 其他）
export function classify(ch) {
  const c = String(ch || '').trim();
  if (/SEO自然|SEO/i.test(c)) return 'SEO';
  if (/SEM付费|SEM/i.test(c)) return 'SEM';
  if (/直接/.test(c)) return 'direct';
  return 'other';
}

// inquiryRows: [{ channel, grade }]（A/B 计有效，A 单列）
// adsTotals:   { costMicros, conversions }（Ads 汇总；缺省视为 0）
export function computeAttribution(inquiryRows = [], adsTotals = {}) {
  const mk = () => ({ total: 0, effective: 0, a: 0 });
  const channels = { SEO: mk(), SEM: mk(), direct: mk(), other: mk() };
  for (const r of inquiryRows) {
    const k = classify(r.channel);
    channels[k].total++;
    if (r.grade === 'A' || r.grade === 'B') channels[k].effective++;
    if (r.grade === 'A') channels[k].a++;
  }

  const costMicros = adsTotals.costMicros || 0;
  const conversions = adsTotals.conversions || 0;
  const cost = costMicros / 1e6; // micros → 账户币种金额
  const sem = channels.SEM;

  return {
    channels,
    totals: {
      total: inquiryRows.length,
      effective: Object.values(channels).reduce((s, c) => s + c.effective, 0),
    },
    sem: {
      costMicros,
      adsConversions: conversions,            // Ads 自报转化（可能与真实询盘不一致）
      inquiriesTotal: sem.total,
      inquiriesEffective: sem.effective,
      inquiriesA: sem.a,
      costPerEffective: sem.effective > 0 ? cost / sem.effective : null,
      costPerA: sem.a > 0 ? cost / sem.a : null,
    },
  };
}
