// 建表迁移。幂等（IF NOT EXISTS），可重复执行。
// 直接运行：node src/db/migrate.js
import { db } from './connection.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('seo','sem','sales','boss')),
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
  cpc           REAL,   -- 后端算后存
  ctr           REAL,   -- 后端算后存
  cost_per_conv REAL,   -- 后端算后存
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
  mode       TEXT NOT NULL CHECK (mode IN ('r','i')),  -- r 正向越大越好 / i 反向越小越好
  unit       TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS keywords (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  type      TEXT NOT NULL CHECK (type IN ('seo','sem','high','customer')),
  keyword   TEXT NOT NULL,
  attrs     TEXT,        -- JSON: 等级/竞争/排名/落地页等
  category  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_keywords_type ON keywords(type);

CREATE TABLE IF NOT EXISTS fixes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  dept       TEXT,        -- SEO / SEM
  detail     TEXT,
  owner      TEXT,
  due_date   TEXT,
  status     TEXT,
  source     TEXT,        -- 手动 / AI诊断 / 复盘
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loop_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL CHECK (kind IN ('plan','test','deposit','task')),
  dept       TEXT,
  content    TEXT,
  owner      TEXT,
  status     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export function migrate() {
  db.exec(SCHEMA);
}

// 作为脚本直接运行时执行
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
  console.log('[migrate] schema 已就绪');
}
