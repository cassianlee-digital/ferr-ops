// GEO 概览 API：AI 引擎带来的流量与询盘。只读已同步的 GA4 数据和带表单证据的询盘。
import * as repo from '../db/repositories/geo.js';
import { requireAuth } from '../auth/middleware.js';
import { parseDateRange, previousRange } from '../lib/parseDateRange.js';
import { resolveProject } from '../sync/googleClient.js';
import { summarizeGeo } from '../services/geo.js';

export async function geoRoutes(app) {
  app.get('/api/geo/summary', { preHandler: requireAuth }, async (request, reply) => {
    const { range, error } = parseDateRange(request.query || {});
    if (error) return reply.code(400).send({ error: 'bad_date_range', detail: error });
    if (!range) return reply.code(400).send({ error: 'bad_date_range', detail: 'start_date 和 end_date 必填' });
    let propertyId = null;
    try { propertyId = resolveProject(request.query || {}).ga4_property_id || null; } catch (e) { propertyId = null; }
    const prev = previousRange(range);
    return {
      range,
      previous_range: prev,
      ...summarizeGeo({
        current: repo.ga4Sources(range, propertyId),
        previous: repo.ga4Sources(prev, propertyId),
        inquiries: repo.formInquiries(range),
        leads: repo.leads(range),
      }),
    };
  });
}
