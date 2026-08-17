import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHermesEvidenceCitationIndex,
  compactHermesEvidence,
  compactHermesMemories,
  compactHermesPageContext,
  serializeHermesPayload,
} from '../src/services/hermesPrompt.js';

test('evidence citation index keeps only valid bounded ids beside human labels', () => {
  const index = buildHermesEvidenceCitationIndex([
    { id: 'EV-SEO-1', label: '自然搜索点击趋势' },
    { id: 'not-valid', label: 'should not appear' },
  ]);
  assert.match(index, /EV-SEO-1: 自然搜索点击趋势/);
  assert.doesNotMatch(index, /not-valid|should not appear/);
  assert.ok(index.length <= 3_000);
});

test('prompt evidence removes duplicate detail and bounds untrusted text', () => {
  const evidence = compactHermesEvidence([{
    id: 'EV-1',
    source: 'source',
    summary: 's'.repeat(900),
    detail: 'duplicate detail',
    value: 'v'.repeat(500),
  }]);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].summary.length, 500);
  assert.equal(evidence[0].value.length, 260);
  assert.equal(Object.hasOwn(evidence[0], 'detail'), false);
});

test('prompt memories and page context have explicit count and text bounds', () => {
  const memories = compactHermesMemories(Array.from({ length: 10 }, (_, index) => ({
    title: `memory-${index}`,
    content: 'x'.repeat(900),
  })));
  assert.equal(memories.length, 6);
  assert.equal(memories[0].content.length, 500);

  const page = compactHermesPageContext({
    panels: [{ visibleText: 'p'.repeat(3000) }],
    tables: [{ rows: Array.from({ length: 20 }, () => Array(20).fill('cell')) }],
  });
  assert.equal(page.panels[0].visibleText.length, 1200);
  assert.equal(page.tables[0].rows.length, 6);
  assert.equal(page.tables[0].rows[0].length, 10);
});

test('serialized Hermes payload remains valid JSON within its budget', () => {
  const payload = {
    operator: { role: 'boss' },
    pageContext: { panels: [{ visibleText: 'p'.repeat(3000) }] },
    opsDiagnosis: { missingData: ['ads'] },
    evidencePack: Array.from({ length: 20 }, (_, index) => ({
      id: `EV-${index}`,
      summary: 'e'.repeat(600),
    })),
    enterpriseMemory: {
      longTermMemories: Array.from({ length: 6 }, () => ({ content: 'm'.repeat(500) })),
      missingData: [],
    },
    backendContext: 'b'.repeat(4000),
  };
  const serialized = serializeHermesPayload(payload, 5000);
  const parsed = JSON.parse(serialized);
  assert.ok(serialized.length <= 5000);
  assert.equal(parsed.contextBudget.reduced, true);
  assert.ok(parsed.contextBudget.evidenceIncluded < parsed.contextBudget.evidenceAvailable);
  assert.equal(parsed.evidencePack[0].id, 'EV-0');
});
