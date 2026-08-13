/* 运营闭环引擎（整改/任务卡/沉淀/计划/测试 + 内容资产 + AI三连）（拆分自 index.html · 阶段4-B）
   经典 script + window 全局兼容。依赖（运行时解析）：esc()、toast()、toastGo()、window.API、openModal()/closeModal()、
   inlineConfirm()（keywords.js）、formatLocalDate()/ymd()（timerange.js）、placeCaretEnd()（Excel 基建，内联）、loadUrgent()（sop.js）、window.ME。
   导出全局：prepend/flashRow（neg-ads 用）、persistLoop/depRowHtml/addTest/addPlan/addDeposit/addTaskCards/sFromDept/persistFailMsg（weekly-review/archive/AI 用）、
   loadClosedLoop/loadContent（init 调）、applyAiDoneStates/aiAct/loopBack（AI 渲染/onclick）。
   注：底部 injectAiActions() 在脚本加载时给 .ai-item 注入按钮——.ai-item 在 body 已先于本脚本解析，安全。 */

/* ================= CLOSED-LOOP ENGINE ================= */
const _2=n=>String(n).padStart(2,'0');
const today=()=>{const d=new Date();return _2(d.getMonth()+1)+'-'+_2(d.getDate());};
const plusDays=n=>{const d=new Date(Date.now()+n*864e5);return _2(d.getMonth()+1)+'-'+_2(d.getDate());};
function flashRow(tr){tr.style.transition='background .25s';tr.style.background='var(--green-soft)';setTimeout(()=>tr.style.background='',1700);}
function prepend(tbId,html){const tb=document.getElementById(tbId);if(!tb)return null;const tr=document.createElement('tr');tr.innerHTML=html;tb.insertBefore(tr,tb.firstChild);flashRow(tr);return tr;}

/* read the text the AI/review item is about */
function grabText(btn){
  const it=btn.closest('.ai-item'); if(it){const b=it.querySelector('.body'); return (b?b.innerText:it.innerText).trim();}
  const rf=btn.closest('.rowflex'); if(rf){const s=rf.querySelector('span'); return s?s.innerText.trim():'';}
  const cell=btn.closest('.review-grid>div'); if(cell) return cell.innerText.trim();
  return '';
}

/* UI hook override: keep the same data fields, add stable classes for the fix ledger layout. */
function fixRowHtml(f){
  const dept=f.dept==='SEM'?'SEM':'SEO';
  const c=dept==='SEM'?'b-purple':'b-blue';
  const owner=f.owner||sFromDept(dept).owner;
  const oc=dept==='SEM'?'b-purple':'b-blue';
  const status=f.status||'计划下周';
  return `<td class="fix-title editable" contenteditable data-field="title">${esc(f.title||'')}</td>`
    +`<td class="fix-dept ctr"><span class="tagselect ${c}" data-kind="dept">${esc(dept)}<i class="ti ti-chevron-down"></i></span></td>`
    +`<td class="fix-evidence editable dim" contenteditable data-field="evidence" style="font-size:11px">${esc(f.evidence||'')}</td>`
    +`<td class="fix-detail editable" contenteditable data-field="detail">${esc(f.detail||'')}</td>`
    +`<td class="fix-owner ctr"><span class="tagselect ${oc}" data-kind="owner">${esc(owner)}<i class="ti ti-chevron-down"></i></span></td>`
    +`<td class="fix-date"><input type="date" class="cell-date" data-field="due_date" value="${ymd(f.due_date)}"></td>`
    +`<td class="fix-result ctr"><span class="tagselect b-blue" data-kind="result">${esc(status)}<i class="ti ti-chevron-down"></i></span></td>`
    +`<td class="fix-actions ctr"><button class="btn-mini row-dep" title="沉淀到沉淀表"><i class="ti ti-database-heart"></i> 沉淀</button><button class="btn-mini row-archive" title="归档" style="color:var(--primary)"><i class="ti ti-archive"></i> 归档</button></td>`;
}
/* decide SEO(李) vs SEM(陈) from context */
function scopeDept(btn,txt){
  const head=(txt||'').slice(0,8); let d=null;
  if(/SEM/i.test(head))d='SEM'; else if(/SEO/i.test(head))d='SEO';
  if(!d){const sp=btn.closest('.subpanel'); if(sp&&/sem/i.test(sp.id))d='SEM'; else if(sp&&/seo/i.test(sp.id))d='SEO';}
  if(!d){const box=btn.closest('.ai-box'); if(box&&box.classList.contains('purple'))d='SEM'; else if(box&&box.classList.contains('blue'))d='SEO';}
  if(!d){const card=btn.closest('.card'); const t=card&&card.querySelector('.card-title'); if(t&&/SEM/.test(t.textContent))d='SEM'; else if(t&&/SEO/.test(t.textContent))d='SEO';}
  if(!d)d='SEO';
  return d==='SEM'?{dept:'SEM',owner:'陈',c:'b-purple'}:{dept:'SEO',owner:'李',c:'b-blue'};
}
const clip=(s,n)=>s.length>n?s.slice(0,n)+'…':s;

function addDeposit(s,text,act){const ac=act==='采纳'?'b-green':'b-teal';
  prepend('tb-dep',`<td class="num">${today()}</td><td class="ctr"><span class="badge ${s.c}">${esc(s.dept)}诊断</span></td><td>${esc(text)}</td><td class="dim" style="font-size:11px"></td><td class="ctr"><span class="badge ${ac}">${esc(act)}</span></td>`);}
/* 整改行：问题/所属/依据/动作/负责人/截止/结果，全部可编辑或可选；绑定 id 后失焦即存 */
function fixRowHtml(f){
  const dept=f.dept==='SEM'?'SEM':'SEO'; const c=dept==='SEM'?'b-purple':'b-blue';
  const owner=f.owner||(dept==='SEM'?'陈':'李'); const oc=owner==='陈'?'b-purple':'b-blue';
  const RES=['已改','进行中','计划下周','放弃']; const status=RES.includes(f.status)?f.status:'计划下周';
  return `<td class="editable" contenteditable data-field="title">${esc(f.title||'')}</td>`
    +`<td class="ctr"><span class="tagselect ${c}" data-kind="dept">${esc(dept)}<i class="ti ti-chevron-down"></i></span></td>`
    +`<td class="editable dim" contenteditable data-field="evidence" style="font-size:11px">${esc(f.evidence||'')}</td>`
    +`<td class="editable" contenteditable data-field="detail">${esc(f.detail||'')}</td>`
    +`<td class="ctr"><span class="tagselect ${oc}" data-kind="owner">${esc(owner)}<i class="ti ti-chevron-down"></i></span></td>`
    +`<td><input type="date" class="cell-date" data-field="due_date" value="${ymd(f.due_date)}"></td>`
    +`<td class="ctr"><span class="tagselect b-blue" data-kind="result">${esc(status)}<i class="ti ti-chevron-down"></i></span></td>`
    +`<td class="ctr">${fixPlanHtml(f)} <button class="btn-mini row-dep" title="沉淀到沉淀表"><i class="ti ti-database-heart"></i> 沉淀</button> <button class="btn-mini row-archive" title="归档" style="color:var(--primary)"><i class="ti ti-archive"></i> 归档</button></td>`;
}
/* 整改行的「排入」控件：没排过 → 可点；排过 → 显示状态并可跳去日计划。
   整改清单一直是"写下来就完了"，没人接的那条和已经在做的那条长得一模一样。 */
