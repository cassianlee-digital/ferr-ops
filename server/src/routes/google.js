import { requireAuth, onlyManagerBoss } from '../auth/middleware.js';
import { config } from '../config.js';
import * as googleRepo from '../db/repositories/googleSync.js';
import { adsSummary, ga4Overview, gscSummary } from '../db/repositories/googleSync.js';
import { buildAuthUrl, exchangeCode, normalizeRange, providerConfig } from '../sync/googleClient.js';

function statusFor(provider, tokens, runs) {
  const pc = providerConfig(provider);
  const token = tokens[provider] || {};
  const run = runs[provider] || null;
  return {
    configured: pc.ready,
    missing: pc.missing,
    authorized: !!token.authorized,
    tokenUpdatedAt: token.updatedAt || null,
    lastSyncAt: run?.finished_at || run?.started_at || null,
    lastSyncStatus: run?.status || null,
    lastError: run?.status === 'failed' ? run.error : null,
  };
}

export async function googleRoutes(app) {
  app.get('/api/google/status', { preHandler: requireAuth }, async () => {
    const tokens = googleRepo.tokenStatus();
    const runs = googleRepo.latestRuns();
    return {
      providers: {
        gsc: {
          ...statusFor('gsc', tokens, runs),
          siteUrlConfigured: !!config.google.gscSiteUrl,
        },
        ga4: {
          ...statusFor('ga4', tokens, runs),
          propertyConfigured: !!config.google.ga4PropertyId,
        },
        ads: {
          ...statusFor('ads', tokens, runs),
          customerConfigured: !!config.google.adsCustomerId,
          loginCustomerConfigured: !!config.google.adsLoginCustomerId,
          apiVersion: config.google.adsApiVersion,
        },
      },
    };
  });

  app.get('/api/google/auth/start', onlyManagerBoss, async (request, reply) => {
    const provider = String(request.query?.provider || '');
    try {
      const authUrl = buildAuthUrl(provider);
      return reply.redirect(authUrl);
    } catch (e) {
      const code = e.message === 'bad_provider' || e.message === 'google_config_missing' ? 400 : 500;
      return reply.code(code).send({ error: e.message || 'google_auth_start_failed', missing: e.missing || undefined });
    }
  });

  app.get('/api/google/auth/callback', { preHandler: requireAuth }, async (request, reply) => {
    const { code, state, error } = request.query || {};
    if (error) return reply.code(400).send({ error: 'google_auth_denied', detail: String(error) });
    const provider = googleRepo.consumeState(String(state || ''));
    if (!provider) return reply.code(400).send({ error: 'bad_oauth_state' });
    try {
      await exchangeCode(provider, String(code || ''));
      return reply.redirect(`/?google_auth=success&provider=${encodeURIComponent(provider)}`);
    } catch (e) {
      return reply.code(502).send({ error: e.message || 'google_auth_exchange_failed' });
    }
  });

  app.delete('/api/google/auth/:provider', onlyManagerBoss, async (request, reply) => {
    const provider = String(request.params?.provider || '');
    try {
      googleRepo.deleteToken(provider);
      return { ok: true };
    } catch (e) {
      return reply.code(400).send({ error: e.message || 'bad_provider' });
    }
  });

  app.get('/api/google/gsc/summary', { preHandler: requireAuth }, async (request, reply) => {
    try {
      return { connected: googleRepo.tokenStatus().gsc.authorized, ...gscSummary(normalizeRange(request.query || {})) };
    } catch (e) {
      return reply.code(400).send({ error: e.message || 'bad_request' });
    }
  });

  app.get('/api/google/ga4/overview', { preHandler: requireAuth }, async (request, reply) => {
    try {
      return { connected: googleRepo.tokenStatus().ga4.authorized, ...ga4Overview(normalizeRange(request.query || {})) };
    } catch (e) {
      return reply.code(400).send({ error: e.message || 'bad_request' });
    }
  });

  app.get('/api/google/ads/summary', { preHandler: requireAuth }, async (request, reply) => {
    try {
      return { connected: googleRepo.tokenStatus().ads.authorized, ...adsSummary(normalizeRange(request.query || {})) };
    } catch (e) {
      return reply.code(400).send({ error: e.message || 'bad_request' });
    }
  });
}
