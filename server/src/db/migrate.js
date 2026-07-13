// 建表迁移。带 schema 版本：升级到 V7 时一次性清库重建（符合「清空所有数据，从0录入」）。
// 直接运行：node src/db/migrate.js
import { pathToFileURL } from 'node:url';
import { db } from './connection.js';

const SCHEMA_VERSION = '7';

const ALL_TABLES = [
  'users', 'inquiries', 'seo_weeks', 'sem_weeks', 'neg_keywords', 'ad_creatives',
  'rank_snapshots', 'kpi_targets', 'keywords', 'fixes', 'loop_items',
  'ai_analyses', 'integrations', 'market_brain', 'market_research', 'monthly_snapshots', 'weekly_reports',
  'content_assets', 'hermes_memories', 'hermes_conversations',
  'sop_definitions', 'sop_completions',
  'google_oauth_tokens', 'google_oauth_states', 'google_sync_runs',
  'google_projects',
  'gsc_daily', 'gsc_query_daily', 'ga4_daily', 'ga4_dimension_daily',
  'google_ads_campaign_daily', 'google_ads_keyword_daily',
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
  -- 6.23 修改文档 7/9/12：客户姓名 / 跟踪反馈 / 原始等级（用于上调标红判定）
  customer_name      TEXT,
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
  task_date     TEXT,   -- 任务：日期（可选）
  task_hour     TEXT,   -- 任务：今日完成时间（小时 00-23）
  note          TEXT,   -- 任务：备注
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
  bounce_rate     REAL,
  avg_session_duration REAL,
  sync_run_id     INTEGER REFERENCES google_sync_runs(id),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (date, property_id, dimension_type, dimension_value)
);
CREATE INDEX IF NOT EXISTS idx_ga4_dimension_daily_type ON ga4_dimension_daily(dimension_type, date);

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
`;

export function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);`);
  const row = db.prepare(`SELECT value FROM meta WHERE key='schema_version'`).get();
  const current = row?.value;

  if (current !== SCHEMA_VERSION) {
    // 升级到 V7：一次性清库重建（符合「清空所有数据」决策）。仅在版本不匹配时执行一次。
    db.pragma('foreign_keys = OFF');
    const drop = db.transaction(() => {
      for (const t of ALL_TABLES) db.exec(`DROP TABLE IF EXISTS ${t};`);
    });
    drop();
    db.pragma('foreign_keys = ON');
  }

  db.exec(SCHEMA);

  // 幂等加列：对已存在的旧库补充新增字段（不升版本、不清库，避免数据丢失）。
  ensureColumns('loop_items', [
    ['hypothesis', 'TEXT'], ['metric', 'TEXT'], ['due_or_budget', 'TEXT'],
    ['variable', 'TEXT'], ['period', 'TEXT'], ['conclusion', 'TEXT'],
    ['analysis', 'TEXT'],
    ['task_date', 'TEXT'], ['task_hour', 'TEXT'], ['note', 'TEXT'],
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
  ]);
  ensureColumns('ga4_dimension_daily', [
    ['bounce_rate', 'REAL'], ['avg_session_duration', 'REAL'], // 页面级跳出率散点 + 来源级跳出/时长
  ]);
  // 6.23 修改文档 7/9/12：inquiries 加客户姓名 / 跟踪反馈 / 原始等级
  ensureColumns('inquiries', [
    ['customer_name', 'TEXT'], ['tracking_feedback', 'TEXT'], ['original_grade', 'TEXT'],
    ['state', 'TEXT'], ['archived_at', 'TEXT'], // P3：询盘软删→归档
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
  // 索引：旧库 db.exec(SCHEMA) 已建表，索引语句 IF NOT EXISTS 幂等，重复 exec 无害
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_loop_items_state_kind ON loop_items(state, kind)'); } catch (e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_fixes_state ON fixes(state)'); } catch (e) {}

  // 周报 week_key 从「年-月-第几周」升级为「本周周一日期 YYYY-MM-DD」，根治相邻周撞 key。幂等。
  try { migrateWeeklyKeysToMonday(); } catch (e) {}

  db.prepare(
    `INSERT INTO meta (key,value) VALUES ('schema_version',?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  ).run(SCHEMA_VERSION);
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

// 跨平台入口判断：Windows 下 process.argv[1] 是反斜杠/含空格的路径，
// 直接拼 `file://` 与 import.meta.url 永远不相等，故用 pathToFileURL 归一化。
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrate();
  console.log('[migrate] schema V' + SCHEMA_VERSION + ' 已就绪');
}
