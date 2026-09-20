// 关键词库数据访问层。attrs 以 JSON 存放各词库的差异化列（等级/竞争/排名/落地页等）。
import { db } from '../connection.js';
import * as attachRepo from './attachments.js';

export const KEYWORD_OWNER_TYPE = 'keyword';

function parse(row) {
  if (!row) return row;
  let attrs = {};
  try { attrs = row.attrs ? JSON.parse(row.attrs) : {}; } catch {}
  return { ...row, attrs };
}

/* 「客户信息词库」的业务反馈是图片。批量挂元数据（不含 BLOB），
   前端拿 id 去 /api/attachments/:id/raw 取图 —— 列表接口不背几 MB 的图片。
   只给 type='customer' 挂：别的词库没这一栏，挂了白费一次查询。 */
function attachImages(rows) {
  const targets = rows.filter((r) => r.type === 'customer');
  if (!targets.length) return rows;
  const map = attachRepo.metaByOwners(KEYWORD_OWNER_TYPE, targets.map((r) => r.id));
  for (const r of targets) r.images = map[r.id] || [];
  return rows;
}

export function list(type) {
  const rows = type
    ? db.prepare('SELECT * FROM keywords WHERE type = ? ORDER BY id ASC').all(type)
    : db.prepare('SELECT * FROM keywords ORDER BY type, id ASC').all();
  return attachImages(rows.map(parse));
}

export function get(id) {
  const row = parse(db.prepare('SELECT * FROM keywords WHERE id = ?').get(id));
  return row ? attachImages([row])[0] : row;
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
  attachRepo.removeByOwner(KEYWORD_OWNER_TYPE, id); // 连带删图，不留孤儿 BLOB
  db.prepare('DELETE FROM keywords WHERE id = ?').run(id);
}
