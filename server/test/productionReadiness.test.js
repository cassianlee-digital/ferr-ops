import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-production-readiness-test-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite');
process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'j'.repeat(40);
process.env.SETTINGS_SECRET = 's'.repeat(40);
process.env.AI_PROVIDER = 'openrouter';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.OPENROUTER_MODEL = 'vendor/model';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://example.test/api/google/auth/callback';
process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'test-developer-token';

const { migrate } = await import('../src/db/migrate.js');
const { db } = await import('../src/db/connection.js');
const googleRepo = await import('../src/db/repositories/googleSync.js');
const {
  checkProductionReadiness,
  sanitizeProductionReadinessReport,
  verifyBackupRestore,
} = await import('../src/services/productionReadiness.js');

migrate();
const project = googleRepo.createProject({
  name: 'Production test',
  gsc_site_url: 'sc-domain:example.test',
  ga4_property_id: '123456789',
  ads_customer_id: '1234567890',
  is_default: true,
});
for (const provider of googleRepo.PROVIDERS) {
  googleRepo.saveToken(provider, {
    access_token: `access-${provider}`,
    refresh_token: `refresh-${provider}`,
    expires_in: 3600,
  });
  const runId = googleRepo.beginProjectRun(provider, project.id, '2026-08-15', '2026-08-15');
  googleRepo.finishRun(runId, 1);
}

googleRepo.upsertGscDaily([{
  date: '2026-08-15', site_url: project.gsc_site_url, clicks: 1, impressions: 10,
  ctr: 0.1, position: 5, sync_run_id: null,
}]);
googleRepo.upsertGscQueries([{
  date: '2026-08-15', site_url: project.gsc_site_url, query: 'test query', page: '/test',
  clicks: 1, impressions: 10, ctr: 0.1, position: 5, sync_run_id: null,
}]);
googleRepo.upsertGa4Daily([{
  date: '2026-08-15', property_id: project.ga4_property_id, active_users: 1, sessions: 1,
  page_views: 1, key_events: 1, bounce_rate: 0, avg_session_duration: 10, sync_run_id: null,
}]);
googleRepo.upsertGa4Events([{
  date: '2026-08-15', property_id: project.ga4_property_id, event_name: 'form_submit',
  event_count: 1, total_users: 1, key_events: 1, sync_run_id: null,
}]);
googleRepo.upsertAdsCampaigns([{
  date: '2026-08-15', customer_id: project.ads_customer_id, campaign_id: '1', campaign_name: 'Test',
  cost_micros: 1000000, impressions: 10, clicks: 1, conversions: 1, ctr: 0.1,
  average_cpc_micros: 1000000, cost_per_conversion_micros: 1000000, sync_run_id: null,
}]);
googleRepo.upsertAdsSearchTerms([{
  date: '2026-08-15', customer_id: project.ads_customer_id, campaign_id: '1', campaign_name: 'Test',
  ad_group_id: '2', ad_group_name: 'Group', search_term: 'real search term', match_type: 'EXACT',
  status: 'NONE', cost_micros: 1000000, impressions: 10, clicks: 1, conversions: 1, ctr: 0.1,
  average_cpc_micros: 1000000, cost_per_conversion_micros: 1000000, sync_run_id: null,
}]);

test.after(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

test('static production check never impersonates live acceptance or exposes secrets', async () => {
  const report = await checkProductionReadiness({
    env: process.env,
    db,
    live: false,
    now: new Date('2026-08-18T00:00:00.000Z'),
  });
  assert.equal(report.verdict, 'not_verified');
  assert.equal(report.ready, false);
  assert.equal(report.checks.find((item) => item.id === 'hermes.live_probe').status, 'unverified');
  assert.equal(report.checks.find((item) => item.id === 'google.ads.live_sync').status, 'unverified');
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /test-openrouter-key|test-client-secret|refresh-ads|access-ads/);
});

