// 内容资产 API。写入限可编辑角色。
import * as repo from '../db/repositories/contentAssets.js';
import { requireAuth, editor } from '../auth/middleware.js';

export async function contentAssetsRoutes(app) {
  app.get('/api/content-assets', { preHandler: requireAuth }, async () => ({ items: repo.list() }));
  app.post('/api/content-assets', editor, async (request, reply) => {
    reply.code(201);
    return { item: repo.create(request.body || {}) };
  });
  app.patch('/api/content-assets/:id', editor, async (request) => ({
    item: repo.update(Number(request.params.id), request.body || {}),
  }));
  app.delete('/api/content-assets/:id', editor, async (request) => {
    repo.remove(Number(request.params.id));
    return { ok: true };
  });
}
