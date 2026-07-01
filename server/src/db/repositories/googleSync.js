import crypto from 'node:crypto';
import { db } from '../connection.js';
import { encrypt, decrypt } from '../../services/crypto.js';

export const PROVIDERS = ['gsc', 'ga4', 'ads'];

export function assertProvider(provider) {
  if (!PROVIDERS.includes(provider)) throw new Error('bad_provider');
}

export function createState(provider) {
  assertProvider(provider);
  const state = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO google_oauth_states (state, provider) VALUES (?, ?)').run(state, provider);
  return state;
}

export function consumeState(state) {
  const row = db.prepare('SELECT state, provider FROM google_oauth_states WHERE state = ?').get(state);
  if (!row) return null;
  db.prepare('DELETE FROM google_oauth_states WHERE state = ?').run(state);
  db.prepare("DELETE FROM google_oauth_states WHERE created_at < datetime('now', '-20 minutes')").run();
  return row.provider;
}

export function saveToken(provider, token) {
  assertProvider(provider);
  const current = getToken(provider);
  const refreshToken = token.refresh_token || current?.refresh_token || '';
  db.prepare(
    `INSERT INTO google_oauth_tokens
     (provider, access_token_enc, refresh_token_enc, scope, token_type, expiry_date_ms, updated_at)
     VALUES (@provider, @access_token_enc, @refresh_token_enc, @scope, @token_type, @expiry_date_ms, datetime('now'))
     ON CONFLICT(provider) DO UPDATE SET
       access_token_enc=excluded.access_token_enc,
       refresh_token_enc=excluded.refresh_token_enc,
       scope=excluded.scope,
       token_type=excluded.token_type,
       expiry_date_ms=excluded.expiry_date_ms,
       updated_at=excluded.updated_at`
  ).run({
    provider,
    access_token_enc: encrypt(token.access_token || ''),
    refresh_token_enc: encrypt(refreshToken),
    scope: token.scope || current?.scope || '',
    token_type: token.token_type || current?.token_type || 'Bearer',
    expiry_date_ms: token.expiry_date_ms || (token.expires_in ? Date.now() + Number(token.expires_in) * 1000 : null),
  });
}

export function getToken(provider) {
  assertProvider(provider);
  const row = db.prepare('SELECT * FROM google_oauth_tokens WHERE provider = ?').get(provider);
  if (!row) return null;
  return {
    provider: row.provider,
    access_token: decrypt(row.access_token_enc),
    refresh_token: decrypt(row.refresh_token_enc),
    scope: row.scope,
    token_type: row.token_type,
    expiry_date_ms: row.expiry_date_ms,
    updated_at: row.updated_at,
  };
}

export function deleteToken(provider) {
  assertProvider(provider);
  db.prepare('DELETE FROM google_oauth_tokens WHERE provider = ?').run(provider);
}

export function tokenStatus() {
  const rows = db.prepare('SELECT provider, refresh_token_enc, scope, expiry_date_ms, updated_at FROM google_oauth_tokens').all();
  const out = {};
  for (const p of PROVIDERS) out[p] = { authorized: false, scope: '', expiresAt: null, updatedAt: null };
  for (const row of rows) {
    out[row.provider] = {
      authorized: !!row.refresh_token_enc,
      scope: row.scope || '',
      expiresAt: row.expiry_date_ms ? new Date(row.expiry_date_ms).toISOString() : null,
      updatedAt: row.updated_at,
    };
  }
  return out;
}

export function beginRun(provider, dateStart, dateEnd) {
  assertProvider(provider);
  const info = db
    .prepare('INSERT INTO google_sync_runs (provider, status, date_start, date_end) VALUES (?, ?, ?, ?)')
    .run(provider, 'running', dateStart || null, dateEnd || null);
  return info.lastInsertRowid;
}

export function finishRun(id, rowsWritten) {
  db.prepare(
    `UPDATE google_sync_runs
     SET status='success', finished_at=datetime('now'), rows_written=?, error=NULL
     WHERE id=?`
  ).run(rowsWritten || 0, id);
}

export function failRun(id, error) {
  db.prepare(
    `UPDATE google_sync_runs
     SET status='failed', finished_at=datetime('now'), error=?
     WHERE id=?`
  ).run(String(error || 'sync_failed').slice(0, 1000), id);
}

export function latestRuns() {
  const out = {};
  for (const p of PROVIDERS) {
    out[p] = db
      .prepare('SELECT * FROM google_sync_runs WHERE provider = ? ORDER BY started_at DESC, id DESC LIMIT 1')
      .get(p) || null;
  }
  return out;
}

