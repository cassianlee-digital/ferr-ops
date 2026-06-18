// SEO weekly report API. SEO role can write; signed-in users can read.
import * as repo from '../db/repositories/seoWeeks.js';
import { requireAuth, onlySeo } from '../auth/middleware.js';
import { recomputeActuals, computeScores } from '../services/kpi.js';
import { parseDateRange } from '../lib/parseDateRange.js';

const num = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));

export async function seoWeeksRoutes(app) {
  app.get('/api/seo-weeks', { preHandler: requireAuth }, async (request, reply) => {
    const { range, error } = parseDateRange(request.query || {});
    if (error) return reply.code(400).send({ error });
    return { items: repo.list(range) };
  });

  app.post('/api/seo-weeks', onlySeo, async (request, reply) => {
    const body = request.body || {};
    const rec = {
      week_date: String(body.week_date || new Date().toISOString().slice(0, 10)),
      clicks: num(body.clicks) ?? 0,
      impressions: num(body.impressions) ?? 0,
      avg_position: num(body.avg_position),
      top10_ratio: num(body.top10_ratio),
      coverage: num(body.coverage),
      indexed_pages: num(body.indexed_pages),
      bounce_rate: num(body.bounce_rate),
      dwell_seconds: num(body.dwell_seconds),
    };
    const item = repo.create(rec);
    recomputeActuals();
    reply.code(201);
    return { item, kpi: computeScores() };
  });
}
