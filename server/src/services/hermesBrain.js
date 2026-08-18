// Hermes 运营大脑（业务逻辑层）：诊断卡引擎 + 企业长期记忆 + 每日运营学习沉淀。
// 从 routes/hermes.js 下沉至此，修正依赖方向——scheduler(基础设施) 与 routes(HTTP) 都依赖本 service，
// 而不是让 scheduler 反向 import 路由文件。纯业务逻辑 + 数据访问，不含任何 Fastify/HTTP 关注点。
import * as marketBrain from './marketBrain.js';
import * as marketResearchRepo from '../db/repositories/marketResearch.js';
import * as hermesMemoryRepo from '../db/repositories/hermesMemories.js';
import * as kpiRepo from '../db/repositories/kpi.js';
import * as inqRepo from '../db/repositories/inquiries.js';
import * as seoRepo from '../db/repositories/seoWeeks.js';
import * as semRepo from '../db/repositories/semWeeks.js';
import * as kwRepo from '../db/repositories/keywords.js';
import * as googleRepo from '../db/repositories/googleSync.js';
import * as loopItemsRepo from '../db/repositories/loopItems.js';
import * as weeklyReportsRepo from '../db/repositories/weeklyReports.js';
import { resolveProject } from '../sync/googleClient.js';
import { findMemoryConflicts, reviewRequiredMemories, trustedMemories } from './hermesMemoryPolicy.js';

