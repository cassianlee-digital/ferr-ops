// 询盘数据访问层。SQL 集中于此，便于将来替换为 PostgreSQL。
import { db } from '../connection.js';

export function list() {
  return db
    .prepare('SELECT * FROM inquiries ORDER BY date DESC, id DESC')
    .all();
}

export function create(rec, userId) {
  const info = db
    .prepare(
      `INSERT INTO inquiries (date, country, region, channel, source, product, grade, note, created_by)
       VALUES (@date, @country, @region, @channel, @source, @product, @grade, @note, @created_by)`
    )
    .run({ ...rec, created_by: userId ?? null });
  return db.prepare('SELECT * FROM inquiries WHERE id = ?').get(info.lastInsertRowid);
}

export function update(id, fields) {
  const allowed = ['date', 'country', 'region', 'channel', 'source', 'product', 'grade', 'note'];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (!keys.length) return get(id);
  const set = keys.map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE inquiries SET ${set} WHERE id = @id`).run({ ...fields, id });
  return get(id);
}

export function get(id) {
  return db.prepare('SELECT * FROM inquiries WHERE id = ?').get(id);
}

export function remove(id) {
  db.prepare('DELETE FROM inquiries WHERE id = ?').run(id);
}

// 汇总：有效询盘(A+B)、A级占比、有效率、总量
export function stats() {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN grade='A' THEN 1 ELSE 0 END) AS a,
         SUM(CASE WHEN grade='B' THEN 1 ELSE 0 END) AS b,
         SUM(CASE WHEN grade='C' THEN 1 ELSE 0 END) AS c
       FROM inquiries`
    )
    .get();
  const total = row.total || 0;
  const a = row.a || 0, b = row.b || 0, c = row.c || 0;
  const valid = a + b;
  return {
    total, a, b, c, valid,
    aRatio: valid ? Math.round((a / valid) * 100) : 0,
    rate: total ? Math.round((valid / total) * 100) : 0,
  };
}
