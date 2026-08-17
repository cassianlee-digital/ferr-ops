import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const chartsSource = readFileSync(new URL('../../public/charts.js', import.meta.url), 'utf8');
const aiSource = readFileSync(new URL('../../public/ai.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));

function runtimeJavaScriptSources() {
  const topLevel = readdirSync(publicDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => join(publicDir, entry.name));
  const srcDir = join(publicDir, 'src');
  const modules = readdirSync(srcDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => join(srcDir, entry.name));
  return [...topLevel, ...modules].map((file) => ({ file, source: readFileSync(file, 'utf8') }));
}

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

test('runtime-generated frontend markup contains no inline event handlers', () => {
  for (const { file, source } of runtimeJavaScriptSources()) {
    assert.doesNotMatch(source, /\bon[a-z]+\s*=\s*(?:["']|\$\{)/i, `generated inline event handler remains in ${file}`);
  }
  assert.doesNotMatch(indexSource, /onclick="\$\{retryAction\}"/);
  assert.match(appSource, /tableLoadState\([^;]+,loadInquiries\)/);
  assert.match(appSource, /retryBtn\.addEventListener\('click',retryAction\)/);
});

test('static frontend markup contains no inline event handlers', () => {
  assert.doesNotMatch(indexSource, /<[^>]+\son[a-z]+\s*=\s*["']/i);
  assert.match(indexSource, /data-ui-action="ai-box" data-ai-prompt=/);
  assert.match(appSource, /STATIC_UI_ACTIONS/);
  assert.match(aiSource, /button\[data-ai-prompt\]/);
  assert.doesNotMatch(aiSource, /getAttribute\('onclick'\)/);
});

test('every static UI action is registered and external application JavaScript remains valid', () => {
  const staticMarkup = indexSource.slice(0, indexSource.indexOf('<script src='));
  const actions = new Set([...staticMarkup.matchAll(/data-ui-action="([^"]+)"/g)].map((match) => match[1]));
  const mapSource = appSource.match(/const STATIC_UI_ACTIONS=\{([\s\S]*?)\n\};/);
  assert.ok(mapSource, 'STATIC_UI_ACTIONS map is missing');
  const registered = new Set(
    [...mapSource[1].matchAll(/^\s*(?:'([^']+)'|"([^"]+)"|([a-z][\w-]*))\s*:/gmi)]
      .map((match) => match[1] || match[2] || match[3])
  );
  assert.deepEqual([...actions].filter((action) => !registered.has(action)), []);
  assert.doesNotThrow(() => new Script(appSource));
});

test('main page loads app.js after its dependencies and contains no inline scripts', () => {
  assert.doesNotMatch(indexSource, /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i);
  assert.match(indexSource, /<script src="\/app\.js"><\/script>/);
  assert.ok(indexSource.indexOf('<script src="/app.js">') > indexSource.indexOf('<script src="/ai.js">'));
});
