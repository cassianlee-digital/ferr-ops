// 派生指标纯计算：round / deriveSem / seoWow。这些数字直接进 KPI 与 SEM 看板，必须守住。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { round, deriveSem, seoWow } from '../src/services/derive.js';

test('round: 四舍五入到指定小数位', () => {
  assert.equal(round(1.23456, 2), 1.23);
  assert.equal(round(1.005, 2), 1.0); // 浮点：Math.round(100.499..)→100
  assert.equal(round(25.6, 0), 26);
});

test('round: 非法输入返回 null（不返回 NaN/Infinity 污染下游）', () => {
  assert.equal(round(null), null);
  assert.equal(round(Infinity), null);
  assert.equal(round(NaN), null);
});

test('deriveSem: CPC/CTR/每次转化费用', () => {
  const r = deriveSem({ cost: 100, clicks: 50, impressions: 1000, conversions: 4 });
  assert.equal(r.cpc, 2);       // 100/50
  assert.equal(r.ctr, 5.0);     // 50/1000*100
  assert.equal(r.cost_per_conv, 25); // 100/4 取整
});

test('deriveSem: 分母为 0 时对应指标为 null（不能造出 Infinity）', () => {
  assert.equal(deriveSem({ cost: 100, clicks: 0, impressions: 1000, conversions: 4 }).cpc, null);
  assert.equal(deriveSem({ cost: 100, clicks: 50, impressions: 0, conversions: 4 }).ctr, null);
  assert.equal(deriveSem({ cost: 100, clicks: 50, impressions: 1000, conversions: 0 }).cost_per_conv, null);
});

test('seoWow: 自然流量环比 %（含涨/跌/上周为0）', () => {
  assert.equal(seoWow(120, 100), 20.0);
  assert.equal(seoWow(80, 100), -20.0);
  assert.equal(seoWow(100, 0), null); // 上周为 0 无法算环比
});
