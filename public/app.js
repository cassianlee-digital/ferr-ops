/* ---------- helpers ---------- */
/* ================= STORAGE LAYER (universal) =================
   优先 Artifact 持久存储(window.storage) → 退 localStorage → 退内存。
   保证在 claude.ai Artifact 内、下载自托管、或预览沙箱里都不报错。*/
const _mem={};
const Store={
  async get(k){
    try{ if(window.storage&&window.storage.get){const r=await window.storage.get(k);return r?JSON.parse(r.value):null;} }catch(e){}
    try{ const v=localStorage.getItem(k);return v?JSON.parse(v):null; }catch(e){}
    return _mem[k]!==undefined?_mem[k]:null;
  },
  async set(k,v){
    _mem[k]=v;
    try{ if(window.storage&&window.storage.set){await window.storage.set(k,JSON.stringify(v));return;} }catch(e){}
    try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){}
  }
};

/* ================= AI 代理 =================
   走后端 /api/ai：密钥只在后端 .env，上下文由后端基于数据库实时组装。*/
async function callClaude(userPrompt){
  const {text}=await API.post('/api/ai',{prompt:userPrompt});
  return text;
}
/* 极简 markdown → html */
/* ===== 1b-a: 统一安全工具 ===== */
// 全站唯一转义入口：& < > " ' ；null/undefined → ''
function esc(s){return (s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
// 单值文本写入，杜绝 HTML 解析
function renderText(el,s){ if(el) el.textContent=(s==null?'':String(s)); }
// AI/Markdown → 安全 HTML：先整体 esc(原始 HTML 一律变文本，无法成标签)，再仅生成白名单标签 p/br/strong/ul/li
function mdToHtml(t){
  const src=esc(t).split(/\n/);
  let html='', para=[], inList=false;
  const flushP=()=>{ if(para.length){ html+='<p>'+para.join('<br>')+'</p>'; para=[]; } };
  const flushL=()=>{ if(inList){ html+='</ul>'; inList=false; } };
  for(let line of src){
    line=line.replace(/\*\*([^*]+?)\*\*/g,'<strong>$1</strong>'); // 仅白名单：加粗
    const m=line.match(/^\s*[-*]\s+(.*)$/);
    if(m){ flushP(); if(!inList){ html+='<ul>'; inList=true; } html+='<li>'+m[1]+'</li>'; }
    else if(line.trim()===''){ flushP(); flushL(); }
    else { flushL(); para.push(line); }
  }
  flushP(); flushL();
  return html;
}
/* AI 协同已拆分至 /ai.js（阶段4-B）
   — aiAsk/aiBox/ai / runAiAnalysis / loadAiAnalyses / applyAiAnalysisStates / renderAiItem / sendAiChat / archiveAiAnalysis / depositAi（esc/mdToHtml/callClaude 由本文件提供）*/

/* ================= MODALS ================= */
function openModal(id){ document.getElementById(id).classList.add('show'); }
function closeModal(id){ document.getElementById(id).classList.remove('show'); }
document.querySelectorAll('.modal-mask').forEach(m=>m.addEventListener('click',e=>{ if(e.target===m)m.classList.remove('show'); }));
const STATIC_UI_ACTIONS={
  'toggle-theme':()=>toggleTheme(),
  go:el=>go(el.dataset.tab),
  ai:el=>runAiAnalysis(el,el.dataset.aiPrompt,el.dataset.aiTitle||'AI 分析',false),
  'ai-box':el=>aiBox(el,el.dataset.aiPrompt),
  'ai-ask':el=>runAiAnalysis(el,el.dataset.aiPrompt,el.dataset.aiTitle,false),
  'open-inquiry':()=>openInquiry(),
  'add-plan':el=>addPlanRow(el.dataset.dept),
  'add-test':el=>addTestRow(el.dataset.dept),
  'snapshot-ranks':()=>snapshotRanks(),
  'add-fix':()=>addFixRow(),
  'add-keyword':el=>addKeyword(el.dataset.keywordType),
  'add-neg':()=>addNeg(),
  'add-ad':()=>addAd(),
  'add-content':()=>addContent(),
  'refresh-brain':el=>refreshBrain(el),
  'create-hermes-daily-learning':()=>createHermesDailyLearning(),
  'load-hermes-memories':()=>loadHermesMemories(true),
  'reset-hermes-memory-form':()=>resetHermesMemoryForm(),
  'save-hermes-memory':()=>saveHermesMemory(),
  'reset-hermes-feedback-form':()=>resetHermesFeedbackForm(),
  'save-hermes-feedback':()=>saveHermesFeedback(),
  'add-deposit':()=>addDepositRow(),
  'open-task':el=>openTaskModal(el.dataset.dept),
  'open-password':()=>openPwd(),
  logout:()=>API.logout(),
  'open-sop':()=>openSopModal(),
  'open-hermes-panel':()=>openHermesPanel(),
  toast:el=>toast(el.dataset.message),
  'close-hermes-panel':()=>closeHermesPanel(),
  'toggle-hermes-maximize':()=>toggleHermesMaximize(),
  'load-hermes-morning-brief':()=>loadHermesMorningBrief(),
  'ask-hermes-starter':el=>askHermesStarter(el.dataset.prompt),
  'sync-hermes-page-detail':()=>syncHermesPageDetail(true),
  'toggle-hermes-deep-thinking':()=>toggleHermesDeepThinking(),
  'send-hermes-prompt':()=>sendHermesPrompt(),
  'clear-hermes-chat':()=>clearHermesChat(),
  'toggle-hermes-history':()=>toggleHermesHistory(),
  'load-hermes-latest':()=>loadHermesLatest(true),
  'learn-hermes-conversation':()=>learnHermesConversation(),
  'archive-hermes-conversation':()=>archiveHermesConversation(),
  'refresh-hermes-status':()=>refreshHermesStatus(true),
  'reset-hermes-window':()=>resetHermesWindow(),
  'close-modal':el=>closeModal(el.dataset.modal),
  'submit-inquiry':()=>submitInquiry(),
  'submit-custom-range':()=>submitCustomRange(),
  'submit-track':()=>submitTrack(),
  'submit-seo-week':()=>submitSeoWeek(),
  'submit-sem-week':()=>submitSemWeek(),
  'submit-password':()=>submitPwd(),
  'submit-task':()=>submitTask(),
  'submit-subtask':()=>submitSubtask(),
  'submit-sop':()=>submitSop(),
  'adopt-ai':()=>adoptAi()
};
document.addEventListener('click',e=>{
  const el=e.target.closest&&e.target.closest('[data-ui-action]');
  if(!el)return;
  const action=STATIC_UI_ACTIONS[el.dataset.uiAction];
  if(action)action(el);
});
const semCampFilter=document.getElementById('semCampFilter');
if(semCampFilter)semCampFilter.addEventListener('change',e=>onSemCampaignChange(e.target.value));
const semAdGroupFilter=document.getElementById('semAdGroupFilter');
if(semAdGroupFilter)semAdGroupFilter.addEventListener('change',e=>onSemAdGroupChange(e.target.value));
let tt;
function showToast(){ const t=document.getElementById('toast'); t.style.transform='translateX(-50%) translateY(0)'; clearTimeout(tt); tt=setTimeout(hideToast,3400); }
function hideToast(){ document.getElementById('toast').style.transform='translateX(-50%) translateY(80px)'; }
function toast(m){ const t=document.getElementById('toast'); t.textContent=m; showToast(); }
/* 带「撤销」的 toast：勾错一条任务，刷新后它就被「已完成」折叠条收走了，找回来要先展开。
   趁 toast 还在，给一次一键撤销。 */
function toastUndo(m,fn){ const t=document.getElementById('toast'); t.textContent=(m==null?'':String(m)); const b=document.createElement('b'); b.textContent='  撤销'; b.style.color='#ff8a82'; b.style.cursor='pointer'; b.onclick=()=>{ hideToast(); try{fn();}catch(e){} }; t.appendChild(b); showToast(); }
function toastGo(m,tab){ const t=document.getElementById('toast'); t.textContent=(m==null?'':String(m)); if(tab){ t.appendChild(document.createTextNode('  ')); const b=document.createElement('b'); b.textContent='查看 →'; b.style.color='#ff8a82'; b.style.cursor='pointer'; b.onclick=()=>{ go(tab); hideToast(); }; t.appendChild(b); } showToast(); }

/* ---------- theme toggle ---------- */
function toggleTheme(){ document.body.classList.toggle('dark'); const dk=document.body.classList.contains('dark'); document.getElementById('themeBtn').innerHTML='<i class="ti ti-'+(dk?'sun':'moon')+'"></i>'; try{localStorage.setItem('ferr:theme',dk?'dark':'light');}catch(e){} }
// 解析期立即恢复主题，避免刷新后丢深色/闪烁
(function(){ try{ if(localStorage.getItem('ferr:theme')==='dark'){ document.body.classList.add('dark'); const b=document.getElementById('themeBtn'); if(b)b.innerHTML='<i class="ti ti-sun"></i>'; } }catch(e){} })();

/* ---------- nav ---------- */
function setPlanningTab(tab){
  const content=document.querySelector('.content');
  if(!content)return;
  const active=tab||'daily';
  content.dataset.planTab=active;
  document.querySelectorAll('.planning-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.planTab===active));
  try{localStorage.setItem('ferr:planningTab',active);}catch(e){}
  if(active==='week'){try{renderReview();}catch(e){}}
  if(active==='month-summary'){try{renderMonthReview();}catch(e){}}
}
function setActionTab(tab){
  const content=document.querySelector('.content');
  if(!content)return;
  const active=tab||'test';
  content.dataset.actionTab=active;
  document.querySelectorAll('.action-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.actionTab===active));
  try{localStorage.setItem('ferr:actionTab',active);}catch(e){}
}
function mountGa4IntoData(){
  const host=document.getElementById('sub-data-ga4');
  const ga4=document.getElementById('panel-ga4');
  if(!host||!ga4)return;
  ga4.classList.remove('panel','active');
  ga4.classList.add('ga4-embedded');
  if(ga4.parentElement!==host)host.appendChild(ga4);
}
function go(tab){ if(tab==='ga4'){ try{localStorage.setItem('ferr:sub:data','data-ga4');}catch(e){} tab='data'; } mountGa4IntoData(); const planCombo=tab==='planning'; const actionCombo=tab==='action'; const p=planCombo?document.getElementById('panel-tasks'):(actionCombo?document.getElementById('panel-test'):document.getElementById('panel-'+tab)); if(!p)return; const content=document.querySelector('.content'); if(content){ content.classList.toggle('planning-composite',planCombo); content.classList.toggle('action-composite',actionCombo); if(!planCombo)delete content.dataset.planTab; if(!actionCombo)delete content.dataset.actionTab; } document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active')); document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active')); if(planCombo){ ['tasks','plan','review','month-review'].forEach(id=>{ const panel=document.getElementById('panel-'+id); if(panel)panel.classList.add('active'); }); let planTab='daily'; try{ planTab=localStorage.getItem('ferr:planningTab')||'daily'; }catch(e){} setPlanningTab(planTab); } else if(actionCombo){ ['test','fix'].forEach(id=>{ const panel=document.getElementById('panel-'+id); if(panel)panel.classList.add('active'); }); let actionTab='test'; try{ actionTab=localStorage.getItem('ferr:actionTab')||'test'; }catch(e){} setActionTab(actionTab); } else { p.classList.add('active'); } const n=document.querySelector('.nav-item[data-tab="'+tab+'"]'); if(n)n.classList.add('active'); document.querySelector('.main').scrollTo({top:0}); window._curTab=tab; try{localStorage.setItem('ferr:tab',tab);}catch(e){} if(tab==='data'&&typeof _resizeScatters==='function')_resizeScatters();
  if(tab==='inquiry')setTimeout(()=>{try{renderGlobe();}catch(e){}},80);
  if(tab==='archive'){try{loadArchive();}catch(e){}} // 归档②：进入归档页时重拉，反映最新归档动作
  if(tab==='tasks'||planCombo){try{loadUrgent();renderSopOverdueBanner();renderReview();}catch(e){}} // Step C：进入任务看板/计划总结时刷新 banner 与周总结
}
document.querySelectorAll('.nav-item').forEach(n=>n.addEventListener('click',()=>go(n.dataset.tab)));
document.querySelectorAll('.planning-tab').forEach(btn=>btn.addEventListener('click',()=>setPlanningTab(btn.dataset.planTab)));
document.querySelectorAll('.action-tab').forEach(btn=>btn.addEventListener('click',()=>setActionTab(btn.dataset.actionTab)));
document.querySelectorAll('.subtab[data-sub]').forEach(t=>t.addEventListener('click',()=>{ const g=t.closest('.panel'); const id=t.dataset.sub; g.querySelectorAll('.subtab').forEach(x=>x.classList.remove('active')); g.querySelectorAll('.subpanel').forEach(x=>x.classList.remove('active')); t.classList.add('active'); const sp=g.querySelector('#sub-'+id); if(sp)sp.classList.add('active'); const tab=(g.id||'').replace('panel-',''); try{localStorage.setItem('ferr:sub:'+tab,id);}catch(e){} if(typeof _resizeScatters==='function')_resizeScatters(); }));
/* 刷新后恢复上次所在页签 + 子页签（修复刷新回总览的 Bug）*/
function restoreRoute(){
  let tab='dashboard'; try{ tab=localStorage.getItem('ferr:tab')||'dashboard'; }catch(e){}
  if(tab==='ga4'){ tab='data'; try{localStorage.setItem('ferr:sub:data','data-ga4');}catch(e){} }
  if(tab!=='planning'&&tab!=='action'&&!document.getElementById('panel-'+tab))tab='dashboard';
  go(tab);
  let sub=null; try{ sub=localStorage.getItem('ferr:sub:'+tab); }catch(e){}
  if(sub){ const panel=document.getElementById('panel-'+tab); const st=panel&&panel.querySelector('.subtab[data-sub="'+sub+'"]'); if(st)st.click(); }
}
document.querySelectorAll('.cat-tabs').forEach(box=>box.addEventListener('click',e=>{
  const t=e.target.closest('.cat-tab'); if(!t)return;
  const sub=box.closest('.subpanel'); const type=sub&&sub.id==='sub-kw-sem'?'sem':'seo';
  if(t.classList.contains('add')){ // 新建分类
    const name=(prompt('新建分类名称：')||'').trim(); if(!name)return;
    if(![...box.querySelectorAll('.cat-tab')].some(x=>x.textContent.trim()===name)){ const span=document.createElement('span'); span.className='cat-tab'; span.textContent=name; box.insertBefore(span,t); }
    box.querySelectorAll('.cat-tab').forEach(x=>x.classList.remove('active'));
    const target=[...box.querySelectorAll('.cat-tab')].find(x=>x.textContent.trim()===name); if(target)target.classList.add('active');
    filterKwByCat(type,name); return;
  }
  box.querySelectorAll('.cat-tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
  filterKwByCat(type, t.classList.contains('cat-all')?null:t.textContent.trim());
}));

/* 时间范围筛选已拆分至 /timerange.js（阶段4-B）
   — RANGES/formatLocalDate/ymd/resolveRange/withRange/getCurrentRange/rangeText/renderTimebar + [data-time] 时间条 + openCustomRange/submitCustomRange */

/* 运营闭环引擎已拆分至 /closed-loop.js（阶段4-B）
   — 整改/任务卡(submitTask/taskDel)/沉淀/计划/测试/loadClosedLoop + 内容资产(loadContent/addContent) + AI三连(aiAct/loopBack/applyAiDoneStates) */

/* 询盘 3D 地球仪已拆分至 /inquiry-globe.js（阶段4-A）— renderGlobe()/COUNTRY_GEO/aggInqByCountry 等 */
/* GA4 流量看板：ES 模块 public/src/ga4-view.js（打包进 /dist/bundle.js）— loadGa4() */

/* 询盘录入已拆分至 /inquiries.js（阶段4-B）
   — openInquiry/submitInquiry / openTrack/submitTrack / inqRowHtml / renderInqList / 月分组 / 删除归档 / refreshInqStats */

/* 否词库 / 广告创意库 录入：ES 模块 public/src/neg-ads.js（打包进 /dist/bundle.js）— addNeg/addAd/negRowHtml/adRowHtml 等 */

/* ================= SEM 层级展开/收起 ================= */
function toggleHier(row){
  row.classList.toggle('collapsed');
  const hidden=row.classList.contains('collapsed');
  let n=row.nextElementSibling;
  while(n&&!n.classList.contains('h-camp')){ n.style.display=hidden?'none':''; n=n.nextElementSibling; }
}

/* ================= minitabs (数据看板 二级标签) ================= */
document.querySelectorAll('.minitab[data-mini]').forEach(t=>t.addEventListener('click',()=>{
  const wrap=t.closest('.subpanel');
  wrap.querySelectorAll('.minitab').forEach(x=>x.classList.remove('active'));
  wrap.querySelectorAll('.minipanel').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  const mp=wrap.querySelector('#mp-'+t.dataset.mini); if(mp)mp.classList.add('active');
  if(typeof _resizeScatters==='function')_resizeScatters();
}));

/* ================= 近6周排名迷你折线 (sparkline) ================= */
function renderSparklines(){
  document.querySelectorAll('[data-spark]').forEach(td=>{
    const v=td.dataset.spark.split(',').map(Number); // 排名:越小越好
    const w=58,h=18,max=Math.max(...v),min=Math.min(...v),rng=Math.max(max-min,1);
    const pts=v.map((d,i)=>{const x=i/(v.length-1)*(w-4)+2; const y=(d-min)/rng*(h-6)+3; return x.toFixed(1)+','+y.toFixed(1);}).join(' ');
    const up=v[v.length-1]<v[0]; const col=up?'var(--green)':(v[v.length-1]>v[0]?'var(--primary)':'var(--text3)');
    const last=v[v.length-1],lx=(w-4)+2,ly=((last-min)/rng*(h-6)+3);
    td.innerHTML=`<svg class="spark" width="${w}" height="${h}"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.6"/><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2" fill="${col}"/></svg>`;
  });
}

/* ================= 载入持久化数据 ================= */
function tableLoadState(id,colspan,state,message,retryAction){
  const tb=document.getElementById(id); if(!tb)return;
  const retry=typeof retryAction==='function'?' <button type="button" class="btn-mini table-retry"><i class="ti ti-refresh"></i> 重试</button>':'';
  tb.innerHTML=`<tr data-load-state="${state}"><td colspan="${colspan}" class="dim csp-s-d48bfa87bb">${esc(message)}${retry}</td></tr>`;
  const retryBtn=tb.querySelector('.table-retry'); if(retryBtn)retryBtn.addEventListener('click',retryAction);
}
// 询盘加载（带当前时间区间）。供首屏 hydrate 与时间切换共用。
async function loadInquiries(){
  try{
    const {items,stats}=await API.get(withRange('/api/inquiries'));
    window._inqCache=items||[];
    renderInqList(); // C组：按月分组渲染（清掉旧行/静态示例行，当月展开、上月折叠）
    try{ renderInqFeed(); }catch(_){} // Hero 左栏「最新询盘」同步刷新
    refreshInqStats(stats);
    // 6.23 文档 2：总览询盘趋势改为「当月按日」独立缓存；不再被 loadInquiries 触发
    renderInqDonuts();  // BUG-6：KPI 页两个 donut 同步真实重绘
    if(window._curTab==='inquiry'){try{renderGlobe();}catch(e){}}
  }catch(e){ if(e&&e.message!=='unauthorized'){
    window._inqCache=[];
    window._inqStats=null;
    const reason=e.message||'未知错误';
    tableLoadState('tb-inq-cur',11,'error','询盘加载失败：'+reason,loadInquiries);
    tableLoadState('tb-inq',11,'error','询盘加载失败：'+reason,loadInquiries);
    const count=document.getElementById('inqFeedCount'); if(count)count.textContent='加载失败';
    renderInqDonuts();
    if(window._curTab==='inquiry'){try{renderGlobe();}catch(_){}}
    toast('询盘加载失败：'+reason);
  } }
}
async function loadNegKeywords(){
  try{
    const {items}=await API.get('/api/neg-keywords');
    const tb=document.getElementById('tb-neg'); if(!tb)return; tb.innerHTML='';
    const rows=items||[];
    if(!rows.length){ tableLoadState('tb-neg',6,'empty','暂无否词记录，点击“加否词”开始记录。'); return; }
    rows.slice().reverse().forEach(r=>{prepend('tb-neg',negRowHtml(r)); tb.firstChild.dataset.id=r.id; tb.firstChild.dataset.ep='/api/neg-keywords';});
  }catch(e){ if(e&&e.message!=='unauthorized'){
    const reason=e.message||'未知错误';
    tableLoadState('tb-neg',6,'error','否词加载失败：'+reason,loadNegKeywords);
    toast('否词加载失败：'+reason);
  } }
}
async function loadAdCreatives(){
  try{
    const {items}=await API.get('/api/ad-creatives');
    const tb=document.getElementById('tb-ad'); if(!tb)return; tb.innerHTML='';
    const rows=items||[];
    if(!rows.length){ tableLoadState('tb-ad',5,'empty','暂无广告创意记录，点击“加创意”开始记录。'); return; }
    rows.slice().reverse().forEach(r=>{prepend('tb-ad',adRowHtml(r)); tb.firstChild.dataset.id=r.id; tb.firstChild.dataset.ep='/api/ad-creatives';});
  }catch(e){ if(e&&e.message!=='unauthorized'){
    const reason=e.message||'未知错误';
    tableLoadState('tb-ad',5,'error','广告创意加载失败：'+reason,loadAdCreatives);
    toast('广告创意加载失败：'+reason);
  } }
}
async function hydrate(){
  // 询盘：从后端读取（多人共享、服务重启不丢）；带当前时间区间
  await loadInquiries();
  // 否词库：从后端读取
  await loadNegKeywords();
  // 广告创意库：从后端读取
  await loadAdCreatives();
  // 排名快照趋势：从后端读取
  try{ const {snapshots}=await API.get('/api/rank-snapshots'); if(snapshots&&snapshots.length>=2)renderRankTrend(snapshots); }catch(e){}
}

/* ⓪ 闭环步骤条渲染 */
const LOOP=[['① 计划','plan'],['② 测试','test'],['③ 数据','data'],['④ 整改','fix'],['⑤ 复盘','review']];
function renderLoopbars(){ document.querySelectorAll('.loopbar').forEach(bar=>{ const cur=+bar.dataset.step;
  bar.innerHTML=LOOP.map((x,i)=>{const n=i+1;const cls=n===cur?'active':(n<cur?'done':'');return `<span class="loopstep ${cls}" data-loop-tab="${esc(x[1])}">${x[0]}</span>`+(n<LOOP.length?'<span class="loopsep"></span>':'');}).join('');
  bar.onclick=e=>{ const step=e.target.closest('[data-loop-tab]'); if(step&&bar.contains(step))go(step.dataset.loopTab); };
}); }
renderLoopbars();

/* ---------- task check ---------- */
/* BUG-23 / SOP-B：动态任务卡(loop_items id) PATCH state；SOP 卡(sopId+freq) POST/DELETE sop completions */
function chk(el){
  el.classList.toggle('on'); const c=el.closest('.tcard');
  const on=el.classList.contains('on');
  if(on){el.innerHTML='<i class="ti ti-check"></i>';c.classList.add('done');}
  else  {el.innerHTML='';                            c.classList.remove('done');}
  // 刚手动勾的卡本次会话不被「已完成」折叠条收走（点完就消失像点错了）；撤销完成时重算折叠条计数
  if(c){c.classList.add('nofold'); if(typeof refreshTaskCols==='function')refreshTaskCols();} // 计数即时更新，见下方 recount()
  const id=c&&c.dataset.id;
  const sopId=c&&c.dataset.sopId;
  // 回滚也要重算：撤销完成失败时若不重算，折叠条计数会比实际少一条，直到下次刷新
  const recount=()=>{ if(typeof refreshTaskCols==='function')refreshTaskCols(); };
  const rollback=()=>{ el.classList.toggle('on'); if(on){el.innerHTML='';c.classList.remove('done');} else {el.innerHTML='<i class="ti ti-check"></i>';c.classList.add('done');} recount(); };
  if(id){
    // 公司大任务完成 → 归档自己 + 级联名下子任务，一起从日计划消失（留痕在归档页；子任务勾完不消失，只有大任务完成才连带清掉）
    if(on && c.classList.contains('cotask')){
      API.post('/api/loop-items/'+id+'/archive',{archive_kind:'company'})
        .then(()=>{ toast('大任务完成 · 已归档（含子任务）'); c.remove(); recount(); loadUrgent(); if(typeof updateSopCounts==='function')updateSopCounts(); })
        .catch(e=>{ rollback(); toast(e&&e.status===403?'无权操作，未入库':'保存失败，已恢复'); });
      return;
    }
    // 归档③：用 state 字段（与归档状态机一致）；同步写 status 以兼容旧前端/外部查看
    API.patch('/api/loop-items/'+id,{state:on?'done':'todo',status:on?'done':'待办'})
      // 出身于整改项的任务：后端会把那条整改回写成「已改」，这里得说出来，否则用户不知道另一张表也动了
      .then(()=>{ const fx=c._item&&c._item.fix_id; if(on)toastUndo('任务完成 · 已入库'+(fx?' · 整改已标「已改」':''),()=>chk(el)); else toast('撤销完成 · 已入库'+(fx?' · 整改回到「进行中」':'')); loadUrgent(); }) // Step C：完成 urgent 任务 → banner 自动消失
      .catch(e=>{ rollback(); toast(e&&e.status===403?'无权操作，未入库':'保存失败，已恢复'); });
  } else if(sopId){
    // SOP-B：完成→POST /api/sop/completions；撤销→DELETE。period_key 按当前频率算
    const freq=c.dataset.sopFreq||'daily';
    const pk=sopPeriodKey(freq);
    const req=on
      ? API.post('/api/sop/completions',{sop_id:Number(sopId),period_key:pk})
      : API.del('/api/sop/completions/'+sopId+'?period_key='+encodeURIComponent(pk));
    req.then(()=>{
      toast(on?'SOP 完成 · 已入库':'撤销完成 · 已入库');
      // 即时更新前端 _sopDone 缓存（无需重拉），再刷 banner + 红点
      const set=window._sopDone&&window._sopDone[freq]; if(set){ if(on)set.add(Number(sopId)); else set.delete(Number(sopId)); }
      updateSopCounts(); renderSopOverdueBanner(); refreshNavTaskDot();
    })
       .catch(e=>{ rollback(); toast(e&&e.status===403?'无权操作，未入库':'保存失败，已恢复'); });
  } else {
    toast(on?'已完成':'');
  }
}

/* 自定义时间区间弹框已拆分至 /timerange.js（阶段4-B）— openCustomRange/submitCustomRange */

/* SOP 引擎已拆分至 /sop.js（阶段4-A）
   — loadSops / renderSopCards / sopCardEl / SOP 设置 CRUD / 未做SOP+urgent banner / refreshNavTaskDot */

/* 彩色标签下拉 tag-select 已拆分至 /tagselect.js（阶段4-B）
   — OPT / selMenu 点击委托 / persistTagChange */

/* 归档②已拆分至 /archive.js（阶段4-A）
   — 行级归档/沉淀委托 / archRowHtml / archInqRowHtml / loadArchive / deriveAk / 恢复+彻删委托 */

/* KPI 引擎 + 周数据已拆分至 /kpi.js（阶段4-B）
   — TOTAL/SEO/SEM / recomputeScores / applyKpiServer / loadMetrics / loadWeeks / 周报录入(openSeoWeek/submitSeoWeek/openSemWeek/submitSemWeek) / renderBoardCards */

/* 设置页：目标值 contenteditable → 回写 KPI 数组 + 重算 */
/* ===== 1c-a: 可编辑保存通用小工具(本轮仅服务 KPI 设置)===== */
// 校验：number 拒绝 空/非数字/负数/多小数点;允许 0 与小数。返回 {ok,value,msg}
function validateEditableValue(raw, type, opts){
  opts=opts||{};
  if(type==='number'){
    const s=String(raw==null?'':raw).trim();
    if(s==='') return {ok:false, msg:'KPI 目标值不能为空'};
    if(!/^\d+(\.\d+)?$/.test(s)) return {ok:false, msg:'请输入有效数字'}; // 拒 abc / -5 / 1.2.3
    const v=Number(s);
    if(isNaN(v)) return {ok:false, msg:'请输入有效数字'};
    if(opts.min!=null && v<opts.min) return {ok:false, msg:'KPI 目标值不能为负数'};
    return {ok:true, value:v};
  }
  const s=String(raw==null?'':raw).trim();
  if(opts.nonempty && s==='') return {ok:false, msg:opts.emptyMsg||'内容不能为空'};
  return {ok:true, value:s};
}
function setSavingState(el, state){
  if(!el) return;
  el.classList.remove('kpi-saving','kpi-ok','kpi-error');
  if(state==='saving') el.classList.add('kpi-saving');
  else if(state==='ok'){ el.classList.add('kpi-ok'); setTimeout(()=>el.classList.remove('kpi-ok'),1200); }
  else if(state==='error'){ el.classList.add('kpi-error'); setTimeout(()=>el.classList.remove('kpi-error'),2000); }
}
function rollbackEditable(el, oldValue){ if(el) el.textContent=(oldValue==null?'':String(oldValue)); }
function showSaveError(el, msg){ setSavingState(el,'error'); toast(msg); }

/* 设置页：目标值 contenteditable → 校验 + 保存中/成功/失败回滚 + 回写 KPI 数组 + 重算 */
function bindSettings(){
  document.querySelectorAll('#panel-settings [data-kpi]').forEach(el=>{
    el.addEventListener('focusin',()=>{ el.dataset.kpiOld=el.textContent; }); // 缓存旧值
    const commit=async()=>{ if(!can('kpiTarget')){ rollbackEditable(el, el.dataset.kpiOld!=null?el.dataset.kpiOld:el.textContent); toast('仅老板/主管可改 KPI 目标'); return; } // 不静默：给明确提示并回滚
      const p=el.dataset.kpi.split(':'),arr=({TOTAL,SEO,SEM})[p[0]],idx=+p[1];
      if(!arr||!arr[idx])return;
      const oldVal=el.dataset.kpiOld!=null?el.dataset.kpiOld:String(arr[idx].t);
      const vr=validateEditableValue(el.textContent,'number',{min:0});
      if(!vr.ok){ rollbackEditable(el,oldVal); showSaveError(el,vr.msg); return; } // 非法 → 回滚 + 提示
      const v=vr.value;
      if(v===arr[idx].t){ el.textContent=String(v); setSavingState(el,null); return; } // 无变化:规范化显示,不请求
      setSavingState(el,'saving');
      try{
        const {rows}=await API.put('/api/kpi-targets',{updates:[{id:arr[idx].id,target:v}]});
        applyKpiServer(rows); renderKPI();                 // arr[idx].t 已更新为服务端确认值
        el.textContent=String(arr[idx].t); el.dataset.kpiOld=String(arr[idx].t); // 用服务端值回写 DOM
        setSavingState(el,'ok');
        toast('已更新「'+arr[idx].n+'」目标 → '+arr[idx].t+' · 已入库, 评分已重算');
      }catch(e){ rollbackEditable(el,oldVal); showSaveError(el,e.status===403?'仅老板可改 KPI 目标':'保存失败，已恢复旧值'); }
    };
    el.addEventListener('blur',commit);
    el.addEventListener('keydown',e=>{ if(e.key==='Enter'){e.preventDefault();el.blur();} });
  });
}

/* 修改密码（后端 /api/change-password 强制校验旧密码）*/
function openPwd(){ ['pwd-old','pwd-new','pwd-new2'].forEach(i=>{const e=document.getElementById(i);if(e)e.value='';}); openModal('pwdMask'); }
async function submitPwd(){
  const oldPassword=document.getElementById('pwd-old').value;
  const newPassword=document.getElementById('pwd-new').value;
  const confirm2=document.getElementById('pwd-new2').value;
  if(!oldPassword||!newPassword){ toast('请填写当前密码与新密码'); return; }
  if(newPassword.length<6){ toast('新密码至少 6 位'); return; }
  if(newPassword!==confirm2){ toast('两次输入的新密码不一致'); return; }
  try{
    await API.post('/api/change-password',{oldPassword,newPassword});
    closeModal('pwdMask'); toast('密码已修改，下次登录用新密码');
  }catch(e){ toast(e.status===401?'当前密码不正确':'修改失败：'+e.message); }
}

/* Google 接入 / 数据源状态卡已拆分至 /google-projects.js（阶段2）
   — INTEG_LABEL / DS_* / dsStatusMeta / dsRow / loadDataSourcesStatus / loadIntegrations / saveIntegration */

/* 市场分析 + AI 记忆体：ES 模块 public/src/market-brain.js（打包进 /dist/bundle.js）
   — renderMarket / loadMarket / 市场单元格 focusout 保存 / loadBrain / refreshBrain */

/* 复盘周报已迁移至 src/weekly-review.js（阶段4-A / 批次7）
   — 周报工作区已迁入 src/weekly-review.js，仅 renderReview/renderMonthReview 保留全局兼容入口 */

/* ===== V7 Excel 化基建：通用单元格保存 + 键盘导航 ===== */
function placeCaretEnd(el){ try{ const r=document.createRange(); r.selectNodeContents(el); r.collapse(false); const s=getSelection(); s.removeAllRanges(); s.addRange(r); }catch(e){} }
/* 通用：带 data-field 的可编辑单元格，失焦即保存到该行 data-ep/:id（否词/广告等）。
   focusin 缓存旧值；无变化不请求；保存失败回滚旧值并提示，杜绝「屏上已改、库里没改」的假成功。 */
document.addEventListener('focusin',e=>{ const cell=e.target.closest&&e.target.closest('td[contenteditable][data-field]'); if(cell)cell._old=cell.innerText; });
// A组：单元格日期选择器(整改截止/测试起止) change 即存到 该行 data-ep/:id；范围型同格两个 input 合成 start~end
document.addEventListener('change',e=>{
  const inp=e.target.closest&&e.target.closest('input.cell-date[data-field]'); if(!inp)return;
  const tr=inp.closest('tr'); const ep=tr&&tr.dataset.ep,id=tr&&tr.dataset.id; if(!ep||!id)return;
  const pair=[...inp.closest('td').querySelectorAll('input.cell-date')];
  const val=pair.length===2?((pair[0].value||'')+'~'+(pair[1].value||'')):inp.value;
  API.patch(ep+'/'+id,{[inp.dataset.field]:val}).then(()=>toast('已保存 · 已入库')).catch(err=>toast(err.status===403?'无权修改':'保存失败，未入库'));
});
document.addEventListener('focusout',async e=>{
  const cell=e.target.closest&&e.target.closest('td[contenteditable][data-field]'); if(!cell)return;
  const tr=cell.closest('tr'); if(!tr)return; const id=tr.dataset.id, ep=tr.dataset.ep; if(!id||!ep)return;
  const val=cell.innerText.trim(); const oldVal=cell._old!=null?cell._old:cell.innerText;
  if(val===String(oldVal).trim())return; // 无变化:不请求
  const body={}; body[cell.dataset.field]=val;
  try{ await API.patch(ep+'/'+id,body); cell._old=val; }
  catch(err){ rollbackEditable(cell,oldVal); toast(err.status===403?'无权修改，已恢复旧值':'保存失败，已恢复旧值'); }
});
/* 通用键盘导航：Tab/Shift+Tab 横向；↑↓ 纵向（多行单元格如市场答案不拦截，保留原生换行/移动）*/
document.addEventListener('keydown',e=>{
  const cell=e.target.closest&&e.target.closest('td[contenteditable]'); if(!cell)return;
  const table=cell.closest('table'); if(!table)return;
  const multiline=cell.classList.contains('mkt-ans');
  if(e.key==='Tab'){
    e.preventDefault();
    const cells=[...table.querySelectorAll('td[contenteditable]')]; const i=cells.indexOf(cell);
    const next=cells[i+(e.shiftKey?-1:1)]; if(next){ cell.blur(); next.focus(); placeCaretEnd(next); }
    return;
  }
  if(multiline) return; // 多行单元格保留原生 ↑↓/Enter
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    const ci=cell.cellIndex; let row=cell.parentElement[e.key==='ArrowDown'?'nextElementSibling':'previousElementSibling'];
    while(row){ const c=row.cells&&row.cells[ci]; if(c&&c.isContentEditable){ e.preventDefault(); cell.blur(); c.focus(); placeCaretEnd(c); return; } row=row[e.key==='ArrowDown'?'nextElementSibling':'previousElementSibling']; }
  }
});

/* AI 弹框结果 → 一键采纳进 ④整改清单（复用 addFix）*/
let _lastAi={text:'',dept:'SEO'};
async function adoptAi(){
  if(!_lastAi.text){toast('暂无可采纳的 AI 内容');return;}
  const s=_lastAi.dept==='SEM'?{dept:'SEM',owner:'陈',c:'b-purple'}:{dept:'SEO',owner:'李',c:'b-blue'};
  const first=_lastAi.text.split('\n').map(x=>x.trim().replace(/^[•\-\*\d\.、:：\s]+/,'')).filter(Boolean)[0]||_lastAi.text;
  const fixText=clip(first.replace(/\*\*/g,''),140), depText=clip(first.replace(/\*\*/g,''),40);
  const btn=document.getElementById('aiAdoptBtn'); if(btn)btn.disabled=true;
  try{
    const [fx]=await Promise.all([persistFix(s,fixText),persistLoop('deposit',s,depText,'采纳')]);
    addFixFromObj(fx.item); addDeposit(s,depText,'采纳');
    if(window._activeAi&&window._activeAi.id)await API.post('/api/ai/analyses/'+window._activeAi.id+'/action',{action:'adopted'});
    closeModal('aiMask'); toastGo('已采纳 → 整改清单（'+s.dept+'）· 已入库','fix');
  }catch(e){ toast(persistFailMsg(e)); }
  finally{ if(btn)btn.disabled=false; }
}

/* 机会词排名 · 每周快照 + 趋势回显（P3）*/
async function snapshotRanks(){
  const trs=[...document.querySelectorAll('#mp-seo-opp tbody tr')];
  const items=trs.map(r=>({keyword:r.cells[0].textContent.trim(),rank:parseInt(r.cells[2].textContent)||null}));
  try{
    const {weeks,snapshots}=await API.post('/api/rank-snapshots',{items});
    renderRankTrend(snapshots);
    toast('已记录本周排名快照（'+items.length+' 词）· 共 '+weeks+' 周，可看趋势');
  }catch(e){ toast(e.status===403?'无权操作（仅李/SEO 可记录快照）':'保存失败：'+e.message); }
}
function renderRankTrend(arr){
  if(!arr||arr.length<2)return; const first=arr[0],last=arr[arr.length-1];
  [...document.querySelectorAll('#mp-seo-opp tbody tr')].forEach(r=>{
    const kw=r.cells[0].textContent.trim(); const a=first.items.find(x=>x.keyword===kw),b=last.items.find(x=>x.keyword===kw);
    if(!a||!b||a.rank==null||b.rank==null)return; const d=a.rank-b.rank;
    let tag=r.querySelector('.rk-trend'); if(!tag){tag=document.createElement('span');tag.className='rk-trend';tag.style.marginLeft='6px';tag.style.fontSize='11px';tag.style.fontWeight='800';r.cells[2].appendChild(tag);}
    tag.textContent=d>0?('▲'+d):d<0?('▼'+(-d)):'—'; tag.style.color=d>0?'var(--green)':d<0?'var(--primary)':'var(--text3)';
  });
  const note=document.getElementById('rankTrendNote'); if(note)note.textContent='已记录 '+arr.length+' 周 · 对比首末快照（▲升 ▼降）';
}
/* 关键词库（4 类）已拆分至 /keywords.js（阶段4-A）
   — kwRow / loadKeywords / addKeyword / kwDelete / 分页 / 分类 tab / inlineConfirm（全局共享） / 单元格保存 */
/* KPI 看板渲染已拆分至 /kpi-view.js（阶段4-B）
   — grade/gauge/badge/fmt/rows/mini/loadOverview/renderKPI */

/* 图表层已拆分至 /charts.js（阶段4-B）
   — DEMO fixture / chartEmpty / renderInqDonuts / SEO 折线(seoSeriesFromWeeks/rebuildSeoChart/loadSeoChartRange) / loadDashboardInq / renderInqTrend / charts() */

window.addEventListener('load',async()=>{
  await ensureAuth();          // 未登录会跳 /login.html
  applyRoleUi();               // 按角色显示用户/登出、隐藏越权控件
  restoreRoute();              // 尽早回到上次页签，避免先闪总览再跳回
  await loadMetrics();          // 持久化的目标/实际覆盖默认
  await loadWeeks();            // 持久化的周数据
  renderKPI();                  // rows + gauges + scores + badges 一次到位
  await loadOverview();         // 顶栏真实数据 + 与上月环比 + miniScores
  charts();
  bindSettings();              // 设置页目标值回写
  renderSparklines();
  await hydrate();             // 询盘/否词/广告/排名快照
  loadDashboardInq();          // 6.23 文档 2：总览询盘趋势独立拉当月，与全局时间范围解耦
  loadDashboardBoards();       // 总览 SEO/SEM 两卡：接真实当月 GSC/Ads 数据（替换写死 demo）
  await loadKeywords();        // 关键词库 4 类
  await loadClosedLoop();      // 整改清单 + 闭环条目 + 沉淀表
  await loadAiAnalyses();      // AI 分析记录：恢复“已分析”状态和历史文档
  await loadArchive();         // 归档②：资产库归档页（三 subtab）
  await loadSops();            // SOP-B：动态 SOP 卡 + 设置页 SOP 列表
  await loadUrgent();          // SOP-C：公司新派 urgent banner + 侧栏红点
  await loadContent();         // 内容资产
  await loadGa4();             // GA4 看板（骨架/空状态）
  loadSeoBoardGsc();           // SEO 看板：真实 GSC 同步数据（趋势/卡片）
  loadSeoBoardFull();          // SEO 富看板：本周要点 + Δ表 + 机会词散点 + GA4 来源
  loadSemBoardAds();           // SEM 看板：真实 Google Ads 同步数据（顶部卡片）
  loadSemBoardFull();          // SEM 富看板：本周要点 + Δ表 + 花费×转化散点 + 系列甜甜圈/日趋势
  loadAttribution();           // 询盘归因：Ads 花费 ÷ 真实 SEM 有效询盘
  loadDiagnostics();           // 诊断引擎：机会词/衰退/蚕食 真实识别 + 角标计数
  loadDataFreshness();         // 阶段5：数据新鲜度条（三源实际有数据天数 + 最后同步）
  await loadDataSourcesStatus(); // 设置页 数据源状态卡(只读真实状态)
  await loadIntegrations();    // 设置页 API 接入状态
  await loadMarket();          // 市场分析问卷表
  if (typeof loadHermesMemories === 'function') await loadHermesMemories(false); // AI 记忆
  await loadBrain();           // AI 记忆体状态 + 摘要
  await renderReview();        // 复盘周报（手风琴+并排）
  refreshInqStats();
});

/* 顶栏显示当前用户 + 登出；按角色做前端控件提示（后端才是权威校验）*/
const ROLE_LABEL={seo:'李 · SEO',sem:'陈 · SEM',manager:'主管',boss:'老板'};
function applyRoleUi(){
  const me=window.ME||{};
  // B-6：个人信息（姓名/角色/用户名）移入设置「个人资料」，不再放顶栏
  const pn=document.getElementById('prof-name'); if(pn)pn.textContent=me.name||'—';
  const pr=document.getElementById('prof-role'); if(pr)pr.textContent=ROLE_LABEL[me.role]||me.role||'—';
  const pu=document.getElementById('prof-user'); if(pu)pu.textContent=me.username||'—';
  // 老板/销售只读 KPI 目标：非 boss 时设置页目标值不可编辑
  if(!can('kpiTarget')){
    document.querySelectorAll('#panel-settings [data-kpi]').forEach(el=>{
      el.removeAttribute('contenteditable'); el.style.opacity='.7';
    });
  }
  // V7：四个运营角色（李/陈/主管/老板）均可录询盘；非登录运营才隐藏录入按钮（后端同样强制校验）
  if(!can('inquiry')){
    document.querySelectorAll('[data-ui-action="open-inquiry"]').forEach(b=>b.style.display='none');
  }
  // 周报录入：SEO 限李，SEM 限陈
  if(!can('seo')) document.querySelectorAll('[data-ui-action="open-seo-week"]').forEach(b=>b.style.display='none');
  if(!can('sem')) document.querySelectorAll('[data-ui-action="open-sem-week"]').forEach(b=>b.style.display='none');
  // 否词/广告创意：限陈(SEM)
  if(!can('sem')){
    document.querySelectorAll('[data-ui-action="add-neg"],[data-ui-action="add-ad"]').forEach(b=>b.style.display='none');
  }
  // 排名快照：限李(SEO)
  if(!can('seo')) document.querySelectorAll('[data-ui-action="snapshot-ranks"]').forEach(b=>b.style.display='none');
  // 关键词库加词：seo/high/customer 限李，sem 限陈
  if(!can('seo')) document.querySelectorAll('[data-ui-action="add-keyword"][data-keyword-type="seo"],[data-ui-action="add-keyword"][data-keyword-type="high"],[data-ui-action="add-keyword"][data-keyword-type="customer"]').forEach(b=>b.style.display='none');
  if(!can('sem')) document.querySelectorAll('[data-ui-action="add-keyword"][data-keyword-type="sem"]').forEach(b=>b.style.display='none');
}
