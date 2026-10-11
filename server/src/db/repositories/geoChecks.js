// GEO 引用抽查数据访问层：固定题库 + 每轮抽查记录。
import { db } from '../connection.js';

export function listQuestions() {
  return db.prepare('SELECT * FROM geo_questions ORDER BY active DESC, id ASC').all();
}
export function getQuestion(id) {
  return db.prepare('SELECT * FROM geo_questions WHERE id = ?').get(id);
}
export function activeQuestionCount() {
  return db.prepare('SELECT COUNT(*) n FROM geo_questions WHERE active = 1').get().n;
}
export function findQuestion(text) {
  return db.prepare('SELECT * FROM geo_questions WHERE question = ?').get(text);
}
export function createQuestion(question, userId) {
  const info = db.prepare('INSERT INTO geo_questions (question, created_by) VALUES (?, ?)').run(question, userId ?? null);
  return getQuestion(info.lastInsertRowid);
}
// 只能启用 / 停用。问题的文字不提供修改：改了字就不是同一个问题，之前各轮的结果就对不上了。
export function setQuestionActive(id, active) {
  db.prepare('UPDATE geo_questions SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
  return getQuestion(id);
}

const CHECK_SELECT = `SELECT c.*, u.name AS checked_by_name,
    (SELECT COUNT(*) FROM attachments a WHERE a.owner_type = 'geo_check' AND a.owner_id = c.id) AS images
  FROM geo_checks c LEFT JOIN users u ON u.id = c.checked_by`;

export function getCheck(id) {
  return db.prepare(`${CHECK_SELECT} WHERE c.id = ?`).get(id);
}
export function listRound(roundDate) {
  return db.prepare(`${CHECK_SELECT} WHERE c.round_date = ? ORDER BY c.question_id, c.engine`).all(roundDate);
}
// 有过记录的轮次，新的在前
export function rounds() {
  return db.prepare('SELECT round_date, COUNT(*) n FROM geo_checks GROUP BY round_date ORDER BY round_date DESC LIMIT 60').all();
}
// 某个日期（含）之前最近的一轮；没有则 null
export function latestRoundOnOrBefore(date) {
  const row = db.prepare('SELECT MAX(round_date) d FROM geo_checks WHERE round_date <= ?').get(date);
  return row.d || null;
}
export function previousRound(roundDate) {
  const row = db.prepare('SELECT MAX(round_date) d FROM geo_checks WHERE round_date < ?').get(roundDate);
  return row.d || null;
}

export function hasLaterRound(roundDate) {
  return Boolean(db.prepare('SELECT 1 FROM geo_checks WHERE round_date > ? LIMIT 1').get(roundDate));
}
// 这一轮定格的题数；没记过是 null
export function roundSnapshot(roundDate) {
  const row = db.prepare('SELECT question_count FROM geo_rounds WHERE round_date = ?').get(roundDate);
  return row ? row.question_count : null;
}

// 同一轮、同一题、同一引擎只有一条：再存就是更新（查错了要能改）
export const upsertCheck = db.transaction((rec, userId) => {
  // 顺手记下「这一轮当时有几道题」。只在它还是最新一轮时记：
  // 后面已经有新轮次了还来改旧记录，那是事后更正，不能把旧轮次的分母改成现在的题库
  if (!hasLaterRound(rec.round_date)) {
    db.prepare(
      `INSERT INTO geo_rounds (round_date, question_count) VALUES (?, ?)
       ON CONFLICT(round_date) DO UPDATE SET question_count = excluded.question_count, updated_at = datetime('now')`
    ).run(rec.round_date, activeQuestionCount());
  }
  db.prepare(
    `INSERT INTO geo_checks (question_id, engine, round_date, mentioned, cited, cited_url, note, checked_by)
     VALUES (@question_id, @engine, @round_date, @mentioned, @cited, @cited_url, @note, @checked_by)
     ON CONFLICT(question_id, engine, round_date) DO UPDATE SET
       mentioned = excluded.mentioned, cited = excluded.cited, cited_url = excluded.cited_url,
       note = excluded.note, checked_by = excluded.checked_by, updated_at = datetime('now')`
  ).run({ ...rec, checked_by: userId ?? null });
  const row = db.prepare('SELECT id FROM geo_checks WHERE question_id = ? AND engine = ? AND round_date = ?')
    .get(rec.question_id, rec.engine, rec.round_date);
  return getCheck(row.id);
});

export function removeCheck(id) {
  db.prepare('DELETE FROM geo_checks WHERE id = ?').run(id);
}