function fixPlanHtml(f){
  if(f&&f.planned_done)return `<span class="badge b-green row-plan-go" style="cursor:pointer" title="日计划里已完成，点击查看">已做完</span>`;
  if(f&&f.planned_task_id)return `<button class="btn-mini row-plan-go" title="已在日计划里，点击查看"><i class="ti ti-calendar-check"></i> 已排</button>`;
  return `<button class="btn-mini row-plan" title="排进负责人的日计划"><i class="ti ti-calendar-plus"></i> 排入</button>`;
}
/* 行级「排入 / 已排」委托。用委托不用内联 onclick：内联 handler 是模块化的地板，能不加就不加 */
document.addEventListener('click',async e=>{
  const jump=e.target.closest('.row-plan-go');
  if(jump){ go('planning'); if(typeof setPlanningTab==='function')setPlanningTab('daily'); return; }
  const btn=e.target.closest('.row-plan'); if(!btn)return;
  const tr=btn.closest('tr'); const id=tr&&tr.dataset.id; if(!id)return;
  btn.disabled=true;
  try{
    const {item,existed}=await API.post('/api/fixes/'+id+'/plan',{start_date:formatLocalDate(new Date())});
    // 行内就地反映：结果标签推到「进行中」、按钮换成「已排」
    const tag=tr.querySelector('[data-kind="result"]');
    if(tag&&tag.firstChild&&!/已改|放弃/.test(tag.textContent))tag.firstChild.nodeValue='进行中';
    btn.outerHTML=fixPlanHtml({planned_task_id:item.id});
    // 日计划已经在 DOM 里的话就地插卡，用户切过去就能看见，不用刷新
    if(!existed&&document.getElementById('newtask-sem')){
      addTaskCard(item.dept==='公司'?coScope():sFromDept(item.dept),item.content,item);
      refreshTaskCols(); if(typeof updateSopCounts==='function')updateSopCounts();
    }
    toastGo(existed?'这条已经在日计划里了':'已排进'+(item.owner||item.dept||'')+'的日计划','planning');
  }catch(err){ btn.disabled=false; toast(err&&err.status===409?'该整改项已归档，不能再排':persistFailMsg(err)); }
});
/* 日计划卡上的「整改」出身标：点它跳回整改清单看依据 */
document.addEventListener('click',e=>{
  if(!e.target.closest('.src-fix'))return;
  go('action'); if(typeof setActionTab==='function')setActionTab('fix');
});
function bindFixRow(tr,f){ if(tr&&f&&f.id){ tr.dataset.id=f.id; tr.dataset.ep='/api/fixes'; } return tr; }
function addFixFromObj(f){ return bindFixRow(prepend('tb-fix',fixRowHtml(f)),f); }
function bindLoopRow(tr,it){ if(tr&&it&&it.id){ tr.dataset.id=it.id; tr.dataset.ep='/api/loop-items'; } return tr; }
function addTest(s,content,it){it=it||{};const id=s.dept==='SEM'?'tb-test-sem':'tb-test-seo';
  return bindLoopRow(prepend(id,`<td class="editable" contenteditable data-field="content">${esc(content||it.content||'')}</td><td class="editable" contenteditable data-field="hypothesis">${esc(it.hypothesis||'')}</td><td class="editable" contenteditable data-field="variable">${esc(it.variable||'')}</td><td><input type="date" class="cell-date" data-field="period" value="${ymd((it.period||'').split('~')[0])}"> ~ <input type="date" class="cell-date" data-field="period" value="${ymd((it.period||'').split('~')[1])}"></td><td class="editable" contenteditable data-field="conclusion">${esc(it.conclusion||'')}</td><td class="ctr"><button class="btn-mini row-dep" title="沉淀到沉淀表"><i class="ti ti-database-heart"></i> 沉淀</button> <button class="btn-mini row-archive" title="归档" style="color:var(--primary)"><i class="ti ti-archive"></i></button></td>`),it);}
function addPlan(s,content,it){it=it||{};const id=s.dept==='SEM'?'tb-plan-sem':'tb-plan-seo';
  const status=it.status||'待开始';
  return bindLoopRow(prepend(id,`<td class="editable" contenteditable data-field="content">${esc(content||it.content||'')}</td><td class="editable" contenteditable data-field="hypothesis">${esc(it.hypothesis||'')}</td><td class="editable" contenteditable data-field="metric">${esc(it.metric||'')}</td><td class="editable" contenteditable data-field="due_or_budget">${esc(it.due_or_budget||'')}</td><td class="ctr"><span class="tagselect b-gray" data-kind="status">${esc(status)}<i class="ti ti-chevron-down"></i></span></td><td class="ctr"><button class="btn-mini row-archive" title="归档" style="color:var(--primary)"><i class="ti ti-archive"></i></button></td>`),it);}
/* 任务卡：个人(SEO/SEM) → 每日新增列；公司 → 公司任务列。绑定 id 后可删除、刷新仍在 */
function coScope(){return {dept:'公司',owner:'',c:'b-red'};}
// 三栏 UI 后：公司派发任务卡插入 #newtask-company（其内有 .add-task 直接子节点，insertBefore 才合法）
function taskColFor(dept){return document.getElementById(dept==='公司'?'newtask-company':(dept==='SEM'?'newtask-sem':'newtask-seo'));}
/* 跨天任务分组：一条任务写一次、设开始日+截止日，这段时间里天天落在「进行中」，不用每天拆一条。
   逾期=截止日已过；今日=截止就是今天或没填日期；进行中=已开始但还没到截止；稍后=还没到开始日。 */
