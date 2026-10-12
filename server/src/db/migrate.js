// 建表迁移（前向、幂等、永不清库）。启动路径只会 CREATE IF NOT EXISTS + 补列。
// 清库重建是显式独立操作：`CONFIRM_RESET=1 node src/db/migrate.js --reset`（会先自动备份）。
// 普通运行：node src/db/migrate.js
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { db } from './connection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// schema 版本仅作记录与未来增量迁移的挂钩点；不再触发任何自动清库。
const SCHEMA_VERSION = '13';

const ALL_TABLES = [
  'users', 'inquiries', 'inquiry_feedbacks', 'inquiry_sales_notes', 'inquiry_leads', 'inquiry_field_changes', 'attachments',
  'seo_weeks', 'sem_weeks', 'neg_keywords', 'ad_creatives',
  'rank_snapshots', 'kpi_targets', 'kpi_period_snapshots', 'kpi_config', 'kpi_review_targets',
  'execution_loops', 'keywords', 'fixes', 'loop_items',
  'ai_analyses', 'integrations', 'market_brain', 'market_research', 'monthly_snapshots', 'weekly_reports',
  'content_assets', 'hermes_memories', 'hermes_conversations',
  'sop_definitions', 'sop_completions', 'task_checkins', 'task_links', 'backlinks', 'expenses', 'geo_questions', 'geo_checks', 'geo_rounds', 'ads_campaign_sites', 'hermes_action_runs',
  'google_oauth_tokens', 'google_oauth_states', 'google_sync_runs',
  'google_projects',
  'gsc_daily', 'gsc_query_daily', 'ga4_daily', 'ga4_dimension_daily', 'ga4_event_daily',
  'google_ads_campaign_daily', 'google_ads_keyword_daily', 'google_ads_search_term_daily',
];

