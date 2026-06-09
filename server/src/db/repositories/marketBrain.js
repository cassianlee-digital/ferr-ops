// 市场 AI 记忆体（单行 id=1）数据访问层。
import { db } from '../connection.js';

export function get() {
  return db.prepare('SELECT * FROM market_brain WHERE id = 1').get();
}

export function update(hash, summary, month) {
  db.prepare(
    `INSERT INTO market_brain (id, last_analyzed_hash, cached_summary, analyzed_month, updated_at)
     VALUES (1, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       last_analyzed_hash=excluded.last_analyzed_hash,
       cached_summary=excluded.cached_summary,
       analyzed_month=excluded.analyzed_month,
       updated_at=excluded.updated_at`
  ).run(hash, summary, month);
}
