// 否词库 API（FR-7）。写入限陈(sem)。
import * as repo from '../db/repositories/negKeywords.js';
import { requireAuth, onlySem } from '../auth/middleware.js';

const s = (v, n = 200) => (v == null ? null : String(v).slice(0, n));

export async function negKeywordsRoutes(app) {
  app.get('/api/neg-keywords', { preHandler: requireAuth }, async () => ({ items: repo.list() }));

  app.post('/api/neg-keywords', onlySem, async (request, reply) => {
    const b = request.body || {};
    if (!b.word) return reply.code(400).send({ error: 'word_required' });
    const item = repo.create({
      word: s(b.word, 100),
      match_type: s(b.match_type, 20) || '词组',
      added_date: s(b.added_date, 20) || new Date().toISOString().slice(5, 10),
      reason: s(b.reason, 300) || '',
      source_campaign: s(b.source_campaign, 60) || '全账户',
      status: s(b.status, 20) || '生效',
    });
    reply.code(201);
    return { item };
  });

  app.patch('/api/neg-keywords/:id', onlySem, async (request) => ({
    item: repo.update(Number(request.params.id), request.body || {}),
  }));
}
