// SEM 周报数据访问层。
import { db } from '../connection.js';

export function list() {
  return db.prepare('SELECT * FROM sem_weeks ORDER BY week_date ASC, id ASC').all();
}

export function latest() {
  return db.prepare('SELECT * FROM sem_weeks ORDER BY week_date DESC, id DESC LIMIT 1').get();
}

export function create(rec) {
  const info = db
    .prepare(
      `INSERT INTO sem_weeks
       (week_date, cost, impressions, clicks, conversions, roas, quality_score, cpc, ctr, cost_per_conv)
       VALUES (@week_date,@cost,@impressions,@clicks,@conversions,@roas,@quality_score,@cpc,@ctr,@cost_per_conv)`
    )
    .run(rec);
  return db.prepare('SELECT * FROM sem_weeks WHERE id = ?').get(info.lastInsertRowid);
}
