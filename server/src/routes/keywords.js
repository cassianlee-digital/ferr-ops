// 关键词库 API（FR-9 / V7）。
// V7：取消 SEO/SEM 编辑隔离 —— 李/陈/manager/boss 可无差别编辑所有词库。
import * as repo from '../db/repositories/keywords.js';
import { requireAuth, editor } from '../auth/middleware.js';

const TYPES = ['seo', 'sem', 'high', 'customer'];

export async function keywordsRoutes(app) {
  app.get('/api/keywords', { preHandler: requireAuth }, async (request) => {
    const type = request.query?.type;
    return { items: repo.list(TYPES.includes(type) ? type : undefined) };
  });

  app.post('/api/keywords', editor, async (request, reply) => {
    const b = request.body || {};
    if (!TYPES.includes(b.type)) return reply.code(400).send({ error: 'bad_type' });
    if (!b.keyword) return reply.code(400).send({ error: 'keyword_required' });
    reply.code(201);
    return { item: repo.create({ type: b.type, keyword: String(b.keyword), attrs: b.attrs || {}, category: b.category ?? null }) };
  });

  app.patch('/api/keywords/:id', editor, async (request, reply) => {
    const cur = repo.get(Number(request.params.id));
    if (!cur) return reply.code(404).send({ error: 'not_found' });
    return { item: repo.update(cur.id, request.body || {}) };
  });

  app.delete('/api/keywords/:id', editor, async (request, reply) => {
    const cur = repo.get(Number(request.params.id));
    if (!cur) return reply.code(404).send({ error: 'not_found' });
    repo.remove(cur.id);
    return { ok: true };
  });
}
