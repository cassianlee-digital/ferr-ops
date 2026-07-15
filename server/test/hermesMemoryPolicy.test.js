import test from 'node:test';
import assert from 'node:assert/strict';
import { findMemoryConflicts, trustedMemories } from '../src/services/hermesMemoryPolicy.js';

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

test('keeps equivalent memories and ignores generated daily learning records', () => {
  const memories = [
    { id: 1, title: '工作偏好', content: '先结论后依据', source: 'manual' },
    { id: 2, title: '工作偏好', content: '先结论后依据', source: 'hermes_conversation:2' },
    { id: 3, title: '今日学习', content: '自动生成内容 A', source: 'hermes_daily_learning' },
    { id: 4, title: '今日学习', content: '自动生成内容 B', source: 'hermes_daily_learning' },
  ];

  const conflicts = findMemoryConflicts(memories);
  assert.equal(conflicts.length, 0);
  assert.equal(trustedMemories(memories, conflicts).length, 4);
});
