// 整改清单数据访问层 + 归档地基（state/archived/deleted）。
import { db } from '../connection.js';

/**
 * 列表查询。opts.view: 'active'(默认) | 'archived' | 'deleted' | 'all'
 *   active   = 排除 archived/deleted
 *   archived = 只看 state='archived'
 *   deleted  = 只看 state='deleted'
 *   all      = 不过滤
 */
export function list(opts = {}) {
  const view = opts.view || 'active';
  const where = [];
  if (view === 'active') {
    where.push("(state IS NULL OR state NOT IN ('archived','deleted'))");
  } else if (view === 'archived') {
    where.push("state = 'archived'");
  } else if (view === 'deleted') {
    where.push("state = 'deleted'");
  }
  const sql = 'SELECT * FROM fixes'
    + (where.length ? ' WHERE ' + where.join(' AND ') : '')
    + ' ORDER BY id ASC';
  return db.prepare(sql).all();
}

export function create(rec) {
  const info = db
    .prepare(
      `INSERT INTO fixes (title, dept, detail, evidence, owner, due_date, status, source)
       VALUES (@title,@dept,@detail,@evidence,@owner,@due_date,@status,@source)`
    )
    .run(rec);
  return db.prepare('SELECT * FROM fixes WHERE id = ?').get(info.lastInsertRowid);
}

export function update(id, fields) {
  const allowed = ['title', 'dept', 'detail', 'evidence', 'owner', 'due_date', 'status', 'source',
    'state', 'archived_at', 'deleted_at', 'archive_kind'];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (!keys.length) return get(id);
  db.prepare(`UPDATE fixes SET ${keys.map((k) => `${k}=@${k}`).join(', ')} WHERE id=@id`)
    .run({ ...fields, id });
  return get(id);
}

export function get(id) {
  return db.prepare('SELECT * FROM fixes WHERE id = ?').get(id);
}

export function archive(id, archiveKind) {
  const row = get(id);
  if (!row) return null;
  if (row.state === 'archived') return row;
  if (row.state === 'deleted') return row;
  const ak = archiveKind || deriveArchiveKind(row.dept);
  db.prepare(
    `UPDATE fixes
       SET state = 'archived',
           archived_at = datetime('now'),
           archive_kind = COALESCE(@ak, archive_kind)
     WHERE id = @id`
  ).run({ id, ak });
  return get(id);
}

export function restore(id) {
  const row = get(id);
  if (!row) return null;
  if (row.state !== 'archived') return row;
  db.prepare(
    "UPDATE fixes SET state = 'todo', archived_at = NULL WHERE id = @id"
  ).run({ id });
  return get(id);
}

export function softDelete(id) {
  const row = get(id);
  if (!row) return null;
  if (row.state === 'deleted') return row;
  db.prepare(
    "UPDATE fixes SET state = 'deleted', deleted_at = datetime('now') WHERE id = @id"
  ).run({ id });
  return get(id);
}

export function hardDelete(id) {
  db.prepare('DELETE FROM fixes WHERE id = ?').run(id);
}

function deriveArchiveKind(dept) {
  if (dept === 'SEM') return 'sem';
  if (dept === 'SEO') return 'seo';
  if (dept === '公司') return 'company';
  return null;
}
