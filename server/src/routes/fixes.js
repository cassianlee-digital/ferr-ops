// 整改清单 API（FR-6/10）+ 归档地基（state/archived/deleted）。写入限李/陈（闭环看板为运营共用）。
import * as repo from '../db/repositories/fixes.js';
import { requireAuth, seoOrSem } from '../auth/middleware.js';

const ARCHIVE_KINDS = ['sem', 'seo', 'company'];
const s = (v, n = 300) => (v == null ? null : String(v).slice(0, n));

function resolveView(q) {
  if (q?.archived === '1' || q?.view === 'archived') return 'archived';
  if (q?.deleted === '1' || q?.view === 'deleted') return 'deleted';
  if (q?.view === 'all') return 'all';
  return 'active';
}

export async function fixesRoutes(app) {
  app.get('/api/fixes', { preHandler: requireAuth }, async (request) => ({
    items: repo.list({ view: resolveView(request.query) }),
  }));

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

  app.post('/api/fixes/:id/archive', seoOrSem, async (request, reply) => {
    const id = Number(request.params.id);
    const ak = s(request.body?.archive_kind, 20);
    const kind = ARCHIVE_KINDS.includes(ak) ? ak : null;
    const item = repo.archive(id, kind);
    if (!item) return reply.code(404).send({ error: 'not_found' });
    return { item };
  });

  app.post('/api/fixes/:id/restore', seoOrSem, async (request, reply) => {
    const item = repo.restore(Number(request.params.id));
    if (!item) return reply.code(404).send({ error: 'not_found' });
    return { item };
  });

  // 新增：DELETE 默认软删；?hard=1 物理删
  app.delete('/api/fixes/:id', seoOrSem, async (request) => {
    const id = Number(request.params.id);
    if (request.query?.hard === '1') {
      repo.hardDelete(id);
      return { ok: true, hard: true };
    }
    const item = repo.softDelete(id);
    return { ok: true, item };
  });
}
