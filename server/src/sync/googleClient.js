import { config } from '../config.js';
import * as repo from '../db/repositories/googleSync.js';

export const SCOPES = {
  gsc: ['https://www.googleapis.com/auth/webmasters.readonly'],
  ga4: ['https://www.googleapis.com/auth/analytics.readonly'],
  ads: ['https://www.googleapis.com/auth/adwords'],
};

export function providerConfig(provider) {
  const missing = [];
  if (!config.google.clientId) missing.push('GOOGLE_OAUTH_CLIENT_ID');
  if (!config.google.clientSecret) missing.push('GOOGLE_OAUTH_CLIENT_SECRET');
  if (!config.google.redirectUri) missing.push('GOOGLE_OAUTH_REDIRECT_URI');
  if (provider === 'gsc' && !config.google.gscSiteUrl) missing.push('GSC_SITE_URL');
  if (provider === 'ga4' && !config.google.ga4PropertyId) missing.push('GA4_PROPERTY_ID');
  if (provider === 'ads') {
    if (!config.google.adsDeveloperToken) missing.push('GOOGLE_ADS_DEVELOPER_TOKEN');
    if (!config.google.adsCustomerId) missing.push('GOOGLE_ADS_CUSTOMER_ID');
  }
  return { ready: missing.length === 0, missing };
}

export function buildAuthUrl(provider) {
  repo.assertProvider(provider);
  const pc = providerConfig(provider);
  if (!pc.ready) {
    const err = new Error('google_config_missing');
    err.missing = pc.missing;
    throw err;
  }
  const state = repo.createState(provider);
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: 'code',
    scope: SCOPES[provider].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCode(provider, code) {
  repo.assertProvider(provider);
  const token = await tokenRequest({
    code,
    client_id: config.google.clientId,
    client_secret: config.google.clientSecret,
    redirect_uri: config.google.redirectUri,
    grant_type: 'authorization_code',
  });
  repo.saveToken(provider, token);
  return token;
}

async function refreshAccessToken(provider, refreshToken) {
  const token = await tokenRequest({
    refresh_token: refreshToken,
    client_id: config.google.clientId,
    client_secret: config.google.clientSecret,
    grant_type: 'refresh_token',
  });
  repo.saveToken(provider, token);
  return token.access_token;
}

async function tokenRequest(body) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error_description || json.error || 'google_token_error');
    err.status = res.status;
    throw err;
  }
  return json;
}

export async function getAccessToken(provider) {
  repo.assertProvider(provider);
  const token = repo.getToken(provider);
  if (!token?.refresh_token) throw new Error('google_not_authorized');
  if (token.access_token && token.expiry_date_ms && token.expiry_date_ms > Date.now() + 60_000) {
    return token.access_token;
  }
  return refreshAccessToken(provider, token.refresh_token);
}

export async function googleJson(provider, url, options = {}) {
  const first = await requestWithAuth(provider, url, options);
  if (first.status !== 401) return parseGoogleResponse(first);

  const token = repo.getToken(provider);
  if (token?.refresh_token) await refreshAccessToken(provider, token.refresh_token);
  const second = await requestWithAuth(provider, url, options);
  return parseGoogleResponse(second);
}

async function requestWithAuth(provider, url, options) {
  const accessToken = await getAccessToken(provider);
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      authorization: `Bearer ${accessToken}`,
    },
  });
}

async function parseGoogleResponse(res) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error?.message || json.error_description || json.error || `google_http_${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

export function defaultRange(days = 7) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return {
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
  };
}

export function normalizeRange(input = {}) {
  const fallback = defaultRange();
  const start = String(input.start_date || input.startDate || fallback.start_date).slice(0, 10);
  const end = String(input.end_date || input.endDate || fallback.end_date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
    throw new Error('bad_date_range');
  }
  return { start_date: start, end_date: end };
}
