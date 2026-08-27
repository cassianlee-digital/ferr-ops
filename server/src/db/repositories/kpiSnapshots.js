// KPI 考核期冻结快照（Phase 5C）。历史成绩读这里，绝不实时重算——改目标不动历史（§29）。
import { db } from '../connection.js';

// 结算：按 (period_type, period_key, owner) 幂等 upsert。冻结分数/覆盖率/证据。
export function settle(snap) {
  db.prepare(
    `INSERT INTO kpi_period_snapshots
       (period_type, period_key, owner, score, provisional_score, coverage, confidence,
        gradable, status, range_start, range_end, rows_json, note, settled_by, settled_at)
     VALUES
       (@period_type, @period_key, @owner, @score, @provisional_score, @coverage, @confidence,
        @gradable, @status, @range_start, @range_end, @rows_json, @note, @settled_by, datetime('now'))
     ON CONFLICT(period_type, period_key, owner) DO UPDATE SET
       score=excluded.score, provisional_score=excluded.provisional_score, coverage=excluded.coverage,
       confidence=excluded.confidence, gradable=excluded.gradable, status=excluded.status,
       range_start=excluded.range_start, range_end=excluded.range_end, rows_json=excluded.rows_json,
       note=excluded.note, settled_by=excluded.settled_by, settled_at=datetime('now')`
  ).run(snap);
  return getOne(snap.period_type, snap.period_key, snap.owner);
}

export function getOne(period_type, period_key, owner) {
  return db.prepare(
    'SELECT * FROM kpi_period_snapshots WHERE period_type=? AND period_key=? AND owner=?'
  ).get(period_type, period_key, owner);
}

// 列表（历史）。可按 owner 过滤，最新在前。
export function list(opts = {}) {
  const where = [], params = {};
  if (opts.owner) { where.push('owner=@owner'); params.owner = opts.owner; }
  const sql = 'SELECT * FROM kpi_period_snapshots'
    + (where.length ? ' WHERE ' + where.join(' AND ') : '')
    + ' ORDER BY period_key DESC, owner ASC';
  return db.prepare(sql).all(params);
}
