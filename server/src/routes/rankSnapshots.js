// 排名快照 API（FR-8）。写入限李(seo)。
import * as repo from '../db/repositories/rankSnapshots.js';
import { requireAuth, editor } from '../auth/middleware.js';

export async function rankSnapshotsRoutes(app) {
  app.get('/api/rank-snapshots', { preHandler: requireAuth }, async () => ({
    snapshots: repo.listGrouped(),
  }));

  app.post('/api/rank-snapshots', editor, async (request, reply) => {
    const b = request.body || {};
    const date = String(b.snapshot_date || new Date().toISOString().slice(0, 10));
    const items = Array.isArray(b.items) ? b.items.filter((i) => i && i.keyword) : [];
    if (!items.length) return reply.code(400).send({ error: 'no_items' });
    repo.create(date, items);
    reply.code(201);
    return { weeks: repo.distinctDateCount(), snapshots: repo.listGrouped() };
  });
}
