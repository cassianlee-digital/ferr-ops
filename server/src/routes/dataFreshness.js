// 数据新鲜度：一次返回 GSC/GA4/Ads 三源在所选区间内的 实际有数据天数 + 区间总天数 + 最后同步时间 + 连接态。
// 用于替代看板顶部被删的碎提示：让用户一眼看清"为什么 30/90/1年 看着一样"。
import { requireAuth } from '../auth/middleware.js';
import { normalizeRange, readScope, resolveProject } from '../sync/googleClient.js';
import { db } from '../db/connection.js';
import * as googleRepo from '../db/repositories/googleSync.js';

function dayDiff(startIso, endIso) {
  return Math.round((Date.parse(endIso + 'T00:00:00Z') - Date.parse(startIso + 'T00:00:00Z')) / 86400000) + 1;
}

function distinctDays(table, dateCol, range, extraCond, extraParams) {
  const cond = extraCond ? (' AND ' + extraCond) : '';
  return db
    .prepare(`SELECT COUNT(DISTINCT ${dateCol}) n FROM ${table} WHERE ${dateCol} BETWEEN @start AND @end${cond}`)
    .get({ start: range.start_date, end: range.end_date, ...(extraParams || {}) }).n;
}

export async function dataFreshnessRoutes(app) {
  app.get('/api/data-freshness', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const project = resolveProject(request.query || {});
      const range = normalizeRange(request.query || {});
      const days = dayDiff(range.start_date, range.end_date);
      // 「最后同步」看的是这个站点自己的同步记录：别的站点刚同步过，不能替它显得新鲜
      // （广告是账户级的，几个站点共用一份同步记录，所以它看全局最近一次）
      const runs = { ...googleRepo.latestProjectRuns(project.id), ads: googleRepo.latestRuns().ads };
      const scope = readScope(project);
      const tokens = googleRepo.tokenStatus();

      const src = (provider, table, dateCol, extraCond, extraParams) => ({
        provider,
        connected: !!(tokens[provider] && tokens[provider].authorized),
        daysWithData: distinctDays(table, dateCol, range, extraCond, extraParams),
        days,
        lastSync: runs[provider] ? (runs[provider].finished_at || runs[provider].started_at) : null,
        status: runs[provider] ? runs[provider].status : null,
      });

      return {
        range,
        gsc: src('gsc', 'gsc_query_daily', 'date', scope.gsc_site_url ? 'site_url = @siteUrl' : null, scope.gsc_site_url ? { siteUrl: scope.gsc_site_url } : null),
        ga4: src('ga4', 'ga4_daily', 'date', scope.ga4_property_id ? 'property_id = @propertyId' : null, scope.ga4_property_id ? { propertyId: scope.ga4_property_id } : null),
        ads: src('ads', 'google_ads_campaign_daily', 'date', project.ads_customer_id ? 'customer_id = @customerId' : null, project.ads_customer_id ? { customerId: project.ads_customer_id } : null),
      };
    } catch (e) {
      return reply.code(400).send({ error: e.message || 'bad_request' });
    }
  });
}
