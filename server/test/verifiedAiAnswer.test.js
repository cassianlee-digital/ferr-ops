import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeVerifiedAnswer, generateVerifiedAiAnswer } from '../src/services/verifiedAiAnswer.js';

function keywordEvidence() {
  return {
    id: 'EV-ADS-KEYWORD',
    source: 'google_ads.keyword_sync',
    dataRole: 'synced_keyword_observation',
    granularity: 'keyword',
    domain: 'sem',
    label: '关键词 custom casting',
    metric: 'ads_keyword_cost_clicks_conversions',
    date: new Date().toISOString().slice(0, 10),
    freshness: 'fresh',
    value: 'keyword=custom casting; cost=600; clicks=80; conversions=0',
    detail: '关键词 custom casting 花费 600，点击 80，转化 0',
  };
}

test('无证据池时，数据结论会进入待验证而不是带警告原样交付', () => {
  const result = finalizeVerifiedAnswer('SEM 实际 CTR 为 0，说明投放失败。', { evidencePack: [] }, { forceEvidence: true });
  assert.equal(result.audit.status, 'no_evidence_pool');
  assert.equal(result.audit.claimAuditStatus, 'downgraded');
  assert.match(result.parsed.answer, /待验证/);
  assert.equal(result.confidenceAssessment.level, 'low');
});

test('共享生成器只采用证据更多且评分更高的一次有界修复', async () => {
  const context = { evidencePack: [keywordEvidence()] };
  const responses = [
    '<hermes_basis>根据后台数据</hermes_basis><hermes_answer>暂停高花费关键词。</hermes_answer>',
    '<hermes_basis>引用关键词明细。[EV-ADS-KEYWORD]</hermes_basis><hermes_answer>关键词 custom casting 花费 600、点击 80、转化 0，先核对搜索词后暂停。[EV-ADS-KEYWORD]</hermes_answer>',
  ];
  const calls = [];
  const generated = await generateVerifiedAiAnswer({
    system: 'system', prompt: 'prompt', context, forceEvidence: true,
    generate: async (_system, prompt, options) => {
      calls.push({ prompt, options });
      return responses.shift();
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.maxAttempts, 1);
  assert.equal(generated.answerQualityRepair.attempted, true);
  assert.equal(generated.answerQualityRepair.used, true);
  assert.equal(generated.confidenceAssessment.level, 'high');
  assert.doesNotMatch(generated.text, /EV-ADS-KEYWORD/);
});
