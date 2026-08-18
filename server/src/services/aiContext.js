// 基于数据库实时数据组装 AI 上下文，保证建议「基于本周真实数据」。
import * as kpiRepo from '../db/repositories/kpi.js';
import * as inqRepo from '../db/repositories/inquiries.js';
import * as seoRepo from '../db/repositories/seoWeeks.js';
import * as semRepo from '../db/repositories/semWeeks.js';
import * as kwRepo from '../db/repositories/keywords.js';
import * as googleRepo from '../db/repositories/googleSync.js';
import { resolveProject } from '../sync/googleClient.js';

// 最近 N 天窗口（GSC 有 ~2 天延迟，end 取昨天）+ 上一等长窗口（供环比/衰退）。
function localIsoDate(offsetDays = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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

function requestedRangeFromText(text) {
  const raw = String(text || '');
  if (/昨天|昨日|yesterday/i.test(raw)) {
    const date = localIsoDate(-1);
    return { label: '昨天', start_date: date, end_date: date };
  }
  if (/今天|今日|today/i.test(raw)) {
    const date = localIsoDate(0);
    return { label: '今天', start_date: date, end_date: date };
  }
  if (/近\s*7\s*天|过去\s*7\s*天|最近\s*7\s*天|last\s*7\s*days/i.test(raw)) {
    return { label: '近7天', start_date: localIsoDate(-6), end_date: localIsoDate(0) };
  }
  return null;
}

function appendRequestedRangeContext(lines, text) {
  const range = requestedRangeFromText(text);
  if (!range) return;
  let project;
  try { project = resolveProject({}); } catch (e) { return; }
  const m6 = (v) => (v == null ? '-' : (Number(v || 0) / 1e6).toFixed(2));

  try {
    const a = googleRepo.adsSummary({ ...range, ads_customer_id: project.ads_customer_id });
    const t = a?.totals || {};
    const hasData = Boolean(Number(t.costMicros || 0) || Number(t.impressions || 0) || Number(t.clicks || 0) || Number(t.conversions || 0));
    lines.push(
      `【用户指定范围·Ads·${range.label} ${range.start_date}~${range.end_date}】` +
        `状态${hasData ? '有同步数据' : '无同步数据'}；花费${m6(t.costMicros)} 点击${t.clicks || 0} 展现${t.impressions || 0} 转化${Number(t.conversions || 0).toFixed(1)} ` +
        `CTR${t.ctr != null ? (t.ctr * 100).toFixed(2) + '%' : '-'} CPC${m6(t.averageCpcMicros)} 每转化成本${m6(t.costPerConversionMicros)}。`
    );
  } catch (e) {
    lines.push(`【用户指定范围·Ads·${range.label} ${range.start_date}~${range.end_date}】读取失败：${e.message || 'ads_context_failed'}`);
  }

  try {
    const g = googleRepo.gscSummary({ ...range, gsc_site_url: project.gsc_site_url });
    const t = g?.totals || {};
    const hasData = Boolean(Number(t.clicks || 0) || Number(t.impressions || 0));
    lines.push(
      `【用户指定范围·GSC·${range.label} ${range.start_date}~${range.end_date}】` +
        `状态${hasData ? '有同步数据' : '无同步数据'}；点击${t.clicks || 0} 展现${t.impressions || 0} ` +
        `CTR${t.ctr != null ? (t.ctr * 100).toFixed(2) + '%' : '-'} 均排名${t.position != null ? t.position.toFixed(1) : '-'}。`
    );
  } catch (e) {
    lines.push(`【用户指定范围·GSC·${range.label} ${range.start_date}~${range.end_date}】读取失败：${e.message || 'gsc_context_failed'}`);
  }
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
    const adsRange = { ...w.cur, ads_customer_id: project.ads_customer_id };
    const searchTermCoverage = googleRepo.adsSearchTermSummary(adsRange);
    const waste = googleRepo.adsWasteSearchTerms(adsRange, { limit: 12 });
    if (searchTermCoverage.rowCount > 0) {
      lines.push(`【Ads真实搜索词覆盖】${searchTermCoverage.rowCount}条日明细/${searchTermCoverage.distinctTerms}个搜索词，最近数据日${searchTermCoverage.lastDate || '-'}`);
    } else {
      lines.push('【Ads搜索词证据缺口】当前区间没有真实 search_term_view 明细，不能提出具体否词。');
    }
    if (waste.length) lines.push('【高花费零转化·真实搜索词】' + waste.map((k) => `${k.searchTerm}(花${m6(k.costMicros)}/点${k.clicks}/0转化/${k.campaignName || '系列未知'})`).join('；'));
  } catch (e) { /* 跳过 */ }
}

export function buildContext(options = {}) {
  const rows = kpiRepo.list();
  const fmt = (r) => `${r.name} 目标${r.target}${r.unit || ''}`;
  const lines = [];
  lines.push('【公司KPI目标·仅目标值，不代表实际表现】' + rows.filter((r) => r.grp === 'total').map(fmt).join('；'));
  lines.push('【SEO KPI目标·仅目标值，不代表实际表现】' + rows.filter((r) => r.grp === 'seo').map(fmt).join('；'));
  lines.push('【SEM KPI目标·仅目标值，不代表实际表现】' + rows.filter((r) => r.grp === 'sem').map(fmt).join('；'));

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
  appendRequestedRangeContext(lines, options.message); // 用户问昨天/今天/近7天时，追加对应范围真实同步摘要

  return lines.join('\n');
}
