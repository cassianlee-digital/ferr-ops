/* SOP 引擎（ES 模块 · esbuild 打包为 IIFE）。
   显式模块依赖：formatLocalDate 来自 ./timerange.js —— 不再靠全局碰运气，依赖在编译期可见。
   运行时仍依赖的全局（尚未迁移的经典脚本/内联提供，调用时解析）：
   API、esc()、toast()、chk()（内联；sopCardEl 生成的内联 onclick 会调用）、openModal()/closeModal()、
   window.ME。
   必须挂 window（main.js 统一处理）：
     - openSopModal/submitSop —— 内联 onclick 调用；
     - loadSops/loadUrgent/sopPeriodKey/updateSopCounts/renderSopOverdueBanner/refreshNavTaskDot —— index.html、closed-loop.js 真实调用；
     - 其余保持原有全局暴露面，零行为差异。
   DEPT_BADGE/FREQ_LABEL/FREQ_ICON/_sopEditing 无外部引用，收进模块作用域。 */
import { esc, openModal, closeModal, toast } from './ui-kit.js';
import { formatLocalDate } from './timerange.js';
import { inlineConfirm } from './keywords.js';
import { compareSops, dueThisWeek, sopPriority } from './sop-schedule.js';
import { isoWeekKey, shiftIsoWeekKey } from './week-key.js';

