import { requireAuth, editor } from '../auth/middleware.js';
import { syncGsc } from '../sync/gsc.js';
import { syncGa4 } from '../sync/ga4.js';
import { syncAds } from '../sync/ads.js';
import * as googleRepo from '../db/repositories/googleSync.js';

const SYNCERS = { gsc: syncGsc, ga4: syncGa4, ads: syncAds };

function safeError(e) {
  return {
    error: e.message || 'sync_failed',
    missing: e.missing || undefined,
  };
}

export async function syncRoutes(app) {
  for (const src of Object.keys(SYNCERS)) {
    app.get(`/api/sync/${src}`, { preHandler: requireAuth }, async (request) => ({
      provider: src,
      latestRun: googleRepo.latestProjectRuns(requestProjectId(request))[src],
    }));

    app.post(`/api/sync/${src}`, editor, async (request, reply) => {
      try {
        return await SYNCERS[src]({ ...(request.query || {}), ...(request.body || {}) });
      } catch (e) {
        const status = ['bad_date_range', 'google_config_missing', 'google_project_not_found'].includes(e.message) ? 400 : 502;
        return reply.code(status).send({ provider: src, ...safeError(e) });
      }
    });
  }
}

function requestProjectId(request) {
  const id = request?.query?.project_id || request?.query?.projectId;
  return id ? Number(id) : null;
}
