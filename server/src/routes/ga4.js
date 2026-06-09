// GA4 看板数据。第一期：返回连接状态 + 空数据（真实抓取在第二期 GA4 Data API 接入后实现）。
import { requireAuth } from '../auth/middleware.js';
import * as integrations from '../db/repositories/integrations.js';

export async function ga4Routes(app) {
  app.get('/api/ga4/overview', { preHandler: requireAuth }, async () => {
    const connected = integrations.status().ga4.configured;
    return {
      connected,
      // 第二期对接 GA4 Data API 后填充以下结构；现在统一为空，前端走空状态
      metrics: null,        // {activeUsers, sessions, pageViews, bounceRate, avgDuration}
      sources: [],          // [{source, sessions, users}]
      countries: [],        // [{country, sessions, users}]
      devices: [],          // [{device, share}]
      landingPages: [],     // [{page, sessions, conversions}]
    };
  });
}
