import { config } from '../config.js';
import * as repo from '../db/repositories/googleSync.js';
import { googleJson, normalizeRange, providerConfig } from './googleClient.js';

function gaDate(s) {
  return String(s || '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
}

function metric(row, index) {
  return Number(row.metricValues?.[index]?.value || 0);
}

function dimension(row, index) {
  return row.dimensionValues?.[index]?.value || '';
}

async function runReport(body) {
  const propertyId = config.google.ga4PropertyId;
  return googleJson('ga4', `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function dimensionReport(type, dimensionName, range, runId) {
  const res = await runReport({
    dateRanges: [{ startDate: range.start_date, endDate: range.end_date }],
    dimensions: [{ name: 'date' }, { name: dimensionName }],
    metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }],
    limit: 25000,
  });
  return (res.rows || []).map((r) => ({
    date: gaDate(dimension(r, 0)),
    property_id: config.google.ga4PropertyId,
    dimension_type: type,
    dimension_value: dimension(r, 1) || '(not set)',
    active_users: Math.round(metric(r, 0)),
    sessions: Math.round(metric(r, 1)),
    page_views: Math.round(metric(r, 2)),
    sync_run_id: runId,
  })).filter((r) => r.date);
}

export async function syncGa4(input = {}) {
  const pc = providerConfig('ga4');
  if (!pc.ready) {
    const err = new Error('google_config_missing');
    err.missing = pc.missing;
    throw err;
  }
  const range = normalizeRange(input);
  const runId = repo.beginRun('ga4', range.start_date, range.end_date);
  try {
    const daily = await runReport({
      dateRanges: [{ startDate: range.start_date, endDate: range.end_date }],
      dimensions: [{ name: 'date' }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
      ],
      limit: 25000,
    });
    const dailyRows = (daily.rows || []).map((r) => ({
      date: gaDate(dimension(r, 0)),
      property_id: config.google.ga4PropertyId,
      active_users: Math.round(metric(r, 0)),
      sessions: Math.round(metric(r, 1)),
      page_views: Math.round(metric(r, 2)),
      bounce_rate: metric(r, 3),
      avg_session_duration: metric(r, 4),
      sync_run_id: runId,
    })).filter((r) => r.date);

    const dims = [
      ...(await dimensionReport('source_medium', 'sessionSourceMedium', range, runId)),
      ...(await dimensionReport('country', 'country', range, runId)),
      ...(await dimensionReport('device', 'deviceCategory', range, runId)),
      ...(await dimensionReport('landing_page', 'landingPagePlusQueryString', range, runId)),
    ];

    const rowsWritten = repo.upsertGa4Daily(dailyRows) + repo.upsertGa4Dimensions(dims);
    repo.finishRun(runId, rowsWritten);
    return { provider: 'ga4', runId, range, rowsWritten };
  } catch (e) {
    repo.failRun(runId, e.message || e);
    throw e;
  }
}
