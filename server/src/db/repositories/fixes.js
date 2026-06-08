// 整改清单数据访问层。
import { db } from '../connection.js';

export function list() {
  return db.prepare('SELECT * FROM fixes ORDER BY id ASC').all();
}

export function create(rec) {
  const info = db
    .prepare(
      `INSERT INTO fixes (title, dept, detail, owner, due_date, status, source)
       VALUES (@title,@dept,@detail,@owner,@due_date,@status,@source)`
    )
    .run(rec);
  return db.prepare('SELECT * FROM fixes WHERE id = ?').get(info.lastInsertRowid);
}

export function update(id, fields) {
  const allowed = ['title', 'dept', 'detail', 'owner', 'due_date', 'status', 'source'];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (!keys.length) return get(id);
  db.prepare(`UPDATE fixes SET ${keys.map((k) => `${k}=@${k}`).join(', ')} WHERE id=@id`)
    .run({ ...fields, id });
  return get(id);
}

export function get(id) {
  return db.prepare('SELECT * FROM fixes WHERE id = ?').get(id);
}
