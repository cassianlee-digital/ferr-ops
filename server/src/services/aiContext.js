// 基于数据库实时数据组装 AI 上下文，保证建议「基于本周真实数据」。
import * as kpiRepo from '../db/repositories/kpi.js';
import * as inqRepo from '../db/repositories/inquiries.js';
import * as seoRepo from '../db/repositories/seoWeeks.js';
import * as semRepo from '../db/repositories/semWeeks.js';
import * as kwRepo from '../db/repositories/keywords.js';
import * as googleRepo from '../db/repositories/googleSync.js';
import { resolveProject } from '../sync/googleClient.js';

// 最近 N 天窗口（GSC 有 ~2 天延迟，end 取昨天）+ 上一等长窗口（供环比/衰退）。
function recentWindows(days = 30) {
  const day = 86400000;
  const end = new Date(Date.now() - day);
  const start = new Date(end.getTime() - (days - 1) * day);
  const prevEnd = new Date(start.getTime() - day);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * day);
  const iso = (d) => d.toISOString().slice(0, 10);
  return {
    cur: { start_date: iso(start), end_date: iso(end) },
    prev: { start_date: iso(prevStart), end_date: iso(prevEnd) },
    days,
  };
}

// 把已同步的真实 GSC/Ads 汇总 + 诊断 findings 注入上下文（无数据/未授权则静默跳过）。
function appendSyncedContext(lines) {
  let project;
  try { project = resolveProject({}); } catch (e) { return; }
  const w = recentWindows(30);
  const m6 = (v) => (v == null ? '-' : (v / 1e6).toFixed(2)); // micros → 账户币种单位

  try {
    const g = googleRepo.gscSummary({ ...w.cur, gsc_site_url: project.gsc_site_url });
    if (g && g.totals && (g.totals.impressions || g.totals.clicks)) {
      const t = g.totals;
      lines.push(
        `【GSC同步·近${w.days}天】点击${t.clicks} 展现${t.impressions} ` +
          `CTR${t.ctr != null ? (t.ctr * 100).toFixed(2) + '%' : '-'} 均排名${t.position != null ? t.position.toFixed(1) : '-'} 覆盖词${g.queryCount}`
      );
    }
  } catch (e) { /* 跳过 */ }

  try {
    const a = googleRepo.adsSummary({ ...w.cur, ads_customer_id: project.ads_customer_id });
    if (a && a.totals && (a.totals.costMicros || a.totals.clicks)) {
      const t = a.totals;
      lines.push(
        `【Ads同步·近${w.days}天】花费${m6(t.costMicros)} 点击${t.clicks} 转化${Number(t.conversions || 0).toFixed(1)} ` +
          `CTR${t.ctr != null ? (t.ctr * 100).toFixed(2) + '%' : '-'} CPC${m6(t.averageCpcMicros)} 每转化成本${m6(t.costPerConversionMicros)}（金额为账户币种）`
      );
      const camps = (a.campaigns || []).slice(0, 6).map((c) => `${c.campaignName}(花${m6(c.costMicros)}/转${Number(c.conversions || 0).toFixed(1)})`);
      if (camps.length) lines.push('【Ads系列】' + camps.join('；'));
    }
  } catch (e) { /* 跳过 */ }

  try {
    const opp = googleRepo.gscOpportunities({ ...w.cur, gsc_site_url: project.gsc_site_url }, { limit: 10 });
    if (opp.length) lines.push('【机会词·排名11-20】' + opp.map((o) => `${o.query}(排${o.position != null ? o.position.toFixed(1) : '-'}/展${o.impressions})`).join('；'));
    const can = googleRepo.gscCannibalization({ ...w.cur, gsc_site_url: project.gsc_site_url }, { limit: 8 });
    if (can.length) lines.push('【关键词蚕食】' + can.map((c) => `${c.query}(${c.pages.length}页)`).join('；'));
    const dec = googleRepo.gscDecayPages({ ...w.cur, gsc_site_url: project.gsc_site_url }, w.prev, { limit: 8 });
    if (dec.length) lines.push('【流量衰退页】' + dec.map((d) => `${d.page}(↓${d.dropPct}%)`).join('；'));
    const waste = googleRepo.adsWasteKeywords({ ...w.cur, ads_customer_id: project.ads_customer_id }, { limit: 12 });
    if (waste.length) lines.push('【高花费零有效·Ads词】' + waste.map((k) => `${k.keyword}(花${m6(k.costMicros)}/点${k.clicks}/0转化)`).join('；'));
  } catch (e) { /* 跳过 */ }
}

const MARKET =
  '目标客户=欧美来图定制工厂/中间商；欧洲毛利高最在意资质，东南亚/巴西薄难成交；' +
  '现仅 SMETA 验厂、缺欧洲认证是短板；客户索要频率 catalog>材质证书>检测报告>案例>工厂视频。';

export function buildContext() {
  const rows = kpiRepo.list();
  const fmt = (r) => `${r.name} 目标${r.target}(实际${r.actual})`;
  const lines = [];
  lines.push('【公司KPI(目标/实际)】' + rows.filter((r) => r.grp === 'total').map(fmt).join('；'));
  lines.push('【SEO·李】' + rows.filter((r) => r.grp === 'seo').map(fmt).join('；'));
  lines.push('【SEM·陈】' + rows.filter((r) => r.grp === 'sem').map(fmt).join('；'));

  const s = inqRepo.stats();
  lines.push(`【询盘】总量${s.total} 有效${s.valid}(A${s.a}/B${s.b}/C${s.c}) A级占比${s.aRatio}% 有效率${s.rate}%`);

  const sw = seoRepo.latestTwo()[0];
  if (sw) {
    lines.push(
      `【本周SEO实录】点击${sw.clicks} 展现${sw.impressions} 均排名${sw.avg_position ?? '-'} ` +
        `跳出${sw.bounce_rate ?? '-'}% Top10占比${sw.top10_ratio ?? '-'}% 覆盖${sw.coverage ?? '-'} 新增收录${sw.indexed_pages ?? '-'}`
    );
  }
  const mw = semRepo.latest();
  if (mw) {
    lines.push(
      `【本周SEM实录】花费¥${mw.cost} 点击${mw.clicks} 转化${mw.conversions} ROAS${mw.roas ?? '-'}x ` +
        `CPC¥${mw.cpc ?? '-'} CTR${mw.ctr ?? '-'}% 每转化¥${mw.cost_per_conv ?? '-'}`
    );
  }

  const seoKw = kwRepo.list('seo');
  if (seoKw.length) lines.push('【SEO关键词排名】' + seoKw.map((k) => `${k.keyword}(${k.attrs?.gscRank ?? '-'})`).join('、'));
  const high = kwRepo.list('high');
  if (high.length) lines.push('【高价值词】' + high.map((k) => k.keyword).join('、'));

  appendSyncedContext(lines); // 注入真实 GSC/Ads 同步汇总 + 诊断 findings

  lines.push('【市场】' + MARKET);
  return lines.join('\n');
}