/* ===== SOP 引擎 Step B：周期 key / 加载 / 渲染 / 设置页 CRUD ===== */
// period_key 按本地时间算，daily=YYYY-MM-DD / weekly=YYYY-Www / monthly=YYYY-MM
export function sopPeriodKey(freq){
  const d=new Date(); d.setHours(0,0,0,0);
  if(freq==='monthly'){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'); return y+'-'+m; }
  if(freq==='weekly')return isoWeekKey(d);
  return formatLocalDate(d);
}
window._sops=[]; window._sopDone={daily:new Set(),weekly:new Set(),monthly:new Set()};
const FREQ_LABEL={daily:'每日必做',weekly:'每周必做',monthly:'每月必做'};
const FREQ_TAG={daily:'日',weekly:'周',monthly:'月'};
/* 每个部门列里按赛道分组。老板那两份文档其实是四个角色：SEM / 社媒 / SEO / GEO。
   日计划保持三列（公司 / 陈-SEM / 李-SEO）不动，赛道只在列内分段：
   社媒是陈在做、GEO 是李在做，但配额各算各的 —— 把「本周领英发了几篇」和「搜索词报告查了没」
   混进同一个完成率，考核就失真了。 */
const DEPT_TRACKS={ SEM:['SEM','社媒'], SEO:['SEO','GEO'], 公司:['公司'] };
window._sopProg=new Map(); window._sopLogs=new Map();
window._sopCompletions=new Map(); window._sopPrevCompletions=new Map();
let _sopCompletionError='';
function periodQuery(){
  return 'daily='+encodeURIComponent(sopPeriodKey('daily'))
    +'&weekly='+encodeURIComponent(sopPeriodKey('weekly'))
    +'&monthly='+encodeURIComponent(sopPeriodKey('monthly'));
}
// 没导入过的老条目 track 是空的，按 dept 归位，别让它们从界面上消失
const trackOf=s=>s.track||s.dept;
const isWeeklyNote=s=>s&&s.freq==='weekly'&&(s.note_kind==='goal'||s.note_kind==='review');
const completionFor=(s,previous=false)=>(previous?window._sopPrevCompletions:window._sopCompletions).get(s?.id)||null;
/* 两个判据，别混用：
   - logged：这条要不要走「记一条」流水。判据是 subject_label —— 它就是「这次做的是哪一个」，
     有对象可填才值得一条条记。「周一看数」周目标也写着 1 次，但它没有对象，维持原来的一个勾。
   - hasQuota：要不要画进度数字和进度条。只有真能数的条目才画。 */
export const isLogged=s=>!!s.subject_label;
export const hasQuota=s=>isLogged(s)&&Number(s.target_qty)>0;
export function doneQty(s){
  const r=window._sopProg&&window._sopProg.get(s.id);
  return r?Number(r.done_qty)||0:0;
}
// 一条 SOP 这周期算不算完成：有配额的看数量够不够，没配额的看勾打了没。
// 两套判据必须分开——「周目标 5 篇」打了 1 个勾就算完成，正是老板要的数量考核做不出来的原因。
export function sopDone(s){
  if(isWeeklyNote(s))return !!completionFor(s)?.note;
  if(isLogged(s))return doneQty(s)>=(Number(s.target_qty)>0?Number(s.target_qty):1);
  return !!(window._sopDone[s.freq]&&window._sopDone[s.freq].has(s.id));
}
export async function loadSops(){
  try{ const {items}=await API.get('/api/sop'); window._sops=items||[]; }
  catch(e){ window._sops=[]; if(e&&e.message!=='unauthorized')toast('SOP 加载失败：'+(e.message||'')); }
  try{
    const q='daily='+encodeURIComponent(sopPeriodKey('daily'))
      +'&weekly='+encodeURIComponent(sopPeriodKey('weekly'))
      +'&monthly='+encodeURIComponent(sopPeriodKey('monthly'));
    const previousWeek=shiftIsoWeekKey(sopPeriodKey('weekly'),-1);
    const [current,previous]=await Promise.all([
      API.get('/api/sop/completions?'+q),
      API.get('/api/sop/completions?weekly='+encodeURIComponent(previousWeek)),
    ]);
    const items=current.items||[];
    window._sopDone={daily:new Set(),weekly:new Set(),monthly:new Set()};
    window._sopCompletions=new Map(items.map(c=>[c.sop_id,c]));
    window._sopPrevCompletions=new Map((previous.items||[]).map(c=>[c.sop_id,c]));
    _sopCompletionError='';
    const keyToFreq={[sopPeriodKey('daily')]:'daily',[sopPeriodKey('weekly')]:'weekly',[sopPeriodKey('monthly')]:'monthly'};
    (items||[]).forEach(c=>{ const f=keyToFreq[c.period_key]; if(f)window._sopDone[f].add(c.sop_id); });
  }catch(e){
    window._sopDone={daily:new Set(),weekly:new Set(),monthly:new Set()};
    window._sopCompletions=new Map(); window._sopPrevCompletions=new Map();
    _sopCompletionError=(e&&e.message)||'请求失败';
  }
  // v2：本周期执行流水 + 配额进度。两个接口分开拿——进度是聚合（画进度条），
  // 流水是明细（「这周都发了哪几条」），前端不自己从明细求和，免得和服务端 SUM 口径分叉。
  try{
    const q=periodQuery();
    const [prog,logs]=await Promise.all([
      API.get('/api/sop/progress?'+q).catch(()=>({items:[]})),
      API.get('/api/sop/logs?'+q).catch(()=>({items:[]})),
    ]);
    window._sopProg=new Map((prog.items||[]).map(r=>[r.sop_id,r]));
    window._sopLogs=new Map();
    (logs.items||[]).forEach(l=>{
      if(!window._sopLogs.has(l.sop_id))window._sopLogs.set(l.sop_id,[]);
      window._sopLogs.get(l.sop_id).push(l);
    });
  }catch(e){ window._sopProg=new Map(); window._sopLogs=new Map(); }
  renderSopCards();
  renderWeeklyFocus();
  renderSopSettingsTable();
  updateSopCounts();
  renderSopOverdueBanner(); // Step C：SOP 未做提示
  refreshNavTaskDot();      // Step C：侧栏红感叹号
}
export function renderSopCards(){
  const now=new Date();
  ['SEM','SEO','公司'].forEach(dept=>{
    const anchor=document.getElementById(dept==='公司'?'sop-company':('sop-'+dept.toLowerCase()));
    if(!anchor)return;
    const list=window._sops.filter(s=>s.dept===dept);
    /* 只有「每日必做」「每周必做」两列 —— 月度不单独占一列（2026-10-21）。
       月度条目轮到它那一周时并进周列（带橙色徽章），其余时候本就不用做，不显示。
       没写周次的月度条目每周都并进来（见 sop-schedule.js dueThisWeek 的第②条），
       所以这里不存在「某条 SOP 整月不出现在任何地方」。 */
    const rolled=list.filter(s=>dueThisWeek(s,now));
    const rolledIds=new Set(rolled.map(s=>s.id));
    const byFreq={
      daily:list.filter(s=>s.freq==='daily'),
      weekly:list.filter(s=>s.freq==='weekly').concat(rolled),
    };
    const parked=list.filter(s=>s.freq==='monthly'&&!rolledIds.has(s.id)).length;
    const cur=byFreq.daily.concat(byFreq.weekly);
    const hit=cur.filter(sopDone).length;
    const cap=document.createElement('div');
    cap.className='colcap';
    // 本月还没轮到的月度条目说一声有几条：不占版面，但也别让人以为 SOP 少了几条
    cap.innerHTML='<i class="ti ti-pin"></i> SOP 固定任务'
      +(parked?`<i class="sop-parked" title="月度 SOP 轮到它那一周才会出现在「每周必做」里">另有 ${parked} 条月度不在本周</i>`:'')
      +(cur.length?`<em class="colcap-stat${hit===cur.length?' ok':''}">本周期 ${hit}/${cur.length} 达标</em>`:'');
    anchor.innerHTML='';
    anchor.appendChild(cap);
    if(!list.length){
      const empty=document.createElement('div');
      empty.className='sop-empty-hint'; empty.textContent='暂无 SOP';
      anchor.appendChild(empty); return;
    }
    const grid=document.createElement('div');
    grid.className='sop-freqgrid';
    ['daily','weekly'].forEach(freq=>{
      const col=document.createElement('div');
      col.className='sop-freqcol';
      // 排序走 compareSops：先时间线（周一→周五，月度统一排在周内节奏之后），再优先级，最后文档行序。
      const rows=byFreq[freq].slice().sort(compareSops);
      const done=rows.filter(sopDone).length;
      const fc=document.createElement('div');
      fc.className='sop-freq-cap';
      fc.innerHTML=`<span>${esc(FREQ_LABEL[freq])}</span>`
        +(rows.length?`<em class="${done===rows.length?'ok':''}">${done}/${rows.length}</em>`:'');
      col.appendChild(fc);
      if(!rows.length){
        const e=document.createElement('div');
        e.className='sop-freq-empty'; e.textContent='无';
        col.appendChild(e);
      }else{
        const listBox=document.createElement('div');
        listBox.className='sop-list';
        rows.forEach(s=>listBox.appendChild(sopCardEl(s,{rolled:rolledIds.has(s.id)})));
        col.appendChild(listBox);
      }
      grid.appendChild(col);
    });
    anchor.appendChild(grid);
  });
}

/* 单行清单项。两种形态：
   - 有周目标的（subject_label 非空 / target_qty 有值）→ 左边是进度数字，右边是「记一条」，
     点一下要写清这次做的是哪个对象，否则「今天发了哪个产品」永远答不出来；
   - 没周目标的（周一看数、月度复盘这类）→ 维持原来的勾，一个周期一次。
   每行都带 ⓘ 展开：为什么做 / 怎么做 / 完成标准 —— 这三栏是老板文档里就有的，
   以前只存了 content 一段话，执行人看不到判据，SOP 就退化成"点一下完事"。 */
export function sopCardEl(s,opts){
  const quota=hasQuota(s);
  const logged=isLogged(s);
  const noted=isWeeklyNote(s);
  const noteValue=noted?(completionFor(s)?.note||''):'';
  const done=sopDone(s);
  const row=document.createElement('div');
  row.className='tcard sop-row'+(done?' done':'');
  row.dataset.sopId=s.id; row.dataset.sopFreq=s.freq;
  if(opts&&opts.rolled)row.classList.add('sop-rolled');
  const code=s.code?`<b class="sop-code">${esc(s.code)}</b> `:'';
  // 优先级小旗：和任务卡同一套颜色（红/橙/蓝/灰）。优先级 4 不画实心旗，免得一列全是旗子。
  const p=Number(sopPriority(s));
  const flag=`<i class="ti ti-flag${p===4?'':'-filled'} sop-prio tprio-${p}" title="优先级${p}"></i>`;
  // 从月列并过来的：标一下出身，否则在「每周必做」里看见一条月度动作会以为排错了
  const rolledTag=(opts&&opts.rolled)?`<span class="sop-rolled-tag">月度${s.time_hint?' · '+esc(s.time_hint):''}</span>`:'';
  // 并进周列的条目，时间提示已经写在「月度 · 每月第 1 周」徽章里了，右边不再重复一遍
  const hint=(s.time_hint&&!(opts&&opts.rolled))?`<span class="tdue"><i class="ti ti-clock"></i> ${esc(s.time_hint)}</span>`:'';
  const left=noted
    ? `<span class="sop-note-state${done?' ok':''}" title="${done?'已填写':'待填写'}"><i class="ti ti-${done?'check':'pencil'}"></i></span>`
    : quota
    ? `<span class="sop-qty${done?' ok':''}">${fmtQty(doneQty(s))}<i>/${fmtQty(s.target_qty)}</i></span>`
    : logged
      ? `<span class="sop-qty${done?' ok':''}">${fmtQty(doneQty(s))}</span>`
      : `<span class="tcheck${done?' on':''}">${done?'<i class="ti ti-check"></i>':''}</span>`;
  const logBtn=logged
    ? `<button type="button" class="btn-mini sop-log-btn"><i class="ti ti-plus"></i> 记一条</button>`
    : '';
  const noteBtn=noted
    ? `<button type="button" class="btn-mini sop-note-btn"><i class="ti ti-pencil"></i> ${noteValue?'修改':'填写'}</button>`
    : '';
  // 一眼认出这条是干啥的浅色小标签（社媒 · 领英+脸书 / SEO · 文章 …）。
  // 老条目没填 tag 就退回赛道名——总比什么都没有强，填了就按填的显示（设置页可改）。
  const tagText=s.tag||trackOf(s)||'';
  const tag=tagText?`<span class="sop-tag">${esc(tagText)}</span>`:'';
  const metrics=metricsLine(s);
  const metricsHtml=metrics?`<div class="sop-metrics">${esc(metrics)}</div>`:'';
  row.innerHTML=left
    +`<span class="sop-text">${flag}${code}${esc(s.title)}${tag}${rolledTag}</span>`
    +`<span class="sop-right">${hint}${noteBtn}${logBtn}`
    +`<button type="button" class="btn-mini sop-info-btn" title="为什么做 / 怎么做 / 本周期做了哪几条"><i class="ti ti-info-circle"></i></button></span>`
    +metricsHtml;
  if(noted){
    const preview=document.createElement('div');
    preview.className='sop-note-preview'+(noteValue?'':' is-empty');
    preview.textContent=noteValue||('待填写：'+s.note_prompt);
    row.appendChild(preview);
  }
  // 完成标准放 title：它是一两句话，59 条每条都平铺会把这一栏撑废；
  // 挂成原生提示，鼠标停一下就能看见，不用先点开 ⓘ。
  if(s.done_when)row.title='完成标准：'+s.done_when;
  if(quota){
    // 进度条宽度只能用 JS 设（CSSOM 不受 CSP 限制）：HTML 字符串里写内联样式属性会被
    // style-src 拦掉，而且 frontendXss.test.js 焊死了「首方前端源码零内联样式属性」。
    const bar=document.createElement('div'); bar.className='sop-bar';
    const fill=document.createElement('i');
    const pct=Math.min(100,Math.round(doneQty(s)/Number(s.target_qty)*100));
    fill.style.width=pct+'%';
    if(done)fill.classList.add('ok');
    bar.appendChild(fill); row.appendChild(bar);
  }
  const detail=document.createElement('div');
  detail.className='sop-detail is-hidden';
  detail.appendChild(detailEl(s));
  row.appendChild(detail);
  const tick=row.querySelector('.tcheck');
  if(tick)tick.addEventListener('click',e=>window.chk(e.currentTarget));
  return row;
}
const fmtQty=n=>{ const v=Number(n)||0; return Number.isInteger(v)?String(v):v.toFixed(1); };
/* 老板两份 SOP 文档里，每条动作带的那几列指标：主要提升 / 周目标 / 单位 / 工时（月度那块是「什么时候」）。
   以前这些全藏在 ⓘ 后面，执行人看到的只有一个标题 —— 「这条要做几个、该花多久、提升什么」
   每次都得点开才知道，等于没写。现在平铺在标题下面一行。
   完成标准不进这行：它是一两句话，59 条每条都铺会把这一栏撑废，改挂在行的 title 上（见 sopCardEl）。 */
export function metricsLine(s){
  const bits=[];
  const q=Number(s.target_qty);
  if(q>0){
    const label=s.freq==='daily'?'日目标':s.freq==='weekly'?'周目标':'目标';
    bits.push(label+' '+fmtQty(q)+(s.unit?' '+s.unit:''));
  }
  // 月度动作在文档里给的是「什么时候」而不是数量——但那已经在行右边的时间提示里显示了，
  // 这里再铺一遍就是同一句话出现两次（实测「首月第 1 周 │ 首月第 1 周 · 工时 2h」）。
  if(s.effort_h!=null&&s.effort_h!=='')bits.push('工时 '+fmtQty(s.effort_h)+'h');
  if(s.metric&&s.metric!=='—')bits.push('提升 '+s.metric);
  return bits.join(' · ');
}
function fieldEl(label,text){
  const d=document.createElement('div'); d.className='sop-field';
  d.innerHTML=`<b>${esc(label)}</b><span>${esc(text)}</span>`;
  return d;
}
/* 展开区：文档四栏 + 本周期已经记了哪几条。
   「本周期做了什么」就在这里回答——同一条「社媒发布」，昨天 FERR 技术选型、今天 BAFAW 连接方式，
   在这张列表里一眼能分开，在勾里永远分不开。 */
function detailEl(s){
  const wrap=document.createElement('div');
  if(s.why)wrap.appendChild(fieldEl('为什么做',s.why));
  if(s.how)wrap.appendChild(fieldEl('怎么做',s.how));
  if(s.done_when)wrap.appendChild(fieldEl('完成标准',s.done_when));
  if(s.content&&!s.why&&!s.how)wrap.appendChild(fieldEl('说明',s.content));
  const meta=[];
  if(s.metric)meta.push('提升：'+s.metric);
  if(s.effort_h!=null)meta.push('工时 '+fmtQty(s.effort_h)+'h');
  if(hasQuota(s))meta.push('周目标 '+fmtQty(s.target_qty)+(s.unit?' '+s.unit:''));
  if(meta.length)wrap.appendChild(fieldEl('口径',meta.join(' · ')));
  if(isWeeklyNote(s))wrap.appendChild(fieldEl(s.note_prompt,completionFor(s)?.note||'未填写'));
  const logs=(window._sopLogs&&window._sopLogs.get(s.id))||[];
  const box=document.createElement('div'); box.className='sop-logs';
  if(!logs.length){
    box.innerHTML='<div class="dim">本周期还没有执行记录。</div>';
  }else{
    logs.forEach(l=>{
      const li=document.createElement('div'); li.className='sop-log'; li.dataset.logId=l.id;
      const link=l.evidence_url?`<a href="${esc(l.evidence_url)}" target="_blank" rel="noopener"><i class="ti ti-external-link"></i></a>`:'';
      li.innerHTML=`<em>${esc((l.day_key||'').slice(5))}</em>`
        +`<span>${esc(l.subject||l.detail||'（未填对象）')}</span>`
        +(Number(l.qty)!==1?`<b>×${fmtQty(l.qty)}</b>`:'')
        +link
        +`<button type="button" class="btn-mini sop-log-del" title="撤销这条"><i class="ti ti-trash"></i></button>`;
      box.appendChild(li);
    });
  }
  wrap.appendChild(fieldEl('本周期已记', ''));
  wrap.lastChild.querySelector('span').replaceWith(box);
  return wrap;
}

/* ===== 本周目标 / 上周复盘 =====
   弹窗和右侧摘要使用同一条 SOP 完成记录，不另存一份：
   周一目标写当前 ISO 周；周五复盘在下一周读取上一 ISO 周。 */
const FOCUS_TRACKS={sem:['SEM','社媒'],seo:['SEO','GEO']};
function weeklyNoteDef(track,kind){
  return (window._sops||[]).find(s=>s.track===track&&s.note_kind===kind&&s.freq==='weekly')||null;
}
function focusRow(track,kind,periodKey,editable=false){
  const s=weeklyNoteDef(track,kind);
  const row=document.createElement('div'); row.className='weekly-focus-row';
  const label=document.createElement('b'); label.textContent=track; row.appendChild(label);
  if(!s){
    const missing=document.createElement('span'); missing.className='weekly-focus-missing';
    missing.textContent='未配置对应的固定周 SOP'; row.appendChild(missing); return row;
  }
  const previous=kind==='review';
  const completion=completionFor(s,previous);
  if(editable){
    const input=document.createElement('textarea');
    input.rows=3; input.maxLength=500; input.value=completion?.note||'';
    input.setAttribute('aria-label',track+' 本周目标');
    input.placeholder='写下这周最重要、可验证的目标…'; input.dataset.weeklyNoteInput=String(s.id);
    const save=document.createElement('button'); save.type='button'; save.className='btn-primary btn-mini weekly-note-save';
    save.dataset.sopId=String(s.id); save.dataset.periodKey=periodKey;
    save.innerHTML='<i class="ti ti-device-floppy"></i> '+(completion?.note?'更新':'保存');
    row.append(input,save);
  }else{
    const text=document.createElement('span'); text.className='weekly-focus-text'+(completion?.note?'':' is-empty');
    text.textContent=completion?.note||(previous?'上周未填写复盘':'本周目标未填写'); row.appendChild(text);
    const edit=document.createElement('button'); edit.type='button'; edit.className='btn-mini weekly-note-edit';
    edit.dataset.sopId=String(s.id); edit.dataset.periodKey=periodKey;
    edit.textContent=completion?.note?'去修改':'去补写'; row.appendChild(edit);
  }
  return row;
}
function focusSection(title,subtitle,tracks,kind,periodKey,editable=false){
  const section=document.createElement('section'); section.className='weekly-focus-section weekly-focus-'+kind;
  const head=document.createElement('div'); head.className='weekly-focus-section-head';
  const h=document.createElement('strong'); h.textContent=title;
  const sub=document.createElement('span'); sub.textContent=subtitle;
  head.append(h,sub); section.appendChild(head);
  tracks.forEach(track=>section.appendChild(focusRow(track,kind,periodKey,editable)));
  return section;
}
export function renderWeeklyFocus(){
  const planDay=document.getElementById('planday-input')?.value;
  const isToday=!planDay||planDay===formatLocalDate(new Date());
  const active=document.querySelector('#panel-tasks > .tboard > .pblock.is-active');
  const tab=active&&active.dataset.planTab;
  const trigger=document.getElementById('weekly-goals-open');
  if(trigger)trigger.classList.toggle('is-hidden',!isToday||!FOCUS_TRACKS[tab]);
  const current=sopPeriodKey('weekly');
  const previous=shiftIsoWeekKey(current,-1);
  Object.entries(FOCUS_TRACKS).forEach(([key,tracks])=>{
    const box=document.getElementById('weekly-focus-'+key); if(!box)return;
    box.replaceChildren(); box.classList.add('is-hidden');
    if(!isToday)return;
    if(_sopCompletionError){
      const error=document.createElement('div'); error.className='weekly-focus-error';
      error.textContent='目标与复盘加载失败：'+_sopCompletionError;
      box.appendChild(error); box.classList.remove('is-hidden'); return;
    }
    const goals=tracks.filter(track=>completionFor(weeklyNoteDef(track,'goal'))?.note);
    const hasReview=tracks.some(track=>completionFor(weeklyNoteDef(track,'review'),true)?.note);
    if(!goals.length&&!hasReview)return;
    box.classList.remove('is-hidden');
    if(goals.length)box.appendChild(focusSection('本周目标',current,goals,'goal',current));
    box.appendChild(focusSection('上周复盘',previous,tracks,'review',previous));
  });
}
function openWeeklyGoals(){
  const active=document.querySelector('#panel-tasks > .tboard > .pblock.is-active');
  const tracks=FOCUS_TRACKS[active?.dataset.planTab];
  const planDay=document.getElementById('planday-input')?.value;
  if(!tracks||(planDay&&planDay!==formatLocalDate(new Date())))return;
  const box=document.getElementById('weekly-goals-fields');
  box.replaceChildren();
  document.getElementById('weekly-goals-title').textContent='本周目标 · '+tracks.join(' / ');
  if(_sopCompletionError){
    const error=document.createElement('div'); error.className='weekly-focus-error';
    error.textContent='目标加载失败：'+_sopCompletionError; box.appendChild(error);
  }else{
    box.appendChild(focusSection('填写本周目标',sopPeriodKey('weekly')+' · 各赛道分别保存',tracks,'goal',sopPeriodKey('weekly'),true));
  }
  openModal('weeklyGoalsMask');
  box.querySelector('textarea')?.focus();
}

let _sopNoteEditing=null;
function openSopNoteModal(s,periodKey=sopPeriodKey('weekly')){
  _sopNoteEditing={s,periodKey};
  const completion=periodKey===sopPeriodKey('weekly')?completionFor(s):completionFor(s,true);
  document.getElementById('sopnote-title').textContent=(s.track||s.dept)+' · '+s.note_prompt;
  document.getElementById('sopnote-week').textContent=periodKey;
  document.getElementById('sopnote-standard').textContent=s.done_when||s.content||'';
  const standard=document.getElementById('sopnote-standard-box');
  standard.classList.toggle('is-hidden',!(s.done_when||s.content));
  const input=document.getElementById('sopnote-text');
  input.value=completion?.note||'';
  input.placeholder=s.note_kind==='goal'?'写下这周最重要、可验证的目标…':'用一句话总结本周情况和下周调整…';
  openModal('sopNoteMask'); setTimeout(()=>input.focus(),50);
}
async function saveWeeklyNote(s,periodKey,note,button){
  const value=String(note||'').trim();
  if(!value){ toast('请填写'+s.note_prompt); return false; }
  if(button)button.disabled=true;
  try{
    await API.post('/api/sop/completions',{sop_id:Number(s.id),period_key:periodKey,note:value});
    await loadSops();
    toast(s.note_prompt+'已保存 · 对应 SOP 已完成');
    return true;
  }catch(e){
    toast(e&&e.status===403?'无权操作，未入库':'保存失败：'+((e&&e.message)||'请求失败'));
    return false;
  }finally{ if(button&&button.isConnected)button.disabled=false; }
}
async function submitSopNote(button){
  if(!_sopNoteEditing)return;
  const {s,periodKey}=_sopNoteEditing;
  const ok=await saveWeeklyNote(s,periodKey,document.getElementById('sopnote-text').value,button);
  if(ok){ _sopNoteEditing=null; closeModal('sopNoteMask'); }
}

document.addEventListener('plantabchange',renderWeeklyFocus);

export function updateSopCounts(){
  // SEM/SEO：SOP N · 新增 M；公司：SOP N · 派发 M（容器 id 用 newtask-company / kcount-company）
  [['SEM','sem','新增'],['SEO','seo','新增'],['公司','company','派发']].forEach(([dept,key,verb])=>{
    const el=document.getElementById('kcount-'+key); if(!el)return;
    // 分母只算本周期该做的（daily+weekly）；月度条目不进周口径，和 /api/sop/stats 同向。
    const cur=window._sops.filter(s=>s.dept===dept&&s.freq!=='monthly');
    const hit=cur.filter(sopDone).length;
    const addCol=document.getElementById('newtask-'+key);
    // 只数顶层任务卡，公司大任务下的子卡（.subtask）不计入「派发 N」
    const addN=addCol?addCol.querySelectorAll('.tcard:not(.subtask)').length:0;
    el.textContent='SOP '+hit+'/'+cur.length+' · '+verb+' '+addN;
  });
}

/* SOP 设置页：列表 + 弹框 + CRUD（仅 manager/boss 可写，其他只读） */
export function isSopWritable(){ const r=(window.ME||{}).role; return r==='manager'||r==='boss'; }
export function renderSopSettingsTable(){
  const tb=document.getElementById('tb-sop'); if(!tb)return;
  const addBtn=document.getElementById('sop-add-btn');
  const writable=isSopWritable();
  if(addBtn)addBtn.style.display=writable?'':'none';
  const impBtn=document.getElementById('sop-import-btn');
  if(impBtn)impBtn.style.display=writable?'':'none';
  tb.innerHTML='';
  const list=window._sops;
  if(!list.length){ const e=document.getElementById('sop-empty'); if(e)e.style.display='block'; return; }
  const e=document.getElementById('sop-empty'); if(e)e.style.display='none';
  list.forEach(s=>{
    const tr=document.createElement('tr'); tr.dataset.sopId=s.id;
    const ops=writable
      ? `<button class="btn-mini sop-edit"><i class="ti ti-edit"></i></button> <button class="btn-mini sop-del csp-s-b0e08465c2"><i class="ti ti-trash"></i></button>`
      : '<span class="dim csp-s-33ee298127">只读</span>';
    const target=hasQuota(s)?fmtQty(s.target_qty)+(s.unit?' '+s.unit:''):'—';
    tr.innerHTML=`<td>${esc(s.dept)}</td><td>${esc(trackOf(s)||'')}</td><td>${esc(s.tag||'')}</td><td>${esc(FREQ_LABEL[s.freq]||s.freq)}</td>`
      +`<td>${esc(s.code||'')}</td><td>${esc(s.title)}</td><td>${esc(target)}</td>`
      +`<td>${s.effort_h==null?'':esc(fmtQty(s.effort_h))}</td>`
      +`<td class="dim csp-s-33ee298127">${esc(s.done_when||s.content||'')}</td>`
      +`<td>${esc(s.time_hint||'')}</td><td class="ctr">${ops}</td>`;
    tb.appendChild(tr);
  });
}
let _sopEditing=null;
export function openSopModal(sop){
  if(!isSopWritable()){ toast('仅经理 / 老板可编辑 SOP'); return; }
  _sopEditing=sop||null;
  document.getElementById('sop-mod-title').textContent=sop?'编辑 SOP':'新增 SOP';
  document.getElementById('sop-dept').value=sop?sop.dept:'SEM';
  document.getElementById('sop-freq').value=sop?sop.freq:'daily';
  // v2 字段一起回填；null/undefined 一律落成空串，别把 "null" 写进输入框
  const set=(id,v)=>{ const el=document.getElementById(id); if(el)el.value=v==null?'':v; };
  set('sop-title',sop?sop.title:'');
  set('sop-track',sop?(sop.track||''):'');
  set('sop-code',sop?sop.code:'');
  set('sop-target',sop?sop.target_qty:'');
  set('sop-unit',sop?sop.unit:'');
  set('sop-tag',sop?sop.tag:'');
  set('sop-priority',sop&&sop.priority?String(sop.priority):'');
  set('sop-subject-label',sop?sop.subject_label:'');
  set('sop-why',sop?sop.why:'');
  set('sop-how',sop?sop.how:'');
  set('sop-done-when',sop?sop.done_when:'');
  set('sop-metric',sop?sop.metric:'');
  set('sop-effort',sop?sop.effort_h:'');
  set('sop-content',sop?sop.content:'');
  set('sop-time',sop?sop.time_hint:'');
  openModal('sopMask'); setTimeout(()=>document.getElementById('sop-title').focus(),50);
}
export async function submitSop(){
  const dept=document.getElementById('sop-dept').value;
  const freq=document.getElementById('sop-freq').value;
  const title=document.getElementById('sop-title').value.trim();
  const content=document.getElementById('sop-content').value.trim();
  const time_hint=document.getElementById('sop-time').value.trim();
  if(!title){ toast('请填写标题'); return; }
  const v=id=>((document.getElementById(id)||{}).value||'').trim();
  const n=id=>{ const t=v(id); return t===''?null:Number(t); };
  const body={dept,freq,title,content,time_hint,
    track:v('sop-track')||null, code:v('sop-code')||null,
    target_qty:n('sop-target'), unit:v('sop-unit')||null,
    tag:v('sop-tag')||null, priority:n('sop-priority'), subject_label:v('sop-subject-label')||null,
    why:v('sop-why')||null, how:v('sop-how')||null, done_when:v('sop-done-when')||null,
    metric:v('sop-metric')||null, effort_h:n('sop-effort')};
  try{
    if(_sopEditing){ await API.patch('/api/sop/'+_sopEditing.id,body); toast('已更新 SOP'); }
    else { await API.post('/api/sop',body); toast('已新增 SOP'); }
    closeModal('sopMask'); await loadSops();
  }catch(e){ toast(e&&e.status===403?'无权操作（仅经理/老板）':'保存失败：'+(e.message||'')); }
}
document.addEventListener('click',async e=>{
  if(e.target.closest('#weekly-goals-open')){ openWeeklyGoals(); return; }
  const edit=e.target.closest('.sop-edit'); const del=e.target.closest('.sop-del');
  if(!edit&&!del)return;
  const tr=(edit||del).closest('tr'); const id=tr&&tr.dataset.sopId; if(!id)return;
  if(edit){ const s=window._sops.find(x=>String(x.id)===String(id)); if(s)openSopModal(s); return; }
  if(del){
    if(!inlineConfirm(del,'确认停用'))return;
    try{ await API.del('/api/sop/'+id); toast('已停用'); await loadSops(); }
    catch(err){ toast(err&&err.status===403?'无权操作（仅经理/老板）':'操作失败：'+(err.message||'请求失败')); }
  }
});

/* ===== Step C：未做 SOP 提示 banner + 公司新派 banner + 侧栏红点 ===== */
/* 未做 SOP banner：只在周期首日 08:00 后展示一天（避免天天弹）。daily=每天 08:00 起；weekly=周一 08:00 起；monthly=1 号 08:00 起。 */
export function isOverduePeriodFirstDay(freq){
  const now=new Date(); const h=now.getHours();
  if(h<8)return false; // 早 8 点前不催
  if(freq==='daily')return true; // 每天都是首日
  if(freq==='weekly')return now.getDay()===1; // 周一
  if(freq==='monthly')return now.getDate()===1; // 1 号
  return false;
}
/* 顶部「未完成提示」的内容：**一个部门一个频率一行**，不是一条 SOP 一行。
   加完每日基线之后，一条一行会变成每天早上九行红字 —— 九行等于没有一行，人会直接略过。
   每行最多点名 3 条，其余折成「等 N 条」；带配额的仍然报「还差几条」，差 1 条和一条没做不是一回事。 */
export function buildSopOverdueList(){
  const today=formatLocalDate(new Date()).replace(/-/g,'.').replace(/^d{4}./,''); // MM.DD
  const NAME_LIMIT=3;
  const groups=new Map(); // "部门|频率" -> { dept, freq, names[], total }
  ['daily','weekly','monthly'].forEach(freq=>{
    if(!isOverduePeriodFirstDay(freq))return;
    (window._sops||[]).forEach(s=>{
      if(s.freq!==freq)return;
      if(sopDone(s))return;
      const key=s.dept+'|'+freq;
      if(!groups.has(key))groups.set(key,{dept:s.dept,freq,names:[],total:0});
      const g=groups.get(key);
      g.total++;
      if(g.names.length<NAME_LIMIT){
        const gap=hasQuota(s)
          ? '（还差 '+fmtQty(Number(s.target_qty)-doneQty(s))+(s.unit?' '+s.unit:'')+'）'
          : '';
        g.names.push(s.title+gap);
      }
    });
  });
  return [...groups.values()].map(g=>{
    const more=g.total>g.names.length?'，共 '+g.total+' 条':'';
    return esc(g.dept)+'-'+today+'-'+esc(FREQ_LABEL[g.freq]||g.freq)+' 还有 '+g.total+' 条未达标：'
      +esc(g.names.join('、'))+esc(more)+'。';
  });
}
export function renderSopOverdueBanner(){
  const box=document.getElementById('sop-overdue-banner');
  const list=document.getElementById('sop-overdue-list');
  if(!box||!list)return;
  const lines=buildSopOverdueList();
  if(!lines.length){ box.style.display='none'; list.innerHTML=''; return; }
  box.style.display='flex';
  list.innerHTML=lines.map(l=>'<div>'+l+'</div>').join('');
}

/* 公司新派 urgent banner：拉 loop_items?urgent=1（active 视图自动排除 archived/deleted）+ 完成则消失 */
window._urgentTasks=[];
export async function loadUrgent(){
  try{
    const {items}=await API.get('/api/loop-items?urgent=1');
    // 仅显示未完成的（state!=='done' 且 status!=='done'）；done 的 banner 自然消失
    window._urgentTasks=(items||[]).filter(it=>{ const st=it.state||''; const ss=it.status||''; return st!=='done' && ss!=='done'; });
  }catch(e){ window._urgentTasks=[]; }
  renderUrgentBanner();
  refreshNavTaskDot();
}
export function renderUrgentBanner(){
  const box=document.getElementById('urgent-banner');
  const list=document.getElementById('urgent-list');
  if(!box||!list)return;
  const arr=window._urgentTasks||[];
  if(!arr.length){ box.style.display='none'; list.innerHTML=''; return; }
  box.style.display='flex';
  list.innerHTML=arr.map(it=>{
    const due=it.task_date?'（截止 '+esc(it.task_date)+'）':'';
    return '<div>'+esc(it.content||'')+due+'</div>';
  }).join('');
}

/* 侧栏「任务看板」红感叹号：未做 SOP 列表非空 OR 有 urgent 未完成 → 显示 */
export function refreshNavTaskDot(){
  const dot=document.getElementById('nav-tasks-dot'); if(!dot)return;
  const overdue=buildSopOverdueList().length>0;
  const urgent=(window._urgentTasks||[]).length>0;
  dot.classList.toggle('is-hidden',!(overdue||urgent));
}

/* ===== v2：执行流水的三个交互（展开详情 / 记一条 / 撤销一条）=====
   用事件委托，零内联 handler（全站 onclick 已清零，别开倒车）。 */
document.addEventListener('click',async e=>{
  const focusSave=e.target.closest('.weekly-note-save');
  if(focusSave){
    const s=(window._sops||[]).find(x=>String(x.id)===focusSave.dataset.sopId);
    const input=document.querySelector(`[data-weekly-note-input="${focusSave.dataset.sopId}"]`);
    if(s&&input){
      const saved=await saveWeeklyNote(s,focusSave.dataset.periodKey,input.value,focusSave);
      if(saved)focusSave.textContent='已保存';
    }
    return;
  }
  const focusEdit=e.target.closest('.weekly-note-edit');
  if(focusEdit){
    const s=(window._sops||[]).find(x=>String(x.id)===focusEdit.dataset.sopId);
    if(s)openSopNoteModal(s,focusEdit.dataset.periodKey);
    return;
  }
  const note=e.target.closest('.sop-note-btn');
  if(note){
    const row=note.closest('.sop-row'); const id=row&&row.dataset.sopId;
    const s=(window._sops||[]).find(x=>String(x.id)===String(id));
    if(s)openSopNoteModal(s);
    return;
  }
  const noteSubmit=e.target.closest('.sop-note-submit');
  if(noteSubmit){ await submitSopNote(noteSubmit); return; }
  const info=e.target.closest('.sop-info-btn');
  if(info){
    const row=info.closest('.sop-row'); const d=row&&row.querySelector('.sop-detail');
    if(d)d.classList.toggle('is-hidden');
    return;
  }
  const add=e.target.closest('.sop-log-btn');
  if(add){
    const row=add.closest('.sop-row'); const id=row&&row.dataset.sopId;
    const s=(window._sops||[]).find(x=>String(x.id)===String(id));
    if(s)openSopLogModal(s);
    return;
  }
  const del=e.target.closest('.sop-log-del');
  if(del){
    const li=del.closest('.sop-log'); const id=li&&li.dataset.logId; if(!id)return;
    if(!inlineConfirm(del,'撤销这条'))return;
    try{ await API.del('/api/sop/logs/'+id); toast('已撤销'); await loadSops(); }
    catch(err){ toast(err&&err.status===403?'无权操作':'撤销失败：'+(err.message||'请求失败')); }
  }
});

/* 「这条链接已经被记过」的提示语。两种情形分开说，因为该做的事不一样：
   - 别的 SOP 记过 → 可能把一份工作算成了两份，要确认是不是协同（李写文章、陈再推一轮是合理的）
   - 同一条 SOP 记过 → 那是往自己的配额里灌水，基本没有正当理由 */
export function dupText(d){
  const who=(d.code?d.code+' ':'')+(d.title||'另一条 SOP');
  const when=(d.day_key||'').slice(5);
  return d.same_sop
    ? ('这条链接 '+when+' 在本条 SOP 已经记过一次')
    : ('这条链接 '+when+' 已被《'+who+'》记过，确认不是同一份工作记两遍');
}
let _sopLogging=null;
export function openSopLogModal(s){
  _sopLogging=s;
  const set=(id,v)=>{ const el=document.getElementById(id); if(el)el.value=v; };
  const txt=(id,v)=>{ const el=document.getElementById(id); if(el)el.textContent=v; };
  txt('soplog-title',(s.code?s.code+' · ':'')+s.title);
  // 完成标准直接摆在填写框上方：判据不在眼前，「做到什么算完成」就还是一句空话
  txt('soplog-standard',s.done_when||s.content||'');
  const std=document.getElementById('soplog-standard-box');
  if(std)std.classList.toggle('is-hidden',!(s.done_when||s.content));
  const subjEl=document.getElementById('soplog-subject');
  if(subjEl)subjEl.placeholder=s.subject_label||'这次做的是哪一个…';
  const lbl=document.getElementById('soplog-subject-label');
  if(lbl)lbl.textContent=s.subject_label?('做了哪个 · '+s.subject_label):'做了哪个（可选）';
  txt('soplog-progress',hasQuota(s)
    ? '本周期 '+fmtQty(doneQty(s))+'/'+fmtQty(s.target_qty)+(s.unit?' '+s.unit:'')
    : '');
  set('soplog-subject',''); set('soplog-url',''); set('soplog-detail',''); set('soplog-qty','1');
  openModal('sopLogMask');
  setTimeout(()=>{ if(subjEl)subjEl.focus(); },50);
}
export async function submitSopLog(){
  const s=_sopLogging; if(!s)return;
  const val=id=>((document.getElementById(id)||{}).value||'').trim();
  const subject=val('soplog-subject');
  if(s.subject_label&&!subject){ toast('请写清这次做的是哪一个：'+s.subject_label); return; }
  const qty=Number(val('soplog-qty'))||1;
  if(!(qty>0)){ toast('数量要大于 0'); return; }
  try{
    const res=await API.post('/api/sop/logs',{
      sop_id:s.id,
      period_key:sopPeriodKey(s.freq),
      day_key:formatLocalDate(new Date()), // 执行日按本地日期，与 task_checkins / completions 同口径
      qty, subject,
      evidence_url:val('soplog-url'),
      detail:val('soplog-detail'),
    });
    closeModal('sopLogMask');
    await loadSops();
    const left=hasQuota(s)?Math.max(0,Number(s.target_qty)-doneQty(s)):0;
    const ok=left>0?('已记一条 · 本周期还差 '+fmtQty(left)+(s.unit?' '+s.unit:'')):'已记一条 · 本周期已达标';
    // 撞上同一条链接：记是记下了（不拦），但要让人当场看见，自己判断是协同还是重复记账
    const dup=res&&res.duplicate;
    toast(dup?(ok+'　⚠ '+dupText(dup)):ok);
  }catch(err){
    if(err&&err.status===400)toast('这条 SOP 要求写清做的是哪一个');
    else toast(err&&err.status===403?'无权操作':'保存失败：'+(err.message||'请求失败'));
  }
}

/* 一键导入老板两份 SOP 文档（59 条）。先 dry-run 把「会新增几条、会更新几条、
   库里有哪些清单里已经没有了」摆给人看，确认了再真导 —— 这是往每个人的日计划里
   一次塞进几十条清单，不该点一下就发生。 */
export async function importSopFromDocs(){
  if(!isSopWritable()){ toast('仅经理 / 老板可导入'); return; }
  let pre;
  try{ pre=await API.post('/api/sop/import-catalog?dry_run=1',{}); }
  catch(e){ toast(e&&e.status===403?'无权操作（仅经理/老板）':'预览失败：'+(e.message||'请求失败')); return; }
  const add=(pre.inserted||[]).length, upd=(pre.updated||[]).length, same=(pre.unchanged||[]).length;
  const orphan=(pre.orphaned||[]).length;
  if(!add&&!upd){ toast('文档里的 '+(pre.total||0)+' 条都已经在库里了，无需导入'); return; }
  const lines=['文档共 '+(pre.total||0)+' 条：新增 '+add+' 条 / 更新 '+upd+' 条 / 无变化 '+same+' 条。'];
  if(orphan)lines.push('另有 '+orphan+' 条库里有、文档里已经没有了——不会被删，要停用请在下方列表里停。');
  lines.push('确定导入吗？');
  if(!window.confirm(lines.join('\n')))return;
  try{
    const r=await API.post('/api/sop/import-catalog',{});
    await loadSops();
    toast('已导入：新增 '+(r.inserted||[]).length+' 条 / 更新 '+(r.updated||[]).length+' 条');
  }catch(e){ toast('导入失败：'+(e.message||'请求失败')); }
}