const TASK_GROUPS=[['overdue','逾期'],['today','今日'],['doing','进行中'],['later','稍后']];
function taskGroupOf(it){
  const t=formatLocalDate(new Date());
  const due=(it&&it.task_date)||'', st=(it&&it.start_date)||'';
  if(due&&due<t)return 'overdue';
  if(st&&st>t)return 'later';
  if(due&&due>t)return st?'doing':'later'; // 只有截止没开始日 = 排在以后做，不算已经在做
  return 'today';
}
// 分组容器按 TASK_GROUPS 固定顺序排列，永远待在折叠条/新增按钮之前
function taskGroupEl(col,g){
  let el=col.querySelector(':scope > .tgroup[data-g="'+g+'"]');
  if(el)return el;
  const label=(TASK_GROUPS.find(x=>x[0]===g)||[,g])[1];
  el=document.createElement('div'); el.className='tgroup'; el.dataset.g=g;
  el.innerHTML=`<div class="tgroup-cap">${esc(label)} <span class="n"></span></div>`;
  const order=TASK_GROUPS.map(x=>x[0]);
  const after=[...col.querySelectorAll(':scope > .tgroup')].find(x=>order.indexOf(x.dataset.g)>order.indexOf(g))
    ||col.querySelector('.donefold')||col.querySelector('.add-task');
  if(after)col.insertBefore(el,after); else col.appendChild(el);
  return el;
}
function addTaskCard(s,content,it){
  const col=taskColFor(s.dept); if(!col)return null;
  const item=Object.assign({},it||{}); item.content=content||item.content||'';
  const done=!!(item.state==='done'||item.status==='done'); // 归档③：优先 state，兼容旧 status='done' 行
  const isCoParent=s.dept==='公司'; // 公司顶层大任务：可拆解出子任务
  const card=document.createElement('div'); card.className='tcard'+(isCoParent?' cotask':'')+(done?' done':''); if(item.id)card.dataset.id=item.id;
  // 卡自带数据：改期/换天后重渲染 meta 与重新分组都读它，不用回后端也不用解析 DOM 文本
  card._item=item; card._scope=s;
  card.innerHTML=`<div class="ttitle"><span class="tcheck${done?' on':''}" onclick="chk(this)">${done?'<i class="ti ti-check"></i>':''}</span>${esc(item.content)}</div><div class="tmeta"></div>`;
  if(isCoParent){ const box=document.createElement('div'); box.className='subtasks'; card.appendChild(box); } // 子任务容器
  renderTaskMeta(card); placeTaskCard(card); return card;
}
/* meta 行整条由卡上的 _item 推导：日期胶囊（可点改期）+ 天数 + 逾期两个出口 + 分发 + 删除。
   任何一次改期/换天只要重跑它 + placeTaskCard，卡的显示和所在分组就一起对上。 */
function renderTaskMeta(card){
  const it=card._item||{}, s=card._scope||{}, box=card.querySelector('.tmeta');
  if(!box)return;
  const isCo=card.classList.contains('cotask'), g=taskGroupOf(it);
  // 个人任务在各自列里，dept 徽章冗余 → 只公司大任务保留「公司」徽章
  const deptBadge=isCo?`<span class="badge ${s.c||'b-gray'}">${esc(s.dept||'')}</span>`:'';
  // 出身标：这条是从整改清单排下来的，点它回去看依据数据（任务能追溯到证据，才不是拍脑袋）
  const srcBadge=it.fix_id?`<span class="badge b-amber src-fix" title="来自整改清单 · 点击查看依据">整改</span>`:'';
  // 备注并入 meta 行（备注居左、日期/操作居右同一行），消掉单独的备注行与空白
  const note=it.note?`<span class="tnote">${esc(it.note)}</span>`:'';
  // 逾期两个出口：顺延到今天 / 放弃并归档。没有出口的话逾期组就是下一个垃圾堆
  const ops=(g==='overdue'&&it.id)
    ? `<button class="btn-mini task-defer" onclick="taskDefer(this)" title="顺延到今天"><i class="ti ti-calendar-plus"></i></button>`
      +`<button class="btn-mini task-drop" onclick="taskDrop(this)" title="放弃并归档"><i class="ti ti-archive"></i></button>`
    : '';
  const push=taskPushHtml(it,g);
  const split=isCo?`<button class="btn-mini cotask-split" onclick="openSubtaskModal(this)"><i class="ti ti-git-branch"></i> 分发</button>`:'';
  // 右侧已有东西时删除键只留间距；只有它自己时才吃 auto 靠右
  const del=it.id?`<button class="btn-mini" style="color:var(--primary);margin-left:${(isCo||ops||push)?'8px':'auto'}" onclick="taskDel(this)"><i class="ti ti-trash"></i></button>`:'';
  box.innerHTML=deptBadge+srcBadge+note+taskDueHtml(it)+taskAgeHtml(it,g)+push+ops+split+del;
}
/* 日期胶囊：跨天显示「开始 ~ 截止」（同年省年份省宽度，完整日期放 title），单日照旧；点它改期。
   没填日期也给一个「设日期」入口——AI 生成/复盘回流的任务本来就没日期，否则永远没法补。 */
function taskDueHtml(it){
  const due=it.task_date||'', st=it.start_date||'', hr=it.task_hour||'';
  const span=st&&due&&st<due;
  const short=d=>(st.slice(0,4)===due.slice(0,4)?d.slice(5):d);
  const txt=span?(short(st)+' ~ '+short(due)):due;
  const time=hr?((txt?' ':'')+hr+':00'):'';
  const empty=!txt&&!time;
  if(empty&&!it.id)return ''; // 还没入库的卡没法改期，也就不给入口
  const cls='tdue'+(empty?' tdue-none':'')+(it.id?' task-edit':'');
  const attrs=it.id?` onclick="openTaskEdit(this)" title="${span?esc(st+' ~ '+due)+' · ':''}点击改期"`:'';
  return `<span class="${cls}"${attrs}><i class="ti ${empty?'ti-calendar-plus':'ti-clock'}"></i> ${empty?'设日期':esc(txt)+esc(time)}</span>`;
}
/* 天数：跨天任务显示「第 N/M 天 · 已推进 K 天」，逾期显示「逾期 N 天」。
   跨天任务能在「进行中」挂一整周，光看"它还在"看不出有没有人动它；
   天数 + 推进打卡合起来才是它的问责信号。 */
const dayDiff=(a,b)=>Math.round((Date.parse(b+'T00:00:00')-Date.parse(a+'T00:00:00'))/864e5);
function taskAgeHtml(it,g){
  const t=formatLocalDate(new Date());
  if(g==='overdue'&&it.task_date){ const n=dayDiff(it.task_date,t); return `<span class="tage tage-over">逾期 ${n} 天</span>`; }
  if(g==='doing'&&it.start_date&&it.task_date){
    const total=dayDiff(it.start_date,it.task_date)+1, cur=dayDiff(it.start_date,t)+1;
    const ck=taskCheckin(it.id);
    const pushed=ck.days?` · 已推进 ${ck.days} 天`:'';
    // 停滞：既没打今天的卡，上次推进也在 2 天前（或压根没推进过）→ 标黄，别让它安静地烂在进行中
    const idle=!ck.today&&(ck.last?dayDiff(ck.last,t)>=2:dayDiff(it.start_date,t)>=2);
    return `<span class="tage${idle?' tage-idle':''}">第 ${cur}/${total} 天${pushed}</span>`;
  }
  return '';
}
/* 推进打卡：跨天任务每天一勾，落 task_checkins（day_key 按本地日期，与 SOP 同口径）。
   只给"进行中/逾期"的跨天任务——当天任务勾完成就够了，再来一个打卡是多余动作。 */
