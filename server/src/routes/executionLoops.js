// Execution 闭环 CRUD（Phase 5A）。SEO/SEM 各自管自己渠道；impact_level 改动与 exclude_from_assessment 仅管理员。
import * as repo from '../db/repositories/executionLoops.js';
import { requireAuth, editor } from '../auth/middleware.js';
import { parseDateRange } from '../lib/parseDateRange.js';

const STATUSES = ['OPEN', 'IN_PROGRESS', 'IMPLEMENTED', 'VERIFYING', 'VERIFIED', 'FAILED', 'CANCELLED'];
const IMPACTS = ['HIGH', 'MEDIUM', 'LOW'];
const RESULTS = ['POSITIVE', 'NEUTRAL', 'NEGATIVE'];
const isAdmin = (role) => role === 'manager' || role === 'boss';
const nowIso = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

// 按角色定渠道：seo→seo、sem→sem 固定；管理员用 body.channel（seo/sem/shared）。
function channelForRole(role, wanted) {
  if (role === 'seo') return 'seo';
  if (role === 'sem') return 'sem';
  return ['seo', 'sem', 'shared'].includes(wanted) ? wanted : null;
}

export function executionLoopRoutes(app) {
  // 列表：可按 channel + 到期区间过滤（?due=1 只看验证到期落在区间的，供 KPI 明细）
  app.get('/api/execution-loops', { preHandler: requireAuth }, async (request) => {
    const q = request.query || {};
    const { range } = parseDateRange(q);
    const items = repo.list({ channel: q.channel, range, dueInRange: q.due === '1' || q.due === 'true' });
    return { items };
  });

  app.post('/api/execution-loops', editor, async (request, reply) => {
    const b = request.body || {};
    const role = request.user.role;
    const channel = channelForRole(role, b.channel);
    if (!channel) return reply.code(400).send({ error: '无效 channel（seo/sem/shared）' });
    if (!b.problem || !String(b.problem).trim()) return reply.code(400).send({ error: 'problem 必填' });
    if (b.impact_level && !IMPACTS.includes(b.impact_level)) return reply.code(400).send({ error: '无效 impact_level' });
    const rec = repo.create({
      channel,
      owner: b.owner || request.user.name,
      owner_id: request.user.id,
      problem: b.problem,
      analysis: b.analysis,
      action: b.action,
      impact_level: b.impact_level || null,
      status: 'OPEN',
      verification_method: b.verification_method,
      verification_due_at: b.verification_due_at || null,
      related_metric: b.related_metric,
      before_value: b.before_value ?? null,
      source_type: b.source_type || 'manual',
      source_id: b.source_id ?? null,
      created_by: request.user.id,
    });
    return { item: rec };
  });

  app.patch('/api/execution-loops/:id', editor, async (request, reply) => {
    const id = Number(request.params.id);
    const rec = repo.get(id);
    if (!rec) return reply.code(404).send({ error: '记录不存在' });
    const role = request.user.role, admin = isAdmin(role);
    // 非管理员只能改自己渠道的记录（防跨渠道篡改）
    if (!admin && ((role === 'seo' && rec.channel !== 'seo') || (role === 'sem' && rec.channel !== 'sem'))) {
      return reply.code(403).send({ error: '只能编辑本渠道记录' });
    }
    const b = request.body || {};
    if (b.status && !STATUSES.includes(b.status)) return reply.code(400).send({ error: '无效 status' });
    if (b.verification_result && !RESULTS.includes(b.verification_result)) return reply.code(400).send({ error: '无效 verification_result' });
    if (b.impact_level && !IMPACTS.includes(b.impact_level)) return reply.code(400).send({ error: '无效 impact_level' });

    const fields = { ...b };
    // 状态流转自动打时刻：IMPLEMENTED→implemented_at；VERIFIED→verified_at+verified=1；退出 VERIFIED→verified=0
    if (b.status === 'IMPLEMENTED' && !rec.implemented_at) fields.implemented_at = nowIso();
    if (b.status === 'VERIFIED') { fields.verified = 1; if (!rec.verified_at) fields.verified_at = nowIso(); }
    else if (b.status && b.status !== 'VERIFIED') { fields.verified = 0; }

    const updated = repo.update(id, fields, { admin }); // repo 过滤：非管理员改不了 impact_level/exclude_from_assessment
    return { item: updated };
  });
}
