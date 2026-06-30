// 诊断引擎路由：基于已同步真实数据跑规则，返回结构化 findings（机会词/蚕食/衰退/高花费零有效）。
import { requireAuth } from '../auth/middleware.js';
import * as googleRepo from '../db/repositories/googleSync.js';
import { normalizeRange, resolveProject } from '../sync/googleClient.js';

function prevRange(range) {
  const day = 86400000;
  const s = new Date(range.start_date + 'T00:00:00Z');
  const e = new Date(range.end_date + 'T00:00:00Z');
  const len = Math.round((e - s) / day) + 1;
  const prevEnd = new Date(s.getTime() - day);
  const prevStart = new Date(prevEnd.getTime() - (len - 1) * day);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { start_date: iso(prevStart), end_date: iso(prevEnd) };
}

export async function diagnosticsRoutes(app) {
  app.get('/api/diagnostics', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const project = resolveProject(request.query || {});
      const range = normalizeRange(request.query || {});
      const gsc = { ...range, gsc_site_url: project.gsc_site_url };
      const ads = { ...range, ads_customer_id: project.ads_customer_id };
      const prev = prevRange(range);

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
