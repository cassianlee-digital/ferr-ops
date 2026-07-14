// 内容资产数据访问层。
import { db } from '../connection.js';
import { updateById } from '../updateHelper.js';
const FIELDS = ['name', 'problem', 'type', 'priority', 'owner', 'status', 'add_date', 'note'];

export function list() {
  return db.prepare('SELECT * FROM content_assets ORDER BY id ASC').all();
}
export function get(id) {
  return db.prepare('SELECT * FROM content_assets WHERE id = ?').get(id);
}
export function create(rec) {
  const info = db
    .prepare(
      `INSERT INTO content_assets (name,problem,type,priority,owner,status,add_date,note)
       VALUES (@name,@problem,@type,@priority,@owner,@status,@add_date,@note)`
    )
    .run({
      name: rec.name ?? '新资产', problem: rec.problem ?? '', type: rec.type ?? '',
      priority: rec.priority ?? '中', owner: rec.owner ?? '李', status: rec.status ?? '待开始',
      add_date: rec.add_date ?? new Date().toISOString().slice(0, 10), note: rec.note ?? '',
    });
  return get(info.lastInsertRowid);
}
export function update(id, fields) {
  updateById('content_assets', id, fields, FIELDS);
  return get(id);
}
export function remove(id) {
  db.prepare('DELETE FROM content_assets WHERE id = ?').run(id);
}
