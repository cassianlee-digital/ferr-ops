// KPI 目标/评分 API（FR-4）。读：所有登录用户；改目标：仅老板(boss)。
// 实际值不在此直接编辑——由周报/询盘自动回写（见 services/kpi.js）。
import * as repo from '../db/repositories/kpi.js';
import { requireAuth, onlyManagerBoss } from '../auth/middleware.js';
import { computeScores, computeScoresForRange } from '../services/kpi.js';
import { buildLedger } from '../services/kpiLedger.js';
import { parseDateRange } from '../lib/parseDateRange.js';

export async function kpiRoutes(app) {
  // 运营总账（只读）：花费 → 询盘 → 优质 → 成交 → 效率。不参与评分，不写库。
  app.get('/api/kpi/ledger', { preHandler: requireAuth }, async (request, reply) => {
    const { range, error } = parseDateRange(request.query || {});
    if (error) return reply.code(400).send({ error });
    return buildLedger(range);
  });

  app.get('/api/kpi-targets', { preHandler: requireAuth }, async (request, reply) => {
    const { range, error } = parseDateRange(request.query || {});
    if (error) return reply.code(400).send({ error });
    return range ? computeScoresForRange(range) : computeScores();
  });

  // 仅老板可改目标值。body: { updates: [{ id, target }] }
  app.put('/api/kpi-targets', onlyManagerBoss, async (request, reply) => {
    const { range, error } = parseDateRange(request.query || {});
    if (error) return reply.code(400).send({ error });
    const updates = Array.isArray(request.body?.updates) ? request.body.updates : [];
    for (const u of updates) {
      const id = Number(u.id);
      const target = Number(u.target);
      if (!id || isNaN(target)) continue;
      repo.updateTarget(id, target);
    }
    return range ? computeScoresForRange(range) : computeScores();
  });
}
