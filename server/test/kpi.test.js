// KPI 评分：整个后台「公司分/李分/陈分」的权威算法。达成率、反向指标、权重、封顶都要守住。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ratio, blockRate, grade, computeScores } from '../src/services/kpi.js';

test('ratio(正向 r)：达成率 = actual/target，封顶 1', () => {
  assert.equal(ratio({ mode: 'r', target: 100, actual: 50 }), 0.5);
  assert.equal(ratio({ mode: 'r', target: 100, actual: 200 }), 1); // 超额封顶
  assert.equal(ratio({ mode: 'r', target: 0, actual: 50 }), 0);    // 目标 0 → 0（不除零）
});

test('ratio(反向 i：越小越好)：达成率 = target/actual，封顶 1', () => {
  assert.equal(ratio({ mode: 'i', target: 50, actual: 100 }), 0.5); // 实际超标一倍
  assert.equal(ratio({ mode: 'i', target: 100, actual: 50 }), 1);   // 优于目标 → 封顶
  assert.equal(ratio({ mode: 'i', target: 50, actual: 0 }), 0);     // 0 是未形成有效观测，不得凭空满分
  assert.equal(ratio({ mode: 'i', target: 50, actual: null }), 0);  // 缺失值不得参与评分
});

test('blockRate：按权重加权平均达成率', () => {
  const rows = [
    { mode: 'r', target: 100, actual: 100, weight: 2 }, // ratio 1
    { mode: 'r', target: 100, actual: 0, weight: 1 },   // ratio 0
  ];
  assert.equal(blockRate(rows), 2 / 3); // (1*2 + 0*1)/3
  assert.equal(blockRate([]), 0);
  assert.equal(blockRate([{ mode: 'r', target: 100, actual: 100, weight: 0 }]), 0); // 权重和 0 不除零
});

test('grade：分档边界 90/75/60', () => {
  assert.equal(grade(90), '优秀');
  assert.equal(grade(89.9), '合格');
  assert.equal(grade(75), '合格');
  assert.equal(grade(74.9), '警告');
  assert.equal(grade(60), '警告');
  assert.equal(grade(59.9), '整改');
});

test('computeScores：李=总*0.5+SEO*0.5，陈=总*0.5+SEM*0.5，公司=均值', () => {
  const rows = [
    { grp: 'total', mode: 'r', target: 100, actual: 50, weight: 1 }, // tR=0.5
    { grp: 'seo', mode: 'r', target: 100, actual: 100, weight: 1 },  // seoR=1
    { grp: 'sem', mode: 'r', target: 100, actual: 0, weight: 1 },    // semR=0
  ];
  const { scores } = computeScores(rows);
  assert.equal(scores.li, 75);      // (0.5*0.5 + 1*0.5)*100
  assert.equal(scores.chen, 25);    // (0.5*0.5 + 0*0.5)*100
  assert.equal(scores.company, 50); // (75+25)/2
  assert.equal(scores.grade, '整改');
});
