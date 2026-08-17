export function memoryTrustAssessment(memory = {}) {
  const source = String(memory?.source || 'manual').trim().toLowerCase();
  if (source.startsWith('hermes_auto_preference:')) {
    return { status: 'trusted', trusted: true, reason: 'explicit_user_preference' };
  }
  if (source.startsWith('hermes_')) {
    return { status: 'review_required', trusted: false, reason: 'hermes_generated_or_feedback_content' };
  }
  return { status: 'trusted', trusted: true, reason: 'human_or_external_source' };
}

export function normalizedMemoryTopic(title) {
  return String(title || '').toLowerCase()
    .replace(/[\s\-_:：/\\]+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .slice(0, 80);
}

export function findMemoryConflicts(memories = []) {
  const groups = new Map();
  for (const memory of Array.isArray(memories) ? memories : []) {
    if (!memoryTrustAssessment(memory).trusted) continue;
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
  return (Array.isArray(memories) ? memories : []).filter((memory) => memoryTrustAssessment(memory).trusted && !blockedIds.has(memory.id));
}

export function reviewRequiredMemories(memories = []) {
  return (Array.isArray(memories) ? memories : []).filter((memory) => !memoryTrustAssessment(memory).trusted);
}
