import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-ga4-sync-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.SETTINGS_SECRET = 'test-settings-secret-for-ga4-sync';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost/google/callback';
process.env.GA4_PROPERTY_ID = '123456789';

const { migrate } = await import('../src/db/migrate.js');
const { db } = await import('../src/db/connection.js');
const repo = await import('../src/db/repositories/googleSync.js');
const { syncGa4 } = await import('../src/sync/ga4.js');
const { buildOpsDiagnosis } = await import('../src/services/hermesBrain.js');

migrate();
repo.saveToken('ga4', {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expiry_date_ms: Date.now() + 3_600_000,
});

function resetGa4Data() {
  db.prepare('DELETE FROM ga4_event_daily').run();
  db.prepare('DELETE FROM ga4_dimension_daily').run();
  db.prepare('DELETE FROM ga4_daily').run();
  db.prepare('DELETE FROM google_sync_runs').run();
}

function metricValues(values) {
  return values.map((value) => ({ value: String(value) }));
}

function reportRow(dimensions, metrics) {
  return {
    dimensionValues: dimensions.map((value) => ({ value })),
    metricValues: metricValues(metrics),
  };
}

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

test.after(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

test('GA4 sync stores campaign and event facts idempotently and overview returns understandable labels', async () => {
  resetGa4Data();
  const originalFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    const dimensions = body.dimensions.map((item) => item.name);
    const second = dimensions[1];
    let rows;
    if (second === 'eventName') {
      rows = [
        reportRow(['20260801', 'form_submit'], [4, 3, 2]),
        reportRow(['20260801', 'custom_quote_request'], [2, 2, 1]),
        reportRow(['20260801', 'page_view'], [30, 10, 0]),
      ];
    } else if (second) {
      const values = {
        sessionSourceMedium: 'google / organic',
        country: 'Germany',
        deviceCategory: 'desktop',
        landingPagePlusQueryString: '/casting?from=ga4',
        sessionCampaignName: 'Foundry Leads',
      };
      const keyEvents = second === 'landingPagePlusQueryString' ? 2 : second === 'sessionCampaignName' ? 1 : 0;
      rows = [reportRow(['20260801', values[second]], [10, 20, 30, 0.4, 60, keyEvents])];
    } else {
      rows = [reportRow(['20260801'], [10, 20, 30, 0.4, 60, 3])];
    }
    return new Response(JSON.stringify({ rows }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const first = await syncGa4({ start_date: '2026-08-01', end_date: '2026-08-01' });
    const second = await syncGa4({ start_date: '2026-08-01', end_date: '2026-08-01' });
    assert.equal(first.rowsWritten, 9);
    assert.deepEqual(first.rowCounts, { daily: 1, dimensions: 5, events: 3 });
    assert.equal(second.rowsWritten, 9);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(bodies.length, 14);
  const campaignRequest = bodies.find((body) => body.dimensions.some((item) => item.name === 'sessionCampaignName'));
  const eventRequest = bodies.find((body) => body.dimensions.some((item) => item.name === 'eventName'));
  assert.ok(campaignRequest);
  assert.ok(eventRequest);
  assert.ok(campaignRequest.metrics.some((item) => item.name === 'keyEvents'));
  assert.deepEqual(eventRequest.metrics.map((item) => item.name), ['eventCount', 'totalUsers', 'keyEvents']);

  assert.equal(db.prepare('SELECT COUNT(*) count FROM ga4_daily').get().count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM ga4_dimension_daily').get().count, 5);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM ga4_event_daily').get().count, 3);
  assert.equal(db.prepare("SELECT key_events FROM ga4_dimension_daily WHERE dimension_type='landing_page'").get().key_events, 2);
  assert.equal(db.prepare("SELECT key_events FROM ga4_event_daily WHERE event_name='form_submit'").get().key_events, 2);
  assert.ok(db.prepare("PRAGMA table_info('ga4_daily')").all().some((column) => column.name === 'key_events'));
  assert.ok(db.prepare("PRAGMA table_info('ga4_dimension_daily')").all().some((column) => column.name === 'key_events'));

  const overview = repo.ga4Overview({ start_date: '2026-08-01', end_date: '2026-08-01', ga4_property_id: '123456789' });
  assert.equal(overview.metrics.keyEvents, 3);
  assert.equal(overview.metrics.bounceRate, 40);
  assert.equal(overview.metrics.avgDuration, 60);
  assert.equal(overview.landingPages[0].conversions, 2);
  assert.equal(overview.campaigns[0].campaign, 'Foundry Leads');
  assert.equal(overview.campaigns[0].conversions, 1);
  assert.equal(overview.eventCoverage.rowCount, 3);
  assert.deepEqual(overview.conversionEvents.map((event) => event.eventName), ['form_submit', 'custom_quote_request']);
  assert.equal(overview.conversionEvents[0].label, '表单提交');
  assert.equal(overview.conversionEvents[1].label, '自定义关键事件');
  assert.equal(overview.conversionEvents.some((event) => event.eventName === 'page_view'), false);

  const { buildApp } = await import('../src/index.js');
  const app = await buildApp();
  try {
    const token = app.jwt.sign({ id: 1, username: 'test', name: 'Test', role: 'boss' });
    const response = await app.inject({
      method: 'GET',
      url: '/api/ga4/overview?start_date=2026-08-01&end_date=2026-08-01',
      headers: { cookie: `ferr_token=${token}` },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().conversionEvents[0].label, '表单提交');
    assert.equal(response.json().landingPages[0].conversions, 2);
  } finally {
    await app.close();
  }
});

test('GA4 range replacement removes stale rows and preserves prior data when a report fails', async () => {
  resetGa4Data();
  repo.upsertGa4Daily([{
    date: '2026-08-02', property_id: '123456789', active_users: 7, sessions: 8, page_views: 9,
    key_events: 1, bounce_rate: 0.5, avg_session_duration: 30, sync_run_id: null,
  }]);
  repo.upsertGa4Events([{
    date: '2026-08-02', property_id: '123456789', event_name: 'obsolete_event', event_count: 1,
    total_users: 1, key_events: 1, sync_run_id: null,
  }]);

  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    const body = JSON.parse(init.body);
    const dimensions = body.dimensions.map((item) => item.name);
    if (dimensions.includes('eventName')) {
      return new Response(JSON.stringify({ error: { message: 'event report unavailable' } }), {
        status: 503, headers: { 'content-type': 'application/json' },
      });
    }
    const second = dimensions[1];
    const metrics = second ? [1, 2, 3, 0.25, 20, 0] : [1, 2, 3, 0.25, 20, 0];
    return new Response(JSON.stringify({ rows: [reportRow(['20260802', ...(second ? ['value'] : [])], metrics)] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };

  try {
    await assert.rejects(() => syncGa4({ start_date: '2026-08-02', end_date: '2026-08-02' }), /event report unavailable/);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls, 7);
  assert.equal(db.prepare("SELECT sessions FROM ga4_daily WHERE date='2026-08-02'").get().sessions, 8);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM ga4_event_daily WHERE event_name='obsolete_event'").get().count, 1);
  assert.equal(db.prepare("SELECT status FROM google_sync_runs ORDER BY id DESC LIMIT 1").get().status, 'failed');
});

test('Hermes exposes a GA4 event data gap and event-level evidence without equating events to inquiries', () => {
  resetGa4Data();
  const date = localDate();
  repo.upsertGa4Daily([{
    date, property_id: '123456789', active_users: 12, sessions: 15, page_views: 20,
    key_events: 0, bounce_rate: 0.3, avg_session_duration: 45, sync_run_id: null,
  }]);

  const gap = buildOpsDiagnosis({ role: 'boss' }, '今天 GA4 表现');
  assert.ok(gap.missingData.includes('ga4_events'));
  assert.ok(gap.evidencePack.some((item) => item.metric === 'ga4_event_coverage' && item.dataRole === 'data_gap'));

  repo.upsertGa4Events([{
    date, property_id: '123456789', event_name: 'form_submit', event_count: 5,
    total_users: 4, key_events: 4, sync_run_id: null,
  }]);
  const grounded = buildOpsDiagnosis({ role: 'boss' }, '今天 GA4 表现');
  const evidence = grounded.evidencePack.find((item) => item.metric === 'ga4_event_count_key_events');
  assert.ok(evidence);
  assert.equal(evidence.granularity, 'event');
  assert.equal(evidence.dataRole, 'synced_event_observation');
  assert.match(evidence.value, /event_name=form_submit/);
  assert.match(evidence.value, /crm_attribution=not_checked/);
  assert.equal(grounded.missingData.includes('ga4_events'), false);
});
