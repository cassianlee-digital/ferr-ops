// 关键词库数据访问层。attrs 以 JSON 存放各词库的差异化列（等级/竞争/排名/落地页等）。
import { db } from '../connection.js';

function parse(row) {
  if (!row) return row;
  let attrs = {};
  try { attrs = row.attrs ? JSON.parse(row.attrs) : {}; } catch {}
  return { ...row, attrs };
}

export function list(type) {
  const rows = type
    ? db.prepare('SELECT * FROM keywords WHERE type = ? ORDER BY id ASC').all(type)
    : db.prepare('SELECT * FROM keywords ORDER BY type, id ASC').all();
  return rows.map(parse);
}

export function get(id) {
  return parse(db.prepare('SELECT * FROM keywords WHERE id = ?').get(id));
}

export function create({ type, keyword, attrs = {}, category = null }) {
  const info = db
    .prepare('INSERT INTO keywords (type, keyword, attrs, category) VALUES (?,?,?,?)')
    .run(type, keyword, JSON.stringify(attrs || {}), category);
  return get(info.lastInsertRowid);
}

export function update(id, fields) {
  const cur = db.prepare('SELECT * FROM keywords WHERE id = ?').get(id);
  if (!cur) return null;
  const keyword = fields.keyword != null ? String(fields.keyword) : cur.keyword;
  const category = fields.category !== undefined ? fields.category : cur.category;
  let attrs = cur.attrs ? JSON.parse(cur.attrs) : {};
  if (fields.attrs && typeof fields.attrs === 'object') attrs = { ...attrs, ...fields.attrs };
  db.prepare('UPDATE keywords SET keyword=?, attrs=?, category=? WHERE id=?')
    .run(keyword, JSON.stringify(attrs), category, id);
  return get(id);
}

export function remove(id) {
  db.prepare('DELETE FROM keywords WHERE id = ?').run(id);
}
