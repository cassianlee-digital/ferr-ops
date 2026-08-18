import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-ads-search-terms-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.SETTINGS_SECRET = 'test-settings-secret-for-search-term-sync';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost/google/callback';
process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'test-developer-token';
process.env.GOOGLE_ADS_CUSTOMER_ID = '1234567890';

const { migrate } = await import('../src/db/migrate.js');
const { db } = await import('../src/db/connection.js');
const repo = await import('../src/db/repositories/googleSync.js');
const { syncAds } = await import('../src/sync/ads.js');
const { buildOpsDiagnosis } = await import('../src/services/hermesBrain.js');

migrate();
repo.saveToken('ads', {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expiry_date_ms: Date.now() + 3_600_000,
});

function resetAdsData() {
  db.prepare('DELETE FROM google_ads_search_term_daily').run();
  db.prepare('DELETE FROM google_ads_keyword_daily').run();
  db.prepare('DELETE FROM google_ads_campaign_daily').run();
  db.prepare('DELETE FROM google_sync_runs').run();
}

function campaign(date, runId = null) {
  return {
    date,
    customer_id: '1234567890',
    campaign_id: '11',
    campaign_name: 'Foundry',
    cost_micros: 9000000,
    impressions: 100,
    clicks: 12,
    conversions: 1,
    ctr: 0.12,
    average_cpc_micros: 750000,
    cost_per_conversion_micros: 9000000,
    sync_run_id: runId,
  };
}

function searchTerm(overrides = {}) {
  return {
    ...campaign('2026-08-01'),
    ad_group_id: '22',
    ad_group_name: 'General',
    search_term: 'free casting drawing',
    match_type: 'BROAD',
    status: 'NONE',
    conversions: 0,
    ...overrides,
  };
}

