// 询盘归因：把真实询盘(按渠道)与 Ads 花费打通，算「真实每有效询盘成本」+ 对比 Ads 自报转化。
// 纯计算已抽到 services/attribution.js（便于单测）；本路由只负责查数据 + 调用。
import { requireAuth } from '../auth/middleware.js';
import * as inq from '../db/repositories/inquiries.js';
import { adsSummary } from '../db/repositories/googleSync.js';
import { normalizeRange, resolveProject } from '../sync/googleClient.js';
import { computeAttribution } from '../services/attribution.js';

export async function attributionRoutes(app) {
  app.get('/api/attribution', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const project = resolveProject(request.query || {});
      const range = normalizeRange(request.query || {});
      const rows = inq.list({ start_date: range.start_date, end_date: range.end_date });
      const ads = adsSummary({ ...range, ads_customer_id: project.ads_customer_id });

      const result = computeAttribution(rows, {
        costMicros: ads.totals?.costMicros,
        conversions: ads.totals?.conversions,
      });
      return { range, ...result };
    } catch (e) {
      return reply.code(400).send({ error: e.message || 'bad_request' });
    }
  });
}
