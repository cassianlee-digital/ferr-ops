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
const loginSource = readFileSync(new URL('../../public/login.html', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../../public/src/main.js', import.meta.url), 'utf8');
const weeklyReviewSource = readFileSync(new URL('../../public/src/weekly-review.js', import.meta.url), 'utf8');
const inquiriesSource = readFileSync(new URL('../../public/src/inquiries.js', import.meta.url), 'utf8');
const tagSelectSource = readFileSync(new URL('../../public/src/tagselect.js', import.meta.url), 'utf8');
const archiveSource = readFileSync(new URL('../../public/src/archive.js', import.meta.url), 'utf8');
const cspUtilitiesSource = readFileSync(new URL('../../public/csp-utilities.css', import.meta.url), 'utf8');
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

test('weekly review is bundled with a narrow global compatibility surface', () => {
  assert.doesNotMatch(indexSource, /<script src="\/weekly-review\.js"><\/script>/);
  assert.match(mainSource, /import \* as weeklyReview from '\.\/weekly-review\.js';/);
  assert.match(mainSource, /Object\.assign\(window,[^;]*\bweeklyReview\b[^;]*\);/);
  assert.doesNotMatch(mainSource, /\bsopRate\b/);
  assert.match(weeklyReviewSource, /import \{ mountSopRate \} from '\.\/sop-rate\.js';/);
  const exportedFunctions = [...weeklyReviewSource.matchAll(/export async function ([A-Za-z_$][\w$]*)/g)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(exportedFunctions, ['renderMonthReview', 'renderReview']);
  assert.doesNotMatch(weeklyReviewSource, /export\s+(?:const|let|var|class|\{)/);
});

test('inquiries are bundled with explicit module dependencies and a narrow global compatibility surface', () => {
  assert.doesNotMatch(indexSource, /<script src="\/inquiries\.js"><\/script>/);
  assert.match(mainSource, /from '\.\/inquiries\.js';/);
  assert.match(mainSource, /Object\.assign\(window,[^;]*inquiryCompatibility\);/);
  assert.match(mainSource, /const inquiryCompatibility=\{([^}]*)\};/);
  const compatibility = mainSource.match(/const inquiryCompatibility=\{([^}]*)\};/)[1]
    .split(',')
    .map((name) => name.trim())
    .sort();
  assert.deepEqual(compatibility, [
    'openInquiry',
    'refreshInqStats',
    'renderInqFeed',
    'renderInqList',
    'submitInquiry',
    'submitTrack'
  ]);
  assert.match(tagSelectSource, /import \{ inqRowHtml, isUpgraded \} from '\.\/inquiries\.js';/);
  assert.match(archiveSource, /import \{ GRADE_BADGE \} from '\.\/inquiries\.js';/);
  assert.doesNotMatch(mainSource, /\b(?:GRADE_BADGE|inqRowHtml|isUpgraded|openTrack|trackCellHtml|toggleInqMonth|toggleInqFeed)\b(?=[,}])/);
  assert.match(inquiriesSource, /export const GRADE_BADGE=/);
  assert.match(inquiriesSource, /class="ctr inq-track-feedback"/);
  assert.match(inquiriesSource, /querySelector\('\.inq-track-feedback'\)/);
  assert.doesNotMatch(inquiriesSource, /lastElementChild\.innerHTML=trackCellHtml/);
  const exportedFunctions = [...inquiriesSource.matchAll(/export (?:async )?function ([A-Za-z_$][\w$]*)/g)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(exportedFunctions, [
    'inqRowHtml',
    'isUpgraded',
    'openInquiry',
    'refreshInqStats',
    'renderInqFeed',
    'renderInqList',
    'submitInquiry',
    'submitTrack'
  ]);
});

test('login page loads only external CSS and JavaScript', () => {
  assert.doesNotMatch(loginSource, /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i);
  assert.doesNotMatch(loginSource, /<style\b[^>]*>[\s\S]*?<\/style>/i);
  assert.match(loginSource, /<link rel="stylesheet" href="\/login\.css">/);
  assert.match(loginSource, /<script src="\/login\.js"><\/script>/);
});

test('first-party frontend sources contain no inline style attributes', () => {
  for (const { file, source } of runtimeJavaScriptSources()) {
    assert.doesNotMatch(source, /\sstyle\s*=\s*(?:["']|\$\{)/i, `generated inline style remains in ${file}`);
  }
  assert.doesNotMatch(indexSource, /<[^>]+\sstyle\s*=\s*["']/i);
  assert.doesNotMatch(loginSource, /<[^>]+\sstyle\s*=\s*["']/i);
  assert.match(indexSource, /<link rel="stylesheet" href="\/csp-utilities\.css">/);
});

test('migrated CSP utility classes are defined and contain only CSS declarations', () => {
  const sources = [indexSource, loginSource, ...runtimeJavaScriptSources().map(({ source }) => source)];
  const referenced = new Set(sources.flatMap((source) => [...source.matchAll(/\bcsp-s-[a-f0-9]{10}\b/g)].map((match) => match[0])));
  const defined = new Set([...cspUtilitiesSource.matchAll(/\.([a-z][\w-]*)\s*\{/gi)].map((match) => match[1]));
  assert.deepEqual([...referenced].filter((className) => !defined.has(className)), []);
  assert.doesNotMatch(cspUtilitiesSource, /\$\{|:\s*['"]\s*\+/);
});
