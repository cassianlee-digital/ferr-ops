# Google Sync API Contract

Backend owner: Codex. Frontend owner: Claude.

The frontend should call these app APIs only. It should not handle Google tokens, developer tokens, client secrets, or direct Google API calls.

## Setup

Required environment variables:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GSC_SITE_URL`
- `GA4_PROPERTY_ID`
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_CUSTOMER_ID`

Optional:

- `GOOGLE_ADS_LOGIN_CUSTOMER_ID`
- `GOOGLE_ADS_API_VERSION`, default `v19`

Redirect URI example:

```text
https://your-domain.com/api/google/auth/callback
```

## Status

```http
GET /api/google/status
```

Response shape:

```json
{
  "providers": {
    "gsc": {
      "configured": true,
      "missing": [],
      "authorized": false,
      "tokenUpdatedAt": null,
      "lastSyncAt": null,
      "lastSyncStatus": null,
      "lastError": null,
      "siteUrlConfigured": true
    }
  }
}
```

Frontend behavior:

- `configured=false`: show the missing setup items.
- `authorized=false`: show "Connect Google".
- `lastSyncStatus=failed`: show `lastError`.
- Never show demo data for Google sources.

## OAuth

Start authorization by navigating the browser to one of:

```text
/api/google/auth/start?provider=gsc
/api/google/auth/start?provider=ga4
/api/google/auth/start?provider=ads
```

After success, the backend redirects to:

```text
/?google_auth=success&provider={provider}
```

Disconnect:

```http
DELETE /api/google/auth/{provider}
```

## Manual Sync

All sync endpoints accept optional `start_date` and `end_date` in `YYYY-MM-DD`.

```http
POST /api/sync/gsc
POST /api/sync/ga4
POST /api/sync/ads
```

Body example:

```json
{
  "start_date": "2026-06-01",
  "end_date": "2026-06-23"
}
```

Success:

```json
{
  "provider": "ga4",
  "runId": 12,
  "range": {
    "start_date": "2026-06-01",
    "end_date": "2026-06-23"
  },
  "rowsWritten": 128
}
```

Failure:

```json
{
  "provider": "ads",
  "error": "google_config_missing",
  "missing": ["GOOGLE_ADS_CUSTOMER_ID"]
}
```

## Read APIs

```http
GET /api/google/gsc/summary?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
GET /api/google/ga4/overview?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
GET /api/google/ads/summary?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
```

Legacy GA4 alias:

```http
GET /api/ga4/overview
```

## Frontend Safety Rules

- Do not render Google text with raw `innerHTML`.
- Do not call Google APIs from the browser.
- Do not store OAuth tokens, client secrets, or developer tokens in frontend state.
- Empty data means empty state, not sample charts.
