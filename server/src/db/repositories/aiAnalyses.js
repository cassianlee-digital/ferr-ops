import { db } from '../connection.js';

const safeJson = (value, fallback) => {
  try { return JSON.parse(value || ''); } catch { return fallback; }
};

const encode = (value) => JSON.stringify(value == null ? null : value);

function decode(row) {
  if (!row) return null;
  return {
    ...row,
    context: safeJson(row.context_json, null),
    messages: safeJson(row.messages_json, []),
  };
}

export function list(opts = {}) {
  const where = [];
  const params = {};
  if (opts.includeArchived !== true) where.push("(state IS NULL OR state != 'archived')");
  if (opts.scope_type) { where.push('scope_type = @scope_type'); params.scope_type = opts.scope_type; }
  const sql = 'SELECT * FROM ai_analyses'
    + (where.length ? ' WHERE ' + where.join(' AND ') : '')
    + ' ORDER BY updated_at DESC, id DESC';
  return db.prepare(sql).all(params).map(decode);
}

export function get(id) {
  return decode(db.prepare('SELECT * FROM ai_analyses WHERE id = ?').get(id));
}

export function getByScope(scopeKey) {
  return decode(db.prepare('SELECT * FROM ai_analyses WHERE scope_key = ?').get(scopeKey));
}

export function create(rec) {
  const messages = rec.messages || [];
  const info = db.prepare(
    `INSERT INTO ai_analyses
      (scope_key, scope_type, title, prompt, context_json, result_text, messages_json, state, action_state)
     VALUES
      (@scope_key, @scope_type, @title, @prompt, @context_json, @result_text, @messages_json, @state, @action_state)`
  ).run({
    scope_key: rec.scope_key,
    scope_type: rec.scope_type || null,
    title: rec.title || null,
    prompt: rec.prompt,
    context_json: encode(rec.context || null),
    result_text: rec.result_text || '',
    messages_json: encode(messages),
    state: rec.state || 'analyzed',
    action_state: rec.action_state || null,
  });
  return get(info.lastInsertRowid);
}

export function replaceResult(id, fields) {
  db.prepare(
    `UPDATE ai_analyses
       SET result_text = @result_text,
           messages_json = @messages_json,
           context_json = @context_json,
           state = 'analyzed',
           updated_at = datetime('now'),
           archived_at = NULL
     WHERE id = @id`
  ).run({
    id,
    result_text: fields.result_text || '',
    messages_json: encode(fields.messages || []),
    context_json: encode(fields.context || null),
  });
  return get(id);
}

export function appendMessages(id, additions) {
  const row = get(id);
  if (!row) return null;
  const messages = [...(row.messages || []), ...(additions || [])];
  db.prepare(
    `UPDATE ai_analyses
       SET messages_json = @messages_json,
           result_text = @result_text,
           updated_at = datetime('now')
     WHERE id = @id`
  ).run({
    id,
    messages_json: encode(messages),
    result_text: [...messages].reverse().find((m) => m.role === 'assistant')?.content || row.result_text || '',
  });
  return get(id);
}

export function setAction(id, action) {
  db.prepare(
    `UPDATE ai_analyses
       SET action_state = @action,
           updated_at = datetime('now')
     WHERE id = @id`
  ).run({ id, action });
  return get(id);
}

export function archive(id) {
  db.prepare(
    `UPDATE ai_analyses
       SET state = 'archived',
           archived_at = datetime('now'),
           updated_at = datetime('now')
     WHERE id = @id`
  ).run({ id });
  return get(id);
}
