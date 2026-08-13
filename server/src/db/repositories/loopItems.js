// 闭环条目数据访问层（plan/test/deposit/task）+ 归档地基（state/archived/deleted）。
import { db } from '../connection.js';
import { updateById } from '../updateHelper.js';

/**
 * 列表查询。opts:
 *   - kind: 限定 kind
 *   - view: 'active'(默认) | 'archived' | 'deleted' | 'all'
 *     active   = 排除 archived/deleted（任务看板/月度计划/测试登记/沉淀表用）
 *     archived = 只看 state='archived'（归档页用）
 *     deleted  = 只看 state='deleted'（归档页「已删除」用）
 *     all      = 不过滤（管理/调试）
 */
export function list(kind, opts = {}) {
  const view = opts.view || 'active';
  const where = [];
  const params = {};
  if (kind) { where.push('kind = @kind'); params.kind = kind; }
  if (view === 'active') {
    where.push("(state IS NULL OR state NOT IN ('archived','deleted'))");
  } else if (view === 'archived') {
    where.push("state = 'archived'");
  } else if (view === 'deleted') {
    where.push("state = 'deleted'");
  }
  const sql = 'SELECT * FROM loop_items'
    + (where.length ? ' WHERE ' + where.join(' AND ') : '')
    + ' ORDER BY id ASC';
  return db.prepare(sql).all(params);
}

// INSERT 的具名参数必须齐全（better-sqlite3 缺一个就抛 RangeError），所以按列清单归一：
// 调用方少给的补 null、多给的丢掉，新增列不再逼着每个调用方同步改。
const CREATE_COLS = ['kind', 'dept', 'content', 'owner', 'status',
  'task_date', 'start_date', 'task_hour', 'note', 'urgent', 'parent_id'];

export function create(rec) {
  const row = {};
  for (const c of CREATE_COLS) row[c] = rec?.[c] ?? null;
  const info = db
    .prepare(
      `INSERT INTO loop_items (kind, dept, content, owner, status, task_date, start_date, task_hour, note, urgent, parent_id)
       VALUES (@kind,@dept,@content,@owner,@status,@task_date,@start_date,@task_hour,@note,@urgent,@parent_id)`
    )
    .run(row);
  return db.prepare('SELECT * FROM loop_items WHERE id = ?').get(info.lastInsertRowid);
}

export function update(id, fields) {
  const allowed = ['dept', 'content', 'owner', 'status',
    'hypothesis', 'metric', 'due_or_budget', 'variable', 'period', 'conclusion', 'analysis',
    'task_date', 'start_date', 'task_hour', 'note',
    'state', 'archived_at', 'deleted_at', 'archive_kind',
    'urgent'];
  updateById('loop_items', id, fields, allowed);
  return get(id);
}

export function get(id) {
  return db.prepare('SELECT * FROM loop_items WHERE id = ?').get(id);
}

// 归档：幂等。已 archived 直接返回当前行。
// kind 从 dept 推导：SEM→sem / SEO→seo / 公司→company；调用方也可显式传入。
export function archive(id, archiveKind) {
  const row = get(id);
  if (!row) return null;
  if (row.state === 'archived') return row;
  if (row.state === 'deleted') return row; // 已软删的不能再被归档
  const ak = archiveKind || deriveArchiveKind(row.dept);
  db.prepare(
    `UPDATE loop_items
       SET state = 'archived',
           archived_at = datetime('now'),
           archive_kind = COALESCE(@ak, archive_kind)
     WHERE id = @id`
  ).run({ id, ak });
  // 级联：公司大任务归档时，名下未归档/未删的子任务一并归档（进同一分桶，日计划上一起消失）
  db.prepare(
    `UPDATE loop_items
       SET state = 'archived',
           archived_at = datetime('now'),
           archive_kind = COALESCE(@ak, archive_kind)
     WHERE parent_id = @id
       AND (state IS NULL OR state NOT IN ('archived','deleted'))`
  ).run({ id, ak });
  return get(id);
}

// 恢复：archived → todo；清 archived_at。已删除的不恢复（需走 restore-from-deleted，本期不开放）。
export function restore(id) {
  const row = get(id);
  if (!row) return null;
  if (row.state !== 'archived') return row;
  db.prepare(
    "UPDATE loop_items SET state = 'todo', archived_at = NULL WHERE id = @id"
  ).run({ id });
  return get(id);
}

// 软删：DELETE 默认走这里。
export function softDelete(id) {
  const row = get(id);
  if (!row) return null;
  if (row.state === 'deleted') return row;
  db.prepare(
    "UPDATE loop_items SET state = 'deleted', deleted_at = datetime('now') WHERE id = @id"
  ).run({ id });
  return get(id);
}

// 物理删除：仅 boss/管理操作用，路由层 hard=1 才会调到。
export function hardDelete(id) {
  db.prepare('DELETE FROM loop_items WHERE id = ?').run(id);
}

// 保留旧名以防外部调用；指向软删。
export function remove(id) { return softDelete(id); }

function deriveArchiveKind(dept) {
  if (dept === 'SEM') return 'sem';
  if (dept === 'SEO') return 'seo';
  if (dept === '公司') return 'company';
  return null;
}