test.after(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

test('Ads sync queries search_term_view and idempotently stores mapped search terms', async () => {
  resetAdsData();
  const originalFetch = globalThis.fetch;
  const queries = [];
  globalThis.fetch = async (_url, init) => {
    const query = JSON.parse(init.body).query;
    queries.push(query);
    let results;
    if (query.includes('FROM search_term_view')) {
      results = [{
        segments: { date: '2026-08-01', searchTermMatchType: 'PHRASE' },
        campaign: { id: '11', name: 'Foundry' },
        adGroup: { id: '22', name: 'General' },
        searchTermView: { searchTerm: 'free casting drawing', status: 'NONE' },
        metrics: { costMicros: '3200000', impressions: '40', clicks: '14', conversions: 0, ctr: 0.35, averageCpc: '228571' },
      }];
    } else if (query.includes('FROM keyword_view')) {
      results = [{
        segments: { date: '2026-08-01' },
        campaign: { id: '11', name: 'Foundry' },
        adGroup: { id: '22', name: 'General' },
        adGroupCriterion: { criterionId: '33', keyword: { text: 'casting supplier', matchType: 'BROAD' } },
        metrics: { costMicros: '9000000', impressions: '100', clicks: '12', conversions: 1, ctr: 0.12, averageCpc: '750000', costPerConversion: '9000000' },
      }];
    } else {
      results = [{
        segments: { date: '2026-08-01' },
        campaign: { id: '11', name: 'Foundry' },
        metrics: { costMicros: '9000000', impressions: '100', clicks: '12', conversions: 1, ctr: 0.12, averageCpc: '750000', costPerConversion: '9000000' },
      }];
    }
    return new Response(JSON.stringify([{ results }]), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const first = await syncAds({ start_date: '2026-08-01', end_date: '2026-08-01' });
    const second = await syncAds({ start_date: '2026-08-01', end_date: '2026-08-01' });
    assert.equal(first.rowsWritten, 3);
    assert.equal(second.rowsWritten, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(queries.length, 6);
  const searchQuery = queries.find((query) => query.includes('FROM search_term_view'));
  assert.match(searchQuery, /search_term_view\.search_term/);
  assert.match(searchQuery, /search_term_view\.status/);
  assert.match(searchQuery, /segments\.search_term_match_type/);

  const rows = db.prepare('SELECT * FROM google_ads_search_term_daily').all();
  assert.equal(rows.length, 1, '重复同步同一天同一搜索词不得生成重复行');
  assert.equal(rows[0].search_term, 'free casting drawing');
  assert.equal(rows[0].match_type, 'PHRASE');
  assert.equal(rows[0].status, 'NONE');
  assert.equal(rows[0].cost_micros, 3200000);

  const { buildApp } = await import('../src/index.js');
  const app = await buildApp();
  try {
    const token = app.jwt.sign({ id: 1, username: 'test', name: 'Test', role: 'boss' });
    const headers = { cookie: `ferr_token=${token}` };
    for (const url of [
      '/api/google/ads/board?start_date=2026-08-01&end_date=2026-08-01',
      '/api/diagnostics?start_date=2026-08-01&end_date=2026-08-01',
    ]) {
      const response = await app.inject({ method: 'GET', url, headers });
      assert.equal(response.statusCode, 200);
      const sem = url.includes('/diagnostics') ? response.json().sem : response.json();
      assert.equal(sem.searchTermCoverage.rowCount, 1);
      assert.equal(sem.wasteSearchTerms[0].searchTerm, 'free casting drawing');
    }
  } finally {
    await app.close();
  }
});

test('search-term candidates aggregate real terms and exclude terms already negated', () => {
  resetAdsData();
  repo.upsertAdsSearchTerms([
    searchTerm({ date: '2026-08-01', cost_micros: 1000000, clicks: 4 }),
    searchTerm({ date: '2026-08-02', cost_micros: 2000000, clicks: 6 }),
    searchTerm({ date: '2026-08-01', search_term: 'sample casting', cost_micros: 2500000, clicks: 8 }),
    searchTerm({ date: '2026-08-02', search_term: 'sample casting', status: 'EXCLUDED', cost_micros: 500000, clicks: 1 }),
    searchTerm({ date: '2026-08-02', search_term: 'casting manufacturer', cost_micros: 4000000, clicks: 9, conversions: 2 }),
  ]);

  const range = { start_date: '2026-08-01', end_date: '2026-08-02', ads_customer_id: '1234567890' };
  const summary = repo.adsSearchTermSummary(range);
  const candidates = repo.adsWasteSearchTerms(range);

  assert.equal(summary.rowCount, 5);
  assert.equal(summary.distinctTerms, 3);
  assert.equal(summary.lastDate, '2026-08-02');
  assert.deepEqual(candidates.map((row) => row.searchTerm), ['free casting drawing']);
  assert.equal(candidates[0].costMicros, 3000000);
  assert.equal(candidates[0].clicks, 10);
});

test('Hermes exposes a search-term data gap and never falls back to keyword evidence', () => {
  resetAdsData();
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  repo.upsertAdsCampaigns([campaign(date)]);
  repo.upsertAdsKeywords([{
    ...campaign(date),
    ad_group_id: '22',
    ad_group_name: 'General',
    criterion_id: '33',
    keyword_text: 'casting supplier',
    match_type: 'BROAD',
    conversions: 0,
  }]);

  const gap = buildOpsDiagnosis({ role: 'boss' }, '今天');
  assert.ok(gap.missingData.includes('google_ads_search_terms'));
  assert.ok(gap.evidencePack.some((item) => item.metric === 'ads_search_term_coverage' && item.dataRole === 'data_gap'));
  assert.equal(gap.evidencePack.some((item) => item.source === 'google_ads.keyword_sync'), false);

  repo.upsertAdsSearchTerms([searchTerm({ date, cost_micros: 3200000, clicks: 14 })]);
  const grounded = buildOpsDiagnosis({ role: 'boss' }, '今天');
  const item = grounded.evidencePack.find((evidence) => evidence.metric === 'ads_search_term_cost_clicks_conversions');
  assert.ok(item);
  assert.equal(item.granularity, 'search_term');
  assert.equal(item.dataRole, 'synced_search_term_observation');
  assert.match(item.value, /search_term=free casting drawing/);
  assert.equal(grounded.missingData.includes('google_ads_search_terms'), false);
});
