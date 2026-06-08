// KPI 目标/评分 API（FR-4）。读：所有登录用户；改目标：仅老板(boss)。
// 实际值不在此直接编辑——由周报/询盘自动回写（见 services/kpi.js）。
import * as repo from '../db/repositories/kpi.js';
import { requireAuth, onlyBoss } from '../auth/middleware.js';
import { computeScores } from '../services/kpi.js';

export async function kpiRoutes(app) {
  app.get('/api/kpi-targets', { preHandler: requireAuth }, async () => computeScores());

  // 仅老板可改目标值。body: { updates: [{ id, target }] }
  app.put('/api/kpi-targets', onlyBoss, async (request, reply) => {
    const updates = Array.isArray(request.body?.updates) ? request.body.updates : [];
    for (const u of updates) {
      const id = Number(u.id);
      const target = Number(u.target);
      if (!id || isNaN(target)) continue;
      repo.updateTarget(id, target);
    }
    return computeScores();
  });
}
