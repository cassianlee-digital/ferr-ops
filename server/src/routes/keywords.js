// 关键词库 API（FR-9）。
// 编辑权限：seo/high/customer 三类限李(seo)；sem 类限陈(sem)。
import * as repo from '../db/repositories/keywords.js';
import { requireAuth } from '../auth/middleware.js';

const TYPES = ['seo', 'sem', 'high', 'customer'];
const editorRole = (type) => (type === 'sem' ? 'sem' : 'seo');

function ensureEditor(request, reply, type) {
  if (request.user.role !== editorRole(type)) {
    reply.code(403).send({ error: 'forbidden', need: editorRole(type) });
    return false;
  }
  return true;
}

export async function keywordsRoutes(app) {
  app.get('/api/keywords', { preHandler: requireAuth }, async (request) => {
    const type = request.query?.type;
    return { items: repo.list(TYPES.includes(type) ? type : undefined) };
  });

  app.post('/api/keywords', { preHandler: requireAuth }, async (request, reply) => {
    const b = request.body || {};
    if (!TYPES.includes(b.type)) return reply.code(400).send({ error: 'bad_type' });
    if (!b.keyword) return reply.code(400).send({ error: 'keyword_required' });
    if (!ensureEditor(request, reply, b.type)) return;
    reply.code(201);
    return { item: repo.create({ type: b.type, keyword: String(b.keyword), attrs: b.attrs || {}, category: b.category ?? null }) };
  });

  app.patch('/api/keywords/:id', { preHandler: requireAuth }, async (request, reply) => {
    const cur = repo.get(Number(request.params.id));
    if (!cur) return reply.code(404).send({ error: 'not_found' });
    if (!ensureEditor(request, reply, cur.type)) return;
    return { item: repo.update(cur.id, request.body || {}) };
  });

  app.delete('/api/keywords/:id', { preHandler: requireAuth }, async (request, reply) => {
    const cur = repo.get(Number(request.params.id));
    if (!cur) return reply.code(404).send({ error: 'not_found' });
    if (!ensureEditor(request, reply, cur.type)) return;
    repo.remove(cur.id);
    return { ok: true };
  });
}
