// SEO/SEM 运营问题闭环（Execution KPI 真实数据源）。SQL 集中于此。
import { db } from '../connection.js';
import { updateById } from '../updateHelper.js';

// 列表。opts: { channel?, range?({start_date,end_date} 按 verification_due_at 过滤), dueInRange? }
export function list(opts = {}) {
  const where = [];
  const params = {};
  if (opts.channel) { where.push('channel = @channel'); params.channel = opts.channel; }
  if (opts.dueInRange && opts.range && opts.range.start_date && opts.range.end_date) {
    where.push('verification_due_at IS NOT NULL AND date(verification_due_at) BETWEEN @start_date AND @end_date');
    params.start_date = opts.range.start_date;
    params.end_date = opts.range.end_date;
  }
  const sql = 'SELECT * FROM execution_loops'
    + (where.length ? ' WHERE ' + where.join(' AND ') : '')
    + ' ORDER BY id DESC';
  return db.prepare(sql).all(params);
}

export function get(id) {
  return db.prepare('SELECT * FROM execution_loops WHERE id = ?').get(id);
}

export function create(rec) {
  const info = db.prepare(
    `INSERT INTO execution_loops
       (channel, owner, owner_id, problem, analysis, action, impact_level, status,
        verification_method, verification_due_at, related_metric, before_value,
        source_type, source_id, created_by)
     VALUES
       (@channel, @owner, @owner_id, @problem, @analysis, @action, @impact_level, @status,
        @verification_method, @verification_due_at, @related_metric, @before_value,
        @source_type, @source_id, @created_by)`
  ).run({
    channel: rec.channel,
    owner: rec.owner ?? null,
    owner_id: rec.owner_id ?? null,
    problem: rec.problem,
    analysis: rec.analysis ?? null,
    action: rec.action ?? null,
    impact_level: rec.impact_level ?? null,
    status: rec.status || 'OPEN',
    verification_method: rec.verification_method ?? null,
    verification_due_at: rec.verification_due_at ?? null,
    related_metric: rec.related_metric ?? null,
    before_value: rec.before_value ?? null,
    source_type: rec.source_type ?? 'manual',
    source_id: rec.source_id ?? null,
    created_by: rec.created_by ?? null,
  });
  return get(info.lastInsertRowid);
}

// 普通员工可改的字段（不含 impact_level / exclude_from_assessment —— 那些需管理员）
const MEMBER_FIELDS = [
  'problem', 'analysis', 'action', 'status', 'verification_method', 'verification_result',
  'verification_result_text', 'verified', 'related_metric', 'before_value', 'after_value',
  'cancel_reason', 'verification_due_at', 'implemented_at', 'verified_at',
];
const ADMIN_ONLY_FIELDS = ['impact_level', 'exclude_from_assessment', 'channel', 'owner', 'owner_id'];

export function update(id, fields, { admin = false } = {}) {
  const allowed = admin ? [...MEMBER_FIELDS, ...ADMIN_ONLY_FIELDS] : MEMBER_FIELDS;
  updateById('execution_loops', id, fields, allowed);
  return get(id);
}
