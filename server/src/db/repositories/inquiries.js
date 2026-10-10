// 询盘数据访问层。SQL 集中于此，便于将来替换为 PostgreSQL。
import { db } from '../connection.js';
import { updateById } from '../updateHelper.js';
import * as salesNotesRepo from './inquirySalesNotes.js';

// range 可选：{ start_date, end_date }(YYYY-MM-DD)。提供则按 date 区间过滤(参数化)；不提供返回全量。
// P3：默认排除已归档（state='archived'）；归档项只在归档页通过 listArchived() 取。
const NOT_ARCHIVED = "(state IS NULL OR state <> 'archived')";
// 列表统一走这里：挂 feedbacks + 渠道 / 等级被改过几次（都是批量取，不做 N+1）
function decorate(rows) { return attachChangeCounts(attachFeedbacks(rows)); }

export function list(range) {
  if (range && range.start_date && range.end_date) {
    return decorate(db
      .prepare(`SELECT * FROM inquiries WHERE ${NOT_ARCHIVED} AND date BETWEEN @start_date AND @end_date ORDER BY date DESC, id DESC`)
      .all({ start_date: range.start_date, end_date: range.end_date }));
  }
  return decorate(db
    .prepare(`SELECT * FROM inquiries WHERE ${NOT_ARCHIVED} ORDER BY date DESC, id DESC`)
    .all());
}

// P3：归档列表（归档页「询盘」桶用），按归档时间倒序
export function listArchived() {
  return attachFeedbacks(db.prepare("SELECT * FROM inquiries WHERE state='archived' ORDER BY archived_at DESC, id DESC").all());
}

// P3：软删→归档（幂等）
// 归档 = 这条询盘从所有统计和考核里消失，所以谁归档的要留痕（userId 传了才记）
export function archive(id, userId) {
  const row = get(id);
  if (!row) return null;
  if (row.state === 'archived') return row;
  db.transaction(() => {
    db.prepare("UPDATE inquiries SET state='archived', archived_at=datetime('now') WHERE id=?").run(id);
    if (userId != null) logFieldChange({ inquiryId: id, field: 'state', oldValue: 'active', newValue: 'archived', userId });
  })();
  return get(id);
}

// P3：从归档恢复
export function restore(id, userId) {
  const row = get(id);
  if (!row) return null;
  if (row.state !== 'archived') return row;
  db.transaction(() => {
    db.prepare("UPDATE inquiries SET state=NULL, archived_at=NULL WHERE id=?").run(id);
    if (userId != null) logFieldChange({ inquiryId: id, field: 'state', oldValue: 'archived', newValue: 'active', userId });
  })();
  return get(id);
}

