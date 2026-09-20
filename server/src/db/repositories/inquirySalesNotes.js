// 业务反馈（业务员针对某条询盘发回来的一段话 + 若干张图）数据访问层。
// 与 inquiry_feedbacks（运营自己记的跟进进度）刻意分表，见 migrate.js 的表注释。
import { db } from '../connection.js';
import * as attachRepo from './attachments.js';

export const OWNER_TYPE = 'inquiry_sales_note';

const SELECT = `SELECT n.id, n.inquiry_id, n.text, n.created_at, u.name AS created_by_name
                  FROM inquiry_sales_notes n LEFT JOIN users u ON u.id = n.created_by`;

function withImages(rows) {
  const map = attachRepo.metaByOwners(OWNER_TYPE, rows.map((r) => r.id));
  for (const r of rows) r.images = map[r.id] || [];
  return rows;
}

// 批量取：询盘列表一次把区间内所有业务反馈 + 图片元数据捞回来，避免 N+1。新的在前。
export function byInquiry(inquiryIds) {
  const map = {};
  if (!inquiryIds.length) return map;
  const rows = withImages(
    db
      .prepare(`${SELECT} WHERE n.inquiry_id IN (${inquiryIds.map(() => '?').join(',')})
                ORDER BY n.created_at DESC, n.id DESC`)
      .all(...inquiryIds)
  );
  for (const r of rows) (map[r.inquiry_id] ||= []).push(r);
  return map;
}

export function list(inquiryId) {
  return withImages(
    db.prepare(`${SELECT} WHERE n.inquiry_id = ? ORDER BY n.created_at DESC, n.id DESC`).all(inquiryId)
  );
}

export function get(id) {
  const row = db.prepare(`${SELECT} WHERE n.id = ?`).get(id);
  return row ? withImages([row])[0] : row;
}

export function create(inquiryId, text, userId) {
  const info = db
    .prepare(`INSERT INTO inquiry_sales_notes (inquiry_id, text, created_by) VALUES (?,?,?)`)
    .run(inquiryId, text ?? null, userId ?? null);
  return get(info.lastInsertRowid);
}

export function update(id, text) {
  db.prepare('UPDATE inquiry_sales_notes SET text=? WHERE id=?').run(text ?? null, id);
  return get(id);
}

// 删记录时同删它的图片，不留孤儿 BLOB
export function remove(id) {
  attachRepo.removeByOwner(OWNER_TYPE, id);
  db.prepare('DELETE FROM inquiry_sales_notes WHERE id=?').run(id);
}

// 询盘被物理删除时用：先清掉每条业务反馈的图片，再清记录本身
export function removeByInquiry(inquiryId) {
  for (const r of db.prepare('SELECT id FROM inquiry_sales_notes WHERE inquiry_id=?').all(inquiryId)) {
    attachRepo.removeByOwner(OWNER_TYPE, r.id);
  }
  db.prepare('DELETE FROM inquiry_sales_notes WHERE inquiry_id=?').run(inquiryId);
}
