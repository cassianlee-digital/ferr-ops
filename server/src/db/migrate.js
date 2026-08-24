// 建表迁移（前向、幂等、永不清库）。启动路径只会 CREATE IF NOT EXISTS + 补列。
// 清库重建是显式独立操作：`CONFIRM_RESET=1 node src/db/migrate.js --reset`（会先自动备份）。
// 普通运行：node src/db/migrate.js
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { db } from './connection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// schema 版本仅作记录与未来增量迁移的挂钩点；不再触发任何自动清库。
const SCHEMA_VERSION = '12';

const ALL_TABLES = [
  'users', 'inquiries', 'seo_weeks', 'sem_weeks', 'neg_keywords', 'ad_creatives',
  'rank_snapshots', 'kpi_targets', 'keywords', 'fixes', 'loop_items',
  'ai_analyses', 'integrations', 'market_brain', 'market_research', 'monthly_snapshots', 'weekly_reports',
  'content_assets', 'hermes_memories', 'hermes_conversations',
  'sop_definitions', 'sop_completions', 'task_checkins', 'hermes_action_runs',
  'google_oauth_tokens', 'google_oauth_states', 'google_sync_runs',
  'google_projects',
  'gsc_daily', 'gsc_query_daily', 'ga4_daily', 'ga4_dimension_daily', 'ga4_event_daily',
  'google_ads_campaign_daily', 'google_ads_keyword_daily', 'google_ads_search_term_daily',
];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('seo','sem','manager','boss')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inquiries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        TEXT NOT NULL,
  country     TEXT,
  region      TEXT,
  channel     TEXT,
  source      TEXT,
  product     TEXT,
  grade       TEXT CHECK (grade IN ('A','B','C')),
  note        TEXT,
  created_by  INTEGER REFERENCES users(id),
  -- 6.23 修改文档 7/9/12：客户姓名（录入已下线，保留历史数据）/ 跟踪反馈 / 原始等级（用于上调标红判定）
  customer_name      TEXT,
  -- 询盘录入改版：客户编码 / 业务员 / 是否成交（客户编码取代客户姓名）
  customer_code      TEXT,
  salesperson        TEXT,
  deal_status        TEXT,
  tracking_feedback  TEXT,
  original_grade     TEXT,
  -- 6.23 文档 P3：询盘软删→归档（state='archived' 时进归档页「询盘」桶，不计入列表/统计/KPI）
  state        TEXT,
  archived_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inquiries_date ON inquiries(date);

CREATE TABLE IF NOT EXISTS seo_weeks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  week_date     TEXT NOT NULL,
  clicks        INTEGER,
  impressions   INTEGER,
  avg_position  REAL,
  top10_ratio   REAL,
  coverage      INTEGER,
  indexed_pages INTEGER,
  bounce_rate   REAL,
  dwell_seconds INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_seo_weeks_date ON seo_weeks(week_date);

CREATE TABLE IF NOT EXISTS sem_weeks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  week_date     TEXT NOT NULL,
  cost          REAL,
  impressions   INTEGER,
  clicks        INTEGER,
  conversions   INTEGER,
  roas          REAL,
  quality_score REAL,
  cpc           REAL,
  ctr           REAL,
  cost_per_conv REAL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sem_weeks_date ON sem_weeks(week_date);

