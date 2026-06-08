// SEO 周报 API（FR-2）。写入限李(seo)。
import * as repo from '../db/repositories/seoWeeks.js';
import { requireAuth, onlySeo } from '../auth/middleware.js';
import { recomputeActuals, computeScores } from '../services/kpi.js';

const num = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));

export async function seoWeeksRoutes(app) {
  app.get('/api/seo-weeks', { preHandler: requireAuth }, async () => ({ items: repo.list() }));

  app.post('/api/seo-weeks', onlySeo, async (request, reply) => {
    const b = request.body || {};
    const rec = {
      week_date: String(b.week_date || new Date().toISOString().slice(0, 10)),
      clicks: num(b.clicks) ?? 0,
      impressions: num(b.impressions) ?? 0,
      avg_position: num(b.avg_position),
      top10_ratio: num(b.top10_ratio),
      coverage: num(b.coverage),
      indexed_pages: num(b.indexed_pages),
      bounce_rate: num(b.bounce_rate),
      dwell_seconds: num(b.dwell_seconds),
    };
    const item = repo.create(rec);
    recomputeActuals();
    reply.code(201);
    return { item, kpi: computeScores() };
  });
}
