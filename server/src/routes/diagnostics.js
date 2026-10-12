// 诊断引擎路由：基于已同步真实数据跑规则，返回结构化 findings（机会词/蚕食/衰退/点击率偏低/高花费零有效）。
import { requireAuth } from '../auth/middleware.js';
import * as googleRepo from '../db/repositories/googleSync.js';
import { normalizeRange, readScope, resolveProject } from '../sync/googleClient.js';
import { previousRange } from '../lib/parseDateRange.js';
import { CTR_RULE, findCtrAnomalies } from '../services/ctrAnomaly.js';

export async function diagnosticsRoutes(app) {
  app.get('/api/diagnostics', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const project = resolveProject(request.query || {});
      const range = normalizeRange(request.query || {});
      const gsc = { ...range, gsc_site_url: readScope(project).gsc_site_url };
      const ads = { ...range, ads_customer_id: project.ads_customer_id };
      const prev = previousRange(range);

      const opportunities = googleRepo.gscOpportunities(gsc);
      const cannibalization = googleRepo.gscCannibalization(gsc);
      const decay = googleRepo.gscDecayPages(gsc, prev);
      // 点击率偏低：与本站同位次的词比（规则与口径见 services/ctrAnomaly.js）。baselines 一并返回 —— 没有基准时界面要能说清「比不了」，而不是「没问题」
      const ctr = findCtrAnomalies(googleRepo.gscFirstPageRows(gsc, { minImpr: CTR_RULE.minImpressions, maxPosition: CTR_RULE.maxPosition }));
      const searchTermCoverage = googleRepo.adsSearchTermSummary(ads);
      const wasteSearchTerms = googleRepo.adsWasteSearchTerms(ads);

      return {
        project,
        range,
        seo: { opportunities, cannibalization, decay, ctr },
        sem: { searchTermCoverage, wasteSearchTerms },
        counts: {
          opportunities: opportunities.length,
          cannibalization: cannibalization.length,
          decay: decay.length,
          ctr: ctr.items.length,
          wasteSearchTerms: wasteSearchTerms.length,
        },
      };
    } catch (e) {
      return reply.code(400).send({ error: e.message || 'bad_request' });
    }
  });
}
