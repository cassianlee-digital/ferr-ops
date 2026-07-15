// 闭环条目 API（FR-10）：月度计划/测试登记/沉淀表/任务看板 + 归档地基（state/archived/deleted）。写入限李/陈。
import * as repo from '../db/repositories/loopItems.js';
import { requireAuth, editor } from '../auth/middleware.js';

const KINDS = ['plan', 'test', 'deposit', 'task'];
const ARCHIVE_KINDS = ['sem', 'seo', 'company'];
const s = (v, n = 400) => (v == null ? null : String(v).slice(0, n));

function resolveView(q) {
  if (q?.archived === '1' || q?.view === 'archived') return 'archived';
  if (q?.deleted === '1' || q?.view === 'deleted') return 'deleted';
  if (q?.view === 'all') return 'all';
  return 'active'; // 默认排除 archived/deleted
}

export async function loopItemsRoutes(app) {
  app.get('/api/loop-items', { preHandler: requireAuth }, async (request) => {
    const kind = request.query?.kind;
    const onlyUrgent = request.query?.urgent === '1';
    const all = repo.list(KINDS.includes(kind) ? kind : undefined, { view: resolveView(request.query) });
    return { items: onlyUrgent ? all.filter((r) => r.urgent === 1) : all };
  });

  app.post('/api/loop-items', editor, async (request, reply) => {
    const b = request.body || {};
    if (!KINDS.includes(b.kind)) return reply.code(400).send({ error: 'bad_kind' });
    const item = repo.create({
      kind: b.kind,
      dept: s(b.dept, 10),
      content: s(b.content, 400) || '',
      owner: s(b.owner, 20),
      status: s(b.status, 20) || '',
      task_date: s(b.task_date, 20),
      task_hour: s(b.task_hour, 10),
      note: s(b.note, 400),
      urgent: b.urgent === 1 || b.urgent === '1' || b.urgent === true ? 1 : null,
    });
    reply.code(201);
    return { item };
  });

  app.patch('/api/loop-items/:id', editor, async (request) => ({
    item: repo.update(Number(request.params.id), request.body || {}),
  }));

  // 归档：服务端打时间戳、推导 archive_kind；幂等。前端调这个最稳。
  app.post('/api/loop-items/:id/archive', editor, async (request, reply) => {
    const id = Number(request.params.id);
    const ak = s(request.body?.archive_kind, 20);
    const kind = ARCHIVE_KINDS.includes(ak) ? ak : null;
    const item = repo.archive(id, kind);
    if (!item) return reply.code(404).send({ error: 'not_found' });
    return { item };
  });

  // 恢复：archived → todo
  app.post('/api/loop-items/:id/restore', editor, async (request, reply) => {
    const item = repo.restore(Number(request.params.id));
    if (!item) return reply.code(404).send({ error: 'not_found' });
    return { item };
  });

  // DELETE：默认软删；?hard=1 物理删（保留给归档页彻底清除）
  app.delete('/api/loop-items/:id', editor, async (request) => {
    const id = Number(request.params.id);
    if (request.query?.hard === '1') {
      repo.hardDelete(id);
      return { ok: true, hard: true };
    }
    const item = repo.softDelete(id);
    return { ok: true, item };
  });
}
