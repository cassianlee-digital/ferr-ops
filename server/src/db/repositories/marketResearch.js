// 市场分析问卷数据访问层（P2 表格化填充；这里提供给记忆体做哈希/喂料的取数）。
import { db } from '../connection.js';

export function list() {
  return db.prepare('SELECT * FROM market_research ORDER BY sort_order, id').all();
}

export function create(rec) {
  const info = db
    .prepare('INSERT INTO market_research (section, question, answers, sort_order) VALUES (?,?,?,?)')
    .run(rec.section ?? '', rec.question ?? '', rec.answers ?? '', rec.sort_order ?? 0);
  return db.prepare('SELECT * FROM market_research WHERE id = ?').get(info.lastInsertRowid);
}

export function update(id, fields) {
  const cur = db.prepare('SELECT * FROM market_research WHERE id = ?').get(id);
  if (!cur) return null;
  db.prepare('UPDATE market_research SET section=?, question=?, answers=? WHERE id=?').run(
    fields.section ?? cur.section,
    fields.question ?? cur.question,
    fields.answers ?? cur.answers,
    id
  );
  return db.prepare('SELECT * FROM market_research WHERE id = ?').get(id);
}

export function remove(id) {
  db.prepare('DELETE FROM market_research WHERE id = ?').run(id);
}

// 拼成纯文本，用于 MD5 特征码与喂给 AI 学习
export function sourceText() {
  return list()
    .map((r) => `【${r.section || ''}】${r.question || ''}\n${r.answers || ''}`)
    .join('\n');
}
