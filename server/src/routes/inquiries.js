// 询盘 API（FR-1）。写入限销售；所有登录用户可读。
import * as repo from '../db/repositories/inquiries.js';
import { requireAuth, roles } from '../auth/middleware.js';

const GRADES = ['A', 'B', 'C'];

function clean(body) {
  const s = (v) => (v == null ? null : String(v).slice(0, 500));
  return {
    date: s(body.date) || new Date().toISOString().slice(0, 10),
    country: s(body.country),
    region: s(body.region),
    channel: s(body.channel),
    source: s(body.source),
    product: s(body.product),
    grade: GRADES.includes(body.grade) ? body.grade : 'C',
    note: s(body.note),
  };
}

export async function inquiriesRoutes(app) {
  app.get('/api/inquiries', { preHandler: requireAuth }, async () => ({
    items: repo.list(),
    stats: repo.stats(),
  }));

  app.post('/api/inquiries', { preHandler: roles('sales') }, async (request, reply) => {
    const rec = clean(request.body || {});
    const item = repo.create(rec, request.user.id);
    reply.code(201);
    return { item, stats: repo.stats() };
  });

  app.patch('/api/inquiries/:id', { preHandler: roles('sales') }, async (request) => {
    const item = repo.update(Number(request.params.id), request.body || {});
    return { item, stats: repo.stats() };
  });

  app.delete('/api/inquiries/:id', { preHandler: roles('sales') }, async (request) => {
    repo.remove(Number(request.params.id));
    return { ok: true, stats: repo.stats() };
  });
}