test('empty or fully invalid acceptance reports remain not verified', () => {
  for (const checks of [[], [{ id: '', title: '', status: 'pass' }]]) {
    const report = sanitizeProductionReadinessReport({ mode: 'live', checks });
    assert.equal(report.verdict, 'not_verified');
    assert.equal(report.ready, false);
    assert.equal(report.checks.length, 0);
  }
});

test('live production check verifies AI, all syncers, and a restorable backup', async () => {
  const calls = [];
  const syncers = Object.fromEntries(googleRepo.PROVIDERS.map((provider) => [provider, async (range) => {
    calls.push({ provider, range });
    const runId = googleRepo.beginProjectRun(provider, project.id, range.start_date, range.end_date);
    googleRepo.finishRun(runId, 0);
    return { provider, runId, rowsWritten: 0 };
  }]));
  const report = await checkProductionReadiness({
    env: process.env,
    db,
    live: true,
    date: '2026-08-15',
    syncers,
    aiProbe: async () => ({
      connected: true, provider: 'openrouter', model: 'vendor/model', error: '', detail: '', elapsedMs: 5,
    }),
  });
  assert.equal(report.verdict, 'pass');
  assert.equal(report.ready, true);
  assert.deepEqual(calls.map((item) => item.provider), ['gsc', 'ga4', 'ads']);
  assert.ok(report.checks.every((item) => item.status === 'pass'));
  assert.equal(report.checks.find((item) => item.id === 'database.backup_restore').status, 'pass');
  for (const id of ['hermes.live_probe', 'google.gsc.live_sync', 'google.ga4.live_sync', 'google.ads.live_sync']) {
    assert.match(report.checks.find((item) => item.id === id).evidence.configurationFingerprint, /^[a-f0-9]{64}$/);
  }
});

test('missing independent SETTINGS_SECRET is a blocking P0 failure', async () => {
  const env = { ...process.env, SETTINGS_SECRET: process.env.JWT_SECRET };
  const report = await checkProductionReadiness({ env, db, live: false });
  const check = report.checks.find((item) => item.id === 'security.settings_secret');
  assert.equal(report.verdict, 'fail');
  assert.equal(check.severity, 'P0');
  assert.equal(check.status, 'fail');
});

test('campaign rows cannot impersonate real Ads search-term evidence', async () => {
  db.prepare('DELETE FROM google_ads_search_term_daily').run();
  const report = await checkProductionReadiness({ env: process.env, db, live: false });
  const check = report.checks.find((item) => item.id === 'google.ads.data_evidence');
  assert.equal(check.status, 'unverified');
  assert.deepEqual(check.evidence.missingTables, ['google_ads_search_term_daily']);
  googleRepo.upsertAdsSearchTerms([{
    date: '2026-08-15', customer_id: project.ads_customer_id, campaign_id: '1', campaign_name: 'Test',
    ad_group_id: '2', ad_group_name: 'Group', search_term: 'real search term', match_type: 'EXACT',
    status: 'NONE', cost_micros: 1000000, impressions: 10, clicks: 1, conversions: 1, ctr: 0.1,
    average_cpc_micros: 1000000, cost_per_conversion_micros: 1000000, sync_run_id: null,
  }]);
});

test('live checks are refused outside production and invalid calendar dates fail early', async () => {
  let syncCalls = 0;
  const report = await checkProductionReadiness({
    env: { ...process.env, NODE_ENV: 'development' },
    db,
    live: true,
    syncers: Object.fromEntries(googleRepo.PROVIDERS.map((provider) => [provider, async () => {
      syncCalls += 1;
      return { provider, rowsWritten: 0 };
    }])),
  });
  assert.equal(report.verdict, 'fail');
  assert.equal(report.mode, 'static');
  assert.equal(syncCalls, 0);
  assert.equal(report.checks.find((item) => item.id === 'google.gsc.live_sync').status, 'unverified');
  await assert.rejects(
    () => checkProductionReadiness({ env: process.env, db, date: '2026-99-99' }),
    /acceptance_date_invalid/
  );
});

test('backup verifier opens the online backup and checks core schema', async () => {
  const result = await verifyBackupRestore(db);
  assert.deepEqual(result, { ok: true, integrity: 'ok', missingTables: [] });
});