CREATE TABLE IF NOT EXISTS neg_keywords (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  word           TEXT NOT NULL,
  match_type     TEXT,
  added_date     TEXT,
  reason         TEXT,
  source_campaign TEXT,
  status         TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ad_creatives (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  description  TEXT,
  ctr          TEXT,
  ab_conclusion TEXT,
  status       TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rank_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL,
  keyword       TEXT NOT NULL,
  rank          INTEGER,
  url           TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rank_snapshots_date ON rank_snapshots(snapshot_date);

CREATE TABLE IF NOT EXISTS kpi_targets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  grp        TEXT NOT NULL CHECK (grp IN ('total','seo','sem')),
  name       TEXT NOT NULL,
  weight     REAL NOT NULL,
  target     REAL NOT NULL,
  actual     REAL NOT NULL,
  mode       TEXT NOT NULL CHECK (mode IN ('r','i')),
  unit       TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS keywords (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  type      TEXT NOT NULL CHECK (type IN ('seo','sem','high','customer')),
  keyword   TEXT NOT NULL,
  attrs     TEXT,
  category  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_keywords_type ON keywords(type);

CREATE TABLE IF NOT EXISTS fixes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  dept       TEXT,
  detail     TEXT,
  evidence   TEXT,
  owner      TEXT,
  due_date   TEXT,
  status     TEXT,
  source     TEXT,
  -- 归档地基（第①步）：与 loop_items 共用同一套语义
  state         TEXT,
  archived_at   TEXT,
  deleted_at    TEXT,
  archive_kind  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- 注意：fixes(state) 索引在下方 ensureColumns 之后用 db.exec 创建（旧库 state 列由 ensureColumns 补，不能在此 IF NOT EXISTS 阶段建索引）

CREATE TABLE IF NOT EXISTS loop_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL CHECK (kind IN ('plan','test','deposit','task')),
  dept       TEXT,
  content    TEXT,
  owner      TEXT,
  status     TEXT,
  hypothesis    TEXT,   -- 计划/测试：假设
  metric        TEXT,   -- 计划：成功指标
  due_or_budget TEXT,   -- 计划：截止或预算
  variable      TEXT,   -- 测试：变量
  period        TEXT,   -- 测试：起止
  conclusion    TEXT,   -- 测试：结论
  analysis      TEXT,   -- 沉淀：对该动作的分析
  task_date     TEXT,   -- 任务：截止日（可选）
  start_date    TEXT,   -- 任务：开始日（可选）。与 task_date 一起表达跨天任务：start<=今天<截止 即「进行中」
  task_hour     TEXT,   -- 任务：今日完成时间（小时 00-23）
  note          TEXT,   -- 任务：备注
  parent_id     INTEGER,-- 公司大任务拆解：子任务指向父 loop_item.id；NULL=顶层任务
  -- 归档地基（第①步）：state 显式状态机 + 软删 + 归档时间 + 归档分桶
  state         TEXT,   -- todo / done / adopted / deposited / archived / deleted  (NULL=兼容旧行视为 todo)
  archived_at   TEXT,   -- 归档时间（ISO）；进入归档页就用这个，不是 created_at
  deleted_at    TEXT,   -- 软删时间（ISO）；NULL=未删
  archive_kind  TEXT,   -- sem / seo / company；归档页分桶
  urgent        INTEGER,-- SOP③：1=公司新派紧急任务（顶部 banner）/ NULL=普通
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- 注意：loop_items(state, kind) 索引在下方 ensureColumns 之后用 db.exec 创建（同上）

-- V7：第三方集成密钥（AES 加密存储）
CREATE TABLE IF NOT EXISTS integrations (
  provider   TEXT PRIMARY KEY CHECK (provider IN ('gsc','ga4','ads')),
  secret_enc TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_analyses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_key     TEXT NOT NULL UNIQUE,
  scope_type    TEXT,
  title         TEXT,
  prompt        TEXT NOT NULL,
  context_json  TEXT,
  result_text   TEXT,
  messages_json TEXT,
  history_json  TEXT,
  quality_json  TEXT,
  state         TEXT NOT NULL DEFAULT 'analyzed',
  action_state  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_state ON ai_analyses(state);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_scope_type ON ai_analyses(scope_type);

CREATE TABLE IF NOT EXISTS google_oauth_tokens (
  provider         TEXT PRIMARY KEY CHECK (provider IN ('gsc','ga4','ads')),
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  scope            TEXT,
  token_type       TEXT,
  expiry_date_ms   INTEGER,
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS google_oauth_states (
  state      TEXT PRIMARY KEY,
  provider   TEXT NOT NULL CHECK (provider IN ('gsc','ga4','ads')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS google_sync_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  provider     TEXT NOT NULL CHECK (provider IN ('gsc','ga4','ads')),
  project_id   INTEGER REFERENCES google_projects(id),
  status       TEXT NOT NULL CHECK (status IN ('running','success','failed')),
  started_at   TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at  TEXT,
  date_start   TEXT,
  date_end     TEXT,
  rows_written INTEGER NOT NULL DEFAULT 0,
  error        TEXT
);
CREATE INDEX IF NOT EXISTS idx_google_sync_runs_provider_started ON google_sync_runs(provider, started_at);

CREATE TABLE IF NOT EXISTS google_projects (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  gsc_site_url    TEXT,
  ga4_property_id TEXT,
  ads_customer_id TEXT,
  is_default      INTEGER NOT NULL DEFAULT 0,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_google_projects_default ON google_projects(is_default, active);

CREATE TABLE IF NOT EXISTS gsc_daily (
  date         TEXT NOT NULL,
  site_url     TEXT NOT NULL,
  clicks       INTEGER NOT NULL DEFAULT 0,
  impressions  INTEGER NOT NULL DEFAULT 0,
  ctr          REAL,
  position     REAL,
  sync_run_id  INTEGER REFERENCES google_sync_runs(id),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (date, site_url)
);

CREATE TABLE IF NOT EXISTS gsc_query_daily (
  date         TEXT NOT NULL,
  site_url     TEXT NOT NULL,
  query        TEXT NOT NULL,
  page         TEXT NOT NULL DEFAULT '',
  clicks       INTEGER NOT NULL DEFAULT 0,
  impressions  INTEGER NOT NULL DEFAULT 0,
  ctr          REAL,
  position     REAL,
  sync_run_id  INTEGER REFERENCES google_sync_runs(id),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (date, site_url, query, page)
);
CREATE INDEX IF NOT EXISTS idx_gsc_query_daily_query ON gsc_query_daily(query, date);

CREATE TABLE IF NOT EXISTS ga4_daily (
  date                 TEXT NOT NULL,
  property_id          TEXT NOT NULL,
  active_users         INTEGER NOT NULL DEFAULT 0,
  sessions             INTEGER NOT NULL DEFAULT 0,
  page_views           INTEGER NOT NULL DEFAULT 0,
  key_events           REAL NOT NULL DEFAULT 0,
  bounce_rate          REAL,
  avg_session_duration REAL,
  sync_run_id          INTEGER REFERENCES google_sync_runs(id),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (date, property_id)
);

CREATE TABLE IF NOT EXISTS ga4_dimension_daily (
  date            TEXT NOT NULL,
  property_id     TEXT NOT NULL,
  dimension_type  TEXT NOT NULL,
  dimension_value TEXT NOT NULL,
  active_users    INTEGER NOT NULL DEFAULT 0,
  sessions        INTEGER NOT NULL DEFAULT 0,
  page_views      INTEGER NOT NULL DEFAULT 0,
  key_events      REAL NOT NULL DEFAULT 0,
  bounce_rate     REAL,
  avg_session_duration REAL,
  sync_run_id     INTEGER REFERENCES google_sync_runs(id),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (date, property_id, dimension_type, dimension_value)
);
CREATE INDEX IF NOT EXISTS idx_ga4_dimension_daily_type ON ga4_dimension_daily(dimension_type, date);

CREATE TABLE IF NOT EXISTS ga4_event_daily (
  date          TEXT NOT NULL,
  property_id   TEXT NOT NULL,
  event_name    TEXT NOT NULL,
  event_count   INTEGER NOT NULL DEFAULT 0,
  total_users   INTEGER NOT NULL DEFAULT 0,
  key_events    REAL NOT NULL DEFAULT 0,
  sync_run_id   INTEGER REFERENCES google_sync_runs(id),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (date, property_id, event_name)
);
CREATE INDEX IF NOT EXISTS idx_ga4_event_daily_name ON ga4_event_daily(event_name, date);

CREATE TABLE IF NOT EXISTS google_ads_campaign_daily (
  date                       TEXT NOT NULL,
  customer_id                TEXT NOT NULL,
  campaign_id                TEXT NOT NULL,
  campaign_name              TEXT,
  cost_micros                INTEGER NOT NULL DEFAULT 0,
  impressions                INTEGER NOT NULL DEFAULT 0,
  clicks                     INTEGER NOT NULL DEFAULT 0,
  conversions                REAL NOT NULL DEFAULT 0,
  ctr                        REAL,
  average_cpc_micros         INTEGER,
  cost_per_conversion_micros INTEGER,
  sync_run_id                INTEGER REFERENCES google_sync_runs(id),
  updated_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (date, customer_id, campaign_id)
);

CREATE TABLE IF NOT EXISTS google_ads_keyword_daily (
  date                       TEXT NOT NULL,
  customer_id                TEXT NOT NULL,
  campaign_id                TEXT NOT NULL,
  campaign_name              TEXT,
  ad_group_id                TEXT NOT NULL,
  ad_group_name              TEXT,
  criterion_id               TEXT NOT NULL,
  keyword_text               TEXT,
  match_type                 TEXT,
  cost_micros                INTEGER NOT NULL DEFAULT 0,
  impressions                INTEGER NOT NULL DEFAULT 0,
  clicks                     INTEGER NOT NULL DEFAULT 0,
  conversions                REAL NOT NULL DEFAULT 0,
  ctr                        REAL,
  average_cpc_micros         INTEGER,
  cost_per_conversion_micros INTEGER,
  sync_run_id                INTEGER REFERENCES google_sync_runs(id),
  updated_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (date, customer_id, campaign_id, ad_group_id, criterion_id)
);
CREATE INDEX IF NOT EXISTS idx_google_ads_keyword_daily_text ON google_ads_keyword_daily(keyword_text, date);

CREATE TABLE IF NOT EXISTS google_ads_search_term_daily (
  date                       TEXT NOT NULL,
  customer_id                TEXT NOT NULL,
  campaign_id                TEXT NOT NULL,
  campaign_name              TEXT,
  ad_group_id                TEXT NOT NULL,
  ad_group_name              TEXT,
  search_term                TEXT NOT NULL,
  match_type                 TEXT,
  status                     TEXT,
  cost_micros                INTEGER NOT NULL DEFAULT 0,
  impressions                INTEGER NOT NULL DEFAULT 0,
  clicks                     INTEGER NOT NULL DEFAULT 0,
  conversions                REAL NOT NULL DEFAULT 0,
  ctr                        REAL,
  average_cpc_micros         INTEGER,
  cost_per_conversion_micros INTEGER,
  sync_run_id                INTEGER REFERENCES google_sync_runs(id),
  updated_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (date, customer_id, campaign_id, ad_group_id, search_term)
);
CREATE INDEX IF NOT EXISTS idx_google_ads_search_term_daily_scope
  ON google_ads_search_term_daily(customer_id, date, campaign_id, ad_group_id);

-- V7：市场 AI 记忆体（单行，id=1）
CREATE TABLE IF NOT EXISTS market_brain (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  last_analyzed_hash TEXT,
  cached_summary     TEXT,
  analyzed_month     TEXT,
  updated_at         TEXT
);

-- V7：市场分析问卷数据（按 xlsx 表格化；P2 填充）
CREATE TABLE IF NOT EXISTS market_research (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  section    TEXT,
  question   TEXT,
  answers    TEXT,         -- JSON：各受访者回答
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- V7：内容资产
CREATE TABLE IF NOT EXISTS content_assets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT,
  problem    TEXT,
  type       TEXT,
  priority   TEXT,
  owner      TEXT,
  status     TEXT,
  add_date   TEXT,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- V7：复盘周报（每周 × 每部门；四段内容为 JSON 列表）
CREATE TABLE IF NOT EXISTS weekly_reports (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  week_key  TEXT NOT NULL,           -- 例：2026-6-2 (年-月-第几周)
  dept      TEXT NOT NULL,           -- SEO / SEM
  summary   TEXT,                    -- ① 本周工作总结 (JSON 数组)
  problems  TEXT,                    -- ② 遇到的问题
  analysis  TEXT,                    -- ③ 分析
  next_plan TEXT,                    -- ④ 下周工作计划
  updated_at TEXT,
  UNIQUE(week_key, dept)
);

-- V7：月度快照（用于总览环比对比）
CREATE TABLE IF NOT EXISTS monthly_snapshots (
  month         TEXT PRIMARY KEY,   -- YYYY-MM
  company_score REAL,
  a_ratio       REAL,
  valid_rate    REAL,
  updated_at    TEXT
);

-- SOP 引擎（Step A）：定义 + 完成记录
CREATE TABLE IF NOT EXISTS hermes_memories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL CHECK (kind IN ('company','customer','market','operation','decision','learning','preference','risk')),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  evidence    TEXT,
  source      TEXT,
  importance  INTEGER NOT NULL DEFAULT 3,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_hermes_memories_active_kind ON hermes_memories(active, kind, importance);

CREATE TABLE IF NOT EXISTS hermes_conversations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  role        TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '新对话',
  messages    TEXT NOT NULL DEFAULT '[]',
  skill       TEXT,
  workflow    TEXT,
  state       TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','archived')),
  archived_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_hermes_conversations_user_state_updated
  ON hermes_conversations(user_id, state, updated_at);

CREATE TABLE IF NOT EXISTS hermes_action_runs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id),
  loop_item_id      INTEGER REFERENCES loop_items(id),
  action_type       TEXT NOT NULL,
  title             TEXT NOT NULL,
  input_json        TEXT NOT NULL DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'proposed'
                    CHECK (status IN ('proposed','approved','running','succeeded','failed','cancelled','verified')),
  result_json       TEXT,
  verification_json TEXT,
  error             TEXT,
  idempotency_key   TEXT,
  attempt_count     INTEGER NOT NULL DEFAULT 0,
  approved_by       INTEGER REFERENCES users(id),
  verified_by       INTEGER REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at       TEXT,
  started_at        TEXT,
  finished_at       TEXT,
  verified_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_hermes_action_runs_status_created
  ON hermes_action_runs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_hermes_action_runs_user_created
  ON hermes_action_runs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_hermes_action_runs_loop_item
  ON hermes_action_runs(loop_item_id);
CREATE TABLE IF NOT EXISTS sop_definitions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  dept       TEXT NOT NULL,                                -- SEM / SEO / 公司
  freq       TEXT NOT NULL CHECK (freq IN ('daily','weekly','monthly')),
  title      TEXT NOT NULL,
  content    TEXT,
  time_hint  TEXT,                                         -- 任务卡角落展示，如 '09:30' '周五' '月初'；不参与判定
  active     INTEGER NOT NULL DEFAULT 1,                   -- 1=启用 0=停用（软删，保留完成历史）
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sop_def_dept_freq_active ON sop_definitions(dept, freq, active);

CREATE TABLE IF NOT EXISTS sop_completions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sop_id        INTEGER NOT NULL,
  period_key    TEXT NOT NULL,                              -- daily=YYYY-MM-DD / weekly=YYYY-Www / monthly=YYYY-MM
  completed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  completed_by  TEXT,                                       -- username
  UNIQUE(sop_id, period_key)
);
CREATE INDEX IF NOT EXISTS idx_sop_comp_period ON sop_completions(period_key);

-- 跨天任务的每日推进打卡。跨天任务（start_date~task_date）在日计划上会连续挂好几天，
-- 没有这张表就只能看到"它还在"，看不到"这几天推进了没有"——每天一条记录才是可复盘的证据。
-- 与 sop_completions 同构：day_key 按客户端本地日期算，UNIQUE 防重、撤销即删。
CREATE TABLE IF NOT EXISTS task_checkins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  loop_item_id  INTEGER NOT NULL,
  day_key       TEXT NOT NULL,                              -- YYYY-MM-DD
  note          TEXT,                                       -- 今天推进了什么（可选）
  created_by    TEXT,                                       -- username
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(loop_item_id, day_key)
);
CREATE INDEX IF NOT EXISTS idx_task_checkins_item ON task_checkins(loop_item_id);
`;

export function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);`);

  // 前向迁移：只建表/补列，绝不 DROP。历史上这里会在「版本对不上」时清空全库，
  // 那是「改一次版本号就抹掉生产真实数据」的地雷，已移除。清库改为显式的 dropAllTables()。
  db.exec(SCHEMA);

  // 幂等加列：对已存在的旧库补充新增字段（不升版本、不清库，避免数据丢失）。
  ensureColumns('loop_items', [
    ['hypothesis', 'TEXT'], ['metric', 'TEXT'], ['due_or_budget', 'TEXT'],
    ['variable', 'TEXT'], ['period', 'TEXT'], ['conclusion', 'TEXT'],
    ['analysis', 'TEXT'],
    ['task_date', 'TEXT'], ['task_hour', 'TEXT'], ['note', 'TEXT'],
    // 跨天任务：开始日（旧库幂等加列；老数据 NULL = 当天任务，语义不变）
    ['start_date', 'TEXT'],
    // 出身：这条任务是从哪条整改项排下来的（诊断→整改→日计划→回写 的那根线）
    ['fix_id', 'INTEGER'],
    // 完成时刻。以前只存 state='done'，"那天完成了什么"就永远答不出来；
    // 老数据留 NULL——不知道就是不知道，不编。
    ['done_at', 'TEXT'],
    // 公司大任务拆解：子任务父指针（旧库幂等加列）
    ['parent_id', 'INTEGER'],
    // 归档地基（第①步）：旧库幂等加列
    ['state', 'TEXT'], ['archived_at', 'TEXT'], ['deleted_at', 'TEXT'], ['archive_kind', 'TEXT'],
    // SOP 引擎（Step A）：公司新派紧急任务标记
    ['urgent', 'INTEGER'],
  ]);
  ensureColumns('fixes', [
    ['evidence', 'TEXT'],
    ['state', 'TEXT'], ['archived_at', 'TEXT'], ['deleted_at', 'TEXT'], ['archive_kind', 'TEXT'],
  ]);
  ensureColumns('ai_analyses', [
    ['history_json', 'TEXT'], // 重新分析时把旧结论存为历史快照（时间线对比）
    ['quality_json', 'TEXT'], // 证据审计、置信度、修复状态和缺失数据
  ]);
  ensureColumns('ga4_dimension_daily', [
    ['bounce_rate', 'REAL'], ['avg_session_duration', 'REAL'], // 页面级跳出率散点 + 来源级跳出/时长
    ['key_events', 'REAL NOT NULL DEFAULT 0'],
  ]);
  ensureColumns('ga4_daily', [
    ['key_events', 'REAL NOT NULL DEFAULT 0'],
  ]);
  // 6.23 修改文档 7/9/12：inquiries 加客户姓名 / 跟踪反馈 / 原始等级
  ensureColumns('inquiries', [
    ['customer_name', 'TEXT'], ['tracking_feedback', 'TEXT'], ['original_grade', 'TEXT'],
    ['state', 'TEXT'], ['archived_at', 'TEXT'], // P3：询盘软删→归档
    // 询盘录入改版：客户编码 / 业务员 / 是否成交（老库补列，老行留 NULL，不补假值）
    ['customer_code', 'TEXT'], ['salesperson', 'TEXT'], ['deal_status', 'TEXT'],
  ]);
  ensureColumns('google_sync_runs', [
    ['project_id', 'INTEGER'],
  ]);
  // 阶段6：广告组维度——旧库补 ad_group_name（需重新同步一次才有值）
  ensureColumns('google_ads_keyword_daily', [
    ['ad_group_name', 'TEXT'],
  ]);
  ensureColumns('google_projects', [
    ['gsc_site_url', 'TEXT'], ['ga4_property_id', 'TEXT'], ['ads_customer_id', 'TEXT'],
    ['is_default', 'INTEGER NOT NULL DEFAULT 0'], ['active', 'INTEGER NOT NULL DEFAULT 1'],
    ['updated_at', 'TEXT'],
  ]);
  ensureColumns('hermes_action_runs', [
    ['idempotency_key', 'TEXT'], ['attempt_count', 'INTEGER NOT NULL DEFAULT 0'],
  ]);
  // 索引：旧库 db.exec(SCHEMA) 已建表，索引语句 IF NOT EXISTS 幂等，重复 exec 无害
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_loop_items_state_kind ON loop_items(state, kind)'); } catch (e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_loop_items_fix ON loop_items(fix_id)'); } catch (e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_fixes_state ON fixes(state)'); } catch (e) {}
  try {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_hermes_action_runs_idempotency ON hermes_action_runs(idempotency_key) WHERE idempotency_key IS NOT NULL');
  } catch (e) {}

  // 周报 week_key 从「年-月-第几周」升级为「本周周一日期 YYYY-MM-DD」，根治相邻周撞 key。幂等。
  try { migrateWeeklyKeysToMonday(); } catch (e) {}

  // 一次性回填：start_date 之前的老任务都是 NULL，日计划会把「截止日在未来」的它们判成「稍后」，
  // 看着像没人做。按创建日补开始日，让它们回到「进行中」。
  // 只跑一次（meta 打标），否则用户事后手动清空开始日会被下次启动重新填回来。
  try { backfillTaskStartDates(); } catch (e) {}

  db.prepare(
    `INSERT INTO meta (key,value) VALUES ('schema_version',?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  ).run(SCHEMA_VERSION);
}

// 老任务补开始日：只补 kind='task'、有截止日、start_date 仍为空的行，取创建日（created_at 的日期部分）。
// 创建日晚于截止日的（补录的旧任务）取截止日，避免出现「开始晚于截止」的倒挂区间。
function backfillTaskStartDates() {
  const done = db.prepare("SELECT value FROM meta WHERE key='backfill_task_start_date'").get();
  if (done) return;
  db.prepare(
    `UPDATE loop_items
        SET start_date = MIN(date(created_at), task_date)
      WHERE kind = 'task'
        AND (start_date IS NULL OR start_date = '')
        AND task_date IS NOT NULL AND task_date <> ''
        AND created_at IS NOT NULL`
  ).run();
  db.prepare("INSERT INTO meta (key,value) VALUES ('backfill_task_start_date','1')").run();
}

// 把旧「年-月-第几周」周报键改写成「本周周一日期 YYYY-MM-DD」。幂等：日期键/月报键都不匹配 legacy 正则。
function migrateWeeklyKeysToMonday() {
  const pad2 = (n) => String(n).padStart(2, '0');
  const lastMondayOfMonth = (y, m) => { // m 为 1-based
    for (let day = new Date(y, m, 0).getDate(); day >= 1; day--) {
      const d = new Date(y, m - 1, day);
      if ((d.getDay() || 7) === 1) return d;
    }
    return null;
  };
  const mondayInMonthWeek = (y, m, w) => { // 该月内 ceil(day/7)===w 的那个周一
    for (let day = (w - 1) * 7 + 1; day <= w * 7; day++) {
      const d = new Date(y, m - 1, day);
      if (d.getMonth() !== m - 1) break;
      if ((d.getDay() || 7) === 1) return d;
    }
    return null;
  };
  const rows = db.prepare('SELECT DISTINCT week_key FROM weekly_reports').all();
  const move = db.prepare('UPDATE OR REPLACE weekly_reports SET week_key=? WHERE week_key=?');
  const tx = db.transaction(() => {
    for (const { week_key } of rows) {
      const mm = /^(\d{4})-(\d{1,2})-([1-5])$/.exec(String(week_key)); // legacy 第几周恒为单位数
      if (!mm) continue;
      const y = Number(mm[1]); const m = Number(mm[2]); const w = Number(mm[3]);
      let monday = null;
      if (w === 1) {
        // 旧代码「第5周→次月第1周」进位:上月末周(周一≥29)被存成本月第1周。优先还原到上月那个周一。
        const py = m === 1 ? y - 1 : y;
        const pm = m === 1 ? 12 : m - 1;
        const lm = lastMondayOfMonth(py, pm);
        if (lm && Math.ceil(lm.getDate() / 7) >= 5) monday = lm;
      }
      if (!monday) monday = mondayInMonthWeek(y, m, w);
      if (!monday) continue;
      const key = `${monday.getFullYear()}-${pad2(monday.getMonth() + 1)}-${pad2(monday.getDate())}`;
      if (key !== week_key) move.run(key, week_key);
    }
  });
  tx();
}

// 仅在列缺失时 ALTER TABLE ADD COLUMN（SQLite 无 IF NOT EXISTS，靠 PRAGMA 自查）。
function ensureColumns(table, cols) {
  const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  for (const [name, type] of cols) {
    if (!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type};`);
  }
}

// 【危险·显式】清库重建：DROP 全部业务表并清掉版本记录。仅供 --reset 流程调用，
// app 启动路径（seed→migrate）永不触及此函数。
export function dropAllTables() {
  db.pragma('foreign_keys = OFF');
  const drop = db.transaction(() => {
    for (const t of ALL_TABLES) db.exec(`DROP TABLE IF EXISTS ${t};`);
    db.exec(`DELETE FROM meta WHERE key='schema_version';`);
  });
  drop();
  db.pragma('foreign_keys = ON');
}

// 跨平台入口判断：Windows 下 process.argv[1] 是反斜杠/含空格的路径，
// 直接拼 `file://` 与 import.meta.url 永远不相等，故用 pathToFileURL 归一化。
// argv[1] 判空不能省：`node -e` / REPL / 嵌入式场景下它是 undefined，
// pathToFileURL(undefined) 会抛 ERR_INVALID_ARG_TYPE，导致「import 本模块」直接崩。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--reset')) {
    // 显式清库重建：需 CONFIRM_RESET=1 双重确认，且先自动在线备份，绝不可被误触发。
    if (process.env.CONFIRM_RESET !== '1') {
      console.error('[migrate] 已拒绝清库：--reset 必须同时设置环境变量 CONFIRM_RESET=1 以确认。');
      console.error('[migrate] 该操作会 DROP 全部业务表并按最新 schema 重建，除自动备份外数据不可恢复。');
      process.exit(1);
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = resolve(__dirname, '../../../backup');
    mkdirSync(backupDir, { recursive: true });
    const out = resolve(backupDir, `ferr-before-reset-${stamp}.sqlite`);
    db.backup(out)
      .then(() => {
        console.log('[migrate] 清库前已备份 ->', out);
        dropAllTables();
        migrate();
        console.log('[migrate] 清库重建完成，schema V' + SCHEMA_VERSION);
        process.exit(0);
      })
      .catch((e) => {
        console.error('[migrate] 备份失败，已中止清库（未做任何改动）：', e.message);
        process.exit(1);
      });
  } else {
    migrate();
    console.log('[migrate] schema V' + SCHEMA_VERSION + ' 已就绪（前向迁移，未清库）');
  }
}