window._taskCheckins=new Map();
function taskCheckin(id){ return window._taskCheckins.get(Number(id))||{days:0,last:'',today:false}; }
function taskPushHtml(it,g){
  if(!it.id||!it.start_date||!it.task_date||it.start_date>=it.task_date)return '';
  if(g!=='doing'&&g!=='overdue')return '';
  const on=taskCheckin(it.id).today;
  return `<button class="btn-mini task-push${on?' on':''}" onclick="taskPush(this)" title="${on?'今天已记推进，点一下撤销':'记一笔：今天推进了这条'}">`
    +`<i class="ti ti-${on?'check':'player-track-next'}"></i> ${on?'今日已推进':'推进'}</button>`;
}
async function taskPush(btn){
  const card=btn.closest('.tcard'); const it=card&&card._item; if(!it||!it.id)return;
  const day=formatLocalDate(new Date());
  const cur=taskCheckin(it.id); const on=cur.today;
  btn.disabled=true;
  try{
    if(on){
      await API.del('/api/task-checkins/'+it.id+'?day_key='+encodeURIComponent(day));
      const days=Math.max(0,cur.days-1);
      window._taskCheckins.set(Number(it.id),{days,last:days?cur.last:'',today:false});
      toast('已撤销今日推进 · 已入库');
    } else {
      await API.post('/api/task-checkins',{loop_item_id:it.id,day_key:day});
      window._taskCheckins.set(Number(it.id),{days:cur.days+1,last:day,today:true});
      toast('已记今日推进 · 已入库');
    }
    renderTaskMeta(card);
  }catch(e){ btn.disabled=false; toast(persistFailMsg(e)); }
}
async function loadTaskCheckins(){
  window._taskCheckins=new Map();
  try{
    const {items}=await API.get('/api/task-checkins/summary?day='+encodeURIComponent(formatLocalDate(new Date())));
    (items||[]).forEach(r=>window._taskCheckins.set(Number(r.loop_item_id),{days:r.days||0,last:r.last_day||'',today:!!r.today_done}));
  }catch(e){ /* 打卡拿不到不该挡住整块日计划：退化成"没人打过卡" */ }
}
/* 放进正确的分组容器。公司列不分组——公司派的活天然跨周，几乎全落「进行中」，
   多一层标题只占地方；逾期靠卡上的 .t-overdue 标红，不依赖分组容器。 */
function placeTaskCard(card){
  const s=card._scope||{}, col=taskColFor(s.dept); if(!col)return;
  const g=taskGroupOf(card._item||{});
  card.classList.toggle('t-overdue',g==='overdue');
  if(s.dept==='公司'){
    const anchor=col.querySelector('.donefold')||col.querySelector('.add-task');
    if(anchor)col.insertBefore(card,anchor); else col.appendChild(card);
    return;
  }
  taskGroupEl(col,g).appendChild(card);
}
/* 逾期出口①：顺延到今天。开始日保留（还想看到「已经拖了几天」），只有开始日在今天之后才跟着挪。 */
function taskDefer(btn){
  const card=btn.closest('.tcard'); const it=card&&card._item; if(!it||!it.id)return;
  const t=formatLocalDate(new Date());
  const body={task_date:t}; if(!it.start_date||it.start_date>t)body.start_date=t;
  API.patch('/api/loop-items/'+it.id,body)
    .then(({item})=>{ Object.assign(it,item||body); renderTaskMeta(card); placeTaskCard(card); refreshTaskCols(); toast('已顺延到今天 · 已入库'); })
    .catch(e=>toast(persistFailMsg(e)));
}
/* 逾期出口②：放弃并归档（留痕在归档页，不是删除）。 */
function taskDrop(btn){
  const card=btn.closest('.tcard'); const it=card&&card._item; if(!it||!it.id)return;
  if(!inlineConfirm(btn,'确认放弃'))return;
  // 归档分桶按卡所在列（_scope 一定有），不赌 item.dept —— 复盘回流/AI 建的任务可能没带 dept
  const dept=(card._scope||{}).dept||it.dept;
  const ak=dept==='公司'?'company':(dept==='SEM'?'sem':'seo');
  API.post('/api/loop-items/'+it.id+'/archive',{archive_kind:ak})
    .then(()=>{ card.remove(); refreshTaskCols(); if(typeof updateSopCounts==='function')updateSopCounts(); toastGo('已放弃 · 归档留痕','archive'); })
    .catch(e=>toast(persistFailMsg(e)));
}
function addTaskCards(s,items){ (items||[]).forEach(t=>addTaskCard(s,t)); } // 兼容复盘回流 loopBack

