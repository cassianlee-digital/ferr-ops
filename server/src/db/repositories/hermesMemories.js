import { db } from '../connection.js';

const KINDS = new Set(['company', 'customer', 'market', 'operation', 'decision', 'learning', 'preference', 'risk']);

function cleanKind(kind) {
  return KINDS.has(kind) ? kind : 'learning';
}

function row(id) {
  return db.prepare('SELECT * FROM hermes_memories WHERE id = ?').get(id);
}

export function list({ activeOnly = true, limit = 50 } = {}) {
  return db.prepare(
    `SELECT * FROM hermes_memories
     WHERE (@activeOnly = 0 OR active = 1)
     ORDER BY importance DESC, updated_at DESC, id DESC
     LIMIT @limit`
  ).all({ activeOnly: activeOnly ? 1 : 0, limit });
}

export function create(input = {}) {
  const title = String(input.title || '').trim();
  const content = String(input.content || '').trim();
  if (!title || !content) return null;

  const info = db.prepare(
    `INSERT INTO hermes_memories (kind, title, content, evidence, source, importance, active)
     VALUES (@kind, @title, @content, @evidence, @source, @importance, 1)`
  ).run({
    kind: cleanKind(input.kind),
    title,
    content,
    evidence: input.evidence == null ? null : String(input.evidence),
    source: input.source == null ? 'manual' : String(input.source),
    importance: Math.max(1, Math.min(5, Number(input.importance) || 3)),
  });
  return row(info.lastInsertRowid);
}

export function upsertBySourceTitle(input = {}) {
  const title = String(input.title || '').trim();
  const source = String(input.source || 'manual').trim();
  const content = String(input.content || '').trim();
  if (!title || !content) return null;

  const existing = db.prepare(
    'SELECT * FROM hermes_memories WHERE active = 1 AND source = ? AND title = ? ORDER BY id DESC LIMIT 1'
  ).get(source, title);

  const payload = {
    kind: cleanKind(input.kind),
    title,
    content,
    evidence: input.evidence == null ? null : String(input.evidence),
    source,
    importance: Math.max(1, Math.min(5, Number(input.importance) || 3)),
  };

  if (existing) {
    db.prepare(
      `UPDATE hermes_memories
       SET kind=@kind, content=@content, evidence=@evidence, importance=@importance, updated_at=datetime('now')
       WHERE id=@id`
    ).run({ ...payload, id: existing.id });
    return row(existing.id);
  }

  return create(payload);
}

export function deactivate(id) {
  db.prepare("UPDATE hermes_memories SET active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
  return row(id);
}

export function sourceBlock({ limit = 20 } = {}) {
  const rows = list({ activeOnly: true, limit });
  if (!rows.length) return '';
  return rows.map((m) => {
    const evidence = m.evidence ? ` evidence=${m.evidence}` : '';
    return `[${m.kind}] ${m.title}: ${m.content}${evidence}`;
  }).join('\n');
}
