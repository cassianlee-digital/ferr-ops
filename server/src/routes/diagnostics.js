// 诊断引擎路由：基于已同步真实数据跑规则，返回结构化 findings（机会词/蚕食/衰退/高花费零有效）。
import { requireAuth } from '../auth/middleware.js';
import * as googleRepo from '../db/repositories/googleSync.js';
import { normalizeRange, resolveProject } from '../sync/googleClient.js';
import { previousRange } from '../lib/parseDateRange.js';

export async function diagnosticsRoutes(app) {
  app.get('/api/diagnostics', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const project = resolveProject(request.query || {});
      const range = normalizeRange(request.query || {});
      const gsc = { ...range, gsc_site_url: project.gsc_site_url };
      const ads = { ...range, ads_customer_id: project.ads_customer_id };
      const prev = previousRange(range);

      const opportunities = googleRepo.gscOpportunities(gsc);
      const cannibalization = googleRepo.gscCannibalization(gsc);
      const decay = googleRepo.gscDecayPages(gsc, prev);
      const wasteKeywords = googleRepo.adsWasteKeywords(ads);

      return {
        project,
        range,
        seo: { opportunities, cannibalization, decay },
        sem: { wasteKeywords },
        counts: {
          opportunities: opportunities.length,
          cannibalization: cannibalization.length,
          decay: decay.length,
          wasteKeywords: wasteKeywords.length,
        },
      };
    } catch (e) {
      return reply.code(400).send({ error: e.message || 'bad_request' });
    }
  });
}
