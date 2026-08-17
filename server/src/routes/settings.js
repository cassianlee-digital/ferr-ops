// 设置页 · 第三方 API 密钥（GSC / GA4 / Ads）。密钥 AES 加密入库，接口只回配置状态。
import * as repo from '../db/repositories/integrations.js';
import { requireAuth, onlyManagerBoss } from '../auth/middleware.js';

export async function settingsRoutes(app) {
  // 状态（已配置/未配置 + 更新时间），任何登录用户可见
  app.get('/api/settings/integrations', { preHandler: requireAuth }, async () => ({
    integrations: repo.status(),
  }));

  // 第三方密钥属于系统级设置，仅经理/老板可写。
  app.put('/api/settings/integrations', onlyManagerBoss, async (request, reply) => {
    const { provider, secret } = request.body || {};
    if (!repo.PROVIDERS.includes(provider)) return reply.code(400).send({ error: 'bad_provider' });
    repo.setSecret(provider, String(secret ?? ''));
    return { ok: true, integrations: repo.status() };
  });
}
