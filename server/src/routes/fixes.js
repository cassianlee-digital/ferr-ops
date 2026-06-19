// 整改清单 API（FR-6/10）。写入限李/陈（闭环看板为运营共用）。
import * as repo from '../db/repositories/fixes.js';
import { requireAuth, seoOrSem } from '../auth/middleware.js';

const s = (v, n = 300) => (v == null ? null : String(v).slice(0, n));

export async function fixesRoutes(app) {
  app.get('/api/fixes', { preHandler: requireAuth }, async () => ({ items: repo.list() }));

  app.post('/api/fixes', seoOrSem, async (request, reply) => {
    const b = request.body || {};
    if (!b.title) return reply.code(400).send({ error: 'title_required' });
    const item = repo.create({
      title: s(b.title, 200),
      dept: s(b.dept, 10),
      detail: s(b.detail, 500),
      evidence: s(b.evidence, 500),
      owner: s(b.owner, 20),
      due_date: s(b.due_date, 20),
      status: s(b.status, 20) || '计划下周',
      source: s(b.source, 40) || '手动',
    });
    reply.code(201);
    return { item };
  });

  app.patch('/api/fixes/:id', seoOrSem, async (request) => ({
    item: repo.update(Number(request.params.id), request.body || {}),
  }));
}
