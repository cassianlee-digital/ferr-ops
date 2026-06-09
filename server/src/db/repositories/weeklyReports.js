// 复盘周报数据访问层。四段内容以 JSON 数组存储。
import { db } from '../connection.js';

const FIELDS = ['summary', 'problems', 'analysis', 'next_plan'];

function parse(row) {
  if (!row) return row;
  const out = { ...row };
  for (const f of FIELDS) {
    try { out[f] = row[f] ? JSON.parse(row[f]) : []; } catch { out[f] = []; }
  }
  return out;
}

export function list() {
  return db.prepare('SELECT * FROM weekly_reports ORDER BY week_key DESC, dept ASC').all().map(parse);
}

export function get(week_key, dept) {
  return parse(db.prepare('SELECT * FROM weekly_reports WHERE week_key=? AND dept=?').get(week_key, dept));
}

// 写入某一段（summary/problems/analysis/next_plan），自动建行
export function upsertSection(week_key, dept, field, items) {
  if (!FIELDS.includes(field)) return null;
  db.prepare(
    `INSERT INTO weekly_reports (week_key, dept, ${field}, updated_at)
     VALUES (?,?,?,datetime('now'))
     ON CONFLICT(week_key,dept) DO UPDATE SET ${field}=excluded.${field}, updated_at=excluded.updated_at`
  ).run(week_key, dept, JSON.stringify(items || []));
  return get(week_key, dept);
}

// 确保某周两个部门的行都存在（用于「当前周」自动出现）
export function ensureWeek(week_key) {
  for (const dept of ['SEO', 'SEM']) {
    db.prepare(
      `INSERT INTO weekly_reports (week_key, dept, updated_at) VALUES (?,?,datetime('now'))
       ON CONFLICT(week_key,dept) DO NOTHING`
    ).run(week_key, dept);
  }
}
