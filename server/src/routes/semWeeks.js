// SEM 周报 API（FR-3）。写入限陈(sem)。CPC/CTR/每次转化费用由后端算。
import * as repo from '../db/repositories/semWeeks.js';
import { requireAuth, onlySem } from '../auth/middleware.js';
import { deriveSem } from '../services/derive.js';
import { recomputeActuals, computeScores } from '../services/kpi.js';

const num = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));

export async function semWeeksRoutes(app) {
  app.get('/api/sem-weeks', { preHandler: requireAuth }, async () => ({ items: repo.list() }));

  app.post('/api/sem-weeks', onlySem, async (request, reply) => {
    const b = request.body || {};
    const base = {
      week_date: String(b.week_date || new Date().toISOString().slice(0, 10)),
      cost: num(b.cost) ?? 0,
      impressions: num(b.impressions) ?? 0,
      clicks: num(b.clicks) ?? 0,
      conversions: num(b.conversions) ?? 0,
      roas: num(b.roas),
      quality_score: num(b.quality_score),
    };
    const derived = deriveSem(base); // cpc / ctr / cost_per_conv
    const item = repo.create({ ...base, ...derived });
    recomputeActuals();
    reply.code(201);
    return { item, kpi: computeScores() };
  });
}
