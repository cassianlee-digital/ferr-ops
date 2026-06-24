import { config } from '../config.js';
import * as repo from '../db/repositories/googleSync.js';
import { googleJson, normalizeRange, providerConfig } from './googleClient.js';

const endpoint = (siteUrl) =>
  `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

function key(row, index) {
  return row.keys?.[index] ?? null;
}

async function querySearchAnalytics(body) {
  return googleJson('gsc', endpoint(config.google.gscSiteUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function syncGsc(input = {}) {
  const pc = providerConfig('gsc');
  if (!pc.ready) {
    const err = new Error('google_config_missing');
    err.missing = pc.missing;
    throw err;
  }
  const range = normalizeRange(input);
  const runId = repo.beginRun('gsc', range.start_date, range.end_date);
  try {
    const daily = await querySearchAnalytics({
      startDate: range.start_date,
      endDate: range.end_date,
      dimensions: ['date'],
      rowLimit: 25000,
      type: 'web',
    });
    const dailyRows = (daily.rows || []).map((r) => ({
      date: key(r, 0),
      site_url: config.google.gscSiteUrl,
      clicks: Math.round(Number(r.clicks || 0)),
      impressions: Math.round(Number(r.impressions || 0)),
      ctr: r.ctr == null ? null : Number(r.ctr),
      position: r.position == null ? null : Number(r.position),
      sync_run_id: runId,
    })).filter((r) => r.date);

    const query = await querySearchAnalytics({
      startDate: range.start_date,
      endDate: range.end_date,
      dimensions: ['date', 'query', 'page'],
      rowLimit: 25000,
      type: 'web',
    });
    const queryRows = (query.rows || []).map((r) => ({
      date: key(r, 0),
      site_url: config.google.gscSiteUrl,
      query: key(r, 1) || '',
      page: key(r, 2) || '',
      clicks: Math.round(Number(r.clicks || 0)),
      impressions: Math.round(Number(r.impressions || 0)),
      ctr: r.ctr == null ? null : Number(r.ctr),
      position: r.position == null ? null : Number(r.position),
      sync_run_id: runId,
    })).filter((r) => r.date && r.query);

    const rowsWritten = repo.upsertGscDaily(dailyRows) + repo.upsertGscQueries(queryRows);
    repo.finishRun(runId, rowsWritten);
    return { provider: 'gsc', runId, range, rowsWritten };
  } catch (e) {
    repo.failRun(runId, e.message || e);
    throw e;
  }
}
