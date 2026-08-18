import { requireAuth } from '../auth/middleware.js';
import { buildRiskRegister } from '../services/riskRegister.js';

export async function risksRoutes(app) {
  app.get('/api/risks', { preHandler: requireAuth }, async (request, reply) => {
    try {
      return await buildRiskRegister();
    } catch (error) {
      request.log.error({ err: error?.message || String(error) }, 'risk register unavailable');
      return reply.code(500).send({
        error: 'risk_register_unavailable',
        detail: '风险清单读取失败，请检查服务器日志后重试。',
      });
    }
  });
}