const SCHEMA = `
-- 账号与角色（seo / sem / manager / boss）。
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('seo','sem','manager','boss')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 询盘：日期、国家、渠道、产品、等级、来源、是否成交，以及渠道 / 等级的确认状态。
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
  -- 询盘录入改版：客户编码 / 公司(询价通过哪个主体来的) / 业务员 / 是否成交（客户编码取代客户姓名）
  customer_code      TEXT,
  company            TEXT,
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

-- SEO 周数据（人工录入的周报口径，与 GSC 同步的事实表不是一个来源）。
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

-- SEM 周数据（人工录入的周报口径，与 Ads 同步的事实表不是一个来源）。
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

-- 否定关键词库。
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

-- 广告创意库：标题、描述、点击率、A/B 结论。
CREATE TABLE IF NOT EXISTS ad_creatives (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  description  TEXT,
  ctr          TEXT,
  ab_conclusion TEXT,
  status       TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 关键词排名快照：哪天、哪个词、排第几、落在哪个页面。
CREATE TABLE IF NOT EXISTS rank_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL,
  keyword       TEXT NOT NULL,
  rank          INTEGER,
  url           TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rank_snapshots_date ON rank_snapshots(snapshot_date);

-- KPI 指标的权重、目标值与实际值（旧版考核表盘与运营总账用；月度绩效考核的目标在 kpi_review_targets）。
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

-- KPI 绩效重构：正式考核期的冻结快照。改目标/权重不影响已结算的历史期（§29）。
-- rows_json 存当期逐指标 target/actual/data_status/score 的完整证据，score=null 表示「数据不足未评分」。
CREATE TABLE IF NOT EXISTS kpi_period_snapshots (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  period_type  TEXT NOT NULL,                 -- 'quarter' | 'month'
  period_key   TEXT NOT NULL,                 -- '2026-Q2' | '2026-08'
  owner        TEXT NOT NULL,                 -- 'company' | 'seo' | 'sem' | 'total'
  score        REAL,                          -- null = 可评分覆盖率不足，未出总分
  coverage     REAL,                          -- 可评分权重占比 0~1
  confidence   REAL,                          -- 数据可信度 0~1
  gradable     INTEGER NOT NULL DEFAULT 0,    -- 覆盖率是否达到出分地板
  rows_json    TEXT,                          -- 冻结的逐指标证据
  note         TEXT,
  settled_by   INTEGER REFERENCES users(id),
  settled_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_snap_key ON kpi_period_snapshots(period_type, period_key, owner);

-- KPI 全局参数（出分地板、评分上限、Lead 权重、考核周期等），KV 存储、可在设置页改。
CREATE TABLE IF NOT EXISTS kpi_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Phase 5A：SEO/SEM 运营问题闭环（Problem→Analysis→Action→Verification）。Execution KPI 的真实数据源。
-- 考核「有效问题是否被完整解决并验证」，非任务数量。可 source_type/source_id 溯源到 fixes/诊断（复用诊断→整改管线）。
CREATE TABLE IF NOT EXISTS execution_loops (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  channel       TEXT NOT NULL CHECK (channel IN ('seo','sem','shared')),
  owner         TEXT,
  owner_id      INTEGER REFERENCES users(id),
  problem       TEXT NOT NULL,
  analysis      TEXT,
  action        TEXT,
  impact_level  TEXT CHECK (impact_level IN ('HIGH','MEDIUM','LOW')),
  status        TEXT NOT NULL DEFAULT 'OPEN'
                CHECK (status IN ('OPEN','IN_PROGRESS','IMPLEMENTED','VERIFYING','VERIFIED','FAILED','CANCELLED')),
  verification_method       TEXT,
  verification_result       TEXT CHECK (verification_result IN ('POSITIVE','NEUTRAL','NEGATIVE')),
  verification_result_text  TEXT,
  verified      INTEGER NOT NULL DEFAULT 0,
  related_metric TEXT,
  before_value  REAL,
  after_value   REAL,
  cancel_reason TEXT,
  exclude_from_assessment INTEGER NOT NULL DEFAULT 0,  -- 仅管理员/主管确认后可置 1，排除出分母（防刷）
  source_type   TEXT,                                  -- 'fix' | 'diagnostic' | 'manual'
  source_id     INTEGER,
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  implemented_at      TEXT,
  verification_due_at TEXT,   -- 到期才进入当周期 Eligible（未到期=PENDING，不扣分）
  verified_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_execution_loops_channel ON execution_loops(channel);
CREATE INDEX IF NOT EXISTS idx_execution_loops_due ON execution_loops(verification_due_at);

-- 关键词库：SEO / SEM / 客户信息等几类共用一张表（type 区分），各类特有的属性存在 attrs 里。
CREATE TABLE IF NOT EXISTS keywords (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  type      TEXT NOT NULL CHECK (type IN ('seo','sem','high','customer')),
  keyword   TEXT NOT NULL,
  attrs     TEXT,
  category  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_keywords_type ON keywords(type);

-- 整改清单：问题、依据、动作、负责人、截止日、状态。
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

-- 闭环条目：任务、月度计划、测试登记、沉淀四种共用一张表（kind 区分）。
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

-- AI 分析结果：每个 scope 一份当前结论，重跑时旧结论进 history_json。
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

-- Google 授权令牌（加密存储，绝不返回前端）。
CREATE TABLE IF NOT EXISTS google_oauth_tokens (
  provider         TEXT PRIMARY KEY CHECK (provider IN ('gsc','ga4','ads')),
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  scope            TEXT,
  token_type       TEXT,
  expiry_date_ms   INTEGER,
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Google 授权流程里的一次性 state，用来确认回调确实是自己发起的。
CREATE TABLE IF NOT EXISTS google_oauth_states (
  state      TEXT PRIMARY KEY,
  provider   TEXT NOT NULL CHECK (provider IN ('gsc','ga4','ads')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 每一次同步的运行记录：哪个源、哪段区间、成没成功、写了多少行。
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

-- Google 项目：一组 GSC 站点 / GA4 媒体资源 / Ads 账户的对应关系。
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

-- Search Console 每日汇总：点击、曝光、点击率、平均排名。
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

-- Search Console「查询词 × 页面」每日明细。
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

-- GA4 每日汇总：用户、会话、浏览、关键事件、跳出率、平均时长。
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

-- GA4 按维度的每日数据：来源 / 国家 / 设备 / 落地页 / 广告系列（dimension_type 区分）。
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

-- GA4 每日事件：事件名、次数、用户数、关键事件数。
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

-- Google Ads 广告系列每日数据：花费、展示、点击、转化。
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

-- Google Ads 关键词每日数据。
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

-- Google Ads 真实搜索词每日数据（用户实际搜的词，不是投放的关键词）。
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
-- SOP 固定任务的定义：部门、频率（日 / 周 / 月）、标题。
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

-- SOP 的完成打卡：某条固定任务在某个周期做了没有。
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

-- 任务关联键（2026-10-10）：一条任务指向它动过的页面 / 广告系列 / 关键词，以及它想推动的 KPI。
-- 没有这张表，任务和 GSC/Ads 同步数据就是两座孤岛：能看到「做了什么」，却永远对不上
-- 「做完之后哪个数变了」。ref 的取值按 link_type：
--   page     = 页面 URL（与 gsc_query_daily.page 同写法才能对上）
--   campaign = google_ads_campaign_daily.campaign_id（只收已同步过的系列，手敲的名字对不上任何数据）
--   keyword  = 关键词原文（小写；对 gsc_query_daily.query / google_ads_keyword_daily.keyword_text）
--   kpi      = services/taskAudit.js 的 TASK_KPIS 里的 key
CREATE TABLE IF NOT EXISTS task_links (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  loop_item_id  INTEGER NOT NULL,
  link_type     TEXT NOT NULL CHECK (link_type IN ('page','campaign','keyword','kpi')),
  ref           TEXT NOT NULL,
  label         TEXT,                                       -- 展示名（系列名 / KPI 名）；page、keyword 留空
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(loop_item_id, link_type, ref)
);
CREATE INDEX IF NOT EXISTS idx_task_links_item ON task_links(loop_item_id);
CREATE INDEX IF NOT EXISTS idx_task_links_ref ON task_links(link_type, ref);

-- 任务改动流水（2026-10-11）。询盘改渠道 / 等级早就留痕，任务却没有：完成之后还能改标题、把截止日往后挪、
-- 把跨天任务改成单日来躲「重要任务要证据」，系统里一点痕迹都不剩。规则在 services/taskAudit.js 的 taskChanges()。
--   field = loop_items 的列名，或两个合成项：
--     done      完成 / 撤销完成（'0' ↔ '1'）—— 撤销会清掉 done_at，不记的话「完成过又撤销」就查不到了
--     multi_day 跨天任务被执行人改成了单日（'1' → '0'）—— 它让这条任务继续按「重要任务」要证据
-- 不设外键：彻底删除任务时由路由显式清（与 task_links 同一做法）。
CREATE TABLE IF NOT EXISTS loop_item_changes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  loop_item_id  INTEGER NOT NULL,
  field         TEXT NOT NULL,
  old_value     TEXT,
  new_value     TEXT,
  changed_by    INTEGER,
  changed_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_loop_item_changes_item ON loop_item_changes(loop_item_id, id);

-- 外链台账（2026-10-10）。经理的原话：花钱买的外链要能直接查到是哪一条、值不值；
-- 不花钱的外链做了哪些、质量怎么样，也要看得到。所以付费与免费记在同一张表里，才能并排比。
-- dr / traffic 是第三方工具（Ahrefs 等）读数，人工录入：没接这些工具的 API，不录就留空，绝不估。
-- status + checked_date：外链会失效，「最近一次核查是哪天」本身就是质量信息。
CREATE TABLE IF NOT EXISTS backlinks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_url    TEXT NOT NULL,          -- 外链所在页面
  source_domain TEXT,                   -- 由 source_url 推出，按域名汇总用
  target_url    TEXT,                   -- 指向我们的哪个页面
  anchor        TEXT,                   -- 锚文本
  method        TEXT,                   -- 购买 / 客座投稿 / 交换 / 目录提交 / 自然获得 / 其他
  rel           TEXT,                   -- dofollow / nofollow / sponsored / ugc
  cost          REAL,                   -- 花了多少；NULL 或 0 = 没花钱
  currency      TEXT,                   -- 有 cost 时必填
  vendor        TEXT,                   -- 卖家 / 中介
  dr            REAL,                   -- 来源域名评级（0~100）
  traffic       REAL,                   -- 来源站月自然流量
  quality_note  TEXT,                   -- 相关性 / 质量判断
  status        TEXT,                   -- 待上线 / 有效 / 失效
  acquired_date TEXT,                   -- 上线日（还没上线的付费外链填付款日）；花费按它归月
  checked_date  TEXT,                   -- 最近一次人工核查
  owner         TEXT,
  task_id       INTEGER,                -- 这条外链是哪条任务做出来的
  note          TEXT,
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at    TEXT                    -- 软删：台账是审计材料，不物理删
);
CREATE INDEX IF NOT EXISTS idx_backlinks_date ON backlinks(acquired_date);
CREATE INDEX IF NOT EXISTS idx_backlinks_task ON backlinks(task_id);

-- 其它支出台账：广告费从 Ads 同步、外链费在 backlinks，除此之外的钱（工具订阅、内容外包、建站技术…）记这里。
-- 三处合起来才答得上「这个月的钱都花在哪」。外链费不许记到这里 —— 否则同一笔钱会被数两遍。
CREATE TABLE IF NOT EXISTS expenses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  spend_date  TEXT NOT NULL,            -- YYYY-MM-DD
  category    TEXT NOT NULL,            -- 工具订阅 / 内容外包 / 建站技术 / 设计素材 / 其他
  amount      REAL NOT NULL,
  currency    TEXT NOT NULL,
  vendor      TEXT,                     -- 付给谁
  purpose     TEXT NOT NULL,            -- 买了什么、为什么买
  dept        TEXT,
  owner       TEXT,
  task_id     INTEGER,                  -- 这笔钱花在哪条任务上
  evidence    TEXT,                     -- 订单 / 发票链接
  note        TEXT,
  created_by  INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(spend_date);
CREATE INDEX IF NOT EXISTS idx_expenses_task ON expenses(task_id);

-- 跟踪反馈改成「多条带时间的记录」（2026-08-27）。
-- 原来 inquiries.tracking_feedback 是单个 TEXT：一条询盘只能存一段话，覆盖式保存，
-- 既不知道是哪天写的，也看不出跟进了几次 —— 复盘时等于没有证据。
-- 老列保留不动（绝不删数据），但从此只读不写，唯一真相在本表。
CREATE TABLE IF NOT EXISTS inquiry_feedbacks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id  INTEGER NOT NULL REFERENCES inquiries(id),
  text        TEXT NOT NULL,
  created_by  INTEGER REFERENCES users(id),
  -- 迁移进来的老记录 created_at 留 NULL：那段话确实没有时间戳，宁可显示「日期不详」也不编一个
  created_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_inquiry_feedbacks_inq ON inquiry_feedbacks(inquiry_id);

-- 通用附件（目前只收图片）。业务发回来的关键词截图 / 聊天记录截图等原始材料。
-- 图片以 BLOB 存库而不是落盘：生产是 Docker Compose，落盘要额外挂卷、备份也会漏，
-- 而 backup.js 备的就是这个 .db 文件 —— 存库图片跟着一起备份，少一处「备份没覆盖到」的坑。
-- 列表接口只回元数据（不含 data），原图走 GET /api/attachments/:id/raw，避免列表把图片一起拖回来。
CREATE TABLE IF NOT EXISTS attachments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type  TEXT NOT NULL,          -- 'inquiry_sales_note' | 'keyword' | 'task'（任务完成证据截图）| 'geo_check'（GEO 抽查截图）
  owner_id    INTEGER NOT NULL,
  name        TEXT,
  mime        TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  data        BLOB NOT NULL,
  created_by  INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attachments_owner ON attachments(owner_type, owner_id);

-- 业务反馈：业务员针对这条询盘发回来的东西（一段话 + 若干张图）。
-- 与「跟踪反馈」刻意分成两张表：跟踪反馈是运营自己记的跟进进度，业务反馈是业务给的原始材料，
-- 混在一张表里以后就分不清「谁说的」，复盘时等于没有证据链。
CREATE TABLE IF NOT EXISTS inquiry_sales_notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id  INTEGER NOT NULL REFERENCES inquiries(id),
  text        TEXT,
  created_by  INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inquiry_sales_notes_inq ON inquiry_sales_notes(inquiry_id);

-- GEO 引用抽查（2026-10-10）：AI 回答里有没有提到 / 引用我们，没有接口能自动拿，只能人按固定题库去问。
-- geo_questions 是题库：问题文字不可改（改了就不是同一个问题），只能停用后另加，所以没有「修改问题」这条路。
-- geo_checks 是每一轮的结果：同一轮 + 同一题 + 同一引擎只有一条。截图走 attachments(owner_type='geo_check')。
CREATE TABLE IF NOT EXISTS geo_questions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  question    TEXT NOT NULL UNIQUE,
  active      INTEGER NOT NULL DEFAULT 1,
  created_by  INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
-- GEO 引用抽查的每一格结果：某一轮 × 某个问题 × 某个引擎，提没提到、引没引用。
CREATE TABLE IF NOT EXISTS geo_checks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES geo_questions(id),
  engine      TEXT NOT NULL,            -- services/geoChecks.js 的 CHECK_ENGINE_KEYS
  round_date  TEXT NOT NULL,            -- 这一轮是哪天查的（YYYY-MM-DD）
  mentioned   INTEGER NOT NULL DEFAULT 0,  -- 回答里提到了我们
  cited       INTEGER NOT NULL DEFAULT 0,  -- 回答引用 / 链接了我们的页面
  cited_url   TEXT,
  note        TEXT,
  checked_by  INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT,
  UNIQUE(question_id, engine, round_date)
);
CREATE INDEX IF NOT EXISTS idx_geo_checks_round ON geo_checks(round_date);
-- 广告系列归到哪个站点：Ads 是一个账户几个站共用、按系列区分，这张表记「这个系列投的是哪个站」（由人指定，不自动推断）。
CREATE TABLE IF NOT EXISTS ads_campaign_sites (
  campaign_id TEXT PRIMARY KEY,
  site_id     INTEGER NOT NULL REFERENCES google_projects(id),
  set_by      INTEGER REFERENCES users(id),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
-- GEO 引用抽查每一轮定格的题数：题库会变，旧轮次的「应查几题」不能跟着现在的题库变（规矩见 services/geoChecks.js 的 roundExpected）。
CREATE TABLE IF NOT EXISTS geo_rounds (
  round_date     TEXT PRIMARY KEY,
  question_count INTEGER NOT NULL,       -- 这一轮最后一次保存记录时，题库里启用的题数
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 询盘确认权与改动留痕（2026-10-10 移植自旧分支的设计）。
-- 等级（A/B/C）决定月度考核里 60 分的 A / B 询价数量，渠道决定「这条询盘算谁带来的」，
-- 而这两个字段录入人自己就能填、能改 —— 等于被考核的人给自己评分。
-- 没有表单证据的询盘拿不到独立于录入人的机器证据，能立的只有流程规矩：
--   ① 录入的是建议值，经理 / 老板确认后才是定稿（inquiries.attribution_status）；
--   ② 改动留痕：谁、什么时候、从什么改成什么、为什么 —— 就是本表；
--   ③ 未确认占比是页面上的明数字。
-- 老列 channel / grade 仍是生效值（所有既有消费者不用改）。
CREATE TABLE IF NOT EXISTS inquiry_field_changes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id  INTEGER NOT NULL REFERENCES inquiries(id),
  field       TEXT NOT NULL,               -- 'channel' | 'grade' | 'attribution_status'
  old_value   TEXT,
  new_value   TEXT,
  reason      TEXT,                        -- 改已确认的值时必填；建议阶段的修改可空
  changed_by  INTEGER REFERENCES users(id),
  changed_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inquiry_field_changes_inq ON inquiry_field_changes(inquiry_id, id);

-- 表单线索（2026-10-10）：独立站询盘表单提交时带着来源参数进来的原始记录。
-- 线索不是询盘：不进任何统计，要有人确认「这就是业务收到的那条」并评了等级才转成询盘（inquiry_id 回指）。
-- 被忽略的也留着并记原因 —— 垃圾询价从哪个系列 / 关键词来，正是要靠这些行去查。
CREATE TABLE IF NOT EXISTS inquiry_leads (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at       TEXT NOT NULL DEFAULT (datetime('now')),
  submission_id     TEXT,             -- 站点给的提交编号（有则用它去重）
  submitted_at      TEXT,             -- 站点记录的提交时间，原样保存
  contact_name      TEXT,
  contact_email     TEXT,
  contact_company   TEXT,
  country           TEXT,
  product           TEXT,
  message           TEXT,
  page_url          TEXT,             -- 提交表单的那个页面
  landing_page      TEXT,             -- 这次访问进站的第一个页面
  referrer          TEXT,             -- 进站时的来路
  gclid             TEXT,
  utm_source        TEXT,
  utm_medium        TEXT,
  utm_campaign      TEXT,
  utm_term          TEXT,
  utm_content       TEXT,
  campaign_id       TEXT,             -- Ads 跟踪模板带的 {campaignid}
  adgroup_id        TEXT,
  keyword           TEXT,             -- Ads 跟踪模板带的 {keyword}
  match_type        TEXT,
  suggested_channel TEXT,             -- 按机器证据建议的渠道（转询盘时人可改）
  state             TEXT NOT NULL DEFAULT 'new' CHECK (state IN ('new','converted','ignored')),
  ignore_reason     TEXT,
  inquiry_id        INTEGER,          -- 转成了哪条询盘
  handled_by        INTEGER REFERENCES users(id),
  handled_at        TEXT,
  dedupe_key        TEXT NOT NULL UNIQUE  -- 表单 webhook 会重试，同一次提交只留一条
);
CREATE INDEX IF NOT EXISTS idx_inquiry_leads_state ON inquiry_leads(state, id);

-- 月度绩效考核目标（老板《2026 运营部绩效考核表》的「目标设置」页口径）。
-- period_key = 'YYYY-MM'；'default' 行是兜底：某月没单独设就用它。两者都没有 → 该指标标「目标待定」，绝不猜。
CREATE TABLE IF NOT EXISTS kpi_review_targets (
  period_key      TEXT PRIMARY KEY,
  a_target        REAL,   -- A 级询价数量目标
  b_target        REAL,   -- B 级询价数量目标
  ad_budget       REAL,   -- 广告预算（只做基准对照，不计分）
  cost_a_target   REAL,   -- A 级询价成本目标（越低越好）
  cost_ab_target  REAL,   -- A+B 有效询价成本目标（越低越好）
  a_ratio_target  REAL,   -- A 级占比目标，0~1
  note            TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
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
    // 思考框架：为什么做 / 完成标准 / 验证日期 / 怎么验证（老板要求每条任务必须能回答这四问）
    ['task_why', 'TEXT'], ['task_done_when', 'TEXT'],
    ['task_verify_date', 'TEXT'], ['task_verify_how', 'TEXT'],
    // 可审计任务（2026-10-10，经理反馈）：光有任务名不够，要能回答「做了什么、结果如何、证据在哪、花了多久」。
    // 老行全部留 NULL —— 以前没记就是没记，归档页显示「结果未记录」，不补假值。
    ['project', 'TEXT'],          // 产品 / 项目
    ['result', 'TEXT'],           // 完成结果（勾完成时必填）
    ['task_actions', 'TEXT'],     // 具体动作：实际做了哪几件事
    ['evidence', 'TEXT'],         // 证据链接，一行一个 http(s) URL；截图走 attachments(owner_type='task')
    ['est_hours', 'REAL'],        // 预估工时（小时）
    ['actual_hours', 'REAL'],     // 实际用时（小时，完成时自报）
    ['important', 'INTEGER'],     // 1=人工标为重要；NULL=按规则判定（见 services/taskAudit.js）
    ['deleted_by', 'INTEGER'],    // 谁删的（2026-10-10）。老的删除记录留 NULL = 不知道，不猜
  ]);
  ensureColumns('expenses', [['deleted_by', 'INTEGER']]);
  // 外链的自动核查结果（2026-10-10）。与人工填的 status / checked_date 分开存：
  // 自动核查拿不到页面、或页面用脚本加载链接时都会「没找到」，那不等于外链失效，不能让它去改人工判断的状态。
  ensureColumns('backlinks', [
    ['auto_status', 'TEXT'],      // found / not_found / unreachable
    ['auto_checked_at', 'TEXT'],
    ['auto_detail', 'TEXT'],      // 给人看的一句话：看到了什么、为什么拿不到
    ['auto_rel', 'TEXT'],         // 页面上实际的链接属性
    ['auto_anchor', 'TEXT'],      // 页面上实际的锚文本
    ['auto_lost_at', 'TEXT'],     // 上次自动核查还在、这次没找到的时刻；再次找到就清空。它只是提醒，不改人工状态
    ['deleted_by', 'INTEGER'],
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
    // 询盘录入改版：客户编码 / 公司 / 业务员 / 是否成交（老库补列，老行留 NULL，不补假值）
    ['customer_code', 'TEXT'], ['company', 'TEXT'], ['salesperson', 'TEXT'], ['deal_status', 'TEXT'],
    // 询盘来源（2026-10-10）：系列 / 落地页 / 来路 / gclid / utm。来源词仍在老的 source 列。
    // src_evidence 单独记「这些来源是怎么来的」：form = 表单带回的机器证据（人改不了），manual = 人填的主张。
    // 绝不用 channel 的取值去暗示有没有证据 —— 那样被考核的人会挑着填。老行全部 NULL，不补。
    ['src_campaign_id', 'TEXT'], ['src_campaign', 'TEXT'], ['src_landing_page', 'TEXT'],
    ['src_referrer', 'TEXT'], ['src_gclid', 'TEXT'], ['src_utm', 'TEXT'],
    ['src_evidence', 'TEXT'], ['lead_id', 'INTEGER'],
    // 多站点（2026-10-12）：这条询盘是从哪个站点来的（google_projects.id）。表单来的由网址域名认出、人改不了；
    // 手工录入的可选。老行留 NULL = 没标注，不按公司或别的字段去猜。
    ['site_id', 'INTEGER'],
    // 确认状态：proposed = 录入人填的建议值 / confirmed = 经理或老板已确认。
    // 老行留 NULL = 历史未审：既不算已确认也不算刚提交，不补假值。
    ['attribution_status', 'TEXT'], ['attribution_confirmed_by', 'INTEGER'], ['attribution_confirmed_at', 'TEXT'],
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
    // 多站点（2026-10-12）：一条记录 = 一个网站。domain 用来认「这条询盘 / 这个网址是哪个站的」，company = 它属于哪家公司
    ['domain', 'TEXT'], ['company', 'TEXT'],
  ]);
  ensureColumns('hermes_action_runs', [
    ['idempotency_key', 'TEXT'], ['attempt_count', 'INTEGER NOT NULL DEFAULT 0'],
  ]);
  // Phase 5C 考核期冻结：快照补 状态/参考分/区间（旧库幂等加列）
  ensureColumns('kpi_period_snapshots', [
    ['status', 'TEXT'], ['provisional_score', 'REAL'],
    ['range_start', 'TEXT'], ['range_end', 'TEXT'],
  ]);
  // KPI 绩效重构：三级分层 + 数据状态 + 目标模式（旧库幂等加列，老行由 classifyKpiDefaults 分类）
  ensureColumns('kpi_targets', [
    ['category', 'TEXT'],                        // 评分角色：performance|diagnostic|summary
    ['perf_group', 'TEXT'],                       // 绩效分组：business|visibility|asset|execution|experiment（仅 performance）
    ['level', 'INTEGER NOT NULL DEFAULT 1'],     // 1=绩效 2=增长/资产 3=诊断（保留，兼容）
    ['target_type', 'TEXT'],                     // higher|lower|improvement|range|absolute
    ['baseline', 'REAL'],                        // improvement 模式基线
    ['target_high', 'REAL'],                     // range 模式上界
    ['scorable', 'INTEGER NOT NULL DEFAULT 1'],  // 是否进绩效评分（诊断/汇总=0；由 category 派生）
    ['data_status', 'TEXT'],                     // VALID|NOT_APPLICABLE|MISSING_DATA|INSUFFICIENT_DATA|PENDING|TRACKING_ERROR
    ['confidence', 'REAL'],
    ['sample_size', 'INTEGER'],
    ['min_sample', 'INTEGER'],
    ['attribution_source', 'TEXT'],               // 预留：SEO/SEM Lead 归因来源（当前空）
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
  try { backfillInquiryFeedbacks(); } catch (e) {}

  // KPI 绩效重构：新行补分类（category 为空才写）；一次性把旧方案(business/execution…)重映射到
  // 新评分角色(performance/diagnostic/summary)+绩效分组；配置键重命名 + 补默认。
  try { classifyKpiDefaults(); } catch (e) {}
  try { remapKpiSchemeV2(); } catch (e) {}
  try { ensurePerformanceGroupsV3(); } catch (e) {}
  try { migrateKpiConfigKeys(); } catch (e) {}
  try { seedKpiConfigDefaults(); } catch (e) {}
  try { seedReviewTargetRow(); } catch (e) {}

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

// 老的单条 tracking_feedback 迁进 inquiry_feedbacks，成为该询盘的第一条记录。
// created_at 故意留 NULL —— 老字段本来就没有时间戳，编一个日期等于伪造跟进记录。
// 老列不清空：万一迁移有问题，原始数据还在原处可比对。幂等靠 meta 标记，只跑一次。
function backfillInquiryFeedbacks() {
  const done = db.prepare("SELECT value FROM meta WHERE key='backfill_inquiry_feedbacks'").get();
  if (done) return;
  db.prepare(
    `INSERT INTO inquiry_feedbacks (inquiry_id, text, created_by, created_at)
     SELECT id, TRIM(tracking_feedback), created_by, NULL
       FROM inquiries
      WHERE tracking_feedback IS NOT NULL AND TRIM(tracking_feedback) <> ''`
  ).run();
  db.prepare("INSERT INTO meta (key,value) VALUES ('backfill_inquiry_feedbacks','1')").run();
}

// KPI 评分角色 + 绩效分组（文档点8/6）。category=评分角色(performance/diagnostic/summary)，
// perf_group=绩效分组(仅 performance)。scorable 由 category 派生：仅 performance=1。
// 说明:遵循文档「不奖励把报表做漂亮」——除 A级询盘/有效询盘成本/闭环执行度(performance)外,
// 现有 SEO/SEM 指标一律为 diagnostic;询盘总量为 summary(仅展示不评分,避免与渠道拆分后的 Lead 重复计分)。
const KPI_CLASSIFY = {
  // 旧共享指标一律 summary（仅展示，不计分）：渠道 Lead(Volume+Quality) 与 SEM CPVI 已取代它们，
  // 旧「闭环执行度」是数量式 KPI（本次重构要避免的东西）。防 Lead 重复计分（点7/8/12）。
  'total|询盘总量':       { category: 'summary', perf_group: null, scorable: 0 },
  'total|A级询盘数':      { category: 'summary', perf_group: null, scorable: 0 },
  'total|有效询盘成本':   { category: 'summary', perf_group: null, scorable: 0 },
  'total|闭环执行度':     { category: 'summary', perf_group: null, scorable: 0 },
  'seo|自然流量环比':     { category: 'diagnostic',  perf_group: null,        scorable: 0 },
  'seo|核心词 Top10 占比':{ category: 'diagnostic',  perf_group: null,        scorable: 0 },
  'seo|关键词覆盖/长尾':  { category: 'diagnostic',  perf_group: null,        scorable: 0 },
  'seo|新增收录页面':     { category: 'diagnostic',  perf_group: null,        scorable: 0 },
  'seo|跳出率':           { category: 'diagnostic',  perf_group: null,        scorable: 0 },
  'seo|页面停留时长':     { category: 'diagnostic',  perf_group: null,        scorable: 0 },
  'sem|CPC':              { category: 'diagnostic',  perf_group: null,        scorable: 0 },
  'sem|CTR':              { category: 'diagnostic',  perf_group: null,        scorable: 0 },
  'sem|质量分':           { category: 'diagnostic',  perf_group: null,        scorable: 0 },
  'sem|ROAS':             { category: 'diagnostic',  perf_group: null,        scorable: 0 },
  'sem|转化次数':         { category: 'diagnostic',  perf_group: null,        scorable: 0 },
  'sem|每次转化费用':     { category: 'diagnostic',  perf_group: null,        scorable: 0 },
};
// 新行补分类（category 为空才写），target_type 由 mode 推导。已分类的行不动（自愈 + 不覆盖）。
export function classifyKpiDefaults() {
  const rows = db.prepare('SELECT id, grp, name, mode, category FROM kpi_targets').all();
  const upd = db.prepare(
    'UPDATE kpi_targets SET category=?, perf_group=?, scorable=?, target_type=?, data_status=COALESCE(data_status,?) WHERE id=?'
  );
  for (const r of rows) {
    if (r.category) continue;
    const c = KPI_CLASSIFY[`${r.grp}|${r.name}`] || { category: 'performance', perf_group: r.grp === 'total' ? 'business' : r.grp, scorable: 1 };
    upd.run(c.category, c.perf_group, c.scorable, r.mode === 'i' ? 'lower' : 'higher', 'VALID', r.id);
  }
}
// 一次性重映射：把旧方案(category=business/execution/…)迁到新评分角色+绩效分组。meta 打标只跑一次。
function remapKpiSchemeV2() {
  const done = db.prepare("SELECT value FROM meta WHERE key='kpi_scheme_v2'").get();
  if (done) return;
  const upd = db.prepare('UPDATE kpi_targets SET category=?, perf_group=?, scorable=? WHERE grp=? AND name=?');
  for (const [key, c] of Object.entries(KPI_CLASSIFY)) {
    const [grp, name] = key.split('|');
    upd.run(c.category, c.perf_group, c.scorable, grp, name);
  }
  db.prepare("INSERT OR IGNORE INTO meta (key,value) VALUES ('kpi_scheme_v2','1')").run();
}

// Phase 4B Performance Groups（真实数据接入）。扁平权重 = 组权重 × 组内权重（引擎按 grp 内 metric.weight
// 加权，故直接扁平化即可精确复现两级权重，且 MISSING 数据拉低覆盖率而非消失）。
// data_status:VALID 的三类由 deriveRangeRows/recomputeActuals 按渠道归因实时算；其余 MISSING/NOT_APPLICABLE 占位，绝不 mock。
const PERF_GROUP_METRICS = [
  // grp, name, weight(扁平), target, mode, unit, perf_group, data_status, sort_order
  ['seo', 'SEO 有效询盘数量', 24, 15, 'r', '封', 'business',   'VALID',          20],
  ['seo', 'SEO 询盘质量指数', 16, 0.5, 'r', '',  'business',   'VALID',          21],
  ['seo', '加权商业词可见度', 12, 100, 'r', '',  'visibility',  'MISSING_DATA',   22],
  ['seo', '高意图词可见度',   9,  100, 'r', '',  'visibility',  'MISSING_DATA',   23],
  ['seo', 'GEO/AI 可见度',    9,  100, 'r', '',  'visibility',  'NOT_APPLICABLE', 24],
  ['seo', '有效页面率',       15, 60,  'r', '%', 'asset',       'MISSING_DATA',   25],
  ['seo', 'SEO 优化验证闭环', 10, 100, 'r', '%', 'execution',   'MISSING_DATA',   26],
  ['seo', 'SEO 实验学习闭环', 5,  100, 'r', '%', 'experiment',  'MISSING_DATA',   27],
  ['sem', 'SEM 有效询盘数量', 24, 15, 'r', '封', 'business',   'VALID',          20],
  ['sem', 'SEM 询盘质量指数', 16, 0.5, 'r', '',  'business',   'VALID',          21],
  ['sem', '每有效询盘成本',   25, 2000,'i', '¥', 'efficiency',  'VALID',          22],
  ['sem', '无效流量消耗率',   15, 15,  'i', '%', 'quality',     'MISSING_DATA',   23],
  ['sem', 'SEM 优化验证闭环', 10, 100, 'r', '%', 'execution',   'MISSING_DATA',   24],
  ['sem', 'SEM 实验学习闭环', 10, 100, 'r', '%', 'experiment',  'MISSING_DATA',   25],
];
// 幂等插入新绩效指标 + 把旧共享指标降级为 summary（防 Lead 重复计分，点7/8/12）。只跑一次（meta 打标）。
export function ensurePerformanceGroupsV3() {
  const done = db.prepare("SELECT value FROM meta WHERE key='kpi_perf_groups_v3'").get();
  if (done) return;
  // 空表时不跑（不设 flag）：新库由 seed 先插基础 16 行、再调本函数，避免抢在 seed 的 COUNT==0 判断前污染。
  if (!db.prepare('SELECT 1 FROM kpi_targets LIMIT 1').get()) return;
  const exists = db.prepare('SELECT id FROM kpi_targets WHERE grp=? AND name=?');
  const ins = db.prepare(
    `INSERT INTO kpi_targets (grp, name, weight, target, actual, mode, unit, sort_order, category, perf_group, scorable, target_type, data_status)
     VALUES (?,?,?,?,0,?,?,?, 'performance', ?, 1, ?, ?)`
  );
  for (const [grp, name, weight, target, mode, unit, pg, ds, sort] of PERF_GROUP_METRICS) {
    if (exists.get(grp, name)) continue;
    ins.run(grp, name, weight, target, mode, unit, sort, pg, mode === 'i' ? 'lower' : 'higher', ds);
  }
  // 旧共享绩效指标 → summary（SEM CPVI/渠道 Lead 已取代；旧「闭环执行度」是数量式 KPI，本次重构要避免的东西）
  const toSummary = db.prepare("UPDATE kpi_targets SET category='summary', scorable=0 WHERE grp='total' AND name=?");
  for (const n of ['有效询盘成本', 'A级询盘数', '闭环执行度', '询盘总量']) toSummary.run(n);
  db.prepare("INSERT OR IGNORE INTO meta (key,value) VALUES ('kpi_perf_groups_v3','1')").run();
}

// KPI 全局默认参数（仅缺失时写）。命名严格：min_coverage_to_grade=允许正式评分的最低覆盖率；
// metric_score_cap=单指标达成率上限；final_score_cap=最终分上限。
const KPI_CONFIG_DEFAULTS = {
  min_coverage_to_grade: '0.6',
  metric_score_cap: '1.0',
  final_score_cap: '1.0',
  lead_weight_a: '3',
  lead_weight_b: '1',
  lead_weight_c: '0',
  lead_quality_min_sample: '3',   // Lead Quality Index 最小样本；不足→INSUFFICIENT_DATA
  block_total_required: '0',      // 公司共享块当前无绩效 KPI，非必需（不触发 CONFIG_INCOMPLETE；点9）
  exec_impact_high: '3',          // Execution 影响权重：HIGH
  exec_impact_medium: '2',        // MEDIUM
  exec_impact_low: '1',           // LOW
  seo_period: 'quarter',
  sem_period: 'month',
  /* ===== 月度绩效考核表（老板 2026 口径）=====
     权重直接照搬老板那张表，合计 100 分；单指标达成率上限 120%（MIN(实际/目标,120%)）。
     这些键都从设置页可改 —— 老板明确说过后期会加/调指标，别写死在代码里。 */
  review_weight_a: '40',          // A 级询价数量
  review_weight_b: '20',          // B 级询价数量
  review_weight_cost_a: '10',     // A 级询价成本（广告投入 ÷ A 级数量，越低越好）
  review_weight_cost_ab: '10',    // A+B 有效询价成本
  review_weight_a_ratio: '5',     // A 级询价占比
  review_weight_weekly: '5',      // 周复盘 / 数据分析完成率
  review_weight_fix: '5',         // 问题整改闭环率
  review_weight_test: '5',        // 实验测试完成率
  review_metric_cap: '1.2',       // 单指标达成率上限（老板表：最高按 120% 计分）
  review_min_coverage: '0.6',     // 可评分权重覆盖率低于此值不出正式总分（沿用 v2 的诚实口径）
  review_budget_tolerance: '0.1', // 广告投入对预算的容忍带 ±10%（只提示，不计分）
  // 分档与绩效系数：老板表第四节。JSON 数组，min 为该档下限（含），按 min 从高到低匹配。
  review_bands: JSON.stringify([
    { min: 110, label: '超额优秀', coef: 1.2, note: '超额完成核心目标，可作为年底额外奖励的重要依据' },
    { min: 100, label: '达成目标', coef: 1.0, note: '正常全额绩效' },
    { min: 90, label: '良好', coef: 0.9, note: '部分未达标' },
    { min: 80, label: '达标', coef: 0.8, note: '基本达标，需关注短板' },
    { min: 0, label: '未达标', coef: 0.6, note: '进入整改 / 专项复盘' },
  ]),
};
// 配置键重命名迁移：score_floor→min_coverage_to_grade、score_cap→metric_score_cap（值搬过去，删旧键）。
function migrateKpiConfigKeys() {
  const get = (k) => db.prepare('SELECT value FROM kpi_config WHERE key=?').get(k);
  const rename = (oldK, newK) => {
    const o = get(oldK);
    if (!o) return;
    if (!get(newK)) db.prepare('INSERT INTO kpi_config (key, value) VALUES (?, ?)').run(newK, o.value);
    db.prepare('DELETE FROM kpi_config WHERE key=?').run(oldK);
  };
  rename('score_floor', 'min_coverage_to_grade');
  rename('score_cap', 'metric_score_cap');
}
function seedKpiConfigDefaults() {
  const ins = db.prepare('INSERT OR IGNORE INTO kpi_config (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(KPI_CONFIG_DEFAULTS)) ins.run(k, v);
}
/* 兜底目标行：只建一行全 NULL 的 'default'，让设置页永远有东西可填、接口永远有形状。
   刻意不预填任何数字 —— 目标是老板定的，编一个进去等于凭空给团队立了个假 KPI。 */
function seedReviewTargetRow() {
  db.prepare("INSERT OR IGNORE INTO kpi_review_targets (period_key) VALUES ('default')").run();
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
