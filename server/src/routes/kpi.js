// KPI 目标/评分 API（FR-4）。读：所有登录用户；改目标：仅老板(boss)。
// 实际值不在此直接编辑——由周报/询盘自动回写（见 services/kpi.js）。
import * as repo from '../db/repositories/kpi.js';
import * as snapRepo from '../db/repositories/kpiSnapshots.js';
import { requireAuth, onlyManagerBoss } from '../auth/middleware.js';
import { computeScores, computeAssessment, deriveRangeRows, settlePeriod, previewPeriod } from '../services/kpi.js';
import { buildLedger } from '../services/kpiLedger.js';
import { parseDateRange } from '../lib/parseDateRange.js';
import { isValidPeriodKey } from '../lib/kpiPeriod.js';

const OWNERS = ['seo', 'sem', 'company'];

// 统一响应：rows（含三级分层/数据状态）+ 旧 scores（向后兼容 overview/周报回执）+ 新 assessment（v2 分层评分）。
// range 存在时只 derive 一次 rows，供 computeScores 与 computeAssessment 复用。
function buildResponse(range) {
  if (range) {
    const rows = deriveRangeRows(range);
    return { ...computeScores(rows), assessment: computeAssessment(rows), range, targetBasis: 'configured_monthly_target_unprorated' };
  }
  return { ...computeScores(), assessment: computeAssessment() };
}

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
    return buildResponse(range);
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
    return buildResponse(range);
  });

  // 已结算历史（读快照，绝不重算——改目标不动历史）
  app.get('/api/kpi/periods', { preHandler: requireAuth }, async (request) => {
    return { items: snapRepo.list({ owner: request.query?.owner }) };
  });

  // 结算前实时预览某期分数
  app.get('/api/kpi/period-preview', { preHandler: requireAuth }, async (request, reply) => {
    const { period_type, period_key, owner } = request.query || {};
    if (!OWNERS.includes(owner)) return reply.code(400).send({ error: '无效 owner' });
    if (!isValidPeriodKey(period_type, period_key)) return reply.code(400).send({ error: '无效周期' });
    return previewPeriod({ period_type, period_key, owner });
  });

  // 结算本期（冻结），仅管理员/老板
  app.post('/api/kpi/settle', onlyManagerBoss, async (request, reply) => {
    const { period_type, period_key, owner, note } = request.body || {};
    if (!OWNERS.includes(owner)) return reply.code(400).send({ error: '无效 owner' });
    if (!isValidPeriodKey(period_type, period_key)) return reply.code(400).send({ error: '无效周期（month:YYYY-MM / quarter:YYYY-Qn）' });
    const item = settlePeriod({ period_type, period_key, owner, settled_by: request.user.id, note: note || null });
    return { item };
  });
}