function parseProject(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    gsc_site_url: row.gsc_site_url || '',
    ga4_property_id: row.ga4_property_id || '',
    ads_customer_id: row.ads_customer_id || '',
    is_default: !!row.is_default,
    active: !!row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function listProjects() {
  return db
    .prepare('SELECT * FROM google_projects WHERE active = 1 ORDER BY is_default DESC, id ASC')
    .all()
    .map(parseProject);
}

export function getProject(id) {
  return parseProject(db.prepare('SELECT * FROM google_projects WHERE id = ? AND active = 1').get(id));
}

export function getDefaultProject() {
  return parseProject(
    db.prepare('SELECT * FROM google_projects WHERE active = 1 ORDER BY is_default DESC, id ASC LIMIT 1').get()
  );
}

export function createProject(input) {
  const isDefault = input.is_default ? 1 : 0;
  const tx = db.transaction(() => {
    if (isDefault) db.prepare('UPDATE google_projects SET is_default = 0').run();
    const info = db.prepare(
      `INSERT INTO google_projects
       (name, gsc_site_url, ga4_property_id, ads_customer_id, is_default, active, updated_at)
       VALUES (@name, @gsc_site_url, @ga4_property_id, @ads_customer_id, @is_default, 1, datetime('now'))`
    ).run({
      name: String(input.name || '').trim(),
      gsc_site_url: String(input.gsc_site_url || '').trim(),
      ga4_property_id: String(input.ga4_property_id || '').trim(),
      ads_customer_id: String(input.ads_customer_id || '').replace(/-/g, '').trim(),
      is_default: isDefault,
    });
    if (!isDefault && db.prepare('SELECT COUNT(*) count FROM google_projects WHERE active = 1').get().count === 1) {
      db.prepare('UPDATE google_projects SET is_default = 1 WHERE id = ?').run(info.lastInsertRowid);
    }
    return info.lastInsertRowid;
  });
  return getProject(tx());
}

export function updateProject(id, input) {
  const cur = getProject(id);
  if (!cur) return null;
  const next = {
    id,
    name: input.name !== undefined ? String(input.name || '').trim() : cur.name,
    gsc_site_url: input.gsc_site_url !== undefined ? String(input.gsc_site_url || '').trim() : cur.gsc_site_url,
    ga4_property_id: input.ga4_property_id !== undefined ? String(input.ga4_property_id || '').trim() : cur.ga4_property_id,
    ads_customer_id: input.ads_customer_id !== undefined ? String(input.ads_customer_id || '').replace(/-/g, '').trim() : cur.ads_customer_id,
    is_default: input.is_default !== undefined ? (input.is_default ? 1 : 0) : (cur.is_default ? 1 : 0),
  };
  db.transaction(() => {
    if (next.is_default) db.prepare('UPDATE google_projects SET is_default = 0').run();
    db.prepare(
      `UPDATE google_projects
       SET name=@name, gsc_site_url=@gsc_site_url, ga4_property_id=@ga4_property_id,
           ads_customer_id=@ads_customer_id, is_default=@is_default, updated_at=datetime('now')
       WHERE id=@id`
    ).run(next);
  })();
  return getProject(id);
}

export function deleteProject(id) {
  db.prepare('UPDATE google_projects SET active = 0, is_default = 0, updated_at=datetime(\'now\') WHERE id = ?').run(id);
}

export function latestProjectRuns(projectId) {
  const out = {};
  for (const p of PROVIDERS) {
    out[p] = db
      .prepare(
        `SELECT * FROM google_sync_runs
         WHERE provider = @provider AND ((@projectId IS NULL AND project_id IS NULL) OR project_id = @projectId)
         ORDER BY started_at DESC, id DESC LIMIT 1`
      )
      .get({ provider: p, projectId: projectId ?? null }) || null;
  }
  return out;
}

export function beginProjectRun(provider, projectId, dateStart, dateEnd) {
  assertProvider(provider);
  const info = db
    .prepare('INSERT INTO google_sync_runs (provider, project_id, status, date_start, date_end) VALUES (?, ?, ?, ?, ?)')
    .run(provider, projectId || null, 'running', dateStart || null, dateEnd || null);
  return info.lastInsertRowid;
}

export function upsertGscDaily(rows) {
  const stmt = db.prepare(
    `INSERT INTO gsc_daily
     (date, site_url, clicks, impressions, ctr, position, sync_run_id, updated_at)
     VALUES (@date, @site_url, @clicks, @impressions, @ctr, @position, @sync_run_id, datetime('now'))
     ON CONFLICT(date, site_url) DO UPDATE SET
       clicks=excluded.clicks, impressions=excluded.impressions, ctr=excluded.ctr,
       position=excluded.position, sync_run_id=excluded.sync_run_id, updated_at=excluded.updated_at`
  );
  db.transaction((items) => items.forEach((r) => stmt.run(r)))(rows);
  return rows.length;
}

export function upsertGscQueries(rows) {
  const stmt = db.prepare(
    `INSERT INTO gsc_query_daily
     (date, site_url, query, page, clicks, impressions, ctr, position, sync_run_id, updated_at)
     VALUES (@date, @site_url, @query, @page, @clicks, @impressions, @ctr, @position, @sync_run_id, datetime('now'))
     ON CONFLICT(date, site_url, query, page) DO UPDATE SET
       clicks=excluded.clicks, impressions=excluded.impressions, ctr=excluded.ctr,
       position=excluded.position, sync_run_id=excluded.sync_run_id, updated_at=excluded.updated_at`
  );
  db.transaction((items) => items.forEach((r) => stmt.run(r)))(rows);
  return rows.length;
}

export function gscSummary(range) {
  const params = { start: range.start_date, end: range.end_date, siteUrl: range.gsc_site_url || null };
  const totals = db
    .prepare(
      `SELECT COALESCE(SUM(clicks),0) clicks, COALESCE(SUM(impressions),0) impressions,
              CASE WHEN SUM(impressions) > 0 THEN SUM(clicks) * 1.0 / SUM(impressions) ELSE NULL END ctr,
              CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) / SUM(impressions) ELSE NULL END position
       FROM gsc_daily WHERE date BETWEEN @start AND @end AND (@siteUrl IS NULL OR site_url = @siteUrl)`
    )
    .get(params);
  const byDate = db.prepare('SELECT * FROM gsc_daily WHERE date BETWEEN @start AND @end AND (@siteUrl IS NULL OR site_url = @siteUrl) ORDER BY date ASC').all(params);
  const topQueries = db
    .prepare(
      `SELECT query, page, SUM(clicks) clicks, SUM(impressions) impressions,
              CASE WHEN SUM(impressions) > 0 THEN SUM(clicks) * 1.0 / SUM(impressions) ELSE NULL END ctr,
              CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) / SUM(impressions) ELSE NULL END position
       FROM gsc_query_daily
       WHERE date BETWEEN @start AND @end AND (@siteUrl IS NULL OR site_url = @siteUrl)
       GROUP BY query, page
       ORDER BY clicks DESC, impressions DESC
       LIMIT 50`
    )
    .all(params);
  // 按页面聚合（页面明细表用），曝光加权排名
  const topPages = db
    .prepare(
      `SELECT page, SUM(clicks) clicks, SUM(impressions) impressions,
              CASE WHEN SUM(impressions) > 0 THEN SUM(clicks) * 1.0 / SUM(impressions) ELSE NULL END ctr,
              CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) / SUM(impressions) ELSE NULL END position
       FROM gsc_query_daily
       WHERE date BETWEEN @start AND @end AND (@siteUrl IS NULL OR site_url = @siteUrl)
       GROUP BY page
       ORDER BY clicks DESC, impressions DESC
       LIMIT 50`
    )
    .all(params);
  // 区间内出现过的去重关键词数（“关键词覆盖”卡）
  const queryCount = db
    .prepare(
      `SELECT COUNT(DISTINCT query) n FROM gsc_query_daily
       WHERE date BETWEEN @start AND @end AND (@siteUrl IS NULL OR site_url = @siteUrl)`
    )
    .get(params).n;
  return { totals, byDate, topQueries, topPages, queryCount };
}

export function upsertGa4Daily(rows) {
  const stmt = db.prepare(
    `INSERT INTO ga4_daily
     (date, property_id, active_users, sessions, page_views, bounce_rate, avg_session_duration, sync_run_id, updated_at)
     VALUES (@date, @property_id, @active_users, @sessions, @page_views, @bounce_rate, @avg_session_duration, @sync_run_id, datetime('now'))
     ON CONFLICT(date, property_id) DO UPDATE SET
       active_users=excluded.active_users, sessions=excluded.sessions, page_views=excluded.page_views,
       bounce_rate=excluded.bounce_rate, avg_session_duration=excluded.avg_session_duration,
       sync_run_id=excluded.sync_run_id, updated_at=excluded.updated_at`
  );
  db.transaction((items) => items.forEach((r) => stmt.run(r)))(rows);
  return rows.length;
}

export function upsertGa4Dimensions(rows) {
  const stmt = db.prepare(
    `INSERT INTO ga4_dimension_daily
     (date, property_id, dimension_type, dimension_value, active_users, sessions, page_views, bounce_rate, avg_session_duration, sync_run_id, updated_at)
     VALUES (@date, @property_id, @dimension_type, @dimension_value, @active_users, @sessions, @page_views, @bounce_rate, @avg_session_duration, @sync_run_id, datetime('now'))
     ON CONFLICT(date, property_id, dimension_type, dimension_value) DO UPDATE SET
       active_users=excluded.active_users, sessions=excluded.sessions, page_views=excluded.page_views,
       bounce_rate=excluded.bounce_rate, avg_session_duration=excluded.avg_session_duration,
       sync_run_id=excluded.sync_run_id, updated_at=excluded.updated_at`
  );
  db.transaction((items) => items.forEach((r) => stmt.run(r)))(rows);
  return rows.length;
}

export function ga4Overview(range) {
  const params = { start: range.start_date, end: range.end_date, propertyId: range.ga4_property_id || null };
  const m = db
    .prepare(
      `SELECT COALESCE(SUM(active_users),0) activeUsers, COALESCE(SUM(sessions),0) sessions,
              COALESCE(SUM(page_views),0) pageViews, AVG(bounce_rate) * 100 bounceRate,
              AVG(avg_session_duration) avgDuration
       FROM ga4_daily WHERE date BETWEEN @start AND @end AND (@propertyId IS NULL OR property_id = @propertyId)`
    )
    .get(params);
  const dim = (type) =>
    db
      .prepare(
        `SELECT dimension_value value, SUM(sessions) sessions, SUM(active_users) users, SUM(page_views) pageViews
         FROM ga4_dimension_daily
         WHERE date BETWEEN @start AND @end AND dimension_type = @type AND (@propertyId IS NULL OR property_id = @propertyId)
         GROUP BY dimension_value
         ORDER BY sessions DESC
         LIMIT 50`
      )
      .all({ ...params, type });
  return {
    metrics: m && (m.activeUsers || m.sessions || m.pageViews) ? m : null,
    sources: dim('source_medium').map((r) => ({ source: r.value, sessions: r.sessions, users: r.users })),
    countries: dim('country').map((r) => ({ country: r.value, sessions: r.sessions, users: r.users })),
    devices: dim('device').map((r) => ({ device: r.value, sessions: r.sessions, users: r.users })),
    landingPages: dim('landing_page').map((r) => ({ page: r.value, sessions: r.sessions, conversions: null })),
  };
}

export function upsertAdsCampaigns(rows) {
  const stmt = db.prepare(
    `INSERT INTO google_ads_campaign_daily
     (date, customer_id, campaign_id, campaign_name, cost_micros, impressions, clicks, conversions,
      ctr, average_cpc_micros, cost_per_conversion_micros, sync_run_id, updated_at)
     VALUES (@date, @customer_id, @campaign_id, @campaign_name, @cost_micros, @impressions, @clicks, @conversions,
      @ctr, @average_cpc_micros, @cost_per_conversion_micros, @sync_run_id, datetime('now'))
     ON CONFLICT(date, customer_id, campaign_id) DO UPDATE SET
      campaign_name=excluded.campaign_name, cost_micros=excluded.cost_micros, impressions=excluded.impressions,
      clicks=excluded.clicks, conversions=excluded.conversions, ctr=excluded.ctr,
      average_cpc_micros=excluded.average_cpc_micros, cost_per_conversion_micros=excluded.cost_per_conversion_micros,
      sync_run_id=excluded.sync_run_id, updated_at=excluded.updated_at`
  );
  db.transaction((items) => items.forEach((r) => stmt.run(r)))(rows);
  return rows.length;
}

export function upsertAdsKeywords(rows) {
  const stmt = db.prepare(
    `INSERT INTO google_ads_keyword_daily
     (date, customer_id, campaign_id, campaign_name, ad_group_id, criterion_id, keyword_text, match_type,
      cost_micros, impressions, clicks, conversions, ctr, average_cpc_micros, cost_per_conversion_micros, sync_run_id, updated_at)
     VALUES (@date, @customer_id, @campaign_id, @campaign_name, @ad_group_id, @criterion_id, @keyword_text, @match_type,
      @cost_micros, @impressions, @clicks, @conversions, @ctr, @average_cpc_micros, @cost_per_conversion_micros, @sync_run_id, datetime('now'))
     ON CONFLICT(date, customer_id, campaign_id, ad_group_id, criterion_id) DO UPDATE SET
      campaign_name=excluded.campaign_name, keyword_text=excluded.keyword_text, match_type=excluded.match_type,
      cost_micros=excluded.cost_micros, impressions=excluded.impressions, clicks=excluded.clicks,
      conversions=excluded.conversions, ctr=excluded.ctr, average_cpc_micros=excluded.average_cpc_micros,
      cost_per_conversion_micros=excluded.cost_per_conversion_micros, sync_run_id=excluded.sync_run_id,
      updated_at=excluded.updated_at`
  );
  db.transaction((items) => items.forEach((r) => stmt.run(r)))(rows);
  return rows.length;
}

export function adsSummary(range) {
  const params = { start: range.start_date, end: range.end_date, customerId: range.ads_customer_id || null };
  const totals = db
    .prepare(
      `SELECT COALESCE(SUM(cost_micros),0) costMicros, COALESCE(SUM(impressions),0) impressions,
              COALESCE(SUM(clicks),0) clicks, COALESCE(SUM(conversions),0) conversions,
              CASE WHEN SUM(impressions) > 0 THEN SUM(clicks) * 1.0 / SUM(impressions) ELSE NULL END ctr,
              CASE WHEN SUM(clicks) > 0 THEN SUM(cost_micros) / SUM(clicks) ELSE NULL END averageCpcMicros,
              CASE WHEN SUM(conversions) > 0 THEN SUM(cost_micros) / SUM(conversions) ELSE NULL END costPerConversionMicros
       FROM google_ads_campaign_daily WHERE date BETWEEN @start AND @end AND (@customerId IS NULL OR customer_id = @customerId)`
    )
    .get(params);
  const campaigns = db
    .prepare(
      `SELECT campaign_id campaignId, campaign_name campaignName, SUM(cost_micros) costMicros,
              SUM(impressions) impressions, SUM(clicks) clicks, SUM(conversions) conversions
       FROM google_ads_campaign_daily
       WHERE date BETWEEN @start AND @end AND (@customerId IS NULL OR customer_id = @customerId)
       GROUP BY campaign_id, campaign_name
       ORDER BY costMicros DESC
       LIMIT 50`
    )
    .all(params);
  const keywords = db
    .prepare(
      `SELECT keyword_text keyword, match_type matchType, campaign_name campaignName, SUM(cost_micros) costMicros,
              SUM(impressions) impressions, SUM(clicks) clicks, SUM(conversions) conversions
       FROM google_ads_keyword_daily
       WHERE date BETWEEN @start AND @end AND (@customerId IS NULL OR customer_id = @customerId)
       GROUP BY keyword_text, match_type, campaign_name
       ORDER BY costMicros DESC
       LIMIT 50`
    )
    .all(params);
  return { totals, campaigns, keywords };
}

/* ===== 诊断引擎查询（全部基于已同步真实数据，无任何 demo） ===== */

// 机会词：区间内 query+page 聚合，曝光加权排名落在 11-20（就差一步进首页）、有一定曝光。
export function gscOpportunities(range, { minImpr = 10, limit = 50 } = {}) {
  const params = { start: range.start_date, end: range.end_date, siteUrl: range.gsc_site_url || null, minImpr, limit };
  return db
    .prepare(
      `SELECT * FROM (
         SELECT query, page, SUM(clicks) clicks, SUM(impressions) impressions,
                CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)*1.0/SUM(impressions) ELSE NULL END ctr,
                CASE WHEN SUM(impressions) > 0 THEN SUM(position*impressions)/SUM(impressions) ELSE NULL END position
         FROM gsc_query_daily
         WHERE date BETWEEN @start AND @end AND (@siteUrl IS NULL OR site_url = @siteUrl)
         GROUP BY query, page
       ) WHERE impressions >= @minImpr AND position >= 11 AND position <= 20
       ORDER BY impressions DESC LIMIT @limit`
    )
    .all(params);
}

// 蚕食：同一 query 在区间内被 >=2 个有意义曝光的页面分散排名。返回每组的页面清单。
export function gscCannibalization(range, { minImpr = 10, limit = 50 } = {}) {
  const params = { start: range.start_date, end: range.end_date, siteUrl: range.gsc_site_url || null, minImpr };
  const rows = db
    .prepare(
      `SELECT * FROM (
         SELECT query, page, SUM(clicks) clicks, SUM(impressions) impressions,
                CASE WHEN SUM(impressions) > 0 THEN SUM(position*impressions)/SUM(impressions) ELSE NULL END position
         FROM gsc_query_daily
         WHERE date BETWEEN @start AND @end AND (@siteUrl IS NULL OR site_url = @siteUrl)
         GROUP BY query, page
       ) WHERE impressions >= @minImpr
       ORDER BY query ASC, impressions DESC`
    )
    .all(params);
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.query)) m.set(r.query, []);
    m.get(r.query).push({ page: r.page, clicks: r.clicks, impressions: r.impressions, position: r.position });
  }
  const groups = [];
  for (const [query, pages] of m) {
    if (pages.length >= 2) {
      groups.push({ query, pages, totalImpressions: pages.reduce((s, p) => s + (p.impressions || 0), 0) });
    }
  }
  groups.sort((a, b) => b.totalImpressions - a.totalImpressions);
  return groups.slice(0, limit);
}

