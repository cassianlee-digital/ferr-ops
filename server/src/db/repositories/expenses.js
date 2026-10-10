// 其它支出台账数据访问层（广告费在 Ads 同步表、外链费在 backlinks，这里只记其余的钱）。软删。
import { db } from '../connection.js';
import { updateById } from '../updateHelper.js';

export const COLS = ['spend_date', 'category', 'amount', 'currency', 'vendor', 'purpose',
  'dept', 'owner', 'task_id', 'evidence', 'note'];

const SELECT = `SELECT e.*, t.content AS task_content
                  FROM expenses e LEFT JOIN loop_items t ON t.id = e.task_id`;

export function list(range) {
  if (range) {
    return db.prepare(
      `${SELECT} WHERE e.deleted_at IS NULL AND e.spend_date BETWEEN @start_date AND @end_date
        ORDER BY e.spend_date DESC, e.id DESC`
    ).all(range);
  }
  return db.prepare(`${SELECT} WHERE e.deleted_at IS NULL ORDER BY e.spend_date DESC, e.id DESC`).all();
}

export function get(id) {
  return db.prepare(`${SELECT} WHERE e.id = ? AND e.deleted_at IS NULL`).get(id);
}

export function create(rec, createdBy) {
  const row = { created_by: createdBy ?? null };
  for (const c of COLS) row[c] = rec?.[c] ?? null;
  const info = db.prepare(
    `INSERT INTO expenses (${COLS.join(', ')}, created_by) VALUES (${COLS.map((c) => '@' + c).join(', ')}, @created_by)`
  ).run(row);
  return get(info.lastInsertRowid);
}

export function update(id, fields) {
  updateById('expenses', id, fields, COLS);
  return get(id);
}

export function softDelete(id) {
  return db.prepare("UPDATE expenses SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL").run(id).changes;
}

// 区间内被删掉的支出（口径同 backlinks.listDeletedPaid：按北京时间的删除日，当天建当天删的不算）
export function listDeleted(range) {
  return db.prepare(
    `SELECT * FROM expenses
      WHERE deleted_at IS NOT NULL AND amount > 0
        AND date(deleted_at, '+8 hours') BETWEEN @start_date AND @end_date
        AND date(created_at, '+8 hours') <> date(deleted_at, '+8 hours')
      ORDER BY deleted_at DESC, id DESC`
  ).all(range);
}

// 名下挂着支出的任务（判「涉及花费」用）
export function spendTaskIds() {
  return db.prepare('SELECT DISTINCT task_id FROM expenses WHERE deleted_at IS NULL AND task_id IS NOT NULL AND amount > 0')
    .all().map((r) => r.task_id);
}
