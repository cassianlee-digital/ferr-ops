import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  auditHermesAnswer,
  assessNumericConsistency,
  assessTimeScopeConsistency,
  buildConfidenceAssessment,
  evidenceSupportsClaim,
  guardHermesAnswer,
  lineNeedsEvidence,
  stripEvidenceRefs,
} from '../src/services/hermesEvidence.js';

function evidence(overrides = {}) {
  return {
    id: 'EV-GSC-SUMMARY',
    source: 'gsc.sync',
    dataRole: 'synced_observation',
    granularity: 'aggregate',
    domain: 'seo',
    label: 'GSC 近30天汇总',
    metric: 'gsc_synced_summary',
    date: new Date().toISOString().slice(0, 10),
    freshness: 'fresh',
    value: 'clicks=33; impressions=16358; ctr=0.20%; position=20.4',
    detail: '点击 33，展现 16358，CTR 0.20%，平均排名 20.4',
    ...overrides,
  };
}

function context(items) {
  return { evidencePack: items };
}

test('汇总 GSC 数据只能支持汇总事实，不能把相关性写成原因', () => {
  const item = evidence();
  assert.equal(evidenceSupportsClaim('近30天 GSC 点击 33、展现 16358、CTR 0.20%、平均排名 20.4。', [item]), true);
  assert.equal(evidenceSupportsClaim('GSC CTR 0.20%，说明关键词排名靠后，用户根本看不到页面。', [item]), false);
});

test('回答时间范围必须与引用证据一致', () => {
  const item = evidence({ label: 'GSC 近30天汇总' });
  assert.equal(evidenceSupportsClaim('近30天 GSC 点击 33。', [item]), true);
  assert.equal(evidenceSupportsClaim('近7天 GSC 点击 33。', [item]), false);
  assert.equal(assessTimeScopeConsistency('近7天 GSC 点击 33。', [item]).consistent, false);
});

test('汇总证据不能支持关键词暂停等具体动作', () => {
  const item = evidence({ domain: 'sem', source: 'google_ads.sync', value: 'cost=18169.94; clicks=1354; conversions=43; ctr=10.67%' });
  assert.equal(evidenceSupportsClaim('暂停这个高花费关键词。', [item]), false);
  const keyword = evidence({
    id: 'EV-ADS-KEYWORD', source: 'google_ads.keyword_sync', dataRole: 'synced_keyword_observation',
    granularity: 'keyword', domain: 'sem', metric: 'ads_keyword_cost_clicks_conversions',
    value: 'keyword=custom casting; cost=600; clicks=80; conversions=0',
  });
  assert.equal(evidenceSupportsClaim('关键词 custom casting 花费 600、点击 80、转化 0，先核对搜索词后暂停。', [keyword]), true);
  assert.equal(evidenceSupportsClaim('关键词 ductile iron casting 花费 600、点击 80、转化 0，先暂停。', [keyword]), false);
});

test('回答数字必须与同一指标的引用证据一致', () => {
  const item = evidence({
    id: 'EV-ADS-KEYWORD', source: 'google_ads.keyword_sync', dataRole: 'synced_keyword_observation',
    granularity: 'keyword', domain: 'sem', metric: 'ads_keyword_cost_clicks_conversions',
    value: 'keyword=valve; cost=100; clicks=80; conversions=0',
  });
  assert.equal(evidenceSupportsClaim('关键词 valve 花费 100、点击 80、转化 0。', [item]), true);
  assert.equal(evidenceSupportsClaim('关键词 valve 花费 999、点击 80、转化 0。', [item]), false);
  assert.equal(evidenceSupportsClaim('关键词 valve 点击 80%。', [item]), false);
});

test('数字核验允许显示精度舍入，但不混淆指标和百分比单位', () => {
  const item = evidence({ domain: 'sem', value: 'cost=18169.94; clicks=1354; conversions=43; ctr=10.67%' });
  assert.equal(evidenceSupportsClaim('SEM CTR 为 10.7%。', [item]), true);
  assert.equal(evidenceSupportsClaim('SEM 点击为 1354%。', [item]), false);
  assert.deepEqual(assessNumericConsistency('SEM CTR 为 10.7%。', [item]).mismatches, []);
});

test('复合指标按最长名称绑定，不被拆成其他指标', () => {
  const item = evidence({
    domain: 'seo', metric: 'seo_weekly_metrics',
    value: 'indexed_pages=10; cpa=100',
    detail: '收录页数 10；每次转化成本 100',
  });
  assert.equal(assessNumericConsistency('收录页数 10。', [item]).consistent, true);
  assert.equal(assessNumericConsistency('每次转化成本 100。', [item]).consistent, true);
});