// 流量衰退：按页面比较「当前窗口」与「上一等长窗口」点击，跌幅达阈值且此前有量的页面。
export function gscDecayPages(range, prevRange, { minPrevClicks = 10, dropRatio = 0.3, limit = 50 } = {}) {
  const agg = (r) => {
    const params = { start: r.start_date, end: r.end_date, siteUrl: range.gsc_site_url || null };
    return db
      .prepare(
        `SELECT page, SUM(clicks) clicks, SUM(impressions) impressions,
                CASE WHEN SUM(impressions) > 0 THEN SUM(position*impressions)/SUM(impressions) ELSE NULL END position
         FROM gsc_query_daily
         WHERE date BETWEEN @start AND @end AND (@siteUrl IS NULL OR site_url = @siteUrl)
         GROUP BY page`
      )
      .all(params);
  };
  const cur = new Map(agg(range).map((x) => [x.page, x]));
  const out = [];
  for (const p of agg(prevRange)) {
    const c = cur.get(p.page) || { clicks: 0, impressions: 0, position: null };
    if ((p.clicks || 0) >= minPrevClicks && (c.clicks || 0) <= (p.clicks || 0) * (1 - dropRatio)) {
      out.push({
        page: p.page,
        clicksPrev: p.clicks || 0,
        clicksCur: c.clicks || 0,
        dropPct: p.clicks ? Math.round((1 - (c.clicks || 0) / p.clicks) * 100) : 0,
        positionPrev: p.position,
        positionCur: c.position,
      });
    }
  }
  out.sort((a, b) => b.dropPct - a.dropPct);
  return out.slice(0, limit);
}

