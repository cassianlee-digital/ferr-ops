// 设置页 · 第三方 API 密钥（GSC / GA4 / Ads）。密钥 AES 加密入库，接口只回配置状态。
import * as repo from '../db/repositories/integrations.js';
import { requireAuth, editor } from '../auth/middleware.js';

export async function settingsRoutes(app) {
  // 状态（已配置/未配置 + 更新时间），任何登录用户可见
  app.get('/api/settings/integrations', { preHandler: requireAuth }, async () => ({
    integrations: repo.status(),
  }));

  // 写入/更新密钥（除 KPI 目标外全权 → editor 角色可改）
  app.put('/api/settings/integrations', editor, async (request, reply) => {
    const { provider, secret } = request.body || {};
    if (!repo.PROVIDERS.includes(provider)) return reply.code(400).send({ error: 'bad_provider' });
    repo.setSecret(provider, String(secret ?? ''));
    return { ok: true, integrations: repo.status() };
  });
}
