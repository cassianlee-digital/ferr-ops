// 广告创意库 API（FR-7）。写入限陈(sem)。
import * as repo from '../db/repositories/adCreatives.js';
import { requireAuth, onlySem } from '../auth/middleware.js';

const s = (v, n = 300) => (v == null ? null : String(v).slice(0, n));

export async function adCreativesRoutes(app) {
  app.get('/api/ad-creatives', { preHandler: requireAuth }, async () => ({ items: repo.list() }));

  app.post('/api/ad-creatives', onlySem, async (request, reply) => {
    const b = request.body || {};
    if (!b.title) return reply.code(400).send({ error: 'title_required' });
    const item = repo.create({
      title: s(b.title, 120),
      description: s(b.description, 300) || '',
      ctr: s(b.ctr, 20) || '—',
      ab_conclusion: s(b.ab_conclusion, 200) || '待测试',
      status: s(b.status, 20) || '测试中',
    });
    reply.code(201);
    return { item };
  });

  app.patch('/api/ad-creatives/:id', onlySem, async (request) => ({
    item: repo.update(Number(request.params.id), request.body || {}),
  }));
}
