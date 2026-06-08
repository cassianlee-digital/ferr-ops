// 闭环条目 API（FR-10）：月度计划/测试登记/沉淀表/任务看板。写入限李/陈。
import * as repo from '../db/repositories/loopItems.js';
import { requireAuth, seoOrSem } from '../auth/middleware.js';

const KINDS = ['plan', 'test', 'deposit', 'task'];
const s = (v, n = 400) => (v == null ? null : String(v).slice(0, n));

export async function loopItemsRoutes(app) {
  app.get('/api/loop-items', { preHandler: requireAuth }, async (request) => {
    const kind = request.query?.kind;
    return { items: repo.list(KINDS.includes(kind) ? kind : undefined) };
  });

  app.post('/api/loop-items', seoOrSem, async (request, reply) => {
    const b = request.body || {};
    if (!KINDS.includes(b.kind)) return reply.code(400).send({ error: 'bad_kind' });
    const item = repo.create({
      kind: b.kind,
      dept: s(b.dept, 10),
      content: s(b.content, 400) || '',
      owner: s(b.owner, 20),
      status: s(b.status, 20) || '',
    });
    reply.code(201);
    return { item };
  });

  app.patch('/api/loop-items/:id', seoOrSem, async (request) => ({
    item: repo.update(Number(request.params.id), request.body || {}),
  }));
}
