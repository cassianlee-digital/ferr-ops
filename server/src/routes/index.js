// 业务路由聚合器。各资源路由逐个接入。
import { inquiriesRoutes } from './inquiries.js';

export async function registerRoutes(app) {
  await app.register(inquiriesRoutes);
}
