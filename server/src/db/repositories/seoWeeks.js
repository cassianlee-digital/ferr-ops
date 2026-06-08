// SEO 周报数据访问层。
import { db } from '../connection.js';

export function list() {
  return db.prepare('SELECT * FROM seo_weeks ORDER BY week_date ASC, id ASC').all();
}

export function latestTwo() {
  return db.prepare('SELECT * FROM seo_weeks ORDER BY week_date DESC, id DESC LIMIT 2').all();
}

export function create(rec) {
  const info = db
    .prepare(
      `INSERT INTO seo_weeks
       (week_date, clicks, impressions, avg_position, top10_ratio, coverage, indexed_pages, bounce_rate, dwell_seconds)
       VALUES (@week_date,@clicks,@impressions,@avg_position,@top10_ratio,@coverage,@indexed_pages,@bounce_rate,@dwell_seconds)`
    )
    .run(rec);
  return db.prepare('SELECT * FROM seo_weeks WHERE id = ?').get(info.lastInsertRowid);
}
