// Google 项目与授权、以及 SEO / SEM 看板的数据 API（都读已同步落库的数据）。
import { requireAuth, editor, onlyManagerBoss } from '../auth/middleware.js';
import { BACKFILL_MAX_DAYS, COMPANIES, normalizeDomain, validateSite } from '../services/sites.js';
import { discoverGoogleResources } from '../sync/googleDiscovery.js';
import { syncSite } from '../sync/syncSites.js';
import { config } from '../config.js';
import * as googleRepo from '../db/repositories/googleSync.js';
import { adsSummary, ga4Overview, gscSummary } from '../db/repositories/googleSync.js';
import { buildAuthUrl, exchangeCode, normalizeRange, projectProviderConfig, readScope, resolveProject } from '../sync/googleClient.js';

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
  /* 上一周期有没有同步数据：有曝光才算有。
     刚登记、只同步了最近几天的站点，上一周期是「没有数据」，不是 0 —— 以前这里会算成「+100%」，
     看起来像翻了一倍，其实只是没有可比的数。没有数据就明说没法比；上一周期确实是 0 次的，写 0 次，不编百分比。 */
  const prevHasData = Number(prevTot?.impressions) > 0;
  if (cur && prevTot && hasObservation) {
    if (cur.clicks != null) {
      const now = `自然点击 ${cur.clicks.toLocaleString()}`;
      if (!prevHasData) H.push({ tone: 'muted', text: `${now}（上一周期没有同步数据，无法对比）` });
      else if (!prevTot.clicks) H.push({ tone: cur.clicks > 0 ? 'good' : 'muted', text: `${now}（上一周期 0 次）` });
      else {
        const dc = _pct(cur.clicks, prevTot.clicks);
        H.push({ tone: dc >= 0 ? 'good' : 'bad', text: `${now}（${dc >= 0 ? '+' : ''}${dc}% vs 上一周期）` });
      }
    }
    if (cur.position != null && prevTot.position != null) {
      const dp = +(cur.position - prevTot.position).toFixed(1); // 负=排名变好
      H.push({ tone: dp <= 0 ? 'good' : 'bad', text: `平均排名 ${cur.position.toFixed(1)}（${dp <= 0 ? '↑进步' : '↓退步'} ${Math.abs(dp)}）` });
    }
  }
  // 单个词、单个页面的涨跌同理：上一周期没有数据时，「+9」只是这个词本期的点击数，不是涨了 9
  if (!prevHasData) return H.slice(0, 6);
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
  // 上一周期有没有同步数据（有曝光或有花费才算有）。没有就明说没法比，不写「+100%」
  const prevHasData = Number(prevTot?.impressions) > 0 || Number(prevTot?.costMicros) > 0;
  if (cur && prevTot && hasObservation) {
    if (cur.conversions != null) {
      const now = `转化 ${Number(cur.conversions).toFixed(1)}`;
      if (!prevHasData) H.push({ tone: 'muted', text: `${now}（上一周期没有同步数据，无法对比）` });
      else if (!Number(prevTot.conversions)) H.push({ tone: Number(cur.conversions) > 0 ? 'good' : 'muted', text: `${now}（上一周期 0 次）` });
      else {
        const dc = _pct(cur.conversions, prevTot.conversions);
        H.push({ tone: dc >= 0 ? 'good' : 'bad', text: `${now}（${dc >= 0 ? '+' : ''}${dc}% vs 上一周期）` });
      }
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

const RUN_FIELDS = ['status', 'started_at', 'finished_at', 'date_start', 'date_end', 'rows_written', 'error'];
function siteView(project) {
  const runs = googleRepo.latestProjectRuns(project.id);
  const view = { ...project, runs: {} };
  for (const provider of ['gsc', 'ga4', 'ads']) {
    const r = runs[provider];
    view.runs[provider] = r ? Object.fromEntries(RUN_FIELDS.map((k) => [k, r[k] ?? null])) : null;
  }
  return view;
}
// 服务器配置（.env）里的那一个站。什么都没配就是 null
function envSite() {
  const g = config.google;
  if (!g.gscSiteUrl && !g.ga4PropertyId) return null;
  const domain = normalizeDomain(g.gscSiteUrl);
  return {
    name: domain || '服务器配置的站点',
    gsc_site_url: g.gscSiteUrl || '',
    ga4_property_id: g.ga4PropertyId || '',
    ads_customer_id: String(g.adsCustomerId || '').replace(/-/g, ''),
    domain,
  };
}
const sameSite = (a, b) => Boolean((a.gsc_site_url && a.gsc_site_url === b.gsc_site_url) || (a.ga4_property_id && a.ga4_property_id === b.ga4_property_id) || (a.domain && a.domain === b.domain));
const CLASH_LABEL = { domain: '域名', gsc_site_url: 'Search Console 资源', ga4_property_id: 'GA4 媒体资源' };
const clashText = (c) => '这个' + CLASH_LABEL[c.field] + '已经登记在站点「' + c.name + '」名下了：同一份数据不能记在两个站点上';

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

  /* ===== 站点（一条记录 = 一个网站 + 它的 Search Console 资源 + 它的 GA4 媒体资源）=====
     规则在 services/sites.js。sites 里每个站点带上各数据源最近一次同步，界面据此显示「同步到哪了、失败在哪」。 */
  app.get('/api/google/projects', { preHandler: requireAuth }, async () => {
    const projects = googleRepo.listProjects();
    return {
      projects,
      defaultProject: googleRepo.getDefaultProject(),
      sites: projects.map(siteView),
      // 一个站点都没登记时，后台用的是服务器配置里的那一个站。让界面看得见它，而不是显示「没有站点」
      env_site: projects.length ? null : envSite(),
      companies: COMPANIES,
      backfill_max_days: BACKFILL_MAX_DAYS,
    };
  });

  app.post('/api/google/projects', onlyManagerBoss, async (request, reply) => {
    const v = validateSite(request.body);
    if (!v.ok) return reply.code(400).send({ error: v.error, detail: v.detail });
    const site = v.value;
    // 广告是账户级的：没单独填就沿用现在在用的那个 Ads 账户
    if (!site.ads_customer_id) site.ads_customer_id = String(resolveProject({}).ads_customer_id || '').replace(/-/g, '');
    const env = googleRepo.listProjects().length ? null : envSite();
    // 第一次登记站点、而服务器配置里已经有一个在用的站：先把那个站登记成默认站点。
    // 否则新加的站会变成「默认」，所有看板一声不响地换成另一个网站的数据。
    if (env && !sameSite(env, site)) googleRepo.createProject({ ...env, is_default: true });
    const clash = googleRepo.findProjectClash(site);
    if (clash) return reply.code(409).send({ error: 'site_exists', detail: clashText(clash) });
    const project = googleRepo.createProject(site);
    // 原来没有站点记录时留下的同步记录，都是服务器配置的那个站的：归到它名下，「最近同步」才不会从头显示成「没同步过」
    if (env) googleRepo.adoptUnassignedRuns(googleRepo.getDefaultProject().id);
    reply.code(201);
    return { project: siteView(project) };
  });

  app.patch('/api/google/projects/:id', onlyManagerBoss, async (request, reply) => {
    const id = Number(request.params.id);
    const cur = googleRepo.getProject(id);
    if (!cur) return reply.code(404).send({ error: 'project_not_found' });
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    // 拿「原来的值 + 这次传的值」合成一条完整记录再校验：只改资源不改域名时，两者对不对得上照样会查
    const merged = {};
    for (const k of ['name', 'gsc_site_url', 'ga4_property_id', 'ads_customer_id', 'domain', 'company', 'is_default']) merged[k] = k in body ? body[k] : cur[k];
    const v = validateSite(merged);
    if (!v.ok) return reply.code(400).send({ error: v.error, detail: v.detail });
    if (cur.is_default && v.value.is_default === false) {
      return reply.code(400).send({ error: 'default_site', detail: '总得有一个默认站点。要换的话，把另一个站点设为默认' });
    }
    const clash = googleRepo.findProjectClash(v.value, id);
    if (clash) return reply.code(409).send({ error: 'site_exists', detail: clashText(clash) });
    return { project: siteView(googleRepo.updateProject(id, v.value)) };
  });

  // 停用（数据保留，只是不再同步、不再出现在选择里）
  app.delete('/api/google/projects/:id', onlyManagerBoss, async (request, reply) => {
    const id = Number(request.params.id);
    const cur = googleRepo.getProject(id);
    if (!cur) return reply.code(404).send({ error: 'project_not_found' });
    if (cur.is_default && googleRepo.listProjects().length > 1) {
      return reply.code(409).send({ error: 'default_site', detail: '这是默认站点。先把另一个站点设为默认，再停用它' });
    }
    googleRepo.deleteProject(id);
    return { ok: true };
  });

  // 账号下能选的 Search Console 资源和 GA4 媒体资源（给「添加站点」当候选）。已经被哪个站点用了一并标出
  app.get('/api/google/discover', onlyManagerBoss, async () => {
    const found = await discoverGoogleResources();
    const sites = googleRepo.listProjects();
    const usedBy = (col, value) => sites.find((s) => s[col] === value)?.name || null;
    return {
      gsc: { error: found.gsc.error, items: found.gsc.items.map((i) => ({ ...i, domain: normalizeDomain(i.site_url), used_by: usedBy('gsc_site_url', i.site_url) })) },
      ga4: { error: found.ga4.error, items: found.ga4.items.map((i) => ({ ...i, used_by: usedBy('ga4_property_id', i.property_id) })) },
    };
  });

  // 同步一个站点的 GSC 和 GA4。带 days = 补最近 N 天的历史（分段取）。广告是账户级的，不在这里
  app.post('/api/google/projects/:id/sync', { ...editor, config: { rateLimit: { max: 6, timeWindow: 60_000 } } }, async (request, reply) => {
    const site = googleRepo.getProject(Number(request.params.id));
    if (!site) return reply.code(404).send({ error: 'project_not_found' });
    const raw = request.body?.days;
    let days = null;
    if (raw != null) {
      days = Number(raw);
      if (!Number.isInteger(days) || days < 1 || days > BACKFILL_MAX_DAYS) {
        return reply.code(400).send({ error: 'bad_days', detail: '补历史的天数要在 1 到 ' + BACKFILL_MAX_DAYS + ' 之间' });
      }
    }
    return { site: siteView(site), results: await syncSite(site, { days }) };
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
      const range = { ...normalizeRange(request.query || {}), gsc_site_url: readScope(project).gsc_site_url };
      return { connected: googleRepo.tokenStatus().gsc.authorized, project, ...gscSummary(range) };
    } catch (e) {
      return reply.code(400).send({ error: e.message || 'bad_request' });
    }
  });

  app.get('/api/google/ga4/overview', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const project = resolveProject(request.query || {});
      const range = { ...normalizeRange(request.query || {}), ga4_property_id: readScope(project).ga4_property_id };
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
      const scope = readScope(project);
      const gsc = { ...range, gsc_site_url: scope.gsc_site_url };
      const gscPrev = { ...prev, gsc_site_url: scope.gsc_site_url };
      const ga = { ...range, ga4_property_id: scope.ga4_property_id };

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
      const searchTermCoverage = googleRepo.adsSearchTermSummary(ads);
      const wasteSearchTerms = googleRepo.adsWasteSearchTerms(ads, { limit: 50 });
      const highlights = buildAdsHighlights({ cur, prevTot, keywords, campaigns });
      return {
        connected: googleRepo.tokenStatus().ads.authorized,
        project,
        range,
        prev,
        totals: cur,
        totalsPrev: prevTot,
        campaigns,
        keywords,
        scatter,
        series,
        seriesPrev,
        searchTermCoverage,
        wasteSearchTerms,
        highlights,
      };
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
