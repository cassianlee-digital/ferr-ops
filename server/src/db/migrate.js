// 建表迁移。带 schema 版本：升级到 V7 时一次性清库重建（符合「清空所有数据，从0录入」）。
// 直接运行：node src/db/migrate.js
import { db } from './connection.js';

const SCHEMA_VERSION = '7';

const ALL_TABLES = [
  'users', 'inquiries', 'seo_weeks', 'sem_weeks', 'neg_keywords', 'ad_creatives',
  'rank_snapshots', 'kpi_targets', 'keywords', 'fixes', 'loop_items',
  'integrations', 'market_brain', 'market_research', 'monthly_snapshots', 'weekly_reports',
  'content_assets',
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
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- V7：第三方集成密钥（AES 加密存储）
CREATE TABLE IF NOT EXISTS integrations (
  provider   TEXT PRIMARY KEY CHECK (provider IN ('gsc','ga4','ads')),
  secret_enc TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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
  ]);
  ensureColumns('fixes', [['evidence', 'TEXT']]);

  db.prepare(
    `INSERT INTO meta (key,value) VALUES ('schema_version',?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  ).run(SCHEMA_VERSION);
}

// 仅在列缺失时 ALTER TABLE ADD COLUMN（SQLite 无 IF NOT EXISTS，靠 PRAGMA 自查）。
function ensureColumns(table, cols) {
  const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  for (const [name, type] of cols) {
    if (!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type};`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
  console.log('[migrate] schema V' + SCHEMA_VERSION + ' 已就绪');
}
