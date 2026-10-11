// 外链台账数据访问层。软删：台账是审计材料，删了也要留得住「曾经有过这一条」。
import { db } from '../connection.js';
import { updateById } from '../updateHelper.js';

// 可写列（硬编码常量，不含任何请求输入，拼进 SQL 是安全的）
export const COLS = ['source_url', 'source_domain', 'target_url', 'anchor', 'method', 'rel',
  'cost', 'currency', 'vendor', 'dr', 'traffic', 'quality_note', 'status',
  'acquired_date', 'checked_date', 'owner', 'task_id', 'note'];

const SELECT = `SELECT b.*, t.content AS task_content
                  FROM backlinks b LEFT JOIN loop_items t ON t.id = b.task_id`;

/* range 可选。按上线日归区间；没填上线日的（还没上线 / 忘了填）只在「不限区间」时出现，
   并由前端单独标出来 —— 悄悄把它们算进某个月或者整个丢掉，都会让汇总对不上。 */
export function list(range) {
  if (range) {
    return db.prepare(
      `${SELECT} WHERE b.deleted_at IS NULL AND b.acquired_date BETWEEN @start_date AND @end_date
        ORDER BY b.acquired_date DESC, b.id DESC`
    ).all(range);
  }
  return db.prepare(`${SELECT} WHERE b.deleted_at IS NULL ORDER BY COALESCE(b.acquired_date, '9999') DESC, b.id DESC`).all();
}

export function get(id) {
  return db.prepare(`${SELECT} WHERE b.id = ? AND b.deleted_at IS NULL`).get(id);
}

export function create(rec, createdBy) {
  const row = { created_by: createdBy ?? null };
  for (const c of COLS) row[c] = rec?.[c] ?? null;
  const info = db.prepare(
    `INSERT INTO backlinks (${COLS.join(', ')}, created_by) VALUES (${COLS.map((c) => '@' + c).join(', ')}, @created_by)`
  ).run(row);
  return get(info.lastInsertRowid);
}

export function update(id, fields) {
  updateById('backlinks', id, fields, COLS);
  return get(id);
}

// 写回自动核查结果。找到了链接也算一次核查，顺手把「最近核查日」更新为今天（由调用方按业务日期传入）；
// 没找到 / 没取到则不动 checked_date —— 那一天并没有确认它还在。status 永远不在这里改。
// auto_lost_at：上次还找得到、这次页面取到了却没有 → 记下时刻（右边的 auto_status 是更新前的旧值）；
// 「页面没取到」不算丢（多半是对方临时拦了），再次找到就清空。
export function saveAutoCheck(id, result, checkedDate) {
  db.prepare(
    `UPDATE backlinks SET auto_status=@auto_status, auto_checked_at=datetime('now'), auto_detail=@auto_detail,
            auto_rel=@auto_rel, auto_anchor=@auto_anchor,
            auto_lost_at = CASE WHEN @auto_status = 'found' THEN NULL
                                WHEN @auto_status = 'not_found' AND auto_status = 'found' THEN datetime('now')
                                ELSE auto_lost_at END,
            checked_date = CASE WHEN @auto_status = 'found' THEN @checked_date ELSE checked_date END
      WHERE id=@id`
  ).run({ id, checked_date: checkedDate, ...result });
  return get(id);
}

export function softDelete(id, userId) {
  return db.prepare("UPDATE backlinks SET deleted_at = datetime('now'), deleted_by = ? WHERE id = ? AND deleted_at IS NULL").run(userId ?? null, id).changes;
}

/* 区间内被删掉的付费外链（按北京时间的删除日）。软删之后它从台账和月度汇总里一起消失，
   周度审核靠这个把它亮出来 —— 否则一笔花得不值的钱删掉就查不到了。
   建出来当天就删的不算：那是录错了改正。 */
export function listDeletedPaid(range) {
  return db.prepare(
    `SELECT b.*, u.name AS deleted_by_name FROM backlinks b LEFT JOIN users u ON u.id = b.deleted_by
      WHERE b.deleted_at IS NOT NULL AND b.cost > 0
        AND date(b.deleted_at, '+8 hours') BETWEEN @start_date AND @end_date
        AND date(b.created_at, '+8 hours') <> date(b.deleted_at, '+8 hours')
      ORDER BY b.deleted_at DESC, b.id DESC`
  ).all(range);
}

/* 轮到自动核查的外链：填了指向页面、人工没标「失效」、从没查过或已经超过 staleDays 天没查。
   从没查过的排最前，其余按上次核查时间从旧到新 —— 每次只查一批，这样谁也不会一直排不上。 */
export function dueForAutoCheck(staleDays, limit) {
  return db.prepare(
    `SELECT * FROM backlinks
      WHERE deleted_at IS NULL AND target_url IS NOT NULL AND target_url <> '' AND COALESCE(status, '') <> '失效'
        AND (auto_checked_at IS NULL OR auto_checked_at < datetime('now', '-' || CAST(@days AS INTEGER) || ' days'))
      ORDER BY auto_checked_at IS NOT NULL, auto_checked_at ASC, id ASC
      LIMIT @limit`
  ).all({ days: Math.max(0, Number(staleDays) || 0), limit: Math.max(1, Number(limit) || 1) });
}

// 名下挂着付费外链的任务（判「涉及花费」用）
export function paidTaskIds() {
  return db.prepare('SELECT DISTINCT task_id FROM backlinks WHERE deleted_at IS NULL AND task_id IS NOT NULL AND cost > 0')
    .all().map((r) => r.task_id);
}
