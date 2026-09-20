import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bindTableEditor } from '../../public/src/table-editor.js';

const html = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../public/src/app.js', import.meta.url), 'utf8');
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
// loadInquiries / tableLoadState 于 2026-08-26 从 app.js 迁到各自归属模块，以下断言随之改指向（强度不变）
const inquiriesSource = readFileSync(new URL('../../public/src/inquiries.js', import.meta.url), 'utf8');
const uiKitSource = readFileSync(new URL('../../public/src/ui-kit.js', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../../public/styles.css', import.meta.url), 'utf8');
// 2026-09-20 新增：产品/大区目录、图片附件、业务反馈、月度绩效考核
const catalogSource = readFileSync(new URL('../../public/src/catalog.js', import.meta.url), 'utf8');
const tagSelectSource = readFileSync(new URL('../../public/src/tagselect.js', import.meta.url), 'utf8');
const attachmentsSource = readFileSync(new URL('../../public/src/attachments.js', import.meta.url), 'utf8');
const inquirySalesSource = readFileSync(new URL('../../public/src/inquiry-sales.js', import.meta.url), 'utf8');
const kpiReviewSource = readFileSync(new URL('../../public/src/kpi-review.js', import.meta.url), 'utf8');
const kpiReviewAdminSource = readFileSync(new URL('../../public/src/kpi-review-admin.js', import.meta.url), 'utf8');

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
  assert.match(inquiriesSource, /API\.get\(withRange\('\/api\/inquiries','inquiry'\)\)/);
  assert.match(inquiriesSource, /const requestId=\+\+inquiryRequestSequence/);
  assert.match(inquiriesSource, /revision!==getRangeRevision\('inquiry'\)/);
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
  assert.match(inquiriesSource, /e\.detail\.scope==='inquiry'\)loadInquiries\(\)/); // 监听器随 loadInquiries 一起迁进 inquiries.js
  assert.match(ga4Source, /e\.detail\.scope === 'data'\) loadGa4\(\)/);
  // 每页各存各的 localStorage key；旧的全站单一 key 只在迁移时读一次
  assert.match(timerangeSource, /'ferr:timeRange:' \+ s/);
  assert.match(timerangeSource, /'ferr:customRange:' \+ s/);
});

