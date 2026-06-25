// 询盘数据访问层。SQL 集中于此，便于将来替换为 PostgreSQL。
import { db } from '../connection.js';

// range 可选：{ start_date, end_date }(YYYY-MM-DD)。提供则按 date 区间过滤(参数化)；不提供返回全量。
// P3：默认排除已归档（state='archived'）；归档项只在归档页通过 listArchived() 取。
const NOT_ARCHIVED = "(state IS NULL OR state <> 'archived')";
export function list(range) {
  if (range && range.start_date && range.end_date) {
    return db
      .prepare(`SELECT * FROM inquiries WHERE ${NOT_ARCHIVED} AND date BETWEEN @start_date AND @end_date ORDER BY date DESC, id DESC`)
      .all({ start_date: range.start_date, end_date: range.end_date });
  }
  return db
    .prepare(`SELECT * FROM inquiries WHERE ${NOT_ARCHIVED} ORDER BY date DESC, id DESC`)
    .all();
}

// P3：归档列表（归档页「询盘」桶用），按归档时间倒序
export function listArchived() {
  return db.prepare("SELECT * FROM inquiries WHERE state='archived' ORDER BY archived_at DESC, id DESC").all();
}

// P3：软删→归档（幂等）
export function archive(id) {
  const row = get(id);
  if (!row) return null;
  if (row.state === 'archived') return row;
  db.prepare("UPDATE inquiries SET state='archived', archived_at=datetime('now') WHERE id=?").run(id);
  return get(id);
}

// P3：从归档恢复
export function restore(id) {
  const row = get(id);
  if (!row) return null;
  if (row.state !== 'archived') return row;
  db.prepare("UPDATE inquiries SET state=NULL, archived_at=NULL WHERE id=?").run(id);
  return get(id);
}

export function create(rec, userId) {
  // 6.23 文档 12/7/9：customer_name + tracking_feedback(录入时通常 null) + original_grade(=入库时的等级，用于上调标红)
  const info = db
    .prepare(
      `INSERT INTO inquiries (date, country, region, channel, source, product, grade, note, created_by,
                              customer_name, tracking_feedback, original_grade)
       VALUES (@date, @country, @region, @channel, @source, @product, @grade, @note, @created_by,
               @customer_name, @tracking_feedback, @original_grade)`
    )
    .run({
      ...rec,
      created_by: userId ?? null,
      customer_name: rec.customer_name ?? null,
      tracking_feedback: rec.tracking_feedback ?? null,
      original_grade: rec.original_grade ?? rec.grade ?? null,
    });
  return db.prepare('SELECT * FROM inquiries WHERE id = ?').get(info.lastInsertRowid);
}

// 6.23 文档 9：首次改 grade 时把「修改前的旧等级」锁为 original_grade（仅对 NULL 旧数据生效；新数据 POST 时已设）。
// 路由层在 PATCH grade 之前调用，使旧 C→A 这种历史上调也能被前端 isUpgraded 正确判定。
export function lockOriginalGradeIfNull(id) {
  db.prepare(`UPDATE inquiries SET original_grade = grade WHERE id = ? AND original_grade IS NULL`).run(id);
}

export function update(id, fields) {
  // original_grade 显式不在 allowed：服务端硬阻止前端改写「最初等级」，确保上调标红判定可靠
  const allowed = ['date', 'country', 'region', 'channel', 'source', 'product', 'grade', 'note',
    'customer_name', 'tracking_feedback'];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (!keys.length) return get(id);
  const set = keys.map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE inquiries SET ${set} WHERE id = @id`).run({ ...fields, id });
  return get(id);
}

export function get(id) {
  return db.prepare('SELECT * FROM inquiries WHERE id = ?').get(id);
}

export function remove(id) {
  db.prepare('DELETE FROM inquiries WHERE id = ?').run(id);
}

// 汇总：有效询盘(A+B)、A级占比、有效率、总量。range 可选，语义同 list()。
// 注意：KPI 评分(recomputeActuals)调用 stats() 不传 range → 始终全量，不受时间筛选影响。
export function stats(range) {
  const ranged = !!(range && range.start_date && range.end_date);
  const stmt = db.prepare(
    `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN grade='A' THEN 1 ELSE 0 END) AS a,
         SUM(CASE WHEN grade='B' THEN 1 ELSE 0 END) AS b,
         SUM(CASE WHEN grade='C' THEN 1 ELSE 0 END) AS c
       FROM inquiries WHERE ${NOT_ARCHIVED}${ranged ? ' AND date BETWEEN @start_date AND @end_date' : ''}`
  );
  const row = ranged ? stmt.get({ start_date: range.start_date, end_date: range.end_date }) : stmt.get();
  const total = row.total || 0;
  const a = row.a || 0, b = row.b || 0, c = row.c || 0;
  const valid = a + b;
  return {
    total, a, b, c, valid,
    aRatio: valid ? Math.round((a / valid) * 100) : 0,
    rate: total ? Math.round((valid / total) * 100) : 0,
  };
}
