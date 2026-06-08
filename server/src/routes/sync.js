// 第二期数据同步占位路由。统一返回 501 Not Implemented。
// 第一期不实现自动同步（GSC / Ads / GA4），数据走手动录入。
import { requireAuth } from '../auth/middleware.js';

const notImplemented = (source) => async (_request, reply) =>
  reply.code(501).send({ error: 'not_implemented', source, phase: 2 });

export async function syncRoutes(app) {
  for (const src of ['gsc', 'ads', 'ga4']) {
    app.get(`/api/sync/${src}`, { preHandler: requireAuth }, notImplemented(src));
    app.post(`/api/sync/${src}`, { preHandler: requireAuth }, notImplemented(src));
  }
}
