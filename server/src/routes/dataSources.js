import { requireAuth } from '../auth/middleware.js';
import { config } from '../config.js';
import * as inqRepo from '../db/repositories/inquiries.js';
import * as seoRepo from '../db/repositories/seoWeeks.js';
import * as semRepo from '../db/repositories/semWeeks.js';
import * as integrations from '../db/repositories/integrations.js';
import * as googleRepo from '../db/repositories/googleSync.js';
import { providerConfig } from '../sync/googleClient.js';

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

function syncSource(provider, legacyConfigured) {
  const pc = providerConfig(provider);
  const token = googleRepo.tokenStatus()[provider] || {};
  const run = googleRepo.latestRuns()[provider] || null;
  const authorized = !!token.authorized;
  return {
    type: 'sync',
    status: !pc.ready ? 'not_configured' : (authorized ? 'available' : (legacyConfigured ? 'configured_not_synced' : 'not_configured')),
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
  app.get('/api/data-sources/status', { preHandler: requireAuth }, async () => {
    let integ = {};
    try {
      integ = integrations.status() || {};
    } catch {
      integ = {};
    }
    const cfg = (p) => !!(integ[p] && integ[p].configured);
    const aiProvider = (process.env.AI_PROVIDER || 'openrouter').toLowerCase();
    const aiConfigured = aiProvider === 'anthropic'
      ? !!config.anthropic.apiKey
      : !!process.env.OPENROUTER_API_KEY;
    const aiModel = aiProvider === 'anthropic'
      ? config.anthropic.model
      : (process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash');

    return {
      sources: {
        inquiries: manualSource('人工录入', inqRepo.list, 'date'),
        seo_weeks: manualSource('人工周报', seoRepo.list, 'week_date'),
        sem_weeks: manualSource('人工周报', semRepo.list, 'week_date'),
        gsc: syncSource('gsc', cfg('gsc')),
        ga4: syncSource('ga4', cfg('ga4')),
        ads: syncSource('ads', cfg('ads')),
        ai: {
          type: 'provider',
          status: aiConfigured ? 'configured_unverified' : 'not_configured',
          provider: aiProvider,
          configured: aiConfigured,
          model: aiConfigured ? aiModel : null,
          error: null,
        },
      },
    };
  });
}
