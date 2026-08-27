import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bindTableEditor } from '../../public/src/table-editor.js';

const html = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8');
const negAdsSource = readFileSync(new URL('../../public/src/neg-ads.js', import.meta.url), 'utf8');
const chartsSource = readFileSync(new URL('../../public/src/charts.js', import.meta.url), 'utf8');
const closedLoopSource = readFileSync(new URL('../../public/src/closed-loop.js', import.meta.url), 'utf8');
const aiSource = readFileSync(new URL('../../public/src/ai.js', import.meta.url), 'utf8');
const editableSource = readFileSync(new URL('../../public/src/editable.js', import.meta.url), 'utf8');
const settingsSource = readFileSync(new URL('../../public/src/settings.js', import.meta.url), 'utf8');
const kpiSource = readFileSync(new URL('../../public/src/kpi.js', import.meta.url), 'utf8');
const kpiViewSource = readFileSync(new URL('../../public/src/kpi-view.js', import.meta.url), 'utf8');
const timerangeSource = readFileSync(new URL('../../public/src/timerange.js', import.meta.url), 'utf8');
const keywordsSource = readFileSync(new URL('../../public/src/keywords.js', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../../public/src/main.js', import.meta.url), 'utf8');
const tableEditorSource = readFileSync(new URL('../../public/src/table-editor.js', import.meta.url), 'utf8');
const rankSnapshotsSource = readFileSync(new URL('../../public/src/rank-snapshots.js', import.meta.url), 'utf8');
const ga4Source = readFileSync(new URL('../../public/src/ga4-view.js', import.meta.url), 'utf8');
const risksSource = readFileSync(new URL('../../public/src/risks.js', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../../public/styles.css', import.meta.url), 'utf8');

function tbody(id) {
  const match = html.match(new RegExp(`<tbody[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/tbody>`));
  assert.ok(match, `missing tbody #${id}`);
  return match[1];
}

test('live business tables never ship static records in real mode', () => {
  // tb-inq-cur（Hero「最新询盘」）已于 2026-08-26 合并进 tb-inq 这唯一一张带筛选/分页的表
  for (const id of ['tb-inq', 'tb-neg', 'tb-ad']) {
    const body = tbody(id);
    assert.match(body, /data-load-state="loading"/);
    assert.doesNotMatch(body, /contenteditable|data-field=|data-id=/);
  }

  const topKeywords = tbody('overview-top-keywords');
  assert.match(topKeywords, /data-load-state="unavailable"/);
  assert.match(topKeywords, /尚未完成关键词排名与询盘归因/);
});

test('known fixture records and unsupported business conclusions are absent', () => {
  const unsupportedClaims = [
    '本月预计 85 分',
    '东南亚来词零有效询盘',
    '欧洲铸件采购Q3回暖',
    '大白话客户(see drawing)成单更快',
    '德国组用"目标ROAS"',
    '球铁页 H1 加入材质牌号(A536)',
    '机加工通用组 ROAS 偏低',
    '球铁页资质版 CTR+38%',
    'ISO/CE 认证铸造厂 · 按图定制',
    'Lowest Price Casting',
    '索要频率：catalog ＞ 材质证书',
  ];
  for (const claim of unsupportedClaims) assert.equal(html.includes(claim), false, `unsupported claim remains: ${claim}`);
});

test('AI entry points require evidence, confidence, and explicit insufficient-data handling', () => {
  assert.match(html, /逐条说明数据依据和置信度/);
  assert.match(html, /没有搜索词级证据时必须明确说明/);
  assert.match(html, /不得编造认证、交期、报价速度/);
  assert.ok((html.match(/data-ai-state="not-generated"/g) || []).length >= 6);
  assert.match(aiSource, /function aiQualityBanner\(/);
  assert.match(aiSource, /function aiIsActionable\(/);
  assert.match(aiSource, /当前结论未通过可执行性评分，需重新分析或补充数据，不能采纳/);
  assert.match(aiSource, /当前结论未通过可执行性评分，需重新分析或补充数据，不能拆成可执行动作/);
});

test('SEM negative-keyword candidates use real search terms instead of keyword-level fallback', () => {
  assert.match(chartsSource, /wasteSearchTerms/);
  assert.match(chartsSource, /searchTermCoverage/);
  assert.match(chartsSource, /真实搜索词明细，不能生成否词候选/);
  assert.match(chartsSource, /p\.searchTerm/);
  assert.doesNotMatch(chartsSource, /零转化烧钱词 · 该砍\/暂停/);
  assert.doesNotMatch(chartsSource, /renderSemScatterTargets\(zero\)/);
});

test('GA4 view exposes real campaign and event evidence with understandable labels and honest states', () => {
  for (const id of ['ga4-key-events', 'ga4-campaigns', 'ga4-events', 'ga4-devices-empty']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /转化 = GA4 关键事件/);
  assert.match(html, /事件需与 CRM 有效询盘核对/);
  assert.match(ga4Source, /row\.label \|\| '自定义事件'/);
  assert.match(ga4Source, /row\.eventName \|\| ''/);
  assert.match(ga4Source, /关键事件尚未同步，请重新执行 GA4 同步/);
  assert.match(ga4Source, /已同步事件，但没有匹配的转化或关键事件/);
  assert.match(ga4Source, /GA4 数据读取失败/);
  assert.match(appSource, /'reload-ga4':\(\)=>loadGa4\(\)/);
  assert.match(ga4Source, /const requestId = \+\+requestSequence/);
  assert.match(ga4Source, /new Chart\(canvas/);
  assert.doesNotMatch(ga4Source, /catch\s*\([^)]*\)\s*\{\s*\}/);
  assert.doesNotMatch(ga4Source, /\.style\./);
});

/* 2026-08-26：时间范围由「全站一个」改成「每页一个」(scope: dashboard/kpi/inquiry/data/fix)。
   这条守卫因此改为要求：每个取数方都显式声明自己属于哪一页，并且只认自己那一页的 revision，
   否则改 A 页的时间会把 B 页的数据也换掉（正是这次要修的毛病）。 */
test('every dated consumer names its own page scope and rejects stale responses', () => {
  assert.match(appSource, /API\.get\(withRange\('\/api\/inquiries','inquiry'\)\)/);
  assert.match(appSource, /const requestId=\+\+inquiryRequestSequence/);
  assert.match(appSource, /revision!==getRangeRevision\('inquiry'\)/);
  assert.match(kpiSource, /API\.get\(withRange\('\/api\/kpi-targets','kpi'\)\)/);
  assert.match(kpiSource, /API\.get\(withRange\('\/api\/seo-weeks','kpi'\)\)/);
  assert.match(kpiSource, /API\.get\(withRange\('\/api\/sem-weeks','kpi'\)\)/);
  assert.match(kpiViewSource, /API\.get\(withRange\('\/api\/overview',scope\)\)/);
  assert.match(kpiViewSource, /const scope=activeScope\(\)/); // 顶栏 KPI 跟随「当前所在页面」
  assert.match(settingsSource, /API\.put\(withRange\('\/api\/kpi-targets','kpi'\)/);
  assert.match(chartsSource, /r=getCurrentRange\('dashboard'\)/);
  assert.match(chartsSource, /API\.get\(withRange\('\/api\/google\/gsc\/summary',r\)\)/);
  assert.match(chartsSource, /API\.get\(withRange\('\/api\/google\/ads\/board',r\)\)/);
  assert.match(chartsSource, /API\.get\(withRange\('\/api\/inquiries','dashboard'\)\)/);
  assert.match(chartsSource, /API\.get\(withRange\('\/api\/inquiries','kpi'\)\)/); // KPI 圆环自带取数，不蹭询盘页缓存
  assert.match(chartsSource, /API\.get\(withRange\('\/api\/google\/seo\/board','data'\)\)/);
  assert.match(chartsSource, /API\.get\(withRange\('\/api\/diagnostics','data'\)\)/);
  assert.match(ga4Source, /API\.get\(withRange\('\/api\/ga4\/overview','data'\)\)/);
  assert.match(chartsSource, /requestId!==dashboardBoardsRequestSequence\|\|revision!==getRangeRevision\('dashboard'\)/);
  assert.match(chartsSource, /requestId!==dashboardInqRequestSequence\|\|revision!==getRangeRevision\('dashboard'\)/);
  assert.match(chartsSource, /loadDashboardInq\(\);[\s\S]*loadDashboardBoards\(\);/);
  // 事件必须带 scope，消费者必须按 scope 认领，否则「分页面独立」形同虚设
  assert.match(timerangeSource, /s\.revision\+\+;/);
  assert.match(timerangeSource, /detail: \{ scope: key, range: s\.range, revision: s\.revision \}/);
  assert.match(chartsSource, /const scope=e\.detail&&e\.detail\.scope/);
  assert.match(appSource, /e\.detail\.scope==='inquiry'\)loadInquiries\(\)/);
  assert.match(ga4Source, /e\.detail\.scope === 'data'\) loadGa4\(\)/);
  // 每页各存各的 localStorage key；旧的全站单一 key 只在迁移时读一次
  assert.match(timerangeSource, /'ferr:timeRange:' \+ s/);
  assert.match(timerangeSource, /'ferr:customRange:' \+ s/);
});

test('empty and failed live loads remain observable and retryable', () => {
  assert.match(appSource, /function tableLoadState\(/);
  assert.match(appSource, /\$\{esc\(message\)\}/);
  assert.match(appSource, /data-load-state="\$\{state\}"/);
  assert.match(appSource, /否词加载失败：/);
  assert.match(appSource, /广告创意加载失败：/);
  assert.match(appSource, /window\._inqStats=null;[\s\S]*tableLoadState\('tb-inq',14,'error'/);
  assert.match(appSource, /loadInquiries\(\)/);
  assert.match(appSource, /loadNegKeywords\(\)/);
  assert.match(appSource, /loadAdCreatives\(\)/);
  assert.match(negAdsSource, /clearLoadState\('tb-neg'\)/);
  assert.match(negAdsSource, /clearLoadState\('tb-ad'\)/);
  assert.match(chartsSource, /function loadFailureText\(/);
  assert.match(chartsSource, /function loadFailureRow\(/);
  assert.match(chartsSource, /chartEmpty\('seoBoard',loadFailureText\('GSC',error\),'加载失败'\)/);
  assert.match(chartsSource, /window\._adsBoard=\{error:e\}/);
  assert.match(chartsSource, /d=\{error:e\}/);
  assert.doesNotMatch(chartsSource, /await API\.get\([^;]+\); \}catch\(e\)\{\}/);
  assert.match(closedLoopSource, /function showTableFailure\(/);
  assert.match(closedLoopSource, /function showLoopLoadFailure\(/);
  assert.match(closedLoopSource, /function showTaskCheckinFailure\(/);
  assert.match(closedLoopSource, /data-closed-loop-load-state="checkins"/);
  assert.match(closedLoopSource, /showTableFailure\('tb-fix',8,'整改清单',e,loadClosedLoop\)/);
  assert.match(closedLoopSource, /showTableFailure\('tb-content',9,'内容资产',e,loadContent\)/);
  assert.doesNotMatch(closedLoopSource, /catch\s*\([^)]*\)\s*\{\s*\}/);
  assert.match(aiSource, /AI 分析记录加载失败：/);
  assert.match(aiSource, /可刷新页面重试/);
  assert.doesNotMatch(aiSource, /loadAiAnalyses\(\)\{[^}]*catch\(e\)\{\}/);
});

test('closed-loop reloads are idempotent and new fix dates use full local ISO dates', () => {
  assert.match(closedLoopSource, /const loadVersion=\+\+closedLoopLoadVersion;[\s\S]*resetClosedLoopView\(\);/);
  assert.match(closedLoopSource, /if\(loadVersion!==closedLoopLoadVersion\)return;/);
  assert.match(closedLoopSource, /loadTaskCheckins\(\(\)=>loadVersion===closedLoopLoadVersion\)/);
  assert.match(closedLoopSource, /const nextCheckins=new Map\(\);[\s\S]*if\(!isCurrent\(\)\)return null;[\s\S]*taskCheckins=nextCheckins;/);
  assert.match(closedLoopSource, /catch\(e\)\{ if\(loadVersion!==closedLoopLoadVersion\)return; addTaskCard\(/);
  assert.match(closedLoopSource, /archivedParentIds\.has\(Number\(it\.parent_id\)\)/);
  assert.match(closedLoopSource, /querySelector\('tr\[data-load-state\]'\)/);
  assert.match(closedLoopSource, /function futureDate\(days\)\{ return formatLocalDate\(/);
  assert.doesNotMatch(closedLoopSource, /\bplusDays\b/);
});

test('settings and editable behavior are modular with explicit dependencies', () => {
  assert.doesNotMatch(appSource, /function (?:validateEditableValue|setSavingState|showSaveError|bindSettings|openPwd|submitPwd|placeCaretEnd)\(/);
  assert.match(settingsSource, /from '\.\/kpi\.js';/);
  assert.match(settingsSource, /from '\.\/kpi-view\.js';/);
  assert.match(settingsSource, /from '\.\/editable\.js';/);
  assert.match(settingsSource, /dataset\.settingsBound==='1'/);
  assert.match(keywordsSource, /from '\.\/editable\.js';/);
  assert.match(keywordsSource, /import \{[^}]*placeCaretEnd[^}]*\} from '\.\/editable\.js';/);
  assert.match(closedLoopSource, /import \{ placeCaretEnd \} from '\.\/editable\.js';/);
  assert.match(negAdsSource, /import \{ placeCaretEnd \} from '\.\/editable\.js';/);
  assert.doesNotMatch(mainSource, /editableCompatibility/);
  assert.match(mainSource, /const settingsCompatibility=\{bindSettings,openPwd,submitPwd\};/);
  assert.equal((appSource.match(/\bbindSettings\(\)/g)||[]).length,1);
  assert.match(editableSource, /Number\.isFinite\(value\)/);
});

test('generic table editing has one idempotent owner and rolls back failed date saves', () => {
  assert.doesNotMatch(appSource, /td\[contenteditable\]\[data-field\]|input\.cell-date\[data-field\]|\bplaceCaretEnd\b|\brollbackEditable\b/);
  assert.match(mainSource, /import \{ bindTableEditor \} from '\.\/table-editor\.js';/);
  assert.equal((mainSource.match(/\bbindTableEditor\(\)/g)||[]).length,1);
  assert.match(tableEditorSource, /if\(tableEditorBound\)return;/);
  assert.match(tableEditorSource, /document\.addEventListener\('focusin',handleFocusIn\)/);
  assert.match(tableEditorSource, /document\.addEventListener\('change',handleDateChange\)/);
  assert.match(tableEditorSource, /input\.value=oldValue\|\|'';/);
  assert.match(tableEditorSource, /保存失败，已恢复旧值/);
  assert.match(tableEditorSource, /setDateInputsBusy\(inputs,true\);[\s\S]*finally\{[\s\S]*setDateInputsBusy\(inputs,false\);/);
  assert.match(tableEditorSource, /setCellBusy\(cell,true,previousEditable\);[\s\S]*finally\{[\s\S]*setCellBusy\(cell,false,previousEditable\);/);
});

test('table editor restores failed date and text saves at runtime', async () => {
  const listeners={};
  const previousDocument=globalThis.document;
  const previousApi=globalThis.API;
  const previousToast=globalThis.toast;
  const messages=[];
  globalThis.document={
    addEventListener(type,handler){
      listeners[type]??=[];
      listeners[type].push(handler);
    }
  };
  globalThis.API={patch:async()=>{ throw null; }};
  globalThis.toast=message=>messages.push(message);

  try{
    bindTableEditor();
    bindTableEditor();
    assert.deepEqual(Object.fromEntries(Object.entries(listeners).map(([type,items])=>[type,items.length])),{
      focusin:1,
      change:1,
      focusout:1,
      keydown:1
    });

    const dateAttributes=new Map();
    const row={dataset:{ep:'/api/fixes',id:'7'}};
    const input={
      value:'2026-08-20',
      defaultValue:'2026-08-19',
      _oldValue:'2026-08-19',
      disabled:false,
      dataset:{field:'due_date'},
      closest(selector){
        if(selector==='input.cell-date[data-field]')return this;
        if(selector==='tr')return row;
        if(selector==='td')return container;
        return null;
      },
      setAttribute(name,value){ dateAttributes.set(name,value); },
      removeAttribute(name){ dateAttributes.delete(name); }
    };
    const container={querySelectorAll:()=>[input]};
    await listeners.change[0]({target:input});
    assert.equal(input.value,'2026-08-19');
    assert.equal(input.disabled,false);
    assert.equal(dateAttributes.has('aria-busy'),false);

    const cellAttributes=new Map([['contenteditable','true']]);
    const cellRow={dataset:{ep:'/api/loop-items',id:'9'}};
    const cell={
      innerText:'new text',
      textContent:'new text',
      _old:'old text',
      dataset:{field:'content'},
      closest(selector){
        if(selector==='td[contenteditable][data-field]')return this;
        if(selector==='tr')return cellRow;
        return null;
      },
      getAttribute:name=>cellAttributes.get(name)??null,
      setAttribute:(name,value)=>cellAttributes.set(name,value),
      removeAttribute:name=>cellAttributes.delete(name)
    };
    await listeners.focusout[0]({target:cell});
    assert.equal(cell.textContent,'old text');
    assert.equal(cellAttributes.get('contenteditable'),'true');
    assert.equal(cellAttributes.has('aria-busy'),false);
    assert.deepEqual(messages,['保存失败，已恢复旧值','保存失败，已恢复旧值']);
  }finally{
    globalThis.document=previousDocument;
    globalThis.API=previousApi;
    globalThis.toast=previousToast;
  }
});

test('rank snapshots are owned by one module with a narrow compatibility surface', () => {
  assert.doesNotMatch(appSource, /function (?:snapshotRanks|renderRankTrend)\(/);
  assert.match(appSource, /await loadRankSnapshots\(\);/);
  assert.match(mainSource, /import \{ loadRankSnapshots, snapshotRanks \} from '\.\/rank-snapshots\.js';/);
  assert.match(mainSource, /const rankSnapshotCompatibility=\{loadRankSnapshots,snapshotRanks\};/);
  assert.match(rankSnapshotsSource, /API\.get\('\/api\/rank-snapshots'\)/);
  assert.match(rankSnapshotsSource, /API\.post\('\/api\/rank-snapshots',\{items\}\)/);
  const exports=[...rankSnapshotsSource.matchAll(/export async function ([A-Za-z_$][\w$]*)/g)].map(match=>match[1]).sort();
  assert.deepEqual(exports,['loadRankSnapshots','snapshotRanks']);
});

test('P0/P1 risk register is a real authenticated data surface with explicit states', () => {
  assert.match(html, /data-tab="risks"/);
  assert.match(html, /id="panel-risks"/);
  assert.match(html, /id="risk-filter-severity"/);
  assert.match(html, /id="risk-filter-status"/);
  assert.match(html, /href="\/page-risks\.css"/);
  assert.match(mainSource, /import \{ loadRisks \} from '\.\/risks\.js';/);
  assert.match(mainSource, /const riskCompatibility=\{loadRisks\};/);
  assert.match(appSource, /if\(tab==='risks'\)\{try\{loadRisks\(\);\}/);
  assert.match(appSource, /document\.querySelector\('\.main'\)\.scrollTo\(\{top:0\}\); window\.scrollTo\(\{top:0\}\);/);
  assert.match(appSource, /matchMedia\('\(max-width:760px\)'\)\.matches\)n\.scrollIntoView/);
  assert.match(stylesSource, /\.sidebar \{[\s\S]*height: 58px !important;[\s\S]*overflow-x: auto !important;/);
  assert.match(risksSource, /API\.get\('\/api\/risks'\)/);
  assert.match(risksSource, /正在核对当前配置、数据库证据和最近生产验收/);
  assert.match(risksSource, /风险清单加载失败/);
  assert.match(risksSource, /当前筛选条件下没有风险项/);
  assert.match(risksSource, /requestId!==requestSequence/);
  assert.match(risksSource, /SOURCE_LABELS=\{production_live:'最近生产验收',current_static:'当前配置与数据库'\}/);
});
