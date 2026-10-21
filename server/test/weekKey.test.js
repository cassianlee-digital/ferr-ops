// 验证前端 ISO 周工具在跨月、跨年边界仍能正确找到上周。
import test from 'node:test';
import assert from 'node:assert/strict';
import { isoWeekKey, shiftIsoWeekKey } from '../../public/src/week-key.js';

const localDate = (year, month, day) => new Date(year, month - 1, day, 12, 0, 0);

test('ISO 周跨年：元旦仍可能属于上一年的第 53 周', () => {
  assert.equal(isoWeekKey(localDate(2021, 1, 1)), '2020-W53');
  assert.equal(isoWeekKey(localDate(2021, 1, 4)), '2021-W01');
});

test('取上周能跨月、跨年，不用字符串减周号', () => {
  assert.equal(shiftIsoWeekKey('2026-W44', -1), '2026-W43');
  assert.equal(shiftIsoWeekKey('2021-W01', -1), '2020-W53');
  assert.equal(shiftIsoWeekKey('2020-W53', 1), '2021-W01');
});

test('非法周次不生成影子周期', () => {
  assert.equal(shiftIsoWeekKey('2026-W00', -1), null);
  assert.equal(shiftIsoWeekKey('2026-W54', -1), null);
  assert.equal(shiftIsoWeekKey('W43', -1), null);
});
