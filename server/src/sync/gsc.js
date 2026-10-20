// Search Console 同步：每日汇总与「查询词 × 页面」明细落库。
import * as repo from '../db/repositories/googleSync.js';
import { googleJson, normalizeRange, projectProviderConfig, resolveProject } from './googleClient.js';

const endpoint = (siteUrl) =>
  `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

function key(row, index) {
  return row.keys?.[index] ?? null;
}

async function querySearchAnalytics(siteUrl, body) {
  return googleJson('gsc', endpoint(siteUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/* 明细（日期 × 查询词 × 页面）要翻页取全。
   接口一次最多回 25000 行，以前只取第一页：区间一长（比如补 90 天历史）后面的行就悄悄没了，
   落库的点击数比 Search Console 里少，而且没有任何报错。
   翻到取不满一页为止；真翻到上限还没完，如实标 truncated，由调用方告诉用户「这一段没取全，缩短区间重取」。 */
const PAGE_SIZE = 25000;
const MAX_PAGES = 20;
async function queryAllRows(siteUrl, body) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const got = (await querySearchAnalytics(siteUrl, { ...body, rowLimit: PAGE_SIZE, startRow: page * PAGE_SIZE })).rows || [];
    rows.push(...got);
    if (got.length < PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

export async function syncGsc(input = {}) {
  const project = resolveProject(input);
  const pc = projectProviderConfig('gsc', project);
  if (!pc.ready) {
    const err = new Error('google_config_missing');
    err.missing = pc.missing;
    throw err;
  }
  const range = normalizeRange(input);
  const runId = repo.beginProjectRun('gsc', project.id, range.start_date, range.end_date);
  try {
    const daily = await querySearchAnalytics(project.gsc_site_url, {
      startDate: range.start_date,
      endDate: range.end_date,
      dimensions: ['date'],
      rowLimit: 25000,
      type: 'web',
    });
    const dailyRows = (daily.rows || []).map((r) => ({
      date: key(r, 0),
      site_url: project.gsc_site_url,
      clicks: Math.round(Number(r.clicks || 0)),
      impressions: Math.round(Number(r.impressions || 0)),
      ctr: r.ctr == null ? null : Number(r.ctr),
      position: r.position == null ? null : Number(r.position),
      sync_run_id: runId,
    })).filter((r) => r.date);

    const query = await queryAllRows(project.gsc_site_url, {
      startDate: range.start_date,
      endDate: range.end_date,
      dimensions: ['date', 'query', 'page'],
      type: 'web',
    });
    const queryRows = query.rows.map((r) => ({
      date: key(r, 0),
      site_url: project.gsc_site_url,
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
    return { provider: 'gsc', project, runId, range, rowsWritten, truncated: query.truncated };
  } catch (e) {
    repo.failRun(runId, e.message || e);
    throw e;
  }
}