/* 公司大任务拆解：子任务卡（挂在父卡 .subtasks 内）。负责人徽章 陈=紫/李=蓝；勾完只划线不消失，删按钮同普通任务。 */
function subOwnerBadge(owner){ return owner==='陈'?'b-purple':'b-blue'; }
function addSubTaskCard(parentCard,it){
  if(!parentCard)return null;
  let box=parentCard.querySelector('.subtasks');
  if(!box){ box=document.createElement('div'); box.className='subtasks'; parentCard.appendChild(box); }
  const done=!!(it&&(it.state==='done'||it.status==='done'));
  const card=document.createElement('div'); card.className='tcard subtask'+(done?' done':''); if(it&&it.id)card.dataset.id=it.id;
  const owner=(it&&it.owner)||'李'; const oc=subOwnerBadge(owner);
  const del=(it&&it.id)?`<button class="btn-mini" onclick="taskDel(this)"><i class="ti ti-trash"></i></button>`:'';
  const dt=(it&&it.task_date)||'', hr=(it&&it.task_hour)||'';
  const due=(dt||hr)?`<span class="tdue"><i class="ti ti-clock"></i> ${esc(dt)}${hr?(dt?' ':'')+esc(hr)+':00':''}</span>`:'';
  // 单行紧凑：勾选 + 内容 + 右侧组(完成时间 + 负责人徽章 + 删除)，一行放下，避免堆叠把父卡撑高
  card.innerHTML=`<div class="ttitle"><span class="tcheck${done?' on':''}" onclick="chk(this)">${done?'<i class="ti ti-check"></i>':''}</span><span class="sub-text">${esc((it&&it.content)||'')}</span><span class="sub-right">${due}<span class="badge ${oc}">${esc(owner)}</span>${del}</span></div>`;
  box.appendChild(card); return card;
}
let _subtaskParentId=null;
function openSubtaskModal(btn){
  const card=btn.closest('.tcard'); const pid=card&&card.dataset.id;
  if(!pid){ toast('请先保存大任务再分发'); return; }
  _subtaskParentId=pid;
  const t=document.getElementById('subtask-content'); if(t)t.value='';
  const o=document.getElementById('subtask-owner'); if(o)o.value='李';
  const hs=document.getElementById('subtask-hour');
  if(hs&&hs.options.length<=1){ for(let h=0;h<24;h++){ const op=document.createElement('option'); const hh=String(h).padStart(2,'0'); op.value=hh; op.textContent=hh+':00'; hs.appendChild(op); } }
  if(hs)hs.value=''; const de=document.getElementById('subtask-date'); if(de)de.value='';
  const ti=document.getElementById('subtask-parent-title'); if(ti){ const tt=card.querySelector('.ttitle'); ti.textContent=tt?tt.innerText.trim():''; }
  openModal('subtaskMask'); if(t)setTimeout(()=>t.focus(),50);
}
async function submitSubtask(){
  const pid=_subtaskParentId; if(!pid)return;
  const content=(document.getElementById('subtask-content').value||'').trim();
  if(!content){ toast('请填写子任务内容'); return; }
  const owner=document.getElementById('subtask-owner').value||'李';
  const task_date=document.getElementById('subtask-date').value||'';
  const task_hour=document.getElementById('subtask-hour').value||'';
  try{
    // dept 保持「公司」→ 不漏进 SEM/SEO 列；负责人靠 owner 承载（陈/李）；完成时间可选
    const {item}=await API.post('/api/loop-items',{kind:'task',dept:'公司',content,owner,status:'待办',task_date,task_hour,parent_id:Number(pid)});
    const parentCard=document.querySelector('#newtask-company .tcard[data-id="'+pid+'"]');
    addSubTaskCard(parentCard,item); closeModal('subtaskMask');
    toast('已分发子任务给'+owner+' · 已入库');
  }catch(e){ toast(persistFailMsg(e)); }
}
let _taskScope=null;
let _taskEditing=null; // 非空 = 弹窗处于「改这张卡」模式，提交走 PATCH
function openTaskModal(dept){
  _taskEditing=null;
  const verb=document.getElementById('task-mod-verb'); if(verb)verb.textContent='新增';
  _taskScope=dept==='公司'?coScope():sFromDept(dept);
  const lbl=document.getElementById('task-deptlabel'); if(lbl)lbl.textContent=dept;
  const hs=document.getElementById('task-hour');
  if(hs&&hs.options.length<=1){ for(let h=0;h<24;h++){ const o=document.createElement('option'); const hh=String(h).padStart(2,'0'); o.value=hh; o.textContent=hh+':00'; hs.appendChild(o); } }
  // 默认开始=截止=今天（普通当天任务）；把截止往后挪就变成跨天任务
  const today=formatLocalDate(new Date());
  const de=document.getElementById('task-date'); if(de)de.value=today;
  const ds=document.getElementById('task-start'); if(ds)ds.value=today;
  if(hs)hs.value=''; const tc=document.getElementById('task-content'); if(tc)tc.value='';
  const tn=document.getElementById('task-note'); if(tn)tn.value='';
  // Step C：经理/老板派发公司任务时可勾「设为紧急」；其他场景隐藏
  const role=(window.ME||{}).role; const canUrgent=(role==='manager'||role==='boss')&&dept==='公司';
  const uf=document.getElementById('task-urgent-fld'); if(uf)uf.style.display=canUrgent?'':'none';
  const uc=document.getElementById('task-urgent'); if(uc)uc.checked=false;
  openModal('taskMask'); if(tc)tc.focus();
}
/* 改期/改内容：点卡上的日期胶囊进来，复用同一个弹窗，提交走 PATCH。
   没有它，跨天任务要延期只能删了重建——这是①落地后最先被骂的地方。 */
function openTaskEdit(el){
  const card=el.closest('.tcard'); const it=card&&card._item;
  if(!it||!it.id)return;
  _taskScope=card._scope||coScope(); _taskEditing=card;
  const verb=document.getElementById('task-mod-verb'); if(verb)verb.textContent='编辑';
  const lbl=document.getElementById('task-deptlabel'); if(lbl)lbl.textContent=_taskScope.dept||'';
  const hs=document.getElementById('task-hour');
  if(hs&&hs.options.length<=1){ for(let h=0;h<24;h++){ const o=document.createElement('option'); const hh=String(h).padStart(2,'0'); o.value=hh; o.textContent=hh+':00'; hs.appendChild(o); } }
  const de=document.getElementById('task-date'); if(de)de.value=it.task_date||'';
  const ds=document.getElementById('task-start'); if(ds)ds.value=it.start_date||'';
  if(hs)hs.value=it.task_hour||'';
  const tc=document.getElementById('task-content'); if(tc)tc.value=it.content||'';
  const tn=document.getElementById('task-note'); if(tn)tn.value=it.note||'';
  const uf=document.getElementById('task-urgent-fld'); if(uf)uf.style.display='none'; // 紧急标记只在派发时设
  openModal('taskMask'); if(tc)tc.focus();
}
async function submitTask(){
  const s=_taskScope; if(!s)return;
  const content=(document.getElementById('task-content').value||'').trim();
  if(!content){ toast('请填写任务内容'); return; }
  const task_date=document.getElementById('task-date').value||'';
  const startEl=document.getElementById('task-start');
  const start_date=(startEl&&startEl.value)||'';
  if(start_date&&task_date&&start_date>task_date){ toast('开始日期不能晚于截止日期'); return; }
  const task_hour=document.getElementById('task-hour').value||'';
  const note=(document.getElementById('task-note').value||'').trim();
  const ucEl=document.getElementById('task-urgent'); const urgent=(ucEl&&ucEl.checked&&document.getElementById('task-urgent-fld').style.display!=='none')?1:undefined;
  if(_taskEditing){
    const card=_taskEditing, it=card._item||{};
    try{
      const {item}=await API.patch('/api/loop-items/'+it.id,{content,task_date,start_date,task_hour,note});
      Object.assign(it,item||{content,task_date,start_date,task_hour,note});
      const t=card.querySelector('.ttitle'); // 只换标题文本，别动前面的勾选框
      if(t){ [...t.childNodes].forEach(n=>{ if(n.nodeType===3)n.remove(); }); t.appendChild(document.createTextNode(it.content||'')); }
      renderTaskMeta(card); placeTaskCard(card); refreshTaskCols();
      closeModal('taskMask'); _taskEditing=null; toast('已更新 · 已入库');
    }catch(e){ toast(persistFailMsg(e)); }
    return;
  }
  try{
    const body={kind:'task',dept:s.dept,content,owner:s.owner,status:'待办',task_date,start_date,task_hour,note};
    if(urgent)body.urgent=1;
    const {item}=await API.post('/api/loop-items',body);
    addTaskCard(s,item.content,item); refreshTaskCols(); closeModal('taskMask');
    toast((s.dept==='公司'?(urgent?'已派发紧急公司任务':'已派发公司任务'):'已新增'+s.dept+'任务')+' · 已入库');
    if(urgent)loadUrgent(); // Step C：紧急任务即时刷 banner
  }catch(e){ toast(persistFailMsg(e)); }
}
function taskDel(btn){ const card=btn.closest('.tcard'); if(!card||!card.dataset.id)return; if(!inlineConfirm(btn,'确认删除'))return; API.del('/api/loop-items/'+card.dataset.id).then(()=>{card.remove();refreshTaskCols();}).catch(e=>toast('删除失败：'+(e.message||'请求失败'))); }

