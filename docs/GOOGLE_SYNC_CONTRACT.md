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
- `GOOGLE_ADS_API_VERSION`, default `v24.1`

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

The response also includes:

```json
{
  "projects": [],
  "defaultProject": null
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

All sync endpoints accept optional `start_date`, `end_date`, and `project_id`.

```http
POST /api/sync/gsc
POST /api/sync/ga4
POST /api/sync/ads
```

Body example:

```json
{
  "project_id": 1,
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

## Google Projects

Use projects to map one operational website/business unit to its GSC, GA4, and Ads identifiers.

```http
GET /api/google/projects
POST /api/google/projects
PATCH /api/google/projects/{id}
DELETE /api/google/projects/{id}
```

Create body:

```json
{
  "name": "FERR Casting",
  "gsc_site_url": "sc-domain:ferrcasting.com",
  "ga4_property_id": "435505484",
  "ads_customer_id": "6644120786",
  "is_default": true
}
```

Frontend should show a project selector and pass `project_id` into sync and read APIs. If `project_id` is omitted, the backend uses the default active project. If no project exists, the backend falls back to the legacy `.env` values.

## Read APIs

```http
GET /api/google/gsc/summary?project_id=1&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
GET /api/google/ga4/overview?project_id=1&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
GET /api/google/ads/summary?project_id=1&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
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
