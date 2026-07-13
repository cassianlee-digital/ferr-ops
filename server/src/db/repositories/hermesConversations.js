import { db } from '../connection.js';

const MAX_MESSAGES = 80;

function safeJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function encode(value) {
  return JSON.stringify(value == null ? [] : value);
}

function cleanMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim())
    .slice(-MAX_MESSAGES)
    .map((m) => ({
      role: m.role,
      content: String(m.content || '').slice(0, 12000),
      basis: m.basis ? String(m.basis).slice(0, 4000) : undefined,
      hermes: m.hermes || undefined,
      attachments: Array.isArray(m.attachments) ? m.attachments.slice(0, 5) : undefined,
      at: m.at || new Date().toISOString(),
    }));
}

function decode(row, withMessages = true) {
  if (!row) return null;
  const base = {
    id: row.id,
    user_id: row.user_id,
    role: row.role,
    title: row.title,
    skill: row.skill,
    workflow: row.workflow,
    state: row.state,
    archived_at: row.archived_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (withMessages) base.messages = safeJson(row.messages, []);
  return base;
}

export function listForUser(userId, { archived = false, limit = 30 } = {}) {
  return db.prepare(
    `SELECT id, user_id, role, title, skill, workflow, state, archived_at, created_at, updated_at, messages
       FROM hermes_conversations
      WHERE user_id = @userId AND state = @state
      ORDER BY updated_at DESC, id DESC
      LIMIT @limit`
  ).all({
    userId,
    state: archived ? 'archived' : 'active',
    limit: Math.max(1, Math.min(100, Number(limit) || 30)),
  }).map((row) => {
    const item = decode(row, false);
    const messages = safeJson(row.messages, []);
    item.last_message = [...messages].reverse().find((m) => m.role === 'user' || m.role === 'assistant')?.content || '';
    item.message_count = messages.length;
    return item;
  });
}

export function latestForUser(userId) {
  const row = db.prepare(
    `SELECT * FROM hermes_conversations
      WHERE user_id = ? AND state = 'active'
      ORDER BY updated_at DESC, id DESC
      LIMIT 1`
  ).get(userId);
  return decode(row);
}

export function getForUser(id, userId) {
  return decode(db.prepare(
    'SELECT * FROM hermes_conversations WHERE id = ? AND user_id = ?'
  ).get(id, userId));
}

export function createForUser(input = {}) {
  const messages = cleanMessages(input.messages);
  const title = String(input.title || messages.find((m) => m.role === 'user')?.content || '新对话').trim().slice(0, 40) || '新对话';
  const info = db.prepare(
    `INSERT INTO hermes_conversations (user_id, role, title, messages, skill, workflow)
     VALUES (@user_id, @role, @title, @messages, @skill, @workflow)`
  ).run({
    user_id: Number(input.user_id),
    role: String(input.role || 'manager'),
    title,
    messages: encode(messages),
    skill: input.skill || null,
    workflow: input.workflow || null,
  });
  return getForUser(info.lastInsertRowid, Number(input.user_id));
}

export function appendForUser(id, userId, additions = [], meta = {}) {
  const row = getForUser(id, userId);
  if (!row || row.state === 'archived') return null;
  const messages = cleanMessages([...(row.messages || []), ...additions]);
  const firstUser = messages.find((m) => m.role === 'user')?.content || row.title;
  db.prepare(
    `UPDATE hermes_conversations
        SET messages = @messages,
            title = @title,
            skill = @skill,
            workflow = @workflow,
            updated_at = datetime('now')
      WHERE id = @id AND user_id = @userId AND state = 'active'`
  ).run({
    id,
    userId,
    messages: encode(messages),
    title: String(row.title === '新对话' ? firstUser : row.title).slice(0, 40) || '新对话',
    skill: meta.skill || row.skill || null,
    workflow: meta.workflow || row.workflow || null,
  });
  return getForUser(id, userId);
}

export function archiveForUser(id, userId) {
  db.prepare(
    `UPDATE hermes_conversations
        SET state = 'archived',
            archived_at = datetime('now'),
            updated_at = datetime('now')
      WHERE id = ? AND user_id = ? AND state = 'active'`
  ).run(id, userId);
  return getForUser(id, userId);
}