test('empty and failed live loads remain observable and retryable', () => {
  assert.match(uiKitSource, /export function tableLoadState\(/);
  assert.match(uiKitSource, /\$\{esc\(message\)\}/);
  assert.match(uiKitSource, /data-load-state="\$\{state\}"/);
  assert.match(appSource, /否词加载失败：/);
  assert.match(appSource, /广告创意加载失败：/);
  // 列数不再写死：2026-09-20 加了「业务反馈」列后是 15 列，colspan 统一由 FILTER_COLS.length 推出，
  // 防的就是「加了列却漏改某处 colspan，空态/错误行宽度对不上」这类改一处漏一处的毛病。
  assert.match(inquiriesSource, /window\._inqStats=null;[\s\S]*tableLoadState\('tb-inq',COLSPAN,'error'/);
  assert.match(inquiriesSource, /const COLSPAN=FILTER_COLS\.length;/);
  assert.doesNotMatch(inquiriesSource, /colspan="\d+"/);
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

// 2026-09-08：老板反馈「客户编码后期补录后，有的直接就不显示」。值其实已入库，
// 是询盘表用旧行缓存整表重画时把它盖回了空白。防回归焊死三件事：存盘后广播、
// 重画前先提交仍在编辑的格子、询盘模块订阅广播同步自己的行缓存。
test('saved cell edits survive the next table repaint', () => {
  assert.match(tableEditorSource, /new CustomEvent\('cellsaved',\{detail\}\)/);
  assert.match(tableEditorSource, /announceCellSaved\(\{ok:true,endpoint,id,field:cell\.dataset\.field,value,item:response&&response\.item\}\)/);
  assert.match(tableEditorSource, /announceCellSaved\(\{ok:false,/);
  assert.match(tableEditorSource, /export function commitPendingCellEdit\(root\)/);
  assert.match(inquiriesSource, /import \{ commitPendingCellEdit \} from '\.\/table-editor\.js';/);
  assert.match(inquiriesSource, /document\.addEventListener\('cellsaved',/);
  assert.match(inquiriesSource, /if\(d\.endpoint!=='\/api\/inquiries'\)return;/);
  // 重画前：先提交仍在编辑的格子（节点被换掉后浏览器不会再补发 focusout），再把未落库的改动收回缓存
  assert.match(inquiriesSource, /commitPendingCellEdit\(tb\);[\s\S]{0,300}absorbEditedCells\(tb\);[\s\S]{0,400}tb\.innerHTML='';/);
  // 只收 dirty 的：全量收会让过期 DOM 反过来盖掉刚从服务端拉回来的新数据
  assert.match(inquiriesSource, /if\(td\._old==null\|\|String\(td\._old\)\.trim\(\)===now\)return;/);
});

test('table editor restores failed date and text saves at runtime', async () => {
  const listeners={};
  const previousDocument=globalThis.document;
  const previousApi=globalThis.API;
  const messages=[];
  // toast 已不再是隐式全局（table-editor 现在 import 自 ui-kit.js），stub globalThis.toast 不再拦得住。
  // 改为提供一个假的 #toast 元素：真实的 ui-kit toast 会写进来，等于连提示链路一起测了。
  const toastEl={ style:{}, appendChild(){}, get textContent(){ return ''; }, set textContent(v){ messages.push(v); } };
  const broadcasts=[];
  globalThis.document={
    addEventListener(type,handler){
      listeners[type]??=[];
      listeners[type].push(handler);
    },
    getElementById(id){ return id==='toast'?toastEl:null; },
    dispatchEvent(event){ broadcasts.push({type:event.type,detail:event.detail}); return true; }
  };
  globalThis.API={patch:async()=>{ throw null; }};

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
    // 存盘失败也要广播：这一格可能已被重画换掉，只把 DOM 滚回旧值不够，缓存也得滚回去
    assert.deepEqual(broadcasts,[{type:'cellsaved',
      detail:{ok:false,endpoint:'/api/loop-items',id:'9',field:'content',value:'old text'}}]);

    // 存盘成功 → 广播服务端整行，列表模块据此同步缓存（否则下一次重画会把新值盖回旧值）
    broadcasts.length=0;
    globalThis.API={patch:async()=>({item:{id:9,content:'new text'}})};
    const savedCell={
      innerText:'DE-2026-018',
      textContent:'DE-2026-018',
      _old:'',
      dataset:{field:'customer_code'},
      closest(selector){
        if(selector==='td[contenteditable][data-field]')return this;
        if(selector==='tr')return {dataset:{ep:'/api/inquiries',id:'12'}};
        return null;
      },
      getAttribute:()=>null, setAttribute(){}, removeAttribute(){}
    };
    await listeners.focusout[0]({target:savedCell});
    assert.deepEqual(broadcasts,[{type:'cellsaved',detail:{ok:true,endpoint:'/api/inquiries',id:'12',
      field:'customer_code',value:'DE-2026-018',item:{id:9,content:'new text'}}}]);
    assert.equal(savedCell._old,'DE-2026-018'); // 已确认落库 → 不再算 dirty，重画时不会被当成未保存改动
  }finally{
    globalThis.document=previousDocument;
    globalThis.API=previousApi;
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

/* ================= 2026-09-20 改版的防回归 ================= */

test('产品与大区只有一份清单：录入下拉 / 彩色标签 / 表头筛选都从 catalog.js 取', () => {
  // 老板反馈的「产品和筛选框不同步」，根因就是同一份清单散在四处各写一遍。
  for (const p of ['爬梯', '紧线器', '电力', '建筑预埋件', 'AI算力']) {
    assert.ok(catalogSource.includes(`['${p}',`), `新产品 ${p} 不在目录里`);
  }
  assert.match(tagSelectSource, /product:PRODUCTS/);
  assert.match(tagSelectSource, /region:REGIONS/);
  assert.match(tagSelectSource, /import \{ PRODUCTS, REGIONS \} from '\.\/catalog\.js';/);
  assert.match(inquiriesSource, /from '\.\/catalog\.js'/);
  // 任何地方再复制一份产品清单都会在这里红
  assert.doesNotMatch(inquiriesSource, /PROD_BADGE=\{/);
  assert.doesNotMatch(tagSelectSource, /\['铸造','b-amber'\]/);
  assert.doesNotMatch(html, /<option>铸造<\/option>/, '录入弹框的产品下拉必须由 fillSelect 按目录渲染，不再写死 option');
  assert.doesNotMatch(html, /<option>西欧<\/option>/, '大区下拉同理');
  assert.match(inquiriesSource, /fillSelect\(document\.getElementById\('f-product'\),PRODUCT_NAMES\)/);
  // 表头筛选的产品/大区列出完整目录（这正是「同步」的含义），不再只列出现过的值
  assert.match(inquiriesSource, /catalog:PRODUCT_NAMES/);
  assert.match(inquiriesSource, /catalog:REGION_NAMES/);
});

test('国家可改、大区可改，且产品/渠道的标签变更真的会落库', () => {
  assert.match(inquiriesSource, /contenteditable data-field="country"/);
  assert.match(inquiriesSource, /data-kind="region"/);
  // region/product/channel 之前不在 fieldMap 里 → 点了换颜色却一次 PATCH 都不发，刷新原样退回
  assert.match(tagSelectSource, /region:'region',product:'product',channel:'channel'/);
});

test('图片附件只走 /raw 取原图，不把 base64 塞进列表或表格', () => {
  assert.match(attachmentsSource, /export function rawUrl\(id\)/);
  assert.match(attachmentsSource, /'\/api\/attachments\/' \+ encodeURIComponent\(id\) \+ '\/raw'/);
  // 缩略图 src 必须是 /raw 地址；把 dataURL 直接渲染进表格会让整页体积随图片线性膨胀
  assert.match(attachmentsSource, /src="\$\{esc\(rawUrl\(im\.id\)\)\}"/);
  assert.doesNotMatch(attachmentsSource, /src="\$\{[^}]*dataUrl/);
  // 上传前压缩：业务随手一张截图好几 MB，原样进库 SQLite 迅速膨胀
  assert.match(attachmentsSource, /export function compressImage\(/);
  assert.match(attachmentsSource, /MAX_EDGE = 1600/);
  // 动图不能重绘（只会剩第一帧），必须原样传
  assert.match(attachmentsSource, /file\.type === 'image\/gif'/);
  // 删除角标压在图里，不往外挑：往外挑会盖住窄格子里挨着的按钮（2026-09-20 在关键词库实测撞上了）
  const componentsCss = readFileSync(new URL('../../public/components.css', import.meta.url), 'utf8');
  const badge = componentsCss.match(/\.att-thumb-del\{([^}]*)\}/);
  assert.ok(badge, '.att-thumb-del 样式缺失');
  assert.doesNotMatch(badge[1], /top:-|right:-/, '删除角标不许用负偏移往外伸');
  // 表格格子里的缩略图只读（deletable 默认 false），删图统一在弹框里做
  assert.match(attachmentsSource, /\{ deletable = false \} = \{\}/);
});

test('大图预览是一张带说明的卡片，且缓存命中时尺寸照样显示', () => {
  assert.match(attachmentsSource, /att-lightbox-card/);
  assert.match(attachmentsSource, /att-lightbox-name/);
  assert.match(attachmentsSource, /在新标签打开原图/);
  // 图走 immutable 缓存，第二次打开 load 早触发完了；只挂监听会永远等不到尺寸
  assert.match(attachmentsSource, /if \(img\.complete\) showDim\(\);/);
  // 判过期必须用序号：读 img.src 回来的是绝对地址，跟相对路径比永远不相等（踩过）
  assert.match(attachmentsSource, /seq !== lightboxSeq/);
  assert.doesNotMatch(attachmentsSource, /img\.src !== /);
  // 点卡片不关窗（要能选文字、点链接），只有背景/✕/Esc 才关
  assert.match(attachmentsSource, /e\.target\.closest\('\.att-lightbox-card'\)/);
  // 刻意不把小图硬放大：拉伸只会变马赛克，等于假装它有更多细节
  const componentsCss2 = readFileSync(new URL('../../public/components.css', import.meta.url), 'utf8');
  const lightboxImg = componentsCss2.match(/\.att-lightbox-img\{([^}]*)\}/);
  assert.ok(lightboxImg, '.att-lightbox-img 样式缺失');
  assert.match(lightboxImg[1], /max-width|max-height/);
  assert.doesNotMatch(lightboxImg[1], /^\s*width:\s*\d|;\s*width:\s*\d/, '不许给预览图写死宽度去强行放大');
});

test('业务反馈与跟踪反馈是两列两张表，语义不许合并', () => {
  assert.match(inquiriesSource, /class="ctr inq-sales-feedback"/);
  assert.match(inquiriesSource, /class="ctr inq-track-feedback"/);
  assert.match(html, /<th class="ctr inq-th-sales">业务反馈<\/th>/);
  // 走各自的接口，别哪天有人图省事把业务反馈写进 inquiry_feedbacks
  assert.match(inquirySalesSource, /'\/sales-notes'/);
  assert.doesNotMatch(inquirySalesSource, /\/feedbacks/);
  // 先建记录再挂图：一张图失败只丢那一张，不会把整条反馈搞没
  assert.match(inquirySalesSource, /API\.post\('\/api\/inquiries\/' \+ editing\.id \+ '\/sales-notes'/);
  // 两个模块不许互相 import（会成环），刷新靠事件
  assert.match(inquirySalesSource, /new CustomEvent\('salesnoteschanged'/);
  assert.match(inquiriesSource, /addEventListener\('salesnoteschanged'/);
  assert.doesNotMatch(inquirySalesSource, /from '\.\/inquiries\.js'/);
});

test('月度绩效考核：前端一行不算分，且缺数据不得显示成 0 分', () => {
  // 分数只能来自后端 services/kpiReview.js —— 两处各算一遍必然对不上账
  assert.doesNotMatch(kpiReviewSource, /\* *m\.weight|weight *\* */);
  assert.match(kpiReviewSource, /API\.get\(withRange\('\/api\/kpi\/review', 'kpi'\)\)/);
  // 非 VALID 的指标出状态文案而不是数字 0
  assert.match(kpiReviewSource, /NO_TARGET: '目标待定'/);
  assert.match(kpiReviewSource, /MISSING_DATA: '缺数据'/);
  assert.match(kpiReviewSource, /m\.score == null \? '—' : m\.score/);
  // 只认 KPI 页自己的时间范围（时间范围已分页面独立）
  assert.match(kpiReviewSource, /e\.detail\.scope === 'kpi'/);
  // 等级配色跟着绩效系数走，不许写死绿色
  assert.match(kpiReviewSource, /function bandTone\(coef\)/);
  // 未归因占比必须一直亮着：老板口径把直接/其他计入总量，但录入质量得有人负责
  assert.match(kpiReviewSource, /未标明来源的询盘/);
});

test('考核方案从设置页改，指标口径不写死在代码里', () => {
  assert.match(html, /data-sub="set-review"/);
  assert.match(html, /id="kpiReviewAdmin"/);
  assert.match(mainSource, /import '\.\/kpi-review-admin\.js';/);
  // 权重/上限/分档/月度目标全部可配（老板明确说后期会加指标）
  for (const key of ['review_weight_a', 'review_weight_fix', 'review_metric_cap', 'review_min_coverage']) {
    assert.match(kpiReviewAdminSource, new RegExp(`'${key}'`), `${key} 应该可以在设置页改`);
  }
  assert.match(kpiReviewAdminSource, /kra-band-min/);
  assert.match(kpiReviewAdminSource, /API\.put\('\/api\/kpi\/review-config'/);
  // 目标留空 = 目标待定，绝不当成 0（当成 0 会让该指标凭空满分）
  assert.match(kpiReviewAdminSource, /function valueOrNull\(input\)/);
  assert.match(kpiReviewAdminSource, /if \(!raw\) return null;/);
});
