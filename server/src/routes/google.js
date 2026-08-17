import { requireAuth, onlyManagerBoss } from '../auth/middleware.js';
import { config } from '../config.js';
import * as googleRepo from '../db/repositories/googleSync.js';
import { adsSummary, ga4Overview, gscSummary } from '../db/repositories/googleSync.js';
import { buildAuthUrl, exchangeCode, normalizeRange, projectProviderConfig, resolveProject } from '../sync/googleClient.js';

// 上一等长窗口（用于 Δ 环比）
function seoPrevRange(range) {
  const day = 86400000;
  const s = new Date(range.start_date + 'T00:00:00Z');
  const e = new Date(range.end_date + 'T00:00:00Z');
  const len = Math.round((e - s) / day) + 1;
  const prevEnd = new Date(s.getTime() - day);
  const prevStart = new Date(prevEnd.getTime() - (len - 1) * day);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { start_date: iso(prevStart), end_date: iso(prevEnd) };
}
const _pct = (cur, prev) => (prev ? Math.round((cur / prev - 1) * 100) : (cur ? 100 : 0));
// 自动挑「本周要点」：最大的涨/跌，供老板一眼看走向
export function buildSeoHighlights({ cur, prevTot, queries, pages }) {
  const H = [];
  const hasObservation = [cur?.clicks, cur?.impressions, prevTot?.clicks, prevTot?.impressions]
    .some((value) => Number(value) > 0) || (queries || []).length > 0 || (pages || []).length > 0;
  if (cur && prevTot && hasObservation) {
    if (cur.clicks != null) {
      const dc = _pct(cur.clicks, prevTot.clicks);
      H.push({ tone: dc >= 0 ? 'good' : 'bad', text: `自然点击 ${cur.clicks.toLocaleString()}（${dc >= 0 ? '+' : ''}${dc}% vs 上一周期）` });
    }
    if (cur.position != null && prevTot.position != null) {
      const dp = +(cur.position - prevTot.position).toFixed(1); // 负=排名变好
      H.push({ tone: dp <= 0 ? 'good' : 'bad', text: `平均排名 ${cur.position.toFixed(1)}（${dp <= 0 ? '↑进步' : '↓退步'} ${Math.abs(dp)}）` });
    }
  }
  const wd = (queries || []).map((q) => ({ ...q, d: (q.clicks || 0) - (q.clicksPrev || 0) }));
  const up = [...wd].sort((a, b) => b.d - a.d)[0];
  const dn = [...wd].sort((a, b) => a.d - b.d)[0];
  if (up && up.d > 0) H.push({ tone: 'good', text: `「${up.query}」点击 +${up.d}（排名 ${up.position != null ? up.position.toFixed(1) : '-'}）` });
  if (dn && dn.d < 0) H.push({ tone: 'bad', text: `「${dn.query}」点击 ${dn.d}，需关注` });
  const strip = (u) => String(u || '').replace(/^https?:\/\/[^/]+/, '') || '/';
  const pd = (pages || [])
    .map((p) => ({ ...p, dp: _pct(p.clicks, p.clicksPrev) }))
    .filter((p) => (p.clicksPrev || 0) >= 20)
    .sort((a, b) => a.dp - b.dp)[0];
  if (pd && pd.dp < 0) H.push({ tone: 'bad', text: `页面 ${strip(pd.page)} 点击 ${pd.dp}%` });
  return H.slice(0, 6);
}
const _m6 = (v) => (v == null ? 0 : v / 1e6);
// SEM 本周要点：转化/每转化成本环比 + 高花费零转化 + 最佳系列
export function buildAdsHighlights({ cur, prevTot, keywords, campaigns }) {
  const H = [];
  const hasObservation = [cur?.costMicros, cur?.impressions, cur?.clicks, cur?.conversions,
    prevTot?.costMicros, prevTot?.impressions, prevTot?.clicks, prevTot?.conversions]
    .some((value) => Number(value) > 0) || (keywords || []).length > 0 || (campaigns || []).length > 0;
  if (cur && prevTot && hasObservation) {
    if (cur.conversions != null) {
      const dc = _pct(cur.conversions, prevTot.conversions);
      H.push({ tone: dc >= 0 ? 'good' : 'bad', text: `转化 ${Number(cur.conversions).toFixed(1)}（${dc >= 0 ? '+' : ''}${dc}% vs 上一周期）` });
    }
    if (cur.costPerConversionMicros != null && prevTot.costPerConversionMicros != null) {
      const dp = _pct(_m6(cur.costPerConversionMicros), _m6(prevTot.costPerConversionMicros));
      H.push({ tone: dp <= 0 ? 'good' : 'bad', text: `每转化成本 ${_m6(cur.costPerConversionMicros).toFixed(0)}（${dp >= 0 ? '+' : ''}${dp}%，越低越好）` });
    }
  }
  const zero = (keywords || []).filter((k) => (k.conversions || 0) === 0 && (k.costMicros || 0) > 0);
  const wasted = zero.reduce((s, k) => s + (k.costMicros || 0), 0);
  if (wasted > 0) H.push({ tone: 'bad', text: `高花费零转化词合计花 ${_m6(wasted).toFixed(0)}（${zero.length} 个词）` });
  const worst = [...zero].sort((a, b) => b.costMicros - a.costMicros)[0];
  if (worst) H.push({ tone: 'bad', text: `最烧钱零转化：「${worst.keyword}」花 ${_m6(worst.costMicros).toFixed(0)}` });
  const best = [...(campaigns || [])].sort((a, b) => (b.conversions || 0) - (a.conversions || 0))[0];
  if (best && best.conversions > 0) H.push({ tone: 'good', text: `最佳系列「${best.name}」转化 ${Number(best.conversions).toFixed(1)}` });
  return H.slice(0, 6);
}

