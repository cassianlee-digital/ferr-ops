// 否词库数据访问层。
import { db } from '../connection.js';

export function list() {
  return db.prepare('SELECT * FROM neg_keywords ORDER BY id ASC').all();
}

export function create(rec) {
  const info = db
    .prepare(
      `INSERT INTO neg_keywords (word, match_type, added_date, reason, source_campaign, status)
       VALUES (@word,@match_type,@added_date,@reason,@source_campaign,@status)`
    )
    .run(rec);
  return db.prepare('SELECT * FROM neg_keywords WHERE id = ?').get(info.lastInsertRowid);
}

export function update(id, fields) {
  const allowed = ['word', 'match_type', 'added_date', 'reason', 'source_campaign', 'status'];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (!keys.length) return get(id);
  db.prepare(`UPDATE neg_keywords SET ${keys.map((k) => `${k}=@${k}`).join(', ')} WHERE id=@id`)
    .run({ ...fields, id });
  return get(id);
}

export function get(id) {
  return db.prepare('SELECT * FROM neg_keywords WHERE id = ?').get(id);
}
