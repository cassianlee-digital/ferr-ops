import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const chartsSource = readFileSync(new URL('../../public/src/charts.js', import.meta.url), 'utf8');
const closedLoopSource = readFileSync(new URL('../../public/src/closed-loop.js', import.meta.url), 'utf8');
const negAdsSource = readFileSync(new URL('../../public/src/neg-ads.js', import.meta.url), 'utf8');
const aiSource = readFileSync(new URL('../../public/src/ai.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../public/src/app.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
const loginSource = readFileSync(new URL('../../public/login.html', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../../public/src/main.js', import.meta.url), 'utf8');
const weeklyReviewSource = readFileSync(new URL('../../public/src/weekly-review.js', import.meta.url), 'utf8');
const inquiriesSource = readFileSync(new URL('../../public/src/inquiries.js', import.meta.url), 'utf8');
const uiKitSource = readFileSync(new URL('../../public/src/ui-kit.js', import.meta.url), 'utf8');
const keywordsSource = readFileSync(new URL('../../public/src/keywords.js', import.meta.url), 'utf8');
const tagSelectSource = readFileSync(new URL('../../public/src/tagselect.js', import.meta.url), 'utf8');
const archiveSource = readFileSync(new URL('../../public/src/archive.js', import.meta.url), 'utf8');
const kpiSource = readFileSync(new URL('../../public/src/kpi.js', import.meta.url), 'utf8');
const kpiViewSource = readFileSync(new URL('../../public/src/kpi-view.js', import.meta.url), 'utf8');
const timerangeSource = readFileSync(new URL('../../public/src/timerange.js', import.meta.url), 'utf8');
const inquiryGlobeSource = readFileSync(new URL('../../public/src/inquiry-globe.js', import.meta.url), 'utf8');
const pageInquiryCss = readFileSync(new URL('../../public/page-inquiry.css', import.meta.url), 'utf8');
const googleProjectsSource = readFileSync(new URL('../../public/src/google-projects.js', import.meta.url), 'utf8');
const sopSource = readFileSync(new URL('../../public/src/sop.js', import.meta.url), 'utf8');
const risksSource = readFileSync(new URL('../../public/src/risks.js', import.meta.url), 'utf8');
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
  assert.match(aiSource, /data-ai-split-index="'\+i\+'"/);
  assert.match(aiSource, /closest\('\[data-ai-split-index\]'\)/);
  assert.doesNotMatch(aiSource, /_adoptActionAttrs|data-(?:title|detail|evidence)=/);
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

test('AI split actions keep untrusted payloads in module state instead of event attributes', () => {
  assert.match(aiSource, /let splitActionItems=\[\]/);
  assert.match(aiSource, /splitActionItems=\(actions\|\|\[\]\)\.map\(/);
  assert.match(aiSource, /adoptSplitAction\(adopt,splitActionItems\[Number\(/);
  assert.doesNotMatch(aiSource, /onclick=|window\.event|sendOrToast/);
});

test('risk register renders backend text through DOM text nodes only', () => {
  assert.doesNotMatch(risksSource, /innerHTML|insertAdjacentHTML|outerHTML/);
  assert.match(risksSource, /element\.textContent=String\(text\)/);
  assert.match(risksSource, /tbody\.replaceChildren\(\)/);
  assert.match(risksSource, /document\.createElement\('tr'\)/);
});

test('runtime-generated frontend markup contains no inline event handlers', () => {
  for (const { file, source } of runtimeJavaScriptSources()) {
    assert.doesNotMatch(source, /\bon[a-z]+\s*=\s*(?:["']|\$\{)/i, `generated inline event handler remains in ${file}`);
  }
  assert.doesNotMatch(indexSource, /onclick="\$\{retryAction\}"/);
  // tableLoadState 已迁入 ui-kit.js，重试按钮仍必须用 addEventListener 绑定而非内联 handler
  assert.match(inquiriesSource, /tableLoadState\([^;]+,loadInquiries\)/);
  assert.match(uiKitSource, /retryBtn\.addEventListener\('click', retryAction\)/);
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
  // app.js 已是 ES 模块，vm.Script 按经典脚本解析会在 import/export 上报错（需要 --experimental-vm-modules
  // 才能用 SourceTextModule）。这里保留原意图——正文语法必须有效——做法是剥掉模块语法后再解析：
  // import 头单独按固定形状校验，剩下 400+ 行正文仍由 vm 真解析，真有语法错依然抓得到。
  const importLines = appSource.match(/^import .*;$/gm) || [];
  assert.ok(importLines.length >= 20, 'app.js 应从各业务模块显式 import');
  for (const line of importLines) assert.match(line, /^import (?:\{[^}]+\}|\* as \w+) from '\.\/[\w-]+\.js';$/);
  const body = appSource.replace(/^import .*;$/gm, '').replace(/^export (?=(?:async )?function )/gm, '');
  assert.doesNotThrow(() => new Script(body));
});

test('app.js is bundled and stays the last import, page has no inline scripts', () => {
  assert.doesNotMatch(indexSource, /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i);
  assert.doesNotMatch(indexSource, /<script src="\/ai\.js"><\/script>/);
  // app.js 已迁入 ES 模块并打进 bundle，不再是独立的经典脚本
  assert.doesNotMatch(indexSource, /<script src="\/app\.js"><\/script>/);
  // 组装层必须是 main.js 的最后一个 import：它在模块求值期做 DOM 绑定 + 注册 window load 启动序列，
  // 顺序等价于原来「bundle.js 之后再加载 app.js」。排到前面会让它先于依赖模块求值。
  const appImport = mainSource.indexOf("import * as app from './app.js';");
  assert.ok(appImport > 0, 'main.js 必须 import app.js');
  const lastImport = mainSource.lastIndexOf('\nimport ');
  assert.equal(mainSource.slice(lastImport + 1).startsWith("import * as app from './app.js';"), true, 'app.js 必须是最后一个 import');
  // window 兼容层里 app 也要最后合并，还原「app.js 的全局后定义、同名覆盖」的原有语义
  assert.match(mainSource, /Object\.assign\(window,[^)]*, app\);/);
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
  assert.match(mainSource, /Object\.assign\(window,[^;]*\binquiryCompatibility\b[^;]*\);/);
  assert.match(mainSource, /const inquiryCompatibility=\{([^}]*)\};/);
  const compatibility = mainSource.match(/const inquiryCompatibility=\{([^}]*)\};/)[1]
    .split(',')
    .map((name) => name.trim())
    .sort();
  assert.deepEqual(compatibility, [
    'openInquiry',
    'refreshInqStats',
    'renderInqList',
    'submitInquiry',
    'submitTrack'
  ]);
  assert.match(tagSelectSource, /import \{ inqRowHtml, isUpgraded \} from '\.\/inquiries\.js';/);
  // loadInquiries 已迁入 inquiries.js，archive 改为显式 import（原先是裸全局）
  assert.match(archiveSource, /import \{ GRADE_BADGE, loadInquiries \} from '\.\/inquiries\.js';/);
  assert.doesNotMatch(mainSource, /\b(?:GRADE_BADGE|inqRowHtml|isUpgraded|openTrack|trackCellHtml|toggleInqMonth|toggleInqFeed)\b(?=[,}])/);
  assert.match(inquiriesSource, /export const GRADE_BADGE=/);
  assert.match(inquiriesSource, /class="ctr inq-track-feedback"/);
  assert.match(inquiriesSource, /querySelector\('\.inq-track-feedback'\)/);
  assert.doesNotMatch(inquiriesSource, /lastElementChild\.innerHTML=trackCellHtml/);
  const exportedFunctions = [...inquiriesSource.matchAll(/export (?:async )?function ([A-Za-z_$][\w$]*)/g)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(exportedFunctions, [
    'filteredInquiries',
    'inqRowHtml',
    'isUpgraded',
    // loadInquiries 2026-08-26 从 app.js 迁回本模块（它渲染的三个函数本来就在这里）；
    // archive 显式 import 它，timerange 改为让本模块订阅事件，故无需再挂 window。
    'loadInquiries',
    'openInquiry',
    'refreshInqStats',
    'renderInqFilterRow',
    'renderInqList',
    'submitInquiry',
    'submitTrack'
  ]);
  // 地图必须与表格同口径：只能读筛选后的结果，不许再直读 window._inqCache（否则筛「业务员=张三」地图还画全量）
  assert.match(inquiryGlobeSource, /import \{ filteredInquiries \} from '\.\/inquiries\.js';/);
  assert.doesNotMatch(inquiryGlobeSource, /\(window\._inqCache/); // 注释里可以提它，代码里不许再读它
  // 筛选条件刻意不持久化：只有每页条数进 localStorage，避免下次打开「询盘少了一半」的误判
  assert.doesNotMatch(inquiriesSource, /localStorage\.setItem\('ferr:inqFilter/);
  assert.match(inquiriesSource, /localStorage\.setItem\('ferr:inqPageSize'/);
  // 跟踪反馈已改为多条记录：走 POST /feedbacks，不许再 PATCH 覆盖式写老列
  assert.match(inquiriesSource, /API\.post\('\/api\/inquiries\/'\+_trackEditing\.id\+'\/feedbacks'/);
  assert.doesNotMatch(inquiriesSource, /API\.patch\([^)]*tracking_feedback/);
  assert.match(inquiriesSource, /data-track-open/);        // 表格里「添加」按钮永远在
  assert.match(inquiriesSource, /日期不详/);                // 老记录没时间戳就如实说，不补假日期
  assert.match(indexSource, /id="track-log"/);             // 弹框里是完整时间线，不是一个覆盖式输入框
  assert.doesNotMatch(indexSource, /id="track-text" rows="6"/);
  // 老板拍板：格子里要把**每一条**跟进都铺出来、正文完整不截断。
  // 这两条守卫防的是「以后有人嫌行太高，又偷偷改回只显示最新一条 / 加省略号」。
  assert.match(inquiriesSource, /list\.map\(f=>`<span class="track-line">/);
  assert.match(inquiriesSource, /class="track-line-date/);
  assert.doesNotMatch(pageInquiryCss, /line-clamp/);
  assert.doesNotMatch(pageInquiryCss, /\.track-line-text\{[^}]*(?:ellipsis|nowrap)/);
});

test('KPI modules use loaded values and expose only required classic-script compatibility', () => {
  assert.doesNotMatch(indexSource, /<script src="\/kpi\.js"><\/script>/);
  assert.match(mainSource, /from '\.\/kpi\.js';/);
  assert.match(kpiViewSource, /from '\.\/kpi\.js';/);
  assert.match(mainSource, /Object\.assign\(window,[^;]*\bkpiCompatibility\b[^;]*\);/);
  const compatibility = mainSource.match(/const kpiCompatibility=\{([^}]*)\};/);
  assert.ok(compatibility, 'KPI compatibility surface is missing');
  assert.deepEqual(compatibility[1].split(',').map((name) => name.trim()).sort(), [
    'SEM',
    'SEO',
    'TOTAL',
    'applyKpiServer',
    'loadMetrics',
    'loadWeeks',
    'submitSemWeek',
    'submitSeoWeek'
  ]);
  assert.equal([...kpiSource.matchAll(/\ba:0\b/g)].length, 16);
  assert.match(kpiSource, /target<=0\|\|actual<=0\)return 0/);
  assert.doesNotMatch(kpiSource, /async function loadMetrics\(\)\{[^}]*catch\(e\)\{\}/);
  const viewExports = [...kpiViewSource.matchAll(/export (?:async )?function ([A-Za-z_$][\w$]*)/g)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(viewExports, ['loadOverview', 'renderKPI']);
  assert.doesNotMatch(mainSource, /\b(?:ratio|recomputeScores|company|liScore|chenScore|mapSeoWeek|openSeoWeek|openSemWeek)\b(?=[,}])/);
});

test('charts are bundled behind events and a narrow classic-script compatibility surface', () => {
  assert.doesNotMatch(indexSource, /<script src="\/charts\.js"><\/script>/);
  assert.match(mainSource, /from '\.\/charts\.js';/);
  assert.match(mainSource, /Object\.assign\(window,[^;]*\bchartCompatibility\b[^;]*\);/);
  const compatibility = mainSource.match(/const chartCompatibility=\{([^}]*)\};/);
  assert.ok(compatibility, 'chart compatibility surface is missing');
  assert.deepEqual(compatibility[1].split(',').map((name) => name.trim()).sort(), [
    'charts',
    'loadAttribution',
    'loadDashboardBoards',
    'loadDashboardInq',
    'loadDataFreshness',
    'loadDiagnostics',
    'loadKpiInqDonuts',
    'loadSemBoardAds',
    'loadSemBoardFull',
    'loadSeoBoardFull',
    'loadSeoBoardGsc',
    'onSemAdGroupChange',
    'onSemCampaignChange',
    'renderInqDonuts',
    'resizeScatters'
  ]);
  const exports = [...chartsSource.matchAll(/export (?:async )?function ([A-Za-z_$][\w$]*)/g)]
    .map((match) => match[1])
    .sort();
  // toggleHier 2026-08-26 从 app.js 迁入（唯一调用者是本模块的委托），不进 window 兼容层
  assert.deepEqual(exports, [...compatibility[1].split(',').map((name) => name.trim()), 'refreshSeoWeekChart', 'toggleHier'].sort());
  assert.match(chartsSource, /import \{ formatLocalDate, getCurrentRange, getRangeRevision, rangeText, withRange \} from '\.\/timerange\.js';/);
  assert.match(chartsSource, /addEventListener\('timerange'/);
  assert.match(chartsSource, /addEventListener\('granularity',[^;]*rebuildSeoChart\(\); renderInqTrend\(\);/);
  assert.doesNotMatch(timerangeSource, /\b(?:loadSeoChartRange|rebuildSeoChart|loadSeoBoardFull|loadSemBoardAds|loadSemBoardFull|loadAttribution|loadDiagnostics|loadDataFreshness)\b/);
  assert.match(kpiSource, /import \{ loadSemBoardAds, loadSeoBoardGsc, refreshSeoWeekChart \} from '\.\/charts\.js';/);
  assert.doesNotMatch(kpiSource, /\b(?:seoFull|seoChart|seoSeriesFromWeeks|buildSeoData)\b/);
  assert.match(inquiriesSource, /import \{ loadDashboardInq, loadKpiInqDonuts \} from '\.\/charts\.js';/);
  assert.match(archiveSource, /import \{ loadDashboardInq \} from '\.\/charts\.js';/);
  assert.match(googleProjectsSource, /import \{ loadDataFreshness \} from '\.\/charts\.js';/);
  assert.doesNotMatch(appSource, /\b_resizeScatters\b/);
});

test('closed-loop is bundled with explicit module dependencies and a narrow compatibility surface', () => {
  assert.doesNotMatch(indexSource, /<script src="\/closed-loop\.js"><\/script>/);
  assert.match(mainSource, /from '\.\/closed-loop\.js';/);
  assert.match(mainSource, /Object\.assign\(window,[^;]*\bclosedLoopCompatibility\b[^;]*\);/);
  const compatibility = mainSource.match(/const closedLoopCompatibility=\{([^}]*)\};/);
  assert.ok(compatibility, 'closed-loop compatibility surface is missing');
  const compatibilityNames = compatibility[1].split(',').map((name) => name.trim()).sort();
  assert.deepEqual(compatibilityNames, [
    'addContent',
    'addDepositRow',
    'addFixRow',
    'addPlanRow',
    'addTestRow',
    'loadClosedLoop',
    'loadContent',
    'openTaskModal',
    'prepend',
    'refreshTaskCols',
    'submitSubtask',
    'submitTask'
  ]);
  const exports = [...closedLoopSource.matchAll(/export (?:async )?function ([A-Za-z_$][\w$]*)/g)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(exports, [...compatibilityNames, 'addDeposit', 'addFixFromObj', 'addTest', 'clip', 'createEvidenceFix', 'depRowHtml', 'futureDate', 'injectAiActions', 'persistFailMsg', 'persistFix', 'persistLoop', 'sFromDept'].sort());
  assert.match(closedLoopSource, /import \{ inlineConfirm \} from '\.\/keywords\.js';/);
  assert.match(closedLoopSource, /import \{ loadSops, loadUrgent, updateSopCounts \} from '\.\/sop\.js';/);
  assert.match(closedLoopSource, /import \{ formatLocalDate, ymd \} from '\.\/timerange\.js';/);
  assert.match(negAdsSource, /import \{ prepend \} from '\.\/closed-loop\.js';/);
  assert.match(archiveSource, /import \{ depRowHtml, persistLoop \} from '\.\/closed-loop\.js';/);
  assert.match(archiveSource, /import \{ inlineConfirm \} from '\.\/keywords\.js';/);
  assert.match(inquiriesSource, /import \{ inlineConfirm \} from '\.\/keywords\.js';/);
  assert.match(sopSource, /import \{ inlineConfirm \} from '\.\/keywords\.js';/);
  assert.match(weeklyReviewSource, /import \{ addDeposit, addTest, persistFailMsg, persistLoop, sFromDept \} from '\.\/closed-loop\.js';/);
  assert.match(chartsSource, /import \{ createEvidenceFix, persistFailMsg \} from '\.\/closed-loop\.js';/);
  assert.doesNotMatch(closedLoopSource, /window\._(?:aiDone|taskCheckins)/);

  const declarations = [...closedLoopSource.matchAll(/^(?:export )?(?:async )?function ([A-Za-z_$][\w$]*)/gm)]
    .map((match) => match[1]);
  const duplicates = declarations.filter((name, index) => declarations.indexOf(name) !== index);
  assert.deepEqual(duplicates, []);
});

test('AI is bundled with internal state and only the classic-script compatibility it needs', () => {
  assert.doesNotMatch(indexSource, /<script src="\/ai\.js"><\/script>/);
  assert.match(mainSource, /import \{ runAiAnalysis, aiBox, loadAiAnalyses, adoptAi \} from '\.\/ai\.js';/);
  const compatibility = mainSource.match(/const aiCompatibility=\{([^}]*)\};/);
  assert.ok(compatibility, 'AI compatibility surface is missing');
  assert.deepEqual(compatibility[1].split(',').map((name) => name.trim()).sort(), ['adoptAi', 'aiBox', 'loadAiAnalyses', 'runAiAnalysis']);
  const exports = [...aiSource.matchAll(/export (?:async )?function ([A-Za-z_$][\w$]*)/g)].map((match) => match[1]).sort();
  assert.deepEqual(exports, ['adoptAi', 'aiBox', 'loadAiAnalyses', 'runAiAnalysis']);
  assert.match(aiSource, /from '\.\/closed-loop\.js';/);
  assert.match(chartsSource, /import \{ runAiAnalysis \} from '\.\/ai\.js';/);
  assert.match(keywordsSource, /import \{ runAiAnalysis \} from '\.\/ai\.js';/);
  assert.doesNotMatch(aiSource, /window\._(?:aiAnalyses|activeAi|aiViewIdx|lastAi)|window\.event|callClaude|function aiAsk\(|function ai\(/);
  assert.doesNotMatch(appSource, /function adoptAi\(|\b_lastAi\b|function callClaude\(/);
  assert.match(aiSource, /activeAi=null; aiViewIdx=-1; splitActionItems=\[\]; lastAi=\{text:'',dept:meta\.dept,quality:null\};/);
  assert.match(aiSource, /const requestVersion=\+\+modalRequestVersion;[\s\S]*if\(requestVersion!==modalRequestVersion\)return;/);
  assert.match(aiSource, /finally\{ if\(requestVersion===modalRequestVersion&&btn\)btn\.disabled=false; \}/);
  assert.doesNotMatch(aiSource, /btn\.classList\.contains\('analyzed'\)/);
  assert.match(aiSource, /if\(input\)input\.value=msg; renderAiBody\(\); toast\('AI 追问失败：'/);

  const declarations = [...aiSource.matchAll(/^(?:export )?(?:async )?function ([A-Za-z_$][\w$]*)/gm)].map((match) => match[1]);
  assert.deepEqual(declarations.filter((name, index) => declarations.indexOf(name) !== index), []);
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