test('多指标回答中任一数字错误都会使整条结论降级', () => {
  const item = evidence({
    id: 'EV-ADS-KEYWORD', source: 'google_ads.keyword_sync', dataRole: 'synced_keyword_observation',
    granularity: 'keyword', domain: 'sem', metric: 'ads_keyword_cost_clicks_conversions',
    value: 'keyword=valve; cost=100; clicks=80; conversions=0',
  });
  const parsed = { basis: '', answer: '- 关键词 valve 花费 999、点击 80、转化 0。[EV-ADS-KEYWORD]' };
  const audit = auditHermesAnswer(parsed, context([item]));
  const guarded = guardHermesAnswer(parsed, audit);
  const confidence = buildConfidenceAssessment(audit, guarded);
  assert.equal(audit.claimAuditStatus, 'downgraded');
  assert.equal(audit.numericMismatches[0].metric, 'cost');
  assert.equal(confidence.dimensions.numericConsistency, 67);
  assert.equal(confidence.level, 'low');
  assert.ok(confidence.score <= 55);
});

test('公司特色判断必须引用主题匹配的调研或记忆', () => {
  const research = evidence({
    id: 'EV-MARKET-1', source: 'market_research', dataRole: 'company_research', granularity: 'research_row', domain: 'market',
    metric: 'company_market_research', freshness: 'unknown',
    value: 'question=客户最关心什么; answer=质量与交期',
  });
  assert.equal(evidenceSupportsClaim('客户最关心质量与交期。', [research]), true);
  assert.equal(evidenceSupportsClaim('客户最关心价格。', [research]), false);
  assert.equal(evidenceSupportsClaim('欧洲客户最看重某项认证资质。', [research]), false);
  const derived = evidence({
    id: 'EV-MARKET-SUMMARY', source: 'market_brain', dataRole: 'derived_company_summary', granularity: 'summary', domain: 'market',
    metric: 'market_summary', value: '欧洲客户最看重认证资质',
  });
  assert.equal(evidenceSupportsClaim('欧洲客户最看重认证资质。', [derived]), false);
  assert.equal(lineNeedsEvidence('FERR 工厂的产品质量和交期有优势。'), true);
  assert.equal(evidenceSupportsClaim('FERR 工厂的产品质量和交期有优势。', [evidence()]), false);
});

test('KPI 目标证据不能把初始化 actual=0 当成真实表现', () => {
  const target = evidence({
    id: 'EV-KPI-TARGET', source: 'kpi_targets', dataRole: 'target_only', granularity: 'target', domain: 'sem',
    metric: 'sem_kpi_targets', freshness: 'unknown', value: 'CTR target=3.5%',
  });
  assert.equal(evidenceSupportsClaim('SEM 的 KPI 目标 CTR 是 3.5%。', [target]), true);
  assert.equal(evidenceSupportsClaim('SEM 实际 CTR 为 0，当前投放未达标。', [target]), false);
});

test('证据不匹配的结论会被降级，并得到低置信度', () => {
  const item = evidence();
  const parsed = { basis: '', answer: '- GSC CTR 0.20%，说明用户看不到页面。[EV-GSC-SUMMARY]' };
  const audit = auditHermesAnswer(parsed, context([item]));
  const guarded = guardHermesAnswer(parsed, audit);
  const confidence = buildConfidenceAssessment(audit, guarded);
  assert.equal(audit.claimAuditStatus, 'downgraded');
  assert.match(guarded.answer, /待验证/);
  assert.equal(confidence.level, 'low');
  assert.ok(confidence.score <= 55);
});

test('新鲜的关键词明细事实通过核验并获得高置信度', () => {
  const item = evidence({
    id: 'EV-ADS-KEYWORD', source: 'google_ads.keyword_sync', dataRole: 'synced_keyword_observation',
    granularity: 'keyword', domain: 'sem', metric: 'ads_keyword_cost_clicks_conversions',
    value: 'keyword=custom casting; cost=600; clicks=80; conversions=0',
  });
  const parsed = { basis: '', answer: '- 关键词 custom casting 花费 600、点击 80、转化 0。[EV-ADS-KEYWORD]' };
  const audit = auditHermesAnswer(parsed, context([item]));
  const guarded = guardHermesAnswer(parsed, audit);
  const confidence = buildConfidenceAssessment(audit, guarded);
  assert.equal(audit.claimAuditStatus, 'passed');
  assert.equal(confidence.level, 'high');
  assert.ok(confidence.score >= 80);
});

test('面向用户的回答会移除内部证据编号', () => {
  assert.equal(stripEvidenceRefs('结论 [EV-GSC-SUMMARY]，下一步。'), '结论，下一步。');
});