/* 每列刷新：分组小标题计数 / 空分组收起 / 「已完成 N 项」折叠条。
   已完成默认收起，避免历史完成项把每日新增列拉长；刚手动勾完的卡带 .nofold（chk() 加），
   本次会话内不隐藏——点完就消失会让人以为点错了；刷新后归位。
   只数顶层任务卡：公司大任务下的 .subtask 嵌在父卡里，不参与分组也不参与折叠。 */
function refreshTaskCols(col){
  // null = 传进来的那一列在页面上不存在 → 到此为止。
  // 不能和「没传参数」共用一个 !col 分支：getElementById 找不到时回 null，会又拐回下面这行，自己递归自己。
  if(col===null)return;
  if(col===undefined){ ['company','sem','seo'].forEach(k=>refreshTaskCols(document.getElementById('newtask-'+k))); return; }
  const folded=col.classList.contains('folded');
  const foldable=c=>c.classList.contains('done')&&!c.classList.contains('nofold');
  // 顶层卡 = 分组容器里的 + 公司列直接平铺的；子任务嵌在父卡内，两边都不算
  const doneN=[...col.querySelectorAll('.tcard:not(.subtask)')].filter(foldable).length;
  col.querySelectorAll(':scope > .tgroup').forEach(g=>{
    const cards=[...g.querySelectorAll(':scope > .tcard')];
    if(!cards.length){ g.remove(); return; }
    const shown=cards.filter(c=>!(folded&&foldable(c))).length;
    g.classList.toggle('empty',shown===0);
    const n=g.querySelector('.tgroup-cap .n'); if(n)n.textContent=shown||'';
  });
  let bar=col.querySelector('.donefold');
  if(!doneN){ if(bar)bar.remove(); col.classList.remove('folded'); return; }
  if(!bar){
    bar=document.createElement('button'); bar.type='button'; bar.className='donefold';
    bar.addEventListener('click',()=>{ col.classList.toggle('folded'); refreshTaskCols(col); });
    const add=col.querySelector('.add-task');
    if(add)col.insertBefore(bar,add); else col.appendChild(bar);
    col.classList.add('folded'); // 默认收起 → 再刷一次让分组计数按收起态算
    refreshTaskCols(col); return;
  }
  bar.innerHTML=`<i class="ti ti-${col.classList.contains('folded')?'chevron-right':'chevron-down'}"></i> 已完成 ${doneN} 项`;
}

/* 跨零点：分组是「按今天」算死在渲染那一刻的，而这个后台常常一开一整天——
   第二天早上看到的还是昨天的今日/逾期。回到页面（或每 5 分钟）比一次日期，变了就地重排，
   顺带重拉 SOP（它的 period_key 也换天了）。只动前端排列，不重拉任务列表，避免重复渲染。 */
let _boardDay=''; // 惰性取首日：脚本顶层不调 formatLocalDate（它来自 bundle.js，顶层调用就把本脚本绑死在加载序上）
function checkDayRollover(){
  if(typeof formatLocalDate!=='function')return;
  const d=formatLocalDate(new Date());
  if(!_boardDay){ _boardDay=d; return; }
  if(d===_boardDay)return;
  _boardDay=d;
  rerenderTaskCards();
  if(typeof loadSops==='function')loadSops();
  // 打卡的「今天」也换了：重拉汇总再刷一次，否则昨天的「今日已推进」会挂到今天头上
  loadTaskCheckins().then(rerenderTaskCards);
}
function rerenderTaskCards(){
  ['company','sem','seo'].forEach(k=>{
    const col=document.getElementById('newtask-'+k); if(!col)return;
    [...col.querySelectorAll('.tcard:not(.subtask)')].forEach(card=>{ if(card._item){ renderTaskMeta(card); placeTaskCard(card); } });
  });
  refreshTaskCols();
}
document.addEventListener('visibilitychange',()=>{ if(!document.hidden)checkDayRollover(); });
window.addEventListener('focus',checkDayRollover);
setInterval(checkDayRollover,5*60*1000); // 页面整夜开着且一直可见时的兜底
async function addFixRow(){
  const s=sFromDept('SEO');
  try{
    const {item}=await API.post('/api/fixes',{title:'新整改项',dept:s.dept,detail:'',evidence:'',owner:s.owner,due_date:plusDays(7),status:'计划下周',source:'手动'});
    const tr=addFixFromObj(item); const c=tr&&tr.querySelector('[data-field="title"]'); if(c){c.focus();placeCaretEnd(c);}
    toast('已新增整改项 · 已入库');
  }catch(e){ toast(persistFailMsg(e)); }
}

