import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chartsSource = readFileSync(new URL('../../public/charts.js', import.meta.url), 'utf8');
const aiSource = readFileSync(new URL('../../public/ai.js', import.meta.url), 'utf8');

test('API-backed action buttons never interpolate data into inline JavaScript', () => {
  assert.doesNotMatch(chartsSource, /onclick="(?:aiAsk|adoptFinding)\([^"\n]*\+/);
  assert.doesNotMatch(aiSource, /onclick="adoptFinding\([^"\n]*\+/);
  assert.doesNotMatch(chartsSource, /function _attr\([^)]*\).*replace/);
});

test('dynamic action payloads use escaped data attributes and delegated handlers', () => {
  assert.match(chartsSource, /function _dataActionAttr\(name,value\).*esc\(String\(/);
  assert.match(chartsSource, /_aiActionAttrs\(q,title\)/);
  assert.match(chartsSource, /_adoptActionAttrs\('SEO',ti,de,ev\)/);
  assert.match(aiSource, /_adoptActionAttrs\(dp,a\.title,a\.detail,a\.evidence\)/);
  assert.match(chartsSource, /closest\('\[data-ferr-action\]'\)/);
  assert.match(chartsSource, /runAiAnalysis\(btn,btn\.dataset\.aiPrompt/);
  assert.match(chartsSource, /adoptFinding\(btn,btn\.dataset\.dept/);
});

test('attribute encoding preserves hostile text as data instead of executable markup', () => {
  const hostile = `');alert(1)//\"<img src=x onerror=alert(2)>&`;
  const escaped = hostile
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const html = ` data-ai-prompt="${escaped}"`;
  assert.equal((html.match(/data-ai-prompt=/g) || []).length, 1);
  assert.doesNotMatch(html, /<img|"\s+onerror=|onclick=/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&#39;\);alert\(1\)/);
});

test('legacy AI fallback keeps prompts out of inline handlers', () => {
  assert.doesNotMatch(aiSource, /onclick="sendOrToast\(/);
  assert.doesNotMatch(aiSource, /JSON\.stringify\(prompt\).*&quot;/);
  assert.match(aiSource, /addEventListener\('click',\(\)=>sendOrToast\(prompt\)\)/);
});
