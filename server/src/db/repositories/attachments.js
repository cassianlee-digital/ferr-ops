// 通用附件（图片）数据访问层。
// 铁律：列表/元数据查询**绝不** SELECT *，否则每次列表都会把几 MB 的 BLOB 一起拖回内存再 JSON 化。
// 原图只有 raw() 这一条路径会读，且一次只读一张。
import { db } from '../connection.js';

const META_COLS = 'id, owner_type, owner_id, name, mime, bytes, created_at, created_by';

export function listByOwner(ownerType, ownerId) {
  return db
    .prepare(`SELECT ${META_COLS} FROM attachments WHERE owner_type=? AND owner_id=? ORDER BY id ASC`)
    .all(ownerType, ownerId);
}

// 批量取：列表页一次把整页的附件捞回来，避免 N+1。返回 {owner_id: [元数据…]}
export function metaByOwners(ownerType, ownerIds) {
  const map = {};
  if (!ownerIds.length) return map;
  const rows = db
    .prepare(`SELECT ${META_COLS} FROM attachments
              WHERE owner_type=? AND owner_id IN (${ownerIds.map(() => '?').join(',')}) ORDER BY id ASC`)
    .all(ownerType, ...ownerIds);
  for (const r of rows) (map[r.owner_id] ||= []).push(r);
  return map;
}

export function getMeta(id) {
  return db.prepare(`SELECT ${META_COLS} FROM attachments WHERE id=?`).get(id);
}

// 原图（含 BLOB）。只给 GET /api/attachments/:id/raw 用。
export function raw(id) {
  return db.prepare('SELECT id, mime, bytes, name, data FROM attachments WHERE id=?').get(id);
}

export function create({ owner_type, owner_id, name, mime, buffer, created_by }) {
  const info = db
    .prepare(
      `INSERT INTO attachments (owner_type, owner_id, name, mime, bytes, data, created_by)
       VALUES (?,?,?,?,?,?,?)`
    )
    .run(owner_type, owner_id, name ?? null, mime, buffer.length, buffer, created_by ?? null);
  return getMeta(info.lastInsertRowid);
}

export function remove(id) {
  db.prepare('DELETE FROM attachments WHERE id=?').run(id);
}

// 宿主被删时一并清掉它的附件，避免留下永远取不到宿主的孤儿图片继续占库
export function removeByOwner(ownerType, ownerId) {
  db.prepare('DELETE FROM attachments WHERE owner_type=? AND owner_id=?').run(ownerType, ownerId);
}

// 单个宿主的附件总字节数（配额校验用）
export function bytesForOwner(ownerType, ownerId) {
  const row = db
    .prepare('SELECT COALESCE(SUM(bytes),0) AS total, COUNT(*) AS n FROM attachments WHERE owner_type=? AND owner_id=?')
    .get(ownerType, ownerId);
  return { bytes: row.total || 0, count: row.n || 0 };
}