export function create(rec, userId) {
  // 录入改版：customer_code/salesperson/deal_status 取代 customer_name（老行的 customer_name 留库不动）
  // + tracking_feedback(录入时通常 null) + original_grade(=入库时的等级，用于上调标红)
  const info = db
    .prepare(
      `INSERT INTO inquiries (date, country, region, channel, source, product, grade, note, created_by,
                              customer_code, company, salesperson, deal_status, tracking_feedback, original_grade,
                              attribution_status, attribution_confirmed_by, attribution_confirmed_at)
       VALUES (@date, @country, @region, @channel, @source, @product, @grade, @note, @created_by,
               @customer_code, @company, @salesperson, @deal_status, @tracking_feedback, @original_grade,
               @attribution_status, @attribution_confirmed_by, @attribution_confirmed_at)`
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
      // 李 / 陈录的是建议值（proposed）；经理 / 老板录的直接算已确认 —— 确认权本来就在他们手里
      attribution_status: rec.attribution_status ?? 'proposed',
      attribution_confirmed_by: rec.attribution_status === 'confirmed' ? (userId ?? null) : null,
      attribution_confirmed_at: rec.attribution_status === 'confirmed' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
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

/* 改动与它的流水同生共死：流水记了而改动没落库（后面的校验把请求拒了），或者反过来，都是假账。
   changes = [{ field, oldValue, newValue, reason, userId }]；source = 要一并写的来源字段（已由路由校验过）。 */
export function updateWithLog(id, fields, { changes = [], source = null } = {}) {
  return db.transaction(() => {
    for (const c of changes) logFieldChange({ inquiryId: id, ...c });
    // 6.23 文档 9：历史行 original_grade=NULL 时，先把「修改前的旧等级」锁成最初等级，再改
    if (changes.some((c) => c.field === 'grade')) lockOriginalGradeIfNull(id);
    update(id, fields);
    return source ? setSource(id, source) : get(id);
  })();
}

/* 来源字段（系列 / 落地页 / 来路 / gclid / utm / 证据类型）。刻意不放进上面 update() 的通用白名单：
   通用 PATCH 把请求体原样传进来，白名单里有 src_evidence 的话，任何人都能把自己手填的来源改成「表单证据」。
   这里只给路由在校验完之后调用。 */
const SOURCE_COLS = ['source', 'src_campaign_id', 'src_campaign', 'src_landing_page',
  'src_referrer', 'src_gclid', 'src_utm', 'src_evidence', 'lead_id'];
export function setSource(id, fields) {
  updateById('inquiries', id, fields, SOURCE_COLS);
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

/* 给一批询盘行挂上 feedbacks（运营跟踪）+ sales_notes（业务反馈，含图片元数据）。
   两者都走批量查询，列表页一次捞完 —— 单条去查会变成 N+1，80 条询盘就是 160 次查询。
   函数名保留 attachFeedbacks 不改：外部已有调用点，改名对打包器/静态分析是隐形的。 */
export function attachFeedbacks(rows) {
  const map = feedbacksByInquiry(rows.map((r) => r.id));
  const notes = salesNotesRepo.byInquiry(rows.map((r) => r.id));
  for (const r of rows) {
    r.feedbacks = map[r.id] || [];
    r.sales_notes = notes[r.id] || [];
  }
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
  if (row) decorate([row]); // 单行也带 feedbacks 与改动次数，PATCH 返回的 item 与列表同形
  return row;
}

export function remove(id) {
  // 物理删除询盘时一并清掉它的跟踪记录与业务反馈（含图片 BLOB），
  // 避免留下指向不存在询盘的孤儿行——图片尤其要清，不然会一直占着库体积
  db.prepare('DELETE FROM inquiry_feedbacks WHERE inquiry_id = ?').run(id);
  // 改动流水有外键指着这条询盘：不先清掉，彻底删除会直接被外键拦成 500（2026-10-10 实测踩到）。
  // 彻底删除本来就是「连痕迹一起抹掉」的操作（仅老板在归档页可做），流水跟着走。
  db.prepare('DELETE FROM inquiry_field_changes WHERE inquiry_id = ?').run(id);
  salesNotesRepo.removeByInquiry(id);
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

/* ===== 确认权与改动留痕（2026-10-10，设计移植自旧分支 a298574）=====
   渠道 / 等级录入时是建议值（proposed），经理或老板确认后才是定稿（confirmed），一切改动留痕。
   老行 attribution_status 为 NULL = 历史未审，既不算已确认也不算刚提交。 */

export const ATTR_FIELDS = ['channel', 'grade'];
// 一经确认就锁住的字段：渠道和等级决定这条询盘算不算 A / B，日期决定它算进哪个月 —— 三个都直接进月度考核的数
export const LOCKED_FIELDS = [...ATTR_FIELDS, 'date'];

const CHANGE_SELECT = `SELECT c.id, c.inquiry_id, c.field, c.old_value, c.new_value, c.reason,
                              c.changed_at, u.name AS changed_by_name
                         FROM inquiry_field_changes c LEFT JOIN users u ON u.id = c.changed_by`;

// 记一条改动。old === new 不记（避免「确认时顺手保存」刷出一堆空流水）。
export function logFieldChange({ inquiryId, field, oldValue, newValue, reason, userId }) {
  const o = oldValue == null ? null : String(oldValue);
  const n = newValue == null ? null : String(newValue);
  if (o === n) return null;
  const info = db.prepare(
    `INSERT INTO inquiry_field_changes (inquiry_id, field, old_value, new_value, reason, changed_by)
     VALUES (?,?,?,?,?,?)`
  ).run(inquiryId, field, o, n, reason ? String(reason).slice(0, 500) : null, userId ?? null);
  return db.prepare(`${CHANGE_SELECT} WHERE c.id = ?`).get(info.lastInsertRowid);
}

// 某条询盘的全部改动，新的在前
export function listFieldChanges(inquiryId) {
  return db.prepare(`${CHANGE_SELECT} WHERE c.inquiry_id = ? ORDER BY c.id DESC`).all(inquiryId);
}

/* 给一批询盘挂上「渠道 / 等级被改过几次」。这个数本身就是监督信号：
   谁在月底前批量把 C 改成 B，一眼看得出来。只数这两个字段，确认 / 撤销确认本身不算「改」。 */
export function attachChangeCounts(rows) {
  const ids = rows.map((r) => r.id);
  const map = {};
  for (let i = 0; i < ids.length; i += 500) {
    const part = ids.slice(i, i + 500);
    const found = db.prepare(
      `SELECT inquiry_id, COUNT(*) n FROM inquiry_field_changes
        WHERE inquiry_id IN (${part.map(() => '?').join(',')}) AND field <> 'attribution_status'
        GROUP BY inquiry_id`
    ).all(...part);
    for (const r of found) map[r.inquiry_id] = r.n;
  }
  for (const r of rows) r.attr_change_count = map[r.id] || 0;
  return rows;
}

// 经理 / 老板确认。可以在确认的同时纠正渠道 / 等级（那是最常见的动作），纠正本身也留痕。
export function confirmAttribution(id, { channel, grade, reason, userId }) {
  const before = get(id);
  if (!before) return null;
  if (channel != null && channel !== before.channel) {
    logFieldChange({ inquiryId: id, field: 'channel', oldValue: before.channel, newValue: channel, reason, userId });
    db.prepare('UPDATE inquiries SET channel = ? WHERE id = ?').run(channel, id);
  }
  if (grade != null && grade !== before.grade) {
    lockOriginalGradeIfNull(id); // 与 PATCH 同规矩：先锁最初等级，再改
    logFieldChange({ inquiryId: id, field: 'grade', oldValue: before.grade, newValue: grade, reason, userId });
    db.prepare('UPDATE inquiries SET grade = ? WHERE id = ?').run(grade, id);
  }
  if (before.attribution_status !== 'confirmed') {
    logFieldChange({ inquiryId: id, field: 'attribution_status', oldValue: before.attribution_status, newValue: 'confirmed', reason, userId });
  }
  db.prepare(
    "UPDATE inquiries SET attribution_status='confirmed', attribution_confirmed_by=?, attribution_confirmed_at=datetime('now') WHERE id=?"
  ).run(userId ?? null, id);
  return get(id);
}

// 撤销确认（确认错了要能退回建议态，不能只能去改库）。同样留痕。
export function unconfirmAttribution(id, { reason, userId }) {
  const before = get(id);
  if (!before) return null;
  logFieldChange({ inquiryId: id, field: 'attribution_status', oldValue: before.attribution_status, newValue: 'proposed', reason, userId });
  db.prepare(
    "UPDATE inquiries SET attribution_status='proposed', attribution_confirmed_by=NULL, attribution_confirmed_at=NULL WHERE id=?"
  ).run(id);
  return get(id);
}

/* 确认覆盖情况：未确认占比是这套规矩的核心监督数字，必须自己亮出来。
   legacy = 这套规矩上线前录的老行。0 条询盘时比例返回 null —— 返回 0 会被读成「全部已确认」或「全部未确认」。 */
export function attributionCoverage(range) {
  const ranged = !!(range && range.start_date && range.end_date);
  const row = db.prepare(
    `SELECT COUNT(*) total,
            SUM(CASE WHEN attribution_status='confirmed' THEN 1 ELSE 0 END) confirmed,
            SUM(CASE WHEN attribution_status='proposed'  THEN 1 ELSE 0 END) proposed,
            SUM(CASE WHEN attribution_status IS NULL     THEN 1 ELSE 0 END) legacy
       FROM inquiries
      WHERE ${NOT_ARCHIVED}${ranged ? ' AND date BETWEEN @start_date AND @end_date' : ''}`
  ).get(ranged ? { start_date: range.start_date, end_date: range.end_date } : {});
  const total = row.total || 0;
  const confirmed = row.confirmed || 0;
  return {
    total, confirmed, proposed: row.proposed || 0, legacy: row.legacy || 0,
    confirmedRate: total > 0 ? Math.round((confirmed / total) * 1000) / 10 : null,
    unconfirmedRate: total > 0 ? Math.round(((total - confirmed) / total) * 1000) / 10 : null,
  };
}