// 高花费零有效：区间内 cost>0 且 conversions=0 的关键词（按花费降序）。
export function adsWasteKeywords(range, { limit = 50 } = {}) {
  const params = { start: range.start_date, end: range.end_date, customerId: range.ads_customer_id || null, limit };
  return db
    .prepare(
      `SELECT keyword_text keyword, match_type matchType, campaign_name campaignName,
              SUM(cost_micros) costMicros, SUM(clicks) clicks, SUM(conversions) conversions
       FROM google_ads_keyword_daily
       WHERE date BETWEEN @start AND @end AND (@customerId IS NULL OR customer_id = @customerId)
       GROUP BY keyword_text, match_type, campaign_name
       HAVING SUM(conversions) = 0 AND SUM(cost_micros) > 0
       ORDER BY costMicros DESC LIMIT @limit`
    )
    .all(params);
}

/* ===== SEO 看板(Looker 风格)聚合：带 Δ 的表 / 散点 / GA4 来源 ===== */
function _gscParams(range) {
  return { start: range.start_date, end: range.end_date, siteUrl: range.gsc_site_url || null };
}
// 按 query 或 page 聚合 GSC 区间数据（col 受控白名单，非用户输入）
function gscAggBy(range, col) {
  return db
    .prepare(
      `SELECT ${col} k, SUM(clicks) clicks, SUM(impressions) impressions,
              CASE WHEN SUM(impressions) > 0 THEN SUM(position*impressions)/SUM(impressions) ELSE NULL END position
       FROM gsc_query_daily
       WHERE date BETWEEN @start AND @end AND (@siteUrl IS NULL OR site_url = @siteUrl)
       GROUP BY ${col}`
    )
    .all(_gscParams(range));
}
// 落地页表 + Query 表，均带「当前 vs 上一等长窗口」的前值（Δ 在路由/前端算）
export function gscBoardTables(range, prev, { limit = 15 } = {}) {
  const mapOf = (rows) => new Map(rows.map((r) => [r.k, r]));
  const pPrev = mapOf(gscAggBy(prev, 'page'));
  const pages = gscAggBy(range, 'page')
    .map((r) => {
      const pv = pPrev.get(r.k) || { clicks: 0, impressions: 0 };
      return { page: r.k, clicks: r.clicks, clicksPrev: pv.clicks || 0, impressions: r.impressions, imprPrev: pv.impressions || 0, position: r.position };
    })
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, limit);
  const qPrev = mapOf(gscAggBy(prev, 'query'));
  const queries = gscAggBy(range, 'query')
    .map((r) => {
      const pv = qPrev.get(r.k) || { clicks: 0, impressions: 0, position: null };
      return { query: r.k, impressions: r.impressions, imprPrev: pv.impressions || 0, clicks: r.clicks, clicksPrev: pv.clicks || 0, position: r.position, positionPrev: pv.position };
    })
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit);
  return { pages, queries };
}
// 散点象限：每个 query 的 展现 × 排名（前端画中位线分四象限）
export function gscScatter(range, { minImpr = 5, limit = 120 } = {}) {
  return gscAggBy(range, 'query')
    .filter((r) => r.impressions >= minImpr && r.position != null)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit)
    .map((r) => ({ query: r.k, impressions: r.impressions, clicks: r.clicks, position: r.position }));
}
// GA4 来源分段（区间汇总）：source_medium 维度。跳出率/时长按会话加权
export function ga4SourcesRange(range) {
  const params = { start: range.start_date, end: range.end_date, propertyId: range.ga4_property_id || null };
  return db
    .prepare(
      `SELECT dimension_value source, SUM(sessions) sessions, SUM(active_users) users, SUM(page_views) pageViews,
              CASE WHEN SUM(CASE WHEN bounce_rate IS NULL THEN 0 ELSE sessions END) > 0
                   THEN SUM(bounce_rate*sessions)/SUM(CASE WHEN bounce_rate IS NULL THEN 0 ELSE sessions END) END bounceRate,
              CASE WHEN SUM(CASE WHEN avg_session_duration IS NULL THEN 0 ELSE sessions END) > 0
                   THEN SUM(avg_session_duration*sessions)/SUM(CASE WHEN avg_session_duration IS NULL THEN 0 ELSE sessions END) END avgDuration
       FROM ga4_dimension_daily
       WHERE date BETWEEN @start AND @end AND dimension_type = 'source_medium' AND (@propertyId IS NULL OR property_id = @propertyId)
       GROUP BY dimension_value ORDER BY sessions DESC`
    )
    .all(params);
}
/* ===== SEM 富看板：带 Δ 的系列/关键词表 + 花费×转化散点 + 日趋势 ===== */
function _adsParams(range) {
  return { start: range.start_date, end: range.end_date, customerId: range.ads_customer_id || null };
}
function adsCampaignAgg(range) {
  return db
    .prepare(
      `SELECT campaign_id id, campaign_name name, SUM(cost_micros) costMicros, SUM(impressions) impressions,
              SUM(clicks) clicks, SUM(conversions) conversions
       FROM google_ads_campaign_daily
       WHERE date BETWEEN @start AND @end AND (@customerId IS NULL OR customer_id = @customerId)
       GROUP BY campaign_id, campaign_name`
    )
    .all(_adsParams(range));
}
function adsKeywordAgg(range) {
  return db
    .prepare(
      `SELECT keyword_text keyword, match_type matchType, campaign_name campaignName, SUM(cost_micros) costMicros,
              SUM(impressions) impressions, SUM(clicks) clicks, SUM(conversions) conversions
       FROM google_ads_keyword_daily
       WHERE date BETWEEN @start AND @end AND (@customerId IS NULL OR customer_id = @customerId)
       GROUP BY keyword_text, match_type, campaign_name`
    )
    .all(_adsParams(range));
}
export function adsBoardTables(range, prev, { limit = 15 } = {}) {
  const cPrev = new Map(adsCampaignAgg(prev).map((r) => [r.id, r]));
  const campaigns = adsCampaignAgg(range)
    .map((r) => { const pv = cPrev.get(r.id) || {}; return { ...r, costPrev: pv.costMicros || 0, clicksPrev: pv.clicks || 0, convPrev: pv.conversions || 0 }; })
    .sort((a, b) => b.costMicros - a.costMicros)
    .slice(0, limit);
  const kKey = (r) => r.keyword + '|' + r.matchType + '|' + r.campaignName;
  const kPrev = new Map(adsKeywordAgg(prev).map((r) => [kKey(r), r]));
  const keywords = adsKeywordAgg(range)
    .map((r) => { const pv = kPrev.get(kKey(r)) || {}; return { ...r, costPrev: pv.costMicros || 0, clicksPrev: pv.clicks || 0, convPrev: pv.conversions || 0 }; })
    .sort((a, b) => b.costMicros - a.costMicros)
    .slice(0, limit);
  return { campaigns, keywords };
}
// 散点：花费 × 转化（高花费低转化=该砍，前端画中位线分四象限）
export function adsScatter(range, { limit = 120 } = {}) {
  return adsKeywordAgg(range)
    .filter((r) => r.costMicros > 0)
    .sort((a, b) => b.costMicros - a.costMicros)
    .slice(0, limit)
    .map((r) => ({ keyword: r.keyword, campaignName: r.campaignName, costMicros: r.costMicros, conversions: r.conversions, clicks: r.clicks }));
}
// 日趋势：每天 花费/点击/转化
export function adsSeries(range) {
  return db
    .prepare(
      `SELECT date, SUM(cost_micros) costMicros, SUM(clicks) clicks, SUM(conversions) conversions
       FROM google_ads_campaign_daily
       WHERE date BETWEEN @start AND @end AND (@customerId IS NULL OR customer_id = @customerId)
       GROUP BY date ORDER BY date`
    )
    .all(_adsParams(range));
}

