import { requireAuth } from '../auth/middleware.js';
import * as inqRepo from '../db/repositories/inquiries.js';
import * as seoRepo from '../db/repositories/seoWeeks.js';
import * as semRepo from '../db/repositories/semWeeks.js';
import * as googleRepo from '../db/repositories/googleSync.js';
import { getHermesStatus } from '../services/hermesStatus.js';
import { projectProviderConfig, resolveProject } from '../sync/googleClient.js';

function manualSource(label, listFn, dateKey) {
  try {
    const rows = listFn() || [];
    const count = rows.length;
    let lastAt = null;
    for (const r of rows) {
      const d = r[dateKey];
      if (d && (lastAt == null || d > lastAt)) lastAt = d;
    }
    return {
      type: 'manual',
      status: count > 0 ? 'available' : 'no_records',
      label,
      lastAt: lastAt ?? null,
      count,
      error: null,
    };
  } catch (e) {
    return { type: 'manual', status: 'error', label, lastAt: null, count: 0, error: String(e.message || e) };
  }
}

function syncSource(provider) {
  const project = resolveProject({});
  const pc = projectProviderConfig(provider, project);
  const token = googleRepo.tokenStatus()[provider] || {};
  const run = googleRepo.latestRuns()[provider] || null;
  const authorized = !!token.authorized;
  return {
    type: 'sync',
    status: !pc.ready ? 'not_configured' : (authorized ? 'available' : 'configured_not_synced'),
    label: '自动同步',
    configured: pc.ready,
    authorized,
    missing: pc.missing,
    lastSyncAt: run?.finished_at || run?.started_at || null,
    count: run?.rows_written || 0,
    error: run?.status === 'failed' ? run.error : null,
    note: authorized ? 'google_sync_ready' : 'google_oauth_required',
    phase: 2,
  };
}

export async function dataSourcesRoutes(app) {
  app.get('/api/data-sources/status', { preHandler: requireAuth }, async (request) => {
    const ai = await getHermesStatus({ logger: request.log });
    return {
      sources: {
        inquiries: manualSource('人工录入', inqRepo.list, 'date'),
        seo_weeks: manualSource('人工周报', seoRepo.list, 'week_date'),
        sem_weeks: manualSource('人工周报', semRepo.list, 'week_date'),
        gsc: syncSource('gsc'),
        ga4: syncSource('ga4'),
        ads: syncSource('ads'),
        ai: {
          type: 'provider',
          status: ai.status,
          provider: ai.provider,
          configured: ai.configured,
          connected: ai.connected,
          model: ai.model,
          lastSuccessfulAt: ai.lastSuccessfulAt,
          lastFailureAt: ai.lastFailureAt,
          consecutiveFailures: ai.consecutiveFailures,
          checkedAt: ai.checkedAt,
          error: ai.error || null,
        },
      },
    };
  });
}
