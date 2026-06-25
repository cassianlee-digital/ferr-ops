import { requireAuth } from '../auth/middleware.js';
import * as googleRepo from '../db/repositories/googleSync.js';
import { ga4Overview } from '../db/repositories/googleSync.js';
import { normalizeRange, resolveProject } from '../sync/googleClient.js';

export async function ga4Routes(app) {
  app.get('/api/ga4/overview', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const project = resolveProject(request.query || {});
      return {
        connected: googleRepo.tokenStatus().ga4.authorized,
        project,
        ...ga4Overview({ ...normalizeRange(request.query || {}), ga4_property_id: project.ga4_property_id }),
      };
    } catch (e) {
      return reply.code(400).send({ error: e.message || 'bad_request' });
    }
  });
}
