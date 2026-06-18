// SEM weekly reports repository.
import { db } from '../connection.js';

export function list(range) {
  if (range && range.start_date && range.end_date) {
    return db
      .prepare('SELECT * FROM sem_weeks WHERE week_date BETWEEN @start_date AND @end_date ORDER BY week_date ASC, id ASC')
      .all({ start_date: range.start_date, end_date: range.end_date });
  }
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
