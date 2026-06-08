// 业务路由聚合器。各资源路由逐个接入。
import { inquiriesRoutes } from './inquiries.js';
import { seoWeeksRoutes } from './seoWeeks.js';
import { semWeeksRoutes } from './semWeeks.js';
import { kpiRoutes } from './kpi.js';
import { negKeywordsRoutes } from './negKeywords.js';
import { adCreativesRoutes } from './adCreatives.js';
import { rankSnapshotsRoutes } from './rankSnapshots.js';
import { keywordsRoutes } from './keywords.js';

export async function registerRoutes(app) {
  await app.register(inquiriesRoutes);
  await app.register(seoWeeksRoutes);
  await app.register(semWeeksRoutes);
  await app.register(kpiRoutes);
  await app.register(negKeywordsRoutes);
  await app.register(adCreativesRoutes);
  await app.register(rankSnapshotsRoutes);
  await app.register(keywordsRoutes);
}
