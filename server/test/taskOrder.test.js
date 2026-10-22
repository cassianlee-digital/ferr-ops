// 日计划当天任务排序回归：卡片视觉顺序必须与时间序号一致。
import test from 'node:test';
import assert from 'node:assert/strict';
import { compareTodayTasks } from '../../public/src/task-order.js';

test('today tasks are ordered chronologically even when priorities differ', () => {
  const tasks = [
    { sequence: 1, task_hour: '11:00', task_priority: 1 },
    { sequence: 3, task_hour: '16:00', task_priority: 1 },
    { sequence: 4, task_hour: '18:00', task_priority: 2 },
    { sequence: 2, task_hour: '15:00', task_priority: 4 },
  ];

  tasks.sort(compareTodayTasks);

  assert.deepEqual(tasks.map((task) => task.sequence), [1, 2, 3, 4]);
});