// GA4 页面级「会话 × 跳出率」散点（找高流量高跳出=重点优化对象）。跳出率按会话加权
export function ga4PageScatter(range, { minSessions = 5, limit = 120 } = {}) {
  const params = { start: range.start_date, end: range.end_date, propertyId: range.ga4_property_id || null, minSessions, limit };
  return db
    .prepare(
      `SELECT dimension_value page, SUM(sessions) sessions, SUM(page_views) pageViews,
              CASE WHEN SUM(CASE WHEN bounce_rate IS NULL THEN 0 ELSE sessions END) > 0
                   THEN SUM(bounce_rate*sessions)/SUM(CASE WHEN bounce_rate IS NULL THEN 0 ELSE sessions END) END bounceRate,
              CASE WHEN SUM(CASE WHEN avg_session_duration IS NULL THEN 0 ELSE sessions END) > 0
                   THEN SUM(avg_session_duration*sessions)/SUM(CASE WHEN avg_session_duration IS NULL THEN 0 ELSE sessions END) END avgDuration
       FROM ga4_dimension_daily
       WHERE date BETWEEN @start AND @end AND dimension_type = 'landing_page' AND (@propertyId IS NULL OR property_id = @propertyId)
       GROUP BY dimension_value
       HAVING SUM(sessions) >= @minSessions AND bounceRate IS NOT NULL
       ORDER BY sessions DESC LIMIT @limit`
    )
    .all(params);
}
// GA4 来源随时间（堆叠面积）：Top N 来源 + 其他
export function ga4SourceSeries(range, { topN = 5 } = {}) {
  const params = { start: range.start_date, end: range.end_date, propertyId: range.ga4_property_id || null };
  const rows = db
    .prepare(
      `SELECT date, dimension_value source, SUM(sessions) sessions
       FROM ga4_dimension_daily
       WHERE date BETWEEN @start AND @end AND dimension_type = 'source_medium' AND (@propertyId IS NULL OR property_id = @propertyId)
       GROUP BY date, dimension_value`
    )
    .all(params);
  const totBy = new Map();
  rows.forEach((r) => totBy.set(r.source, (totBy.get(r.source) || 0) + r.sessions));
  const top = [...totBy.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map((x) => x[0]);
  const topSet = new Set(top);
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const di = new Map(dates.map((d, i) => [d, i]));
  const hasOther = rows.some((r) => !topSet.has(r.source));
  const keys = hasOther ? [...top, '其他'] : [...top];
  const seriesMap = new Map(keys.map((s) => [s, new Array(dates.length).fill(0)]));
  rows.forEach((r) => {
    const key = topSet.has(r.source) ? r.source : '其他';
    const arr = seriesMap.get(key);
    if (arr) arr[di.get(r.date)] += r.sessions;
  });
  return { dates, series: [...seriesMap.entries()].map(([source, values]) => ({ source, values })) };
}
