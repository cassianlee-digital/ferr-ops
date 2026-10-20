// SOP 引擎数据访问层（定义 + 完成记录）。
import { db } from '../connection.js';
import { updateById } from '../updateHelper.js';

/* ===== sop_definitions ===== */

export function listDefs({ activeOnly = true } = {}) {
  // sort_order 来自老板文档里的行序（表是按优先级从上往下排的，顺序本身是信息：
  // 「时间不够时从最下面往上砍」）。没填的老条目排在后面，不插队。
  const order = ' ORDER BY dept, freq, COALESCE(sort_order, 9999), id';
  const sql = activeOnly
    ? 'SELECT * FROM sop_definitions WHERE active = 1' + order
    : 'SELECT * FROM sop_definitions' + order;
  return db.prepare(sql).all();
}

export function getDef(id) {
  return db.prepare('SELECT * FROM sop_definitions WHERE id = ?').get(id);
}

// v2 新增列按清单归一：调用方少给的补 null，INSERT 的具名参数才不会缺。
const DEF_COLS = ['dept', 'freq', 'title', 'content', 'time_hint',
  'track', 'code', 'target_qty', 'unit', 'effort_h', 'metric', 'why', 'how', 'done_when',
  'subject_label', 'sort_order', 'source'];

export function createDef(rec) {
  const row = {};
  for (const c of DEF_COLS) row[c] = rec?.[c] ?? null;
  if (!row.track) row.track = row.dept; // 老口径：没给赛道就跟部门同值，不留空
  const info = db.prepare(
    `INSERT INTO sop_definitions (${DEF_COLS.join(', ')}, active)
     VALUES (${DEF_COLS.map((c) => '@' + c).join(', ')}, 1)`
  ).run(row);
  return getDef(info.lastInsertRowid);
}

export function updateDef(id, fields) {
  const allowed = [...DEF_COLS, 'active'];
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

// 区间内的完成记录，按打卡发生时间（completed_at）算。
// 不按 period_key 过滤：daily 的 key 是日期能比，weekly 的是 ISO 周号没法跟日期区间比，
// 而 ISO 周只在前端算一份（全项目约定），服务端不重算。
export function completionsBetween(from, to) {
  return db.prepare(
    `SELECT c.*, d.dept AS dept, d.freq AS freq
       FROM sop_completions c
       JOIN sop_definitions d ON d.id = c.sop_id
      WHERE date(c.completed_at) BETWEEN @from AND @to`
  ).all({ from, to });
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

/* ===== sop_logs：执行流水（一次执行一行）=====
   completions 回答「这个周期做没做」，logs 回答「做了哪几个、分别是什么、证据在哪」。
   两张表一起写：打一条流水 → upsert 一条 completion，周报执行率那套口径一行不用改。 */

export function listLogs(periodKeys) {
  const keys = Object.values(periodKeys || {}).filter(Boolean);
  if (!keys.length) return [];
  const ph = keys.map(() => '?').join(',');
  return db.prepare(
    `SELECT * FROM sop_logs WHERE period_key IN (${ph}) ORDER BY day_key DESC, id DESC`
  ).all(...keys);
}

// 某条 SOP 的历史流水（最近 N 条）。前端展开「这条都做过什么」时用。
export function logsForSop(sopId, limit = 30) {
  return db.prepare(
    'SELECT * FROM sop_logs WHERE sop_id = ? ORDER BY day_key DESC, id DESC LIMIT ?'
  ).all(sopId, Math.max(1, Math.min(200, Number(limit) || 30)));
}

// 当前周期每条 SOP 已完成的数量。done_qty 用 SUM(qty)，不是 COUNT(*)——
// 一次补录 3 篇是一行 qty=3，按行数数会把它算成 1，配额永远追不平。
export function progress(periodKeys) {
  const keys = Object.values(periodKeys || {}).filter(Boolean);
  if (!keys.length) return [];
  const ph = keys.map(() => '?').join(',');
  return db.prepare(
    `SELECT sop_id, period_key, SUM(qty) AS done_qty, COUNT(*) AS log_count, MAX(day_key) AS last_day
       FROM sop_logs WHERE period_key IN (${ph})
      GROUP BY sop_id, period_key`
  ).all(...keys);
}

// 区间流水（周报 / 绩效用）。按 day_key 过滤：它就是执行日，和区间同量纲。
export function logsBetween(from, to) {
  return db.prepare(
    `SELECT l.*, d.dept AS dept, d.track AS track, d.freq AS freq,
            d.target_qty AS target_qty, d.title AS title, d.code AS code
       FROM sop_logs l
       JOIN sop_definitions d ON d.id = l.sop_id
      WHERE l.day_key BETWEEN @from AND @to
      ORDER BY l.day_key ASC, l.id ASC`
  ).all({ from, to });
}

export function getLog(id) {
  return db.prepare('SELECT * FROM sop_logs WHERE id = ?').get(id);
}

export function addLog(rec) {
  const info = db.prepare(
    `INSERT INTO sop_logs (sop_id, period_key, day_key, qty, subject, detail, evidence_url, logged_by)
     VALUES (@sop_id, @period_key, @day_key, @qty, @subject, @detail, @evidence_url, @logged_by)`
  ).run({
    sop_id: rec.sop_id, period_key: rec.period_key, day_key: rec.day_key,
    qty: rec.qty ?? 1, subject: rec.subject ?? null, detail: rec.detail ?? null,
    evidence_url: rec.evidence_url ?? null, logged_by: rec.logged_by ?? null,
  });
  return getLog(info.lastInsertRowid);
}

export function deleteLog(id) {
  const row = getLog(id);
  if (row) db.prepare('DELETE FROM sop_logs WHERE id = ?').run(id);
  return row;
}

// 本周期还剩几条流水。撤销最后一条流水时要据此决定 completion 是否一并撤销——
// 还有别的流水就说明这周期确实做过，勾不能跟着消失。
export function countLogs(sopId, periodKey) {
  const r = db.prepare('SELECT COUNT(*) AS n FROM sop_logs WHERE sop_id = ? AND period_key = ?')
    .get(sopId, periodKey);
  return r ? r.n : 0;
}

// 近 N 天里带证据链接的流水（含它挂在哪条 SOP 上）。给「同一条链接记了两次」的软提醒用。
// 只取有链接的行：没链接就没法比，拉回来是白费。
export function logsWithEvidenceSince(sinceDay) {
  return db.prepare(
    `SELECT l.id, l.sop_id, l.day_key, l.evidence_url, l.logged_by,
            d.title AS title, d.code AS code, d.track AS track
       FROM sop_logs l
       JOIN sop_definitions d ON d.id = l.sop_id
      WHERE l.evidence_url IS NOT NULL AND l.evidence_url <> '' AND l.day_key >= ?
      ORDER BY l.day_key DESC, l.id DESC`
  ).all(sinceDay);
}
