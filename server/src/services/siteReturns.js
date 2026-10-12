// 按站点看「花了多少广告费、带来几条询盘」（纯函数，不碰数据库）。
//
// 广告是一个账户几个站共用，按系列区分。要把花费落到站点上，得先知道每个系列投的是哪个站 ——
// 这由人指定（ads_campaign_sites 表）：系列就那么几个，指定一次就行，而且指定的是事实，不会随数据漂。
// 系统能帮的是给建议：表单线索同时带着系列编号和落地页，「这个系列的线索都落在哪个站」是现成的证据。
//
// 诚实口径：
//   · 没归到任何站点的系列，花费单列「未归属」，不摊给谁；
//   · 没标站点的询盘单列「未标注」，不按公司去猜（老询盘都没标，刚上线时这一行会很大）；
//   · 一个站点没有归过任何系列 = 没有花费口径（null），不是 0 元；
//   · 花了钱却没有 SEM 有效询盘：成本是「算不出」（null + 原因），不是无穷大，也不是 0；
//   · 询盘的渠道和等级多数是人填的，所以这张表是参考，不进考核。
import { classify } from './attribution.js';

const EFFECTIVE = new Set(['A', 'B']);

/* campaigns  = 区间内各系列的花费：[{ campaignId, campaignName, costMicros, clicks, conversions }]
   mapping    = Map(系列编号 → 站点 id)
   sites      = 要列出来的站点：[{ id, name, active }]（启用中的 + 被引用到的已停用站点）
   inquiries  = 区间内的询盘：[{ site_id, channel, grade }]
   evidence   = 表单证据：[{ campaign_id, site_id, n }]（带表单证据的询盘里，这个系列落在这个站点几次） */
export function computeSiteReturns({ campaigns = [], mapping = new Map(), sites = [], inquiries = [], evidence = [] }) {
  const siteName = new Map(sites.map((s) => [s.id, s.name]));
  const rows = new Map(sites.map((s) => [s.id, {
    site_id: s.id, name: s.name, active: s.active !== false,
    campaigns: 0, costMicros: null, inquiries: 0, effective: 0, sem_inquiries: 0, sem_effective: 0,
  }]));
  const unassigned = { campaigns: 0, costMicros: 0 };

  for (const c of campaigns) {
    const row = rows.get(mapping.get(String(c.campaignId)));
    const cost = Number(c.costMicros) || 0;
    if (!row) { unassigned.campaigns += 1; unassigned.costMicros += cost; continue; }
    row.campaigns += 1;
    row.costMicros = (row.costMicros || 0) + cost;
  }

  const unlabeled = { inquiries: 0, effective: 0, sem_effective: 0 };
  for (const q of inquiries) {
    const row = rows.get(q.site_id);
    const eff = EFFECTIVE.has(q.grade);
    const sem = classify(q.channel) === 'SEM';
    if (!row) {
      unlabeled.inquiries += 1;
      if (eff) unlabeled.effective += 1;
      if (eff && sem) unlabeled.sem_effective += 1;
      continue;
    }
    row.inquiries += 1;
    if (eff) row.effective += 1;
    if (sem) row.sem_inquiries += 1;
    if (sem && eff) row.sem_effective += 1;
  }

  for (const row of rows.values()) {
    // 每条 SEM 有效询盘花了多少：和「真实询盘回报」卡同一个口径（广告花费 ÷ 渠道为 SEM 的 A/B 询盘）
    if (row.costMicros == null) { row.cost_per_sem_effective = null; row.cost_reason = 'no_campaigns'; }
    else if (!row.sem_effective) { row.cost_per_sem_effective = null; row.cost_reason = row.costMicros > 0 ? 'spent_no_effective' : 'no_spend'; }
    else { row.cost_per_sem_effective = Math.round(row.costMicros / row.sem_effective); row.cost_reason = null; }
  }

  // 每个系列：现在归到哪、证据建议归到哪（只在证据全都指向同一个站点时才建议；两边都有就不猜）
  const bySeries = new Map();
  for (const e of evidence) {
    const k = String(e.campaign_id);
    if (!bySeries.has(k)) bySeries.set(k, []);
    bySeries.get(k).push(e);
  }
  const list = campaigns.map((c) => {
    const id = String(c.campaignId);
    const hits = (bySeries.get(id) || []).filter((e) => siteName.has(e.site_id));
    const one = hits.length === 1 ? hits[0] : null;
    const siteId = mapping.has(id) && siteName.has(mapping.get(id)) ? mapping.get(id) : null;
    return {
      id, name: c.campaignName || id, costMicros: Number(c.costMicros) || 0,
      site_id: siteId, site_name: siteId != null ? siteName.get(siteId) : null,
      suggestion: one && one.site_id !== siteId ? { site_id: one.site_id, site_name: siteName.get(one.site_id), leads: one.n } : null,
      conflicting_evidence: hits.length > 1,
    };
  });

  return {
    synced: campaigns.length > 0,   // false = 这段时间没有同步到广告数据（下面的花费都不该读成 0）
    sites: [...rows.values()],
    unassigned,
    unlabeled,
    campaigns: list,
  };
}