/* —— 整改/闭环 入库（FR-6/10）。上面的 add* 仅负责渲染；下面负责持久化 —— */
function sFromDept(dept){return dept==='SEM'?{dept:'SEM',owner:'陈',c:'b-purple'}:{dept:'SEO',owner:'李',c:'b-blue'};}
function persistFix(s,text){return API.post('/api/fixes',{title:clip(text,24),dept:s.dept,detail:text,owner:s.owner,due_date:formatLocalDate(new Date(Date.now()+7*864e5)),status:'计划下周',source:'AI诊断'});}
function persistLoop(kind,s,content,status){return API.post('/api/loop-items',{kind,dept:s.dept,content,owner:s.owner,status:status||''});}
// 全站最常用的失败文案（11 处复用：ai/charts/closed-loop/weekly-review）。403 有专属文案；
// 其余必须带上后端给的原因（api.js 已把 400 的 detail 放进 e.message，如「字段 due_date 需要字符串」），
// 否则用户只看到「保存失败」，违背 CLAUDE.md「API 失败必须显示失败原因」。
function persistFailMsg(e){return e&&e.status===403?'无权操作，未入库':'保存失败，未入库：'+((e&&e.message)||'请求失败');}
async function loadClosedLoop(){
  // BUG-28：重建已采纳/沉淀/测试指纹集（每次加载先清空，避免残留）
  window._aiDone={沉淀:new Set(),采纳:new Set(),测试:new Set()};
  try{ const {items}=await API.get('/api/fixes'); (items||[]).slice().reverse().forEach(f=>{ addFixFromObj(f); window._aiDone.采纳.add(aiFp(f.dept,f.detail||f.title)); }); }catch(e){}
  const depTb=document.getElementById('tb-dep'); if(depTb)depTb.innerHTML='';
  await loadTaskCheckins(); // 先拿打卡汇总，卡片渲染时「已推进 K 天/停滞」才是对的
  const _pendingSubtasks=[]; // 子任务延后挂：父卡须先建好（加载为 id 倒序）
  try{ const {items}=await API.get('/api/loop-items');
    (items||[]).slice().reverse().forEach(it=>{ const s=sFromDept(it.dept);
      if(it.kind==='deposit'){ const tr=document.createElement('tr'); tr.dataset.id=it.id; tr.dataset.ep='/api/loop-items'; tr.innerHTML=depRowHtml(it); depTb&&depTb.appendChild(tr); window._aiDone[it.status==='采纳'?'采纳':'沉淀'].add(aiFp(it.dept,it.content)); }
      else if(it.kind==='test'){ addTest(s,it.content,it); window._aiDone.测试.add(aiFp(it.dept,it.content)); }
      else if(it.kind==='plan')addPlan(s,it.content,it);
      else if(it.kind==='task'){
        // 公司大任务的子任务：延后挂到父卡下（子任务不参与惰性归档，只随父任务级联归档）
        if(it.parent_id){ _pendingSubtasks.push(it); return; }
        const ts=it.dept==='公司'?coScope():s;
        // 归档③：完成 + task_date 已过 → 静默惰性归档，不再渲染（次日自动消失，进归档页）
        const today=formatLocalDate(new Date());
        const isDone=it.state==='done'||it.status==='done';
        if(isDone && it.task_date && it.task_date<today){
          const ak=it.dept==='公司'?'company':(it.dept==='SEM'?'sem':'seo');
          API.post('/api/loop-items/'+it.id+'/archive',{archive_kind:ak}).catch(()=>{}); // 静默 + 幂等
        } else {
          addTaskCard(ts,it.content,it);
        }
      }
    });
    // 第二遍：把子任务按 id 升序挂到各自父卡下；父卡不在（异常）则兜底平铺，避免数据隐身
    _pendingSubtasks.sort((a,b)=>a.id-b.id).forEach(it=>{
      const parentCard=document.querySelector('#newtask-company .tcard[data-id="'+it.parent_id+'"]');
      if(parentCard)addSubTaskCard(parentCard,it);
      else addTaskCard(coScope(),it.content,it);
    });
  }catch(e){}
  const de=document.getElementById('dep-empty'); if(de)de.style.display=(depTb&&depTb.children.length)?'none':'block';
  refreshTaskCols(); // 三列的「已完成 N 项」折叠条
  applyAiDoneStates(); // 给已渲染的 AI 项标灰
}
/* 沉淀表行（可改内容 + 删除）*/
function depRowHtml(it){
  const date=(it.created_at||'').slice(5,10)||today();
  const badge=it.status==='采纳'?'<span class="badge b-green">采纳</span>':'<span class="badge b-teal">沉淀</span>';
  return `<td class="num">${esc(date)}</td><td class="ctr">${badge}</td><td class="editable" contenteditable data-field="content">${esc(it.content)}</td><td class="editable dim" contenteditable data-field="analysis" style="font-size:11px">${esc(it.analysis||'')}</td><td class="ctr"><button class="btn-mini" style="color:var(--primary)" onclick="depDel(this)"><i class="ti ti-trash"></i></button></td>`;
}
async function addDepositRow(){
  try{ const {item}=await API.post('/api/loop-items',{kind:'deposit',content:'',status:'沉淀'});
    const tb=document.getElementById('tb-dep'); const tr=document.createElement('tr'); tr.dataset.id=item.id; tr.dataset.ep='/api/loop-items'; tr.innerHTML=depRowHtml(item); tb.insertBefore(tr,tb.firstChild);
    document.getElementById('dep-empty').style.display='none'; const c=tr.querySelector('[data-field="content"]'); if(c){c.focus();}
  }catch(e){ toast(e.status===403?'无权操作':'保存失败：'+(e.message||'请求失败')); }
}
function depDel(btn){ const tr=btn.closest('tr'); if(!tr.dataset.id)return; if(!inlineConfirm(btn,'确认删除'))return; API.del('/api/loop-items/'+tr.dataset.id).then(()=>{tr.remove(); const tb=document.getElementById('tb-dep'); if(tb&&!tb.children.length)document.getElementById('dep-empty').style.display='block';}).catch(e=>toast('删除失败：'+(e.message||'请求失败'))); }
async function addPlanRow(dept){
  const s=sFromDept(dept);
  try{
    const {item}=await persistLoop('plan',s,'新月度计划','待开始');
    const tr=addPlan(s,item.content,item);
    const c=tr&&tr.querySelector('[data-field="content"]'); if(c){c.focus();placeCaretEnd(c);}
    toast('已新增'+dept+'计划 · 已入库');
  }catch(e){ toast(persistFailMsg(e)); }
}
async function addTestRow(dept){
  const s=sFromDept(dept);
  try{
    const {item}=await persistLoop('test',s,'新测试登记','观察中');
    const tr=addTest(s,item.content,item);
    const c=tr&&tr.querySelector('[data-field="content"]'); if(c){c.focus();placeCaretEnd(c);}
    toast('已新增'+dept+'测试 · 已入库');
  }catch(e){ toast(persistFailMsg(e)); }
}
/* 内容资产 */
const CA_PRIO={'最高':'b-red','高':'b-amber','中':'b-blue','持续':'b-gray'};
const CA_OWNER={'李':'b-blue','陈':'b-purple','主管':'b-teal'};
const CA_STATUS={'待开始':'b-gray','进行中':'b-amber','已完成':'b-green'};
function contentRowHtml(r){
  return `<td class="editable" contenteditable data-field="name">${esc(r.name)}</td>`
    +`<td class="editable dim" contenteditable data-field="problem" style="font-size:11px">${esc(r.problem)}</td>`
    +`<td class="editable" contenteditable data-field="type" style="font-size:11px">${esc(r.type)}</td>`
    +`<td class="ctr"><span class="tagselect ${CA_PRIO[r.priority]||'b-blue'}" data-kind="priority">${esc(r.priority||'中')}<i class="ti ti-chevron-down"></i></span></td>`
    +`<td class="ctr"><span class="tagselect ${CA_OWNER[r.owner]||'b-blue'}" data-kind="owner">${esc(r.owner||'李')}<i class="ti ti-chevron-down"></i></span></td>`
    +`<td class="ctr"><span class="tagselect ${CA_STATUS[r.status]||'b-gray'}" data-kind="status">${esc(r.status||'待开始')}<i class="ti ti-chevron-down"></i></span></td>`
    +`<td class="num">${esc(r.add_date||'')}</td>`
    +`<td class="editable dim" contenteditable data-field="note" style="font-size:11px">${esc(r.note)}</td>`
    +`<td class="ctr"><button class="btn-mini" style="color:var(--primary)" onclick="contentDel(this)"><i class="ti ti-trash"></i></button></td>`;
}
async function loadContent(){
  try{ const {items}=await API.get('/api/content-assets'); const tb=document.getElementById('tb-content'); if(!tb)return; tb.innerHTML='';
    (items||[]).forEach(r=>{ const tr=document.createElement('tr'); tr.dataset.id=r.id; tr.dataset.ep='/api/content-assets'; tr.innerHTML=contentRowHtml(r); tb.appendChild(tr); });
    const e=document.getElementById('content-empty'); if(e)e.style.display=(items&&items.length)?'none':'block';
  }catch(e){}
}
async function addContent(){
  try{ const {item}=await API.post('/api/content-assets',{}); const tb=document.getElementById('tb-content'); const tr=document.createElement('tr'); tr.dataset.id=item.id; tr.dataset.ep='/api/content-assets'; tr.innerHTML=contentRowHtml(item); tb.appendChild(tr);
    document.getElementById('content-empty').style.display='none'; const c=tr.querySelector('[data-field="name"]'); if(c){c.focus();placeCaretEnd(c);}
  }catch(e){ toast(e.status===403?'无权操作':'保存失败：'+(e.message||'请求失败')); }
}
function contentDel(btn){ const tr=btn.closest('tr'); if(!tr.dataset.id)return; if(!inlineConfirm(btn,'确认删除'))return; API.del('/api/content-assets/'+tr.dataset.id).then(()=>{tr.remove(); const tb=document.getElementById('tb-content'); if(tb&&!tb.children.length)document.getElementById('content-empty').style.display='block';}).catch(e=>toast('删除失败：'+(e.message||'请求失败'))); }

