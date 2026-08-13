// 跨天任务的每日推进打卡（task_checkins）。与 sop_completions 同构：day_key 由前端按本地日期传入。
import { db } from '../connection.js';

// 汇总：每条任务推进了几天、最后一次是哪天、今天打了没。
// 一次查完给前端渲染用——按卡逐条问后端会在日计划上打出几十个请求。
// 只统计未删/未归档任务的打卡（归档任务不再出现在日计划上）。
export function summary(dayKey) {
  return db.prepare(
    `SELECT c.loop_item_id           AS loop_item_id,
            COUNT(*)                 AS days,
            MAX(c.day_key)           AS last_day,
            MAX(CASE WHEN c.day_key = @day THEN 1 ELSE 0 END) AS today_done
       FROM task_checkins c
       JOIN loop_items i ON i.id = c.loop_item_id
      WHERE i.state IS NULL OR i.state NOT IN ('archived','deleted')
      GROUP BY c.loop_item_id`
  ).all({ day: dayKey || '' });
}

// 某一天的全部打卡（日计划回放：那天谁推进了哪条）
export function listForDay(dayKey) {
  return db.prepare('SELECT * FROM task_checkins WHERE day_key = ?').all(dayKey);
}

export function listForItem(loopItemId) {
  return db.prepare(
    'SELECT * FROM task_checkins WHERE loop_item_id = ? ORDER BY day_key ASC'
  ).all(loopItemId);
}

// 打卡；UNIQUE(loop_item_id, day_key) 防重。同一天再打只补备注，不新增行（幂等）。
export function mark(loopItemId, dayKey, note, username) {
  const exists = db.prepare(
    'SELECT * FROM task_checkins WHERE loop_item_id = ? AND day_key = ?'
  ).get(loopItemId, dayKey);
  if (exists) {
    if (note != null && note !== exists.note) {
      db.prepare('UPDATE task_checkins SET note = ? WHERE id = ?').run(note, exists.id);
      return db.prepare('SELECT * FROM task_checkins WHERE id = ?').get(exists.id);
    }
    return exists;
  }
  const info = db.prepare(
    'INSERT INTO task_checkins (loop_item_id, day_key, note, created_by) VALUES (?, ?, ?, ?)'
  ).run(loopItemId, dayKey, note ?? null, username || null);
  return db.prepare('SELECT * FROM task_checkins WHERE id = ?').get(info.lastInsertRowid);
}

// 撤销当天打卡（点错了就地取消，历史不动）
export function unmark(loopItemId, dayKey) {
  db.prepare('DELETE FROM task_checkins WHERE loop_item_id = ? AND day_key = ?')
    .run(loopItemId, dayKey);
}
