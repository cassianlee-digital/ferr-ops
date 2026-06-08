// 广告创意库数据访问层。
import { db } from '../connection.js';

export function list() {
  return db.prepare('SELECT * FROM ad_creatives ORDER BY id ASC').all();
}

export function create(rec) {
  const info = db
    .prepare(
      `INSERT INTO ad_creatives (title, description, ctr, ab_conclusion, status)
       VALUES (@title,@description,@ctr,@ab_conclusion,@status)`
    )
    .run(rec);
  return db.prepare('SELECT * FROM ad_creatives WHERE id = ?').get(info.lastInsertRowid);
}

export function update(id, fields) {
  const allowed = ['title', 'description', 'ctr', 'ab_conclusion', 'status'];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (!keys.length) return get(id);
  db.prepare(`UPDATE ad_creatives SET ${keys.map((k) => `${k}=@${k}`).join(', ')} WHERE id=@id`)
    .run({ ...fields, id });
  return get(id);
}

export function get(id) {
  return db.prepare('SELECT * FROM ad_creatives WHERE id = ?').get(id);
}