function statusFor(provider, tokens, runs, project) {
  const pc = projectProviderConfig(provider, project);
  const token = tokens[provider] || {};
  const run = runs[provider] || null;
  return {
    configured: pc.ready,
    missing: pc.missing,
    authorized: !!token.authorized,
    tokenUpdatedAt: token.updatedAt || null,
    lastSyncAt: run?.finished_at || run?.started_at || null,
    lastSyncStatus: run?.status || null,
    lastError: run?.status === 'failed' ? run.error : null,
  };
}

export async function googleRoutes(app) {
  app.get('/api/google/status', { preHandler: requireAuth }, async () => {
    const tokens = googleRepo.tokenStatus();
    const runs = googleRepo.latestRuns();
    const projects = googleRepo.listProjects();
    const defaultProject = resolveProject({});
    return {
      providers: {
        gsc: {
          ...statusFor('gsc', tokens, runs, defaultProject),
          siteUrlConfigured: !!config.google.gscSiteUrl,
        },
        ga4: {
          ...statusFor('ga4', tokens, runs, defaultProject),
          propertyConfigured: !!config.google.ga4PropertyId,
        },
        ads: {
          ...statusFor('ads', tokens, runs, defaultProject),
          customerConfigured: !!config.google.adsCustomerId,
          loginCustomerConfigured: !!config.google.adsLoginCustomerId,
          apiVersion: config.google.adsApiVersion,
        },
      },
      projects,
      defaultProject,
    };
  });

  app.get('/api/google/projects', { preHandler: requireAuth }, async () => ({
    projects: googleRepo.listProjects(),
    defaultProject: googleRepo.getDefaultProject(),
  }));

  app.post('/api/google/projects', onlyManagerBoss, async (request, reply) => {
    const body = request.body || {};
    if (!String(body.name || '').trim()) return reply.code(400).send({ error: 'project_name_required' });
    const project = googleRepo.createProject(body);
    reply.code(201);
    return { project };
  });

  app.patch('/api/google/projects/:id', onlyManagerBoss, async (request, reply) => {
    const project = googleRepo.updateProject(Number(request.params.id), request.body || {});
    if (!project) return reply.code(404).send({ error: 'project_not_found' });
    return { project };
  });

  app.delete('/api/google/projects/:id', onlyManagerBoss, async (request, reply) => {
    googleRepo.deleteProject(Number(request.params.id));
    return { ok: true };
  });

  app.get('/api/google/auth/start', onlyManagerBoss, async (request, reply) => {
    const provider = String(request.query?.provider || '');
    try {
      const authUrl = buildAuthUrl(provider);
      return reply.redirect(authUrl);
    } catch (e) {
      const code = e.message === 'bad_provider' || e.message === 'google_config_missing' ? 400 : 500;
      return reply.code(code).send({ error: e.message || 'google_auth_start_failed', missing: e.missing || undefined });
    }
  });

  app.get('/api/google/auth/callback', { preHandler: requireAuth }, async (request, reply) => {
    const { code, state, error } = request.query || {};
    if (error) return reply.code(400).send({ error: 'google_auth_denied', detail: String(error) });
    const provider = googleRepo.consumeState(String(state || ''));
    if (!provider) return reply.code(400).send({ error: 'bad_oauth_state' });
    try {
      await exchangeCode(provider, String(code || ''));
      return reply.redirect(`/?google_auth=success&provider=${encodeURIComponent(provider)}`);
    } catch (e) {
      return reply.code(502).send({ error: e.message || 'google_auth_exchange_failed' });
    }
  });

  app.delete('/api/google/auth/:provider', onlyManagerBoss, async (request, reply) => {
    const provider = String(request.params?.provider || '');
    try {
      googleRepo.deleteToken(provider);
      return { ok: true };
    } catch (e) {
      return reply.code(400).send({ error: e.message || 'bad_provider' });
    }
  });

  app.get('/api/google/gsc/summary', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const project = resolveProject(request.query || {});
      const range = { ...normalizeRange(request.query || {}), gsc_site_url: project.gsc_site_url };
      return { connected: googleRepo.tokenStatus().gsc.authorized, project, ...gscSummary(range) };
    } catch (e) {
      return reply.code(400).send({ error: e.message || 'bad_request' });
    }
  });

  app.get('/api/google/ga4/overview', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const project = resolveProject(request.query || {});
      const range = { ...normalizeRange(request.query || {}), ga4_property_id: project.ga4_property_id };
      return { connected: googleRepo.tokenStatus().ga4.authorized, project, ...ga4Overview(range) };
    } catch (e) {
      return reply.code(400).send({ error: e.message || 'bad_request' });
    }
  });

  // SEO 看板一次性聚合：带 Δ 的落地页/Query 表 + 机会词散点 + GA4 来源(甜甜圈+堆叠面积) + 本周要点
  app.get('/api/google/seo/board', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const project = resolveProject(request.query || {});
      const range = normalizeRange(request.query || {});
      const prev = seoPrevRange(range);
      const gsc = { ...range, gsc_site_url: project.gsc_site_url };
      const gscPrev = { ...prev, gsc_site_url: project.gsc_site_url };
      const ga = { ...range, ga4_property_id: project.ga4_property_id };

      const cur = gscSummary(gsc).totals;
      const prevTot = gscSummary(gscPrev).totals;
      const { pages, queries } = googleRepo.gscBoardTables(gsc, gscPrev);
      const scatter = googleRepo.gscScatter(gsc);
      const pageScatter = googleRepo.ga4PageScatter(ga);
      const sources = googleRepo.ga4SourcesRange(ga);
      const sourceSeries = googleRepo.ga4SourceSeries(ga);
      const highlights = buildSeoHighlights({ cur, prevTot, queries, pages });

      return { connected: googleRepo.tokenStatus().gsc.authorized, project, range, prev, totals: cur, totalsPrev: prevTot, pages, queries, scatter, pageScatter, sources, sourceSeries, highlights };
    } catch (e) {
      return reply.code(400).send({ error: e.message || 'bad_request' });
    }
  });

  // SEM 看板一次性聚合：带 Δ 的系列/关键词表 + 花费×转化散点 + 日趋势 + 本周要点
  app.get('/api/google/ads/board', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const project = resolveProject(request.query || {});
      const range = normalizeRange(request.query || {});
      const prev = seoPrevRange(range);
      const campaignId = (request.query || {}).campaign_id || null; // 系列筛选，null=全部
      const adGroupId = (request.query || {}).ad_group_id || null;   // 广告组筛选，null=全部
      const ads = { ...range, ads_customer_id: project.ads_customer_id, ads_campaign_id: campaignId, ads_ad_group_id: adGroupId };
      const adsPrev = { ...prev, ads_customer_id: project.ads_customer_id, ads_campaign_id: campaignId, ads_ad_group_id: adGroupId };
      const cur = adsSummary(ads).totals;
      const prevTot = adsSummary(adsPrev).totals;
      const { campaigns, keywords } = googleRepo.adsBoardTables(ads, adsPrev);
      const scatter = googleRepo.adsScatter(ads);
      const series = googleRepo.adsSeries(ads);
      const seriesPrev = googleRepo.adsSeries(adsPrev); // 上一等长区间日趋势，前端按天偏移对齐画对比虚影线
      const highlights = buildAdsHighlights({ cur, prevTot, keywords, campaigns });
      return { connected: googleRepo.tokenStatus().ads.authorized, project, range, prev, totals: cur, totalsPrev: prevTot, campaigns, keywords, scatter, series, seriesPrev, highlights };
    } catch (e) {
      return reply.code(400).send({ error: e.message || 'bad_request' });
    }
  });

  app.get('/api/google/ads/summary', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const project = resolveProject(request.query || {});
      const range = { ...normalizeRange(request.query || {}), ads_customer_id: project.ads_customer_id, ads_campaign_id: (request.query || {}).campaign_id || null, ads_ad_group_id: (request.query || {}).ad_group_id || null };
      return { connected: googleRepo.tokenStatus().ads.authorized, project, ...adsSummary(range) };
    } catch (e) {
      return reply.code(400).send({ error: e.message || 'bad_request' });
    }
  });
}
