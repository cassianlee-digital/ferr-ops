// 询盘数据访问层。SQL 集中于此，便于将来替换为 PostgreSQL。
import { db } from '../connection.js';
import { updateById } from '../updateHelper.js';

// range 可选：{ start_date, end_date }(YYYY-MM-DD)。提供则按 date 区间过滤(参数化)；不提供返回全量。
// P3：默认排除已归档（state='archived'）；归档项只在归档页通过 listArchived() 取。
const NOT_ARCHIVED = "(state IS NULL OR state <> 'archived')";
export function list(range) {
  if (range && range.start_date && range.end_date) {
    return attachFeedbacks(db
      .prepare(`SELECT * FROM inquiries WHERE ${NOT_ARCHIVED} AND date BETWEEN @start_date AND @end_date ORDER BY date DESC, id DESC`)
      .all({ start_date: range.start_date, end_date: range.end_date }));
  }
  return attachFeedbacks(db
    .prepare(`SELECT * FROM inquiries WHERE ${NOT_ARCHIVED} ORDER BY date DESC, id DESC`)
    .all());
}

// P3：归档列表（归档页「询盘」桶用），按归档时间倒序
export function listArchived() {
  return attachFeedbacks(db.prepare("SELECT * FROM inquiries WHERE state='archived' ORDER BY archived_at DESC, id DESC").all());
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
  // 录入改版：customer_code/salesperson/deal_status 取代 customer_name（老行的 customer_name 留库不动）
  // + tracking_feedback(录入时通常 null) + original_grade(=入库时的等级，用于上调标红)
  const info = db
    .prepare(
      `INSERT INTO inquiries (date, country, region, channel, source, product, grade, note, created_by,
                              customer_code, company, salesperson, deal_status, tracking_feedback, original_grade)
       VALUES (@date, @country, @region, @channel, @source, @product, @grade, @note, @created_by,
               @customer_code, @company, @salesperson, @deal_status, @tracking_feedback, @original_grade)`
    )
    .run({
      ...rec,
      created_by: userId ?? null,
      customer_code: rec.customer_code ?? null,
      company: rec.company ?? null,
      salesperson: rec.salesperson ?? null,
      deal_status: rec.deal_status ?? null,
      tracking_feedback: rec.tracking_feedback ?? null,
      original_grade: rec.original_grade ?? rec.grade ?? null,
    });
  return get(info.lastInsertRowid); // 与列表同形（带空的 feedbacks 数组）
}

// 6.23 文档 9：首次改 grade 时把「修改前的旧等级」锁为 original_grade（仅对 NULL 旧数据生效；新数据 POST 时已设）。
// 路由层在 PATCH grade 之前调用，使旧 C→A 这种历史上调也能被前端 isUpgraded 正确判定。
export function lockOriginalGradeIfNull(id) {
  db.prepare(`UPDATE inquiries SET original_grade = grade WHERE id = ? AND original_grade IS NULL`).run(id);
}

export function update(id, fields) {
  // original_grade 显式不在 allowed：服务端硬阻止前端改写「最初等级」，确保上调标红判定可靠
  // tracking_feedback 也不在 allowed（2026-08-27）：跟踪反馈已改为 inquiry_feedbacks 多条记录，
  // 老列只保留历史数据、只读不写，避免两处各存一份、对不上账
  const allowed = ['date', 'country', 'region', 'channel', 'source', 'product', 'grade', 'note',
    'customer_code', 'company', 'salesperson', 'deal_status'];
  updateById('inquiries', id, fields, allowed);
  return get(id);
}

/* ===== 跟踪反馈：一条询盘可以有多条带时间的记录（2026-08-27）=====
   created_at 为 NULL = 从老的单条 tracking_feedback 迁过来的、时间不详的历史记录，前端如实标注。 */
const FEEDBACK_SELECT = `SELECT f.id, f.inquiry_id, f.text, f.created_at, u.name AS created_by_name
                           FROM inquiry_feedbacks f LEFT JOIN users u ON u.id = f.created_by`;

// 批量取：列表页一次把区间内所有询盘的反馈捞回来，避免 N+1。返回 {inquiry_id: [记录…]}，新的在前。
function feedbacksByInquiry(ids) {
  const map = {};
  if (!ids.length) return map;
  const rows = db
    .prepare(`${FEEDBACK_SELECT} WHERE f.inquiry_id IN (${ids.map(() => '?').join(',')})
              ORDER BY f.created_at IS NULL, f.created_at DESC, f.id DESC`)
    .all(...ids);
  for (const r of rows) (map[r.inquiry_id] ||= []).push(r);
  return map;
}

// 给一批询盘行挂上 feedbacks 数组（列表/统计都用它，保证前端只认一个字段）
export function attachFeedbacks(rows) {
  const map = feedbacksByInquiry(rows.map((r) => r.id));
  for (const r of rows) r.feedbacks = map[r.id] || [];
  return rows;
}

export function listFeedbacks(inquiryId) {
  return db
    .prepare(`${FEEDBACK_SELECT} WHERE f.inquiry_id = ? ORDER BY f.created_at IS NULL, f.created_at DESC, f.id DESC`)
    .all(inquiryId);
}

export function addFeedback(inquiryId, text, userId) {
  const info = db
    .prepare(`INSERT INTO inquiry_feedbacks (inquiry_id, text, created_by, created_at)
              VALUES (?, ?, ?, datetime('now'))`)
    .run(inquiryId, text, userId ?? null);
  return db.prepare(`${FEEDBACK_SELECT} WHERE f.id = ?`).get(info.lastInsertRowid);
}

export function getFeedback(id) {
  return db.prepare('SELECT * FROM inquiry_feedbacks WHERE id = ?').get(id);
}

export function removeFeedback(id) {
  db.prepare('DELETE FROM inquiry_feedbacks WHERE id = ?').run(id);
}

export function get(id) {
  const row = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(id);
  if (row) attachFeedbacks([row]); // 单行也带 feedbacks，PATCH 返回的 item 与列表同形
  return row;
}

export function remove(id) {
  // 物理删除询盘时一并清掉它的跟踪记录，避免留下指向不存在询盘的孤儿行
  db.prepare('DELETE FROM inquiry_feedbacks WHERE inquiry_id = ?').run(id);
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
