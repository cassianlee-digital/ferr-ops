import { db } from '../connection.js';

const JSON_FIELDS = ['input_json', 'result_json', 'verification_json'];

function decode(row) {
  if (!row) return null;
  const out = { ...row };
  for (const field of JSON_FIELDS) {
    if (out[field] == null) continue;
    try { out[field.replace('_json', '')] = JSON.parse(out[field]); } catch { out[field.replace('_json', '')] = null; }
    delete out[field];
  }
  return out;
}

export function create({ userId, loopItemId = null, actionType, title, input = {} }) {
  const info = db.prepare(
    `INSERT INTO hermes_action_runs
      (user_id, loop_item_id, action_type, title, input_json)
     VALUES (@userId, @loopItemId, @actionType, @title, @inputJson)`
  ).run({
    userId,
    loopItemId,
    actionType,
    title,
    inputJson: JSON.stringify(input),
  });
  return get(info.lastInsertRowid);
}

export function get(id) {
  return decode(db.prepare('SELECT * FROM hermes_action_runs WHERE id = ?').get(id));
}

export function list({ userId = null, status = null, limit = 50 } = {}) {
  const where = [];
  const params = { limit: Math.min(Math.max(Number(limit) || 50, 1), 200) };
  if (userId != null) { where.push('user_id = @userId'); params.userId = userId; }
  if (status) { where.push('status = @status'); params.status = status; }
  const sql = `SELECT * FROM hermes_action_runs${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
    ORDER BY id DESC LIMIT @limit`;
  return db.prepare(sql).all(params).map(decode);
}

export function approve(id, approvedBy) {
  const info = db.prepare(
    `UPDATE hermes_action_runs
        SET status = 'approved', approved_by = @approvedBy, approved_at = datetime('now')
      WHERE id = @id AND status = 'proposed'`
  ).run({ id, approvedBy });
  return info.changes ? get(id) : null;
}

export function claim(id) {
  const info = db.prepare(
    `UPDATE hermes_action_runs
        SET status = 'running', started_at = datetime('now'), error = NULL
      WHERE id = @id AND status = 'approved'`
  ).run({ id });
  return info.changes ? get(id) : null;
}

export function succeed(id, result = {}) {
  db.prepare(
    `UPDATE hermes_action_runs
        SET status = 'succeeded', result_json = @resultJson, finished_at = datetime('now'), error = NULL
      WHERE id = @id AND status = 'running'`
  ).run({ id, resultJson: JSON.stringify(result) });
  return get(id);
}

export function fail(id, error, result = null) {
  db.prepare(
    `UPDATE hermes_action_runs
        SET status = 'failed', result_json = @resultJson, error = @error, finished_at = datetime('now')
      WHERE id = @id AND status = 'running'`
  ).run({
    id,
    resultJson: result == null ? null : JSON.stringify(result),
    error: String(error || 'action_failed').slice(0, 1000),
  });
  return get(id);
}

export function verify(id, verifiedBy, verification = {}) {
  const info = db.prepare(
    `UPDATE hermes_action_runs
        SET status = 'verified', verification_json = @verificationJson,
            verified_by = @verifiedBy, verified_at = datetime('now')
      WHERE id = @id AND status = 'succeeded'`
  ).run({ id, verifiedBy, verificationJson: JSON.stringify(verification) });
  return info.changes ? get(id) : null;
}

export function cancel(id) {
  const info = db.prepare(
    `UPDATE hermes_action_runs
        SET status = 'cancelled', finished_at = datetime('now')
      WHERE id = @id AND status IN ('proposed','approved')`
  ).run({ id });
  return info.changes ? get(id) : null;
}
