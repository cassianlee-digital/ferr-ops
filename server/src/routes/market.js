// 市场分析 / AI 记忆体路由。
import { requireAuth, editor } from '../auth/middleware.js';
import * as mr from '../db/repositories/marketResearch.js';
import * as brain from '../services/marketBrain.js';

export async function marketRoutes(app) {
  // 市场问卷数据（P3 前端表格化用）
  app.get('/api/market/research', { preHandler: requireAuth }, async () => ({ items: mr.list() }));
  app.post('/api/market/research', editor, async (request, reply) => {
    reply.code(201);
    return { item: mr.create(request.body || {}) };
  });
  app.patch('/api/market/research/:id', editor, async (request) => ({
    item: mr.update(Number(request.params.id), request.body || {}),
  }));
  app.delete('/api/market/research/:id', editor, async (request) => {
    mr.remove(Number(request.params.id));
    return { ok: true };
  });

  // 记忆体状态（不消耗 token）
  app.get('/api/market/brain', { preHandler: requireAuth }, async () => ({
    state: brain.checkState(),
    summary: brain.getSummary(),
  }));

  // 一键洗脑（手动触发，消耗 token，仅资料有变时才真正重学）
  app.post('/api/market/brain/refresh', editor, async (request, reply) => {
    try {
      return await brain.refresh();
    } catch (e) {
      if (e.code === 'NO_KEY') return reply.code(503).send({ error: 'ai_unconfigured' });
      request.log.error({ err: e.message }, 'brain refresh failed');
      return reply.code(502).send({ error: 'ai_failed' });
    }
  });
}
