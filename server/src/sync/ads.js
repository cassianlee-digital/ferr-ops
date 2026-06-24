import { config } from '../config.js';
import * as repo from '../db/repositories/googleSync.js';
import { getAccessToken, normalizeRange, providerConfig } from './googleClient.js';

function adsHeaders(accessToken) {
  const headers = {
    authorization: `Bearer ${accessToken}`,
    'developer-token': config.google.adsDeveloperToken,
    'content-type': 'application/json',
  };
  if (config.google.adsLoginCustomerId) headers['login-customer-id'] = config.google.adsLoginCustomerId;
  return headers;
}

async function searchStream(query) {
  const accessToken = await getAccessToken('ads');
  const url = `https://googleads.googleapis.com/${config.google.adsApiVersion}/customers/${config.google.adsCustomerId}/googleAds:searchStream`;
  const res = await fetch(url, {
    method: 'POST',
    headers: adsHeaders(accessToken),
    body: JSON.stringify({ query }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error?.message || `google_ads_http_${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return Array.isArray(json) ? json.flatMap((batch) => batch.results || []) : (json.results || []);
}

const micros = (v) => (v == null || v === '' ? 0 : Math.round(Number(v)));
const num = (v) => (v == null || v === '' ? 0 : Number(v));

function campaignRow(r, runId) {
  return {
    date: r.segments?.date,
    customer_id: config.google.adsCustomerId,
    campaign_id: String(r.campaign?.id || ''),
    campaign_name: r.campaign?.name || '',
    cost_micros: micros(r.metrics?.costMicros),
    impressions: Math.round(num(r.metrics?.impressions)),
    clicks: Math.round(num(r.metrics?.clicks)),
    conversions: num(r.metrics?.conversions),
    ctr: r.metrics?.ctr == null ? null : Number(r.metrics.ctr),
    average_cpc_micros: r.metrics?.averageCpc == null ? null : micros(r.metrics.averageCpc),
    cost_per_conversion_micros: r.metrics?.costPerConversion == null ? null : micros(r.metrics.costPerConversion),
    sync_run_id: runId,
  };
}

function keywordRow(r, runId) {
  const base = campaignRow(r, runId);
  return {
    ...base,
    ad_group_id: String(r.adGroup?.id || ''),
    criterion_id: String(r.adGroupCriterion?.criterionId || ''),
    keyword_text: r.adGroupCriterion?.keyword?.text || '',
    match_type: r.adGroupCriterion?.keyword?.matchType || '',
  };
}

export async function syncAds(input = {}) {
  const pc = providerConfig('ads');
  if (!pc.ready) {
    const err = new Error('google_config_missing');
    err.missing = pc.missing;
    throw err;
  }
  const range = normalizeRange(input);
  const runId = repo.beginRun('ads', range.start_date, range.end_date);
  try {
    const campaignQuery = `
      SELECT
        segments.date,
        campaign.id,
        campaign.name,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.ctr,
        metrics.average_cpc,
        metrics.cost_per_conversion
      FROM campaign
      WHERE segments.date BETWEEN '${range.start_date}' AND '${range.end_date}'
      ORDER BY segments.date ASC
    `;
    const campaigns = (await searchStream(campaignQuery)).map((r) => campaignRow(r, runId)).filter((r) => r.date && r.campaign_id);

    const keywordQuery = `
      SELECT
        segments.date,
        campaign.id,
        campaign.name,
        ad_group.id,
        ad_group_criterion.criterion_id,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.ctr,
        metrics.average_cpc,
        metrics.cost_per_conversion
      FROM keyword_view
      WHERE segments.date BETWEEN '${range.start_date}' AND '${range.end_date}'
      ORDER BY segments.date ASC
    `;
    const keywords = (await searchStream(keywordQuery)).map((r) => keywordRow(r, runId)).filter((r) => r.date && r.criterion_id);

    const rowsWritten = repo.upsertAdsCampaigns(campaigns) + repo.upsertAdsKeywords(keywords);
    repo.finishRun(runId, rowsWritten);
    return { provider: 'ads', runId, range, rowsWritten };
  } catch (e) {
    repo.failRun(runId, e.message || e);
    throw e;
  }
}
