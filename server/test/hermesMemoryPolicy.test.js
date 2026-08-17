import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findMemoryConflicts,
  memoryTrustAssessment,
  reviewRequiredMemories,
  trustedMemories,
} from '../src/services/hermesMemoryPolicy.js';

test('flags conflicting active memories and excludes both from trusted context', () => {
  const memories = [
    { id: 1, title: 'Hermes 名称', content: '叫小瑞', source: 'manual' },
    { id: 2, title: 'Hermes-名称', content: '叫小助手', source: 'manual' },
  ];
  const conflicts = findMemoryConflicts(memories);

  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].memoryIds, [1, 2]);
  assert.deepEqual(trustedMemories(memories, conflicts), []);
});

test('generated Hermes content remains review-only and cannot become trusted evidence', () => {
  const memories = [
    { id: 1, title: '工作偏好', content: '先结论后依据', source: 'manual' },
    { id: 2, title: '工作偏好', content: '先结论后依据', source: 'hermes_conversation:2' },
    { id: 3, title: '今日学习', content: '自动生成内容 A', source: 'hermes_daily_learning' },
    { id: 4, title: '今日学习', content: '自动生成内容 B', source: 'hermes_daily_learning' },
    { id: 5, title: '回答反馈', content: 'AI 回答摘要', source: 'hermes_feedback:2:1:wrong' },
  ];

  const conflicts = findMemoryConflicts(memories);
  assert.equal(conflicts.length, 0);
  assert.deepEqual(trustedMemories(memories, conflicts).map((memory) => memory.id), [1]);
  assert.deepEqual(reviewRequiredMemories(memories).map((memory) => memory.id), [2, 3, 4, 5]);
  assert.equal(memoryTrustAssessment(memories[2]).status, 'review_required');
});

test('explicit user preference memory remains trusted', () => {
  const memory = { id: 1, title: '称呼偏好', content: '称呼 Hermes 为小瑞', source: 'hermes_auto_preference:assistant_alias' };
  assert.equal(memoryTrustAssessment(memory).trusted, true);
  assert.deepEqual(trustedMemories([memory], []), [memory]);
});
