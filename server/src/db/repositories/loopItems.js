// 闭环条目数据访问层（plan/test/deposit/task）。
import { db } from '../connection.js';

export function list(kind) {
  return kind
    ? db.prepare('SELECT * FROM loop_items WHERE kind = ? ORDER BY id ASC').all(kind)
    : db.prepare('SELECT * FROM loop_items ORDER BY id ASC').all();
}

export function create(rec) {
  const info = db
    .prepare(
      `INSERT INTO loop_items (kind, dept, content, owner, status)
       VALUES (@kind,@dept,@content,@owner,@status)`
    )
    .run(rec);
  return db.prepare('SELECT * FROM loop_items WHERE id = ?').get(info.lastInsertRowid);
}

export function update(id, fields) {
  const allowed = ['dept', 'content', 'owner', 'status',
    'hypothesis', 'metric', 'due_or_budget', 'variable', 'period', 'conclusion', 'analysis'];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (!keys.length) return get(id);
  db.prepare(`UPDATE loop_items SET ${keys.map((k) => `${k}=@${k}`).join(', ')} WHERE id=@id`)
    .run({ ...fields, id });
  return get(id);
}

export function get(id) {
  return db.prepare('SELECT * FROM loop_items WHERE id = ?').get(id);
}

export function remove(id) {
  db.prepare('DELETE FROM loop_items WHERE id = ?').run(id);
}