function numericValue(value) {
  const n = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function evidenceId(source, title) {
  const base = String(source || 'source') + '-' + String(title || 'evidence');
  const slug = String(source || 'source').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'source';
  let hash = 0;
  for (const ch of base) hash = ((hash * 31) + ch.charCodeAt(0)) >>> 0;
  return `EV-${slug.slice(0, 32)}-${hash.toString(36)}`;
}

function freshnessFromDate(date) {
  if (!date) return 'unknown';
  const d = new Date(String(date).slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return 'unknown';
  const ageDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (ageDays <= 14) return 'fresh';
  if (ageDays <= 45) return 'aging';
  return 'stale';
}

function evidenceDataRole(source, value) {
  const sourceKey = String(source || '').toLowerCase();
  const valueText = String(value || '').toLowerCase();
  if (valueText.includes('no_synced_rows')) return 'data_gap';
  if (sourceKey === 'kpi_targets') return 'target_only';
  if (sourceKey === 'sem_weeks.latest' || sourceKey === 'seo_weeks.latest' || sourceKey === 'seo_weeks.latesttwo') return 'manual_weekly_report';
  if (sourceKey === 'keywords') return 'keyword_registry';
  if (sourceKey === 'inquiries.stats') return 'crm_observation';
  if (sourceKey === 'market_research') return 'company_research';
  if (sourceKey === 'market_brain') return 'derived_company_summary';
  if (sourceKey.startsWith('hermes_memory')) return 'internal_memory';
  if (sourceKey.endsWith('.sync')) return 'synced_observation';
  return 'operational_observation';
}

function localIsoDate(offsetDays = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function requestedRangeFromText(text) {
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
  return { label: '近30天', start_date: localIsoDate(-29), end_date: localIsoDate(0) };
}

function moneyMicros(value) {
  return (Number(value || 0) / 1e6).toFixed(2);
}

function previousRange(range) {
  const start = new Date(`${range.start_date}T00:00:00Z`);
  const end = new Date(`${range.end_date}T00:00:00Z`);
  const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const prevEnd = new Date(start.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - ((days - 1) * 86400000));
  return { start_date: prevStart.toISOString().slice(0, 10), end_date: prevEnd.toISOString().slice(0, 10) };
}

function hasAdsTotals(t) {
  return Boolean(Number(t?.costMicros || 0) || Number(t?.impressions || 0) || Number(t?.clicks || 0) || Number(t?.conversions || 0));
}

function hasGscTotals(t) {
  return Boolean(Number(t?.clicks || 0) || Number(t?.impressions || 0));
}

export function makeEvidence({ source, title, metric, date, value, detail, dataRole, granularity = 'aggregate', domain = '', label, summary }) {
  return {
    id: evidenceId(source, title),
    source: source || 'unknown',
    dataRole: dataRole || evidenceDataRole(source, value),
    granularity,
    domain,
    label: label || title || '数据证据',
    summary: summary || detail || '',
    metric: metric || '',
    date: date || '',
    freshness: freshnessFromDate(date),
    value: value == null ? '' : String(value),
    detail: detail || '',
  };
}

function makeCard({ area, severity = 'medium', title, evidence, judgment, action, owner, verifyMetric, reviewWindow, source, evidenceMeta = {} }) {
  const evidenceItem = makeEvidence({
    source,
    title,
    metric: evidenceMeta.metric || verifyMetric,
    date: evidenceMeta.date || '',
    value: evidenceMeta.value,
    detail: evidence,
    dataRole: evidenceMeta.dataRole,
    granularity: evidenceMeta.granularity,
    domain: evidenceMeta.domain || area,
    label: evidenceMeta.label || title,
    summary: evidenceMeta.summary || evidence,
  });
  return {
    area,
    severity,
    title,
    evidence: `[${evidenceItem.id}] ${evidence}`,
    evidenceRefs: [evidenceItem.id],
    evidencePack: [evidenceItem],
    judgment,
    action,
    owner,
    verifyMetric,
    reviewWindow,
    source,
  };
}

export function buildOpsDiagnosis(operator, contextText = '') {
  const cards = [];
  const missing = [];
  let hasAdsSyncEvidence = false;
  let hasGscSyncEvidence = false;

  try {
    const project = resolveProject({});
    const range = requestedRangeFromText(contextText);
    const ads = googleRepo.adsSummary({ ...range, ads_customer_id: project.ads_customer_id });
    const t = ads?.totals || {};
    hasAdsSyncEvidence = hasAdsTotals(t);
    cards.push(makeCard({
      area: 'sem',
      severity: hasAdsSyncEvidence ? 'medium' : 'high',
      title: `Ads 同步数据：${range.label}`,
      evidence: `${range.start_date} 至 ${range.end_date}：${hasAdsSyncEvidence ? '已有同步数据' : '没有同步明细'}；花费 ${moneyMicros(t.costMicros)}，展现 ${t.impressions || 0}，点击 ${t.clicks || 0}，转化 ${Number(t.conversions || 0).toFixed(1)}，CTR ${t.ctr != null ? (t.ctr * 100).toFixed(2) + '%' : '-'}`,
      evidenceMeta: {
        metric: 'google_ads_synced_summary', date: range.end_date, granularity: 'aggregate', domain: 'sem',
        value: `status=${hasAdsSyncEvidence ? 'has_data' : 'no_synced_rows'}; cost=${moneyMicros(t.costMicros)}; impressions=${t.impressions || 0}; clicks=${t.clicks || 0}; conversions=${Number(t.conversions || 0).toFixed(1)}; ctr=${t.ctr != null ? (t.ctr * 100).toFixed(2) + '%' : '-'}`,
      },
      judgment: hasAdsSyncEvidence
        ? '系统已经有该范围的 Google Ads 同步数据，应基于这组数据分析 SEM，而不是只看 KPI 目标表或人工周报。'
        : '该范围在本地同步表中没有 Ads 明细，不能声称已经看到了真实投放表现；应检查同步任务、授权或 Ads 后台当天是否有投放。',
      action: hasAdsSyncEvidence
        ? '按系列、关键词、真实搜索词、花费、点击和转化继续拆解浪费点或放量机会。'
        : '先核对 Google Ads 同步状态和该日期是否写入 campaign / keyword / search term 三层明细，再分析运营动作。',
      owner: 'SEM',
      verifyMetric: 'Google Ads synced cost/clicks/conversions',
      reviewWindow: '当天或同步完成后复核',
      source: 'google_ads.sync',
    }));

    if (hasAdsSyncEvidence) {
      const adsRange = { ...range, ads_customer_id: project.ads_customer_id };
      const searchTermCoverage = googleRepo.adsSearchTermSummary(adsRange);
      const hasSearchTerms = Number(searchTermCoverage?.rowCount || 0) > 0;
      cards.push(makeCard({
        area: 'sem', severity: hasSearchTerms ? 'medium' : 'high',
        title: hasSearchTerms ? `Ads 搜索词明细：${range.label}` : `Ads 搜索词证据缺失：${range.label}`,
        evidence: hasSearchTerms
          ? `${range.start_date} 至 ${range.end_date}，已同步 ${searchTermCoverage.rowCount} 条搜索词日明细、${searchTermCoverage.distinctTerms} 个可报告搜索词，最近数据日 ${searchTermCoverage.lastDate || '-'}。`
          : `${range.start_date} 至 ${range.end_date}，Ads 汇总有数据，但 google_ads_search_term_daily 没有搜索词明细。`,
        evidenceMeta: {
          metric: 'ads_search_term_coverage', date: range.end_date,
          dataRole: hasSearchTerms ? 'synced_search_term_coverage' : 'data_gap',
          granularity: 'aggregate', domain: 'sem',
          value: `status=${hasSearchTerms ? 'has_search_terms' : 'missing_search_terms'}; rows=${searchTermCoverage?.rowCount || 0}; distinct_terms=${searchTermCoverage?.distinctTerms || 0}; last_date=${searchTermCoverage?.lastDate || '-'}`,
        },
        judgment: hasSearchTerms
          ? '否词排查已有真实用户搜索词证据，但仍需结合询盘质量和样本量，不能仅凭零 Ads 转化自动否定。'
          : '当前只能评价系列和投放关键词表现，不能把关键词当成用户实际搜索词，也不能生成具体否词结论。',
        action: hasSearchTerms
          ? '优先核对高花费零转化搜索词的询盘归因，再决定加否词或保留。'
          : '重新执行 Ads 同步并确认 search_term_view 有返回后，再做否词排查。',
        owner: 'SEM', verifyMetric: '搜索词明细数、搜索词花费、Ads 转化、有效询盘', reviewWindow: '同步完成后或 3-7 天复盘',
        source: 'google_ads.search_term_sync',
      }));
      if (!hasSearchTerms) missing.push('google_ads_search_terms');

      const waste = hasSearchTerms ? googleRepo.adsWasteSearchTerms(adsRange, { limit: 6 }) : [];
      waste.slice(0, 4).forEach((row) => cards.push(makeCard({
        area: 'sem', severity: 'high', title: `高花费零转化搜索词：${row.searchTerm}`,
        evidence: `${range.start_date} 至 ${range.end_date}，真实搜索词“${row.searchTerm}”（${row.matchType || '匹配方式未知'}，${row.campaignName || '系列未知'} / ${row.adGroupName || '广告组未知'}）花费 ${moneyMicros(row.costMicros)}，点击 ${row.clicks || 0}，转化 ${Number(row.conversions || 0).toFixed(1)}。`,
        evidenceMeta: {
          metric: 'ads_search_term_cost_clicks_conversions', date: range.end_date, dataRole: 'synced_search_term_observation',
          granularity: 'search_term', domain: 'sem', value: `search_term=${row.searchTerm}; campaign=${row.campaignName || ''}; ad_group=${row.adGroupName || ''}; cost=${moneyMicros(row.costMicros)}; clicks=${row.clicks || 0}; conversions=${Number(row.conversions || 0).toFixed(1)}; inquiry_attribution=not_checked`,
        },
        judgment: '该用户搜索词在当前区间产生花费但没有 Ads 转化，是候选否词，不等于已经证明无商业价值。',
        action: '先核对该搜索词对应的有效询盘、意图和样本量，再决定加否词或保留观察。',
        owner: 'SEM', verifyMetric: '搜索词花费、Ads 转化、有效询盘', reviewWindow: '3-7 天复盘',
        source: 'google_ads.search_term_sync',
      })));
    }
  } catch {
    missing.push('google_ads_sync');
  }

  try {
    const project = resolveProject({});
    const range = requestedRangeFromText(contextText);
    const gsc = googleRepo.gscSummary({ ...range, gsc_site_url: project.gsc_site_url });
    const t = gsc?.totals || {};
    hasGscSyncEvidence = hasGscTotals(t);
    cards.push(makeCard({
      area: 'seo',
      severity: hasGscSyncEvidence ? 'medium' : 'high',
      title: `GSC 同步数据：${range.label}`,
      evidence: `${range.start_date} 至 ${range.end_date}：${hasGscSyncEvidence ? '已有同步数据' : '没有同步明细'}；点击 ${t.clicks || 0}，展现 ${t.impressions || 0}，CTR ${t.ctr != null ? (t.ctr * 100).toFixed(2) + '%' : '-'}，平均排名 ${t.position != null ? t.position.toFixed(1) : '-'}。`,
      evidenceMeta: {
        metric: 'gsc_synced_summary', date: range.end_date, granularity: 'aggregate', domain: 'seo',
        value: `status=${hasGscSyncEvidence ? 'has_data' : 'no_synced_rows'}; clicks=${t.clicks || 0}; impressions=${t.impressions || 0}; ctr=${t.ctr != null ? (t.ctr * 100).toFixed(2) + '%' : '-'}; position=${t.position != null ? t.position.toFixed(1) : '-'}`,
      },
      judgment: hasGscSyncEvidence
        ? '系统已经有该范围的 GSC 同步数据，可以基于点击、展现、CTR 和排名判断 SEO。'
        : '该范围在本地同步表中没有 GSC 数据；GSC 通常有延迟，不能把 0 当作真实搜索表现。',
      action: hasGscSyncEvidence
        ? '继续按页面、查询词和 CTR 拆 SEO 异常。'
        : '先看 GSC 同步状态、授权和数据延迟，再下 SEO 结论。',
      owner: 'SEO',
      verifyMetric: 'GSC synced clicks/impressions/CTR/position',
      reviewWindow: '同步完成后复核',
      source: 'gsc.sync',
    }));

    if (hasGscSyncEvidence) {
      const opportunities = googleRepo.gscOpportunities({ ...range, gsc_site_url: project.gsc_site_url }, { limit: 6 });
      opportunities.slice(0, 4).forEach((row) => cards.push(makeCard({
        area: 'seo', severity: 'medium', title: `排名 11-20 机会词：${row.query}`,
        evidence: `${range.start_date} 至 ${range.end_date}，查询词“${row.query}”对应页面 ${row.page || '-'}，展现 ${row.impressions || 0}，点击 ${row.clicks || 0}，CTR ${row.ctr != null ? (row.ctr * 100).toFixed(2) + '%' : '-'}，平均排名 ${row.position != null ? row.position.toFixed(1) : '-'}。`,
        evidenceMeta: {
          metric: 'gsc_query_opportunity', date: range.end_date, dataRole: 'synced_query_observation',
          granularity: 'query', domain: 'seo', value: `query=${row.query}; page=${row.page || ''}; impressions=${row.impressions || 0}; clicks=${row.clicks || 0}; ctr=${row.ctr != null ? (row.ctr * 100).toFixed(2) + '%' : '-'}; position=${row.position != null ? row.position.toFixed(1) : '-'}`,
        },
        judgment: '该查询词已有展现且平均排名在 11-20，可作为优先核查对象；不能仅凭排名断言修改后一定增长。',
        action: '核对搜索意图、对应页面覆盖和内部链接，再决定补内容、改标题或增强内链。',
        owner: 'SEO', verifyMetric: '查询词排名、展现、点击、CTR', reviewWindow: '7-14 天复盘',
        source: 'gsc.query_sync',
      })));

      const cannibalization = googleRepo.gscCannibalization({ ...range, gsc_site_url: project.gsc_site_url }, { limit: 4 });
      cannibalization.slice(0, 3).forEach((row) => cards.push(makeCard({
        area: 'seo', severity: 'medium', title: `疑似关键词蚕食：${row.query}`,
        evidence: `${range.start_date} 至 ${range.end_date}，查询词“${row.query}”由 ${row.pages.length} 个页面获得有效展现，总展现 ${row.totalImpressions || 0}。`,
        evidenceMeta: {
          metric: 'gsc_query_multiple_pages', date: range.end_date, dataRole: 'synced_query_observation',
          granularity: 'query', domain: 'seo', value: `query=${row.query}; pages=${row.pages.length}; impressions=${row.totalImpressions || 0}`,
        },
        judgment: '同一查询词分散到多个页面属于蚕食风险信号，但合并页面前必须核对各页面意图是否真的重复。',
        action: '先比较页面意图、排名和转化角色，再决定合并、规范主页面或调整内链。',
        owner: 'SEO', verifyMetric: '主页面排名、点击、被收录页面数', reviewWindow: '14 天复盘',
        source: 'gsc.query_sync',
      })));

      const decay = googleRepo.gscDecayPages({ ...range, gsc_site_url: project.gsc_site_url }, { ...previousRange(range), gsc_site_url: project.gsc_site_url }, { limit: 4 });
      decay.slice(0, 3).forEach((row) => cards.push(makeCard({
        area: 'seo', severity: 'high', title: `点击衰退页：${row.page}`,
        evidence: `页面 ${row.page} 当前区间点击 ${row.clicksCur || 0}，上一等长区间点击 ${row.clicksPrev || 0}，下降 ${row.dropPct || 0}%；平均排名由 ${row.positionPrev == null ? '-' : row.positionPrev.toFixed(1)} 变为 ${row.positionCur == null ? '-' : row.positionCur.toFixed(1)}。`,
        evidenceMeta: {
          metric: 'gsc_page_click_decline', date: range.end_date, dataRole: 'synced_page_observation',
          granularity: 'page', domain: 'seo', value: `page=${row.page}; clicks_current=${row.clicksCur || 0}; clicks_previous=${row.clicksPrev || 0}; drop=${row.dropPct || 0}%; position_current=${row.positionCur ?? ''}; position_previous=${row.positionPrev ?? ''}`,
        },
        judgment: '该页面点击较上一等长区间下滑；原因仍需结合查询词、排名、CTR、收录和页面变更核查。',
        action: '先拆查询词与排名/CTR 变化，再决定内容更新、标题调整或技术排查。',
        owner: 'SEO', verifyMetric: '页面点击、查询词排名、CTR', reviewWindow: '7-14 天复盘',
        source: 'gsc.page_sync',
      })));
    }
  } catch {
    missing.push('gsc_sync');
  }

  try {
    const rows = kpiRepo.list();
    const groups = { total: '公司', seo: 'SEO', sem: 'SEM' };
    Object.entries(groups).forEach(([group, label]) => {
      const targets = rows.filter((row) => row.grp === group && numericValue(row.target) != null);
      if (!targets.length) return;
      const summary = targets.map((row) => `${row.name} ${row.target}${row.unit || ''}`).join('；');
      cards.push(makeCard({
        area: group === 'total' ? 'kpi' : group,
        severity: 'medium',
        title: `${label} KPI 目标配置`,
        evidence: `${label}当前配置的目标值：${summary}。这些值只代表目标/阈值，不代表实际业绩。`,
        evidenceMeta: {
          metric: `${group}_kpi_targets`, dataRole: 'target_only', granularity: 'target', domain: group === 'total' ? 'kpi' : group,
          value: targets.map((row) => `${row.name} target=${row.target}${row.unit || ''}`).join('; '),
        },
        judgment: '目标值只能用于设定判断基准，必须与相同口径、相同周期的真实观测数据一起使用。',
        action: '先确认指标口径和统计周期，再与 GSC、Ads、询盘或周报实绩比较。',
        owner: group === 'seo' ? 'SEO' : group === 'sem' ? 'SEM' : '主管/老板',
        verifyMetric: 'KPI 目标口径与周期',
        reviewWindow: '目标调整或月度复盘时',
        source: 'kpi_targets',
      }));
    });
  } catch {
    missing.push('KPI targets');
  }

  try {
    const s = inqRepo.stats();
    cards.push(makeCard({
      area: 'inquiry',
      severity: s.valid > 0 ? 'medium' : 'high',
      title: '询盘质量基线',
      evidence: `total=${s.total}, valid=${s.valid}, A=${s.a}, B=${s.b}, C=${s.c}, validRate=${s.rate}%, ARatio=${s.aRatio}%`,
      evidenceMeta: { metric: 'inquiry_quality', value: `total=${s.total}; valid=${s.valid}; validRate=${s.rate}%; ARatio=${s.aRatio}%` },
      judgment: s.valid > 0 ? '已有有效询盘，可用来校验 SEO/SEM 动作是否带来真实业务结果。' : '当前缺少有效询盘，投放和内容建议都需要先验证线索质量。',
      action: '所有 SEO/SEM 优化动作都要绑定有效询盘或 A/B 级询盘变化，不只看流量或点击。',
      owner: '主管/SEO/SEM',
      verifyMetric: '有效询盘数、A 级询盘占比、有效率',
      reviewWindow: '每周复盘',
      source: 'inquiries.stats',
    }));
  } catch {
    missing.push('inquiries');
  }

  try {
    const sem = semRepo.latest();
    if (sem) {
      if (numericValue(sem.cost) > 0 && numericValue(sem.conversions) === 0) {
        cards.push(makeCard({
          area: 'sem',
          severity: 'high',
          title: 'SEM 有花费但无转化',
          evidence: `week=${sem.week_date}, cost=${sem.cost}, clicks=${sem.clicks}, conversions=${sem.conversions}`,
          evidenceMeta: { metric: 'sem_cost_without_conversion', date: sem.week_date, value: `cost=${sem.cost}; clicks=${sem.clicks}; conversions=${sem.conversions}` },
          judgment: '已产生点击成本但没有转化，优先怀疑关键词意图、匹配方式、落地页或询盘入口。',
          action: '先暂停或降价高花费低转化词；检查搜索词并补否词；同步检查落地页和表单。',
          owner: 'SEM',
          verifyMetric: 'conversions, cost_per_conv, valid inquiries',
          reviewWindow: '3-7 天复盘',
          source: 'sem_weeks.latest',
        }));
      }
      if (numericValue(sem.cpc) != null && numericValue(sem.ctr) != null) {
        cards.push(makeCard({
          area: 'sem',
          severity: 'medium',
          title: 'SEM 周报关键指标',
          evidence: `week=${sem.week_date}, CPC=${sem.cpc}, CTR=${sem.ctr}, quality_score=${sem.quality_score}, ROAS=${sem.roas}, cost_per_conv=${sem.cost_per_conv}`,
          evidenceMeta: { metric: 'sem_weekly_metrics', date: sem.week_date, value: `CPC=${sem.cpc}; CTR=${sem.ctr}; quality_score=${sem.quality_score}; ROAS=${sem.roas}; cost_per_conv=${sem.cost_per_conv}` },
          judgment: '这组指标应用来判断是流量质量问题、创意相关性问题，还是转化链路问题。',
          action: '按 CPC/CTR/质量分/转化成本拆分计划和关键词，优先处理高成本低转化组合。',
          owner: 'SEM',
          verifyMetric: 'CPC, CTR, quality_score, cost_per_conv, conversions',
          reviewWindow: '每周复盘',
          source: 'sem_weeks.latest',
        }));
      }
    } else {
      if (!hasAdsSyncEvidence) missing.push('sem_weeks');
    }
  } catch {
    if (!hasAdsSyncEvidence) missing.push('sem_weeks');
  }

  try {
    const seoWeeks = seoRepo.latestTwo();
    const latest = seoWeeks[0];
    const prev = seoWeeks[1];
    if (latest) {
      if (prev && numericValue(latest.clicks) != null && numericValue(prev.clicks) != null && Number(latest.clicks) < Number(prev.clicks)) {
        cards.push(makeCard({
          area: 'seo',
          severity: 'high',
          title: 'SEO 点击下滑',
          evidence: `latest=${latest.week_date} clicks=${latest.clicks}; prev=${prev.week_date} clicks=${prev.clicks}`,
          evidenceMeta: { metric: 'seo_clicks_decline', date: latest.week_date, value: `latest=${latest.clicks}; prev=${prev.clicks}` },
          judgment: '自然点击较上期下降，需要优先排查衰退页面、机会词和标题 CTR。',
          action: '找点击下滑页面；优先改展现高 CTR 低页面标题/描述；给排名 11-20 机会词补内容和内链。',
          owner: 'SEO',
          verifyMetric: 'GSC clicks, CTR, avg_position',
          reviewWindow: '7-14 天复盘',
          source: 'seo_weeks.latestTwo',
        }));
      }
      cards.push(makeCard({
        area: 'seo',
        severity: 'medium',
        title: 'SEO 周报关键指标',
        evidence: `week=${latest.week_date}, clicks=${latest.clicks}, impressions=${latest.impressions}, avg_position=${latest.avg_position}, top10_ratio=${latest.top10_ratio}, coverage=${latest.coverage}, indexed_pages=${latest.indexed_pages}`,
        evidenceMeta: { metric: 'seo_weekly_metrics', date: latest.week_date, value: `clicks=${latest.clicks}; impressions=${latest.impressions}; avg_position=${latest.avg_position}; top10_ratio=${latest.top10_ratio}; indexed_pages=${latest.indexed_pages}` },
        judgment: '这组指标应用来判断是排名问题、CTR 问题、收录问题，还是关键词覆盖不足。',
        action: '按展现高低、排名区间和页面类型拆 SEO 任务，不要只写泛泛内容建议。',
        owner: 'SEO',
        verifyMetric: 'clicks, impressions, CTR, avg_position, indexed_pages',
        reviewWindow: '每周复盘',
        source: 'seo_weeks.latest',
      }));
    } else {
      if (!hasGscSyncEvidence) missing.push('seo_weeks');
    }
  } catch {
    if (!hasGscSyncEvidence) missing.push('seo_weeks');
  }

  try {
    const semKeywords = kwRepo.list('sem').slice(0, 12).map((k) => k.keyword);
    const seoKeywords = kwRepo.list('seo').slice(0, 12).map((k) => k.keyword);
    if (semKeywords.length || seoKeywords.length) {
      cards.push(makeCard({
        area: 'keywords',
        severity: 'medium',
        title: '关键词库可用于落地动作',
        evidence: `sem=${semKeywords.join(', ') || '-'}; seo=${seoKeywords.join(', ') || '-'}`,
        evidenceMeta: { metric: 'keyword_pool', value: `sem=${semKeywords.length}; seo=${seoKeywords.length}` },
        judgment: '关键词库能把建议落到具体词，但是否浪费/机会仍需结合 Ads/GSC 明细。',
        action: '让 Hermes 输出建议时必须引用具体关键词，并说明要暂停、扩展、否定、改内容还是改落地页。',
        owner: 'SEO/SEM',
        verifyMetric: 'keyword rank, CTR, CPC, conversions',
        reviewWindow: '7-14 天复盘',
        source: 'keywords',
      }));
    }
  } catch {
    missing.push('keywords');
  }

  const severityOrder = { high: 0, medium: 1, low: 2 };
  const priorityCards = cards.slice().sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9)).slice(0, 12);
  const evidencePack = cards.flatMap((card) => card.evidencePack || []).slice(0, 40);

  return {
    generatedAt: new Date().toISOString(),
    role: operator.role,
    priorityCards,
    evidencePack,
    missingData: [...new Set(missing)],
    usage: 'Use evidencePack ids as citation anchors. Do not make claims that are not supported by an evidence id or explicit missingData.',
  };
}

function safeJson(value) {
  try { return value ? JSON.parse(value) : null; } catch { return null; }
}

const COMPLETED_ACTION_STATUSES = new Set([
  'done', 'completed', 'closed', 'verified', '已完成', '完成', '已验证', '已关闭',
]);

function beijingDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function actionStatus(row) {
  return String(row?.status || '').trim().toLowerCase();
}

function actionLabel(row) {
  return String(row?.content || row?.title || `动作 #${row?.id || ''}`).trim();
}

function reportHasContent(report) {
  return ['summary', 'problems', 'analysis', 'next_plan'].some((field) => {
    const value = report?.[field];
    return Array.isArray(value) ? value.length > 0 : Boolean(String(value || '').trim());
  });
}

function recentReportCutoff(today) {
  const date = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return today;
  date.setUTCDate(date.getUTCDate() - 14);
  return date.toISOString().slice(0, 10);
}

export function buildClosureAudit({ memories = [], actions = [], reports = [], today = beijingDateKey() } = {}) {
  const memoryConflicts = findMemoryConflicts(memories);

  const actionRows = (Array.isArray(actions) ? actions : []).filter((row) => row?.state !== 'deleted');
  const completedActions = actionRows.filter((row) => COMPLETED_ACTION_STATUSES.has(actionStatus(row)));
  const archivedActions = actionRows.filter((row) => row?.state === 'archived');
  const openActions = actionRows.filter((row) => row?.state !== 'archived' && !COMPLETED_ACTION_STATUSES.has(actionStatus(row)));
  const overdueActions = openActions.filter((row) =>
    /^\d{4}-\d{2}-\d{2}$/.test(String(row?.task_date || '')) && row.task_date < today
  ).slice(0, 10).map((row) => ({
    id: row.id, content: actionLabel(row), taskDate: row.task_date, status: row.status || '未完成',
  }));
  const verificationCandidates = [
    ...completedActions,
    ...archivedActions.filter((row) => ['task', 'plan', 'test'].includes(String(row?.kind || '').toLowerCase())),
  ];
  const unverifiedActions = verificationCandidates.filter((row) =>
    !String(row?.metric || '').trim() || (!String(row?.conclusion || '').trim() && !String(row?.analysis || '').trim())
  ).slice(0, 10).map((row) => ({
    id: row.id,
    content: actionLabel(row),
    state: row.state || 'active',
    fields: [
      !String(row?.metric || '').trim() ? 'metric' : '',
      !String(row?.conclusion || '').trim() && !String(row?.analysis || '').trim() ? 'conclusion' : '',
    ].filter(Boolean),
    missing: [
      !String(row?.metric || '').trim() ? '验证指标' : '',
      !String(row?.conclusion || '').trim() && !String(row?.analysis || '').trim() ? '执行结果/结论' : '',
    ].filter(Boolean),
  }));

  const reportRows = Array.isArray(reports) ? reports : [];
  const cutoff = recentReportCutoff(today);
  const reviewGaps = reportRows.filter((report) => {
    const weekKey = String(report?.week_key || '');
    if (!reportHasContent(report)) return /^\d{4}-\d{2}-\d{2}$/.test(weekKey) && weekKey >= cutoff;
    const hasAnalysis = Array.isArray(report.analysis) ? report.analysis.length > 0 : Boolean(String(report.analysis || '').trim());
    const hasNextPlan = Array.isArray(report.next_plan) ? report.next_plan.length > 0 : Boolean(String(report.next_plan || '').trim());
    return !hasAnalysis || !hasNextPlan;
  }).slice(0, 10).map((report) => ({
    weekKey: report.week_key,
    dept: report.dept,
    fields: [
      !reportHasContent(report) ? 'summary' : '',
      (Array.isArray(report.analysis) ? report.analysis.length === 0 : !String(report.analysis || '').trim()) ? 'analysis' : '',
      (Array.isArray(report.next_plan) ? report.next_plan.length === 0 : !String(report.next_plan || '').trim()) ? 'next_plan' : '',
    ].filter(Boolean),
    missing: [
      !reportHasContent(report) ? '周报内容' : '',
      (Array.isArray(report.analysis) ? report.analysis.length === 0 : !String(report.analysis || '').trim()) ? '分析结论' : '',
      (Array.isArray(report.next_plan) ? report.next_plan.length === 0 : !String(report.next_plan || '').trim()) ? '下一步计划' : '',
    ].filter(Boolean),
  }));

  const issueCount = memoryConflicts.length + overdueActions.length + unverifiedActions.length + reviewGaps.length;
  const hasRecords = (Array.isArray(memories) && memories.length > 0) || actionRows.length > 0 || reportRows.length > 0;
  return {
    generatedAt: new Date().toISOString(),
    status: !hasRecords ? 'no_data' : issueCount ? 'blocked' : 'clear',
    issueCount,
    memoryConflicts: memoryConflicts.slice(0, 8),
    actionSummary: {
      total: actionRows.length, open: openActions.length, archived: archivedActions.length, completed: completedActions.length,
      overdue: overdueActions.length, unverified: unverifiedActions.length,
    },
    overdueActions,
    unverifiedActions,
    reviewGaps,
  };
}

export function buildEnterpriseMemory() {
  let brainState = null;
  let marketSummary = '';
  let marketRows = [];
  let longTermMemories = [];
  let actions = [];
  let reports = [];
  const missing = [];

  try {
    brainState = marketBrain.checkState();
    marketSummary = marketBrain.getSummary();
  } catch {
    missing.push('market_brain');
  }

  try {
    marketRows = marketResearchRepo.list().slice(0, 80).map((r) => ({
      section: r.section || '',
      question: r.question || '',
      answers: safeJson(r.answers) || r.answers || '',
    }));
  } catch {
    missing.push('market_research');
  }

  try {
    longTermMemories = hermesMemoryRepo.list({ activeOnly: true, limit: 30 });
  } catch {
    missing.push('hermes_memories');
  }

  try {
    actions = loopItemsRepo.list(null, { view: 'all' });
  } catch {
    missing.push('loop_items');
  }

  try {
    reports = weeklyReportsRepo.list();
  } catch {
    missing.push('weekly_reports');
  }

  const closureAudit = buildClosureAudit({ memories: longTermMemories, actions, reports });
  const trusted = trustedMemories(longTermMemories, closureAudit.memoryConflicts);
  const reviewRequired = reviewRequiredMemories(longTermMemories);
  const evidencePack = [];
  marketRows.slice(0, 12).forEach((row, index) => {
    evidencePack.push(makeEvidence({
      source: 'market_research',
      title: `${row.section || '市场调研'}：${row.question || `记录 ${index + 1}`}`,
      label: `${row.section || '市场调研'}：${row.question || `记录 ${index + 1}`}`,
      metric: 'company_market_research',
      value: JSON.stringify(row.answers || ''),
      detail: `公司市场调研记录：${JSON.stringify(row.answers || '')}`,
      dataRole: 'company_research', granularity: 'research_row', domain: 'market',
    }));
  });
  trusted.slice(0, 12).forEach((memory) => {
    evidencePack.push(makeEvidence({
      source: `hermes_memory:${memory.source || memory.id}`,
      title: memory.title || `长期记忆 ${memory.id}`,
      label: `公司记忆：${memory.title || memory.id}`,
      metric: 'trusted_internal_memory',
      date: memory.updated_at || memory.created_at || '',
      value: memory.content || '',
      detail: [memory.content, memory.evidence].filter(Boolean).join('；'),
      dataRole: 'internal_memory', granularity: 'memory', domain: ['customer', 'market', 'company'].includes(memory.kind) ? 'market' : '',
    }));
  });
  if (marketSummary) {
    evidencePack.push(makeEvidence({
      source: 'market_brain', title: '市场分析 AI 摘要', label: '市场分析摘要', metric: 'market_summary',
      date: brainState?.updatedAt || brainState?.updated_at || '', value: marketSummary, detail: marketSummary,
      dataRole: 'derived_company_summary', granularity: 'summary', domain: 'market',
    }));
  }
  return {
    generatedAt: new Date().toISOString(),
    purpose: 'Long-lived enterprise memory for Hermes. Use this before generic marketing assumptions.',
    marketBrain: {
      state: brainState,
      summary: marketSummary,
      instruction: marketSummary
        ? 'This is an AI-derived navigation summary only. Verify every company or customer fact against marketResearch rows or trustedLongTermMemories before using it.'
        : 'Market research exists but AI memory summary is empty or not refreshed. Ask user to click Sync / Update AI memory on Market Analysis.',
    },
    marketResearch: {
      totalRows: marketRows.length,
      sampleRows: marketRows.slice(0, 12),
      instruction: 'Use market research rows as customer/ICP evidence. Do not quote rows not present in this payload.',
    },
    longTermMemories,
    trustedLongTermMemories: trusted,
    reviewRequiredLongTermMemories: reviewRequired,
    evidencePack,
    closureAudit,
    missingData: missing,
  };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function buildDailyLearningMemory(operator) {
  const diagnosis = buildOpsDiagnosis(operator);
  const enterpriseMemory = buildEnterpriseMemory();
  const day = todayKey();
  const cards = diagnosis.priorityCards || [];
  const high = cards.filter((c) => c.severity === 'high');
  const focus = (high.length ? high : cards).slice(0, 5);
  const missing = [
    ...(diagnosis.missingData || []),
    ...(enterpriseMemory.missingData || []),
  ];

  const content = [
    `日期：${day}`,
    `角色视角：${operator.role}`,
    `今日核心判断：${focus.length ? '优先盯住 ' + focus.map((c) => c.title).join('；') : '当前没有足够诊断卡，需要先补数据。'}`,
    '',
    '今日优先动作：',
    ...(focus.length ? focus.map((c, i) => `${i + 1}. ${c.title}｜${c.action}｜负责人：${c.owner}｜验证：${c.verifyMetric}｜复盘：${c.reviewWindow}`) : ['1. 补齐 KPI/SEO/SEM/询盘数据后再生成诊断。']),
    '',
    `市场记忆状态：${enterpriseMemory.marketBrain?.summary ? '已有市场分析摘要' : '市场分析摘要未生成或需更新'}`,
    missing.length ? `缺失/需补充数据：${[...new Set(missing)].join('、')}` : '缺失/需补充数据：暂无',
  ].join('\n');

  const evidence = focus.map((c) => `${c.title}: ${c.evidence}`).join('\n');
  const item = hermesMemoryRepo.upsertBySourceTitle({
    kind: 'learning',
    title: `每日运营学习 ${day}`,
    content,
    evidence,
    source: 'hermes_daily_learning',
    importance: 5,
  });

  return { item, diagnosis, enterpriseMemory };
}
