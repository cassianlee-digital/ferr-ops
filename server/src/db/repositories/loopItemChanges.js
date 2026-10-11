// 任务改动流水的数据访问层。规则（哪些字段要记、什么算改动）在 services/taskAudit.js 的 taskChanges()。
import { db } from '../connection.js';

const CHUNK = 500;
// 这两个是合成项，不算「改了几次」：done 是完成 / 撤销，multi_day 只是给「重要任务」判定留的记号
const NOT_COUNTED = "('done', 'multi_day')";

const SELECT = `SELECT c.id, c.loop_item_id, c.field, c.old_value, c.new_value, c.changed_at,
                       u.name AS changed_by_name
                  FROM loop_item_changes c LEFT JOIN users u ON u.id = c.changed_by`;

export function log(itemId, changes, userId) {
  if (!changes || !changes.length) return;
  const stmt = db.prepare(
    'INSERT INTO loop_item_changes (loop_item_id, field, old_value, new_value, changed_by) VALUES (?,?,?,?,?)'
  );
  for (const c of changes) stmt.run(itemId, c.field, c.old_value ?? null, c.new_value ?? null, userId ?? null);
}

// 某条任务的全部改动，新的在前
export function byItem(itemId) {
  return db.prepare(`${SELECT} WHERE c.loop_item_id = ? ORDER BY c.id DESC`).all(itemId);
}

function inChunks(ids, fn) {
  for (let i = 0; i < ids.length; i += CHUNK) fn(ids.slice(i, i + CHUNK));
}
const marks = (part) => part.map(() => '?').join(',');

// 一批任务的全部改动，按任务分组、时间正序（周度审核用）
export function byItems(ids) {
  const out = {};
  inChunks(ids, (part) => {
    for (const r of db.prepare(`${SELECT} WHERE c.loop_item_id IN (${marks(part)}) ORDER BY c.id ASC`).all(...part)) {
      (out[r.loop_item_id] ||= []).push(r);
    }
  });
  return out;
}

// 每条任务被改过几次：{ id → n }
export function counts(ids) {
  const out = {};
  inChunks(ids, (part) => {
    const rows = db.prepare(
      `SELECT loop_item_id, COUNT(*) n FROM loop_item_changes
        WHERE loop_item_id IN (${marks(part)}) AND field NOT IN ${NOT_COUNTED} GROUP BY loop_item_id`
    ).all(...part);
    for (const r of rows) out[r.loop_item_id] = r.n;
  });
  return out;
}

// 哪些任务曾被执行人从跨天改成单日
export function shortenedIds(ids) {
  const out = new Set();
  inChunks(ids, (part) => {
    const rows = db.prepare(
      `SELECT DISTINCT loop_item_id FROM loop_item_changes WHERE loop_item_id IN (${marks(part)}) AND field = 'multi_day'`
    ).all(...part);
    for (const r of rows) out.add(r.loop_item_id);
  });
  return out;
}

export function removeByItem(itemId) {
  db.prepare('DELETE FROM loop_item_changes WHERE loop_item_id = ?').run(itemId);
}
