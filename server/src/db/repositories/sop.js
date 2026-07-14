// SOP 引擎数据访问层（定义 + 完成记录）。
import { db } from '../connection.js';
import { updateById } from '../updateHelper.js';

/* ===== sop_definitions ===== */

export function listDefs({ activeOnly = true } = {}) {
  const sql = activeOnly
    ? 'SELECT * FROM sop_definitions WHERE active = 1 ORDER BY dept, freq, id'
    : 'SELECT * FROM sop_definitions ORDER BY dept, freq, id';
  return db.prepare(sql).all();
}

export function getDef(id) {
  return db.prepare('SELECT * FROM sop_definitions WHERE id = ?').get(id);
}

export function createDef(rec) {
  const info = db.prepare(
    `INSERT INTO sop_definitions (dept, freq, title, content, time_hint, active)
     VALUES (@dept, @freq, @title, @content, @time_hint, 1)`
  ).run(rec);
  return getDef(info.lastInsertRowid);
}

export function updateDef(id, fields) {
  const allowed = ['dept', 'freq', 'title', 'content', 'time_hint', 'active'];
  updateById('sop_definitions', id, fields, allowed);
  return getDef(id);
}

// 软删：active=0；保留 completions 历史。
export function softDeleteDef(id) {
  db.prepare('UPDATE sop_definitions SET active = 0 WHERE id = ?').run(id);
  return getDef(id);
}

/* ===== sop_completions ===== */

// 批量查询：?period_keys=daily=YYYY-MM-DD;weekly=YYYY-Www;monthly=YYYY-MM
// 返回当前周期所有已完成的 (sop_id, freq) → 由 route 解包后合并到 def
export function listCompletions(periodKeys) {
  // periodKeys: { daily, weekly, monthly } 三选一或多
  const keys = Object.values(periodKeys || {}).filter(Boolean);
  if (!keys.length) return [];
  const placeholders = keys.map(() => '?').join(',');
  return db.prepare(
    `SELECT * FROM sop_completions WHERE period_key IN (${placeholders})`
  ).all(...keys);
}

// 标记完成；UNIQUE(sop_id, period_key) 防重；冲突时返回已有记录（幂等）
export function markComplete(sopId, periodKey, username) {
  const exists = db.prepare(
    'SELECT * FROM sop_completions WHERE sop_id = ? AND period_key = ?'
  ).get(sopId, periodKey);
  if (exists) return exists;
  const info = db.prepare(
    `INSERT INTO sop_completions (sop_id, period_key, completed_by) VALUES (?, ?, ?)`
  ).run(sopId, periodKey, username || null);
  return db.prepare('SELECT * FROM sop_completions WHERE id = ?').get(info.lastInsertRowid);
}

// 撤销完成（仅本周期）
export function unmarkComplete(sopId, periodKey) {
  db.prepare('DELETE FROM sop_completions WHERE sop_id = ? AND period_key = ?')
    .run(sopId, periodKey);
}
