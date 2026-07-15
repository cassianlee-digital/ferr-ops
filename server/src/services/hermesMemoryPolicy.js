const IGNORED_SOURCES = /^hermes_(daily_learning|morning_brief)/i;

export function normalizedMemoryTopic(title) {
  return String(title || '').toLowerCase()
    .replace(/[\s\-_:：/\\]+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .slice(0, 80);
}

export function findMemoryConflicts(memories = []) {
  const groups = new Map();
  for (const memory of Array.isArray(memories) ? memories : []) {
    if (IGNORED_SOURCES.test(String(memory?.source || ''))) continue;
    const topic = normalizedMemoryTopic(memory?.title);
    if (!topic) continue;
    const group = groups.get(topic) || [];
    group.push(memory);
    groups.set(topic, group);
  }

  return [...groups].flatMap(([topic, group]) => {
    const contents = new Set(group.map((memory) => String(memory?.content || '').trim()).filter(Boolean));
    if (group.length < 2 || contents.size < 2) return [];
    return [{
      topic,
      memoryIds: group.map((memory) => memory.id).filter(Boolean),
      titles: group.map((memory) => String(memory.title || '').trim()).filter(Boolean),
      candidates: group.map((memory) => ({
        id: memory.id,
        title: String(memory.title || '').trim(),
        content: String(memory.content || '').trim(),
        evidence: String(memory.evidence || '').trim(),
        source: String(memory.source || '').trim(),
        updatedAt: memory.updated_at || memory.created_at || '',
        importance: memory.importance,
      })),
      reason: '同一主题存在多条内容不同的活动记忆，需要确认哪一条仍然有效。',
    }];
  });
}

export function trustedMemories(memories = [], conflicts = []) {
  const blockedIds = new Set(conflicts.flatMap((conflict) => conflict.memoryIds || []));
  return (Array.isArray(memories) ? memories : []).filter((memory) => !blockedIds.has(memory.id));
}
