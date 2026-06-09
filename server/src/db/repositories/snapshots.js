// 月度快照数据访问层（总览环比用）。
import { db } from '../connection.js';

export function upsert(month, { company_score, a_ratio, valid_rate }) {
  db.prepare(
    `INSERT INTO monthly_snapshots (month, company_score, a_ratio, valid_rate, updated_at)
     VALUES (?,?,?,?,datetime('now'))
     ON CONFLICT(month) DO UPDATE SET
       company_score=excluded.company_score, a_ratio=excluded.a_ratio,
       valid_rate=excluded.valid_rate, updated_at=excluded.updated_at`
  ).run(month, company_score, a_ratio, valid_rate);
}

// 给定月份之前最近的一个月快照（用于环比）
export function prevBefore(month) {
  return db
    .prepare('SELECT * FROM monthly_snapshots WHERE month < ? ORDER BY month DESC LIMIT 1')
    .get(month);
}