/* AI 三连: 沉淀→沉淀表 / 采纳→整改清单+沉淀表 / 测试→测试登记
   BUG-28：刷新后保持「已点」灰态——按 dept|文本前200 指纹反查 fixes+loop_items 缓存(纯前端、无后端改) */
window._aiDone={沉淀:new Set(),采纳:new Set(),测试:new Set()};
function aiFp(dept,text){ return (dept||'')+'|'+String(text||'').trim().slice(0,200); }
function aiMarkDone(grp,kind){ grp.querySelectorAll('.aibtn').forEach(b=>b.classList.add('done')); const btn=[...grp.querySelectorAll('.aibtn')].find(b=>b.dataset.kind===kind); if(btn)btn.textContent='✓ 已'+kind; }
function applyAiDoneStates(root){ (root||document).querySelectorAll('.ai-actions').forEach(grp=>{
  const it=grp.closest('.ai-item'); if(!it)return; const text=grabText(grp.firstChild||grp); const s=scopeDept(grp,text); const fp=aiFp(s.dept,text);
  ['沉淀','采纳','测试'].forEach(k=>{ if(window._aiDone[k].has(fp))aiMarkDone(grp,k); });
}); }
async function aiAct(btn,kind){
  const grp=btn.closest('.ai-actions');
  const text=grabText(btn); const s=scopeDept(btn,text);
  btn.disabled=true;
  try{
    if(kind==='沉淀'){ await persistLoop('deposit',s,text,'沉淀'); addDeposit(s,text,'沉淀'); toastGo('已沉淀到沉淀表 · 已入库','deposit'); }
    else if(kind==='采纳'){ const [fx]=await Promise.all([persistFix(s,text),persistLoop('deposit',s,text,'采纳')]); addFixFromObj(fx.item); addDeposit(s,text,'采纳'); toastGo('已采纳 → 整改清单 + 沉淀表 · 已入库','fix'); }
    else if(kind==='测试'){ const r=await persistLoop('test',s,text,'观察中'); addTest(s,r.item.content,r.item); toastGo('已加入测试登记（'+s.dept+'）· 已入库','test'); }
    window._aiDone[kind].add(aiFp(s.dept,text)); aiMarkDone(grp,kind);
  }catch(e){ btn.disabled=false; toast(persistFailMsg(e)); }
}
/* inject 沉淀/采纳/测试 onto every AI suggestion item；带 data-kind 便于反查标灰 */
function injectAiActions(){ document.querySelectorAll('.ai-item').forEach(it=>{ if(it.querySelector('.ai-actions'))return; const wrap=document.createElement('span'); wrap.className='ai-actions'; wrap.innerHTML='<button class="aibtn dep" data-kind="沉淀" onclick="aiAct(this,\'沉淀\')">沉淀</button><button class="aibtn adopt" data-kind="采纳" onclick="aiAct(this,\'采纳\')">采纳</button><button class="aibtn test" data-kind="测试" onclick="aiAct(this,\'测试\')">测试</button>'; it.appendChild(wrap); }); applyAiDoneStates(); }
injectAiActions();

/* ⑤复盘「下周必做」回流 → ①月度计划 + 任务看板，闭环回到起点 */
async function loopBack(btn,dept){
  const cell=btn.closest('.next3'); const raw=cell.innerText.replace(/↻[^\n]*$/,'');
  const items=raw.split(/[｜|]/).map(x=>x.replace(/^\s*\d+[\.\、:：]?\s*/,'').trim()).filter(Boolean);
  const s=dept==='SEM'?{dept:'SEM',owner:'陈',c:'b-purple'}:{dept:'SEO',owner:'李',c:'b-blue'};
  btn.disabled=true;
  try{
    await Promise.all([...items.map(t=>persistLoop('plan',s,t,'待开始')),...items.map(t=>persistLoop('task',s,t,'待办'))]);
    items.forEach(t=>addPlan(s,t)); addTaskCards(s,items);
    btn.textContent='✓ 已排入'; btn.classList.add('done');
    toastGo(items.length+' 条已排入下月计划 + 任务看板 · 已入库','plan');
  }catch(e){ btn.disabled=false; toast(persistFailMsg(e)); }
}
