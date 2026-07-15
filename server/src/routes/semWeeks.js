// SEM weekly report API. SEM role can write; signed-in users can read.
import * as repo from '../db/repositories/semWeeks.js';
import { requireAuth, editor } from '../auth/middleware.js';
import { deriveSem } from '../services/derive.js';
import { recomputeActuals, computeScores } from '../services/kpi.js';
import { parseDateRange } from '../lib/parseDateRange.js';

const num = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));

export async function semWeeksRoutes(app) {
  app.get('/api/sem-weeks', { preHandler: requireAuth }, async (request, reply) => {
    const { range, error } = parseDateRange(request.query || {});
    if (error) return reply.code(400).send({ error });
    return { items: repo.list(range) };
  });

  app.post('/api/sem-weeks', editor, async (request, reply) => {
    const body = request.body || {};
    const base = {
      week_date: String(body.week_date || new Date().toISOString().slice(0, 10)),
      cost: num(body.cost) ?? 0,
      impressions: num(body.impressions) ?? 0,
      clicks: num(body.clicks) ?? 0,
      conversions: num(body.conversions) ?? 0,
      roas: num(body.roas),
      quality_score: num(body.quality_score),
    };
    const derived = deriveSem(base);
    const item = repo.create({ ...base, ...derived });
    recomputeActuals();
    reply.code(201);
    return { item, kpi: computeScores() };
  });
}
