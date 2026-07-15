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
    +`<td class="ctr"><button class="btn-mini row-dep" title="沉淀到沉淀表"><i class="ti ti-database-heart"></i> 沉淀</button> <button class="btn-mini row-archive" title="归档" style="color:var(--primary)"><i class="ti ti-archive"></i> 归档</button></td>`;
}
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
function addTaskCard(s,content,it){
  const col=taskColFor(s.dept); if(!col)return null; const add=col.querySelector('.add-task');
  const done=!!(it&&(it.state==='done'||it.status==='done')); // 归档③：优先 state，兼容旧 status='done' 行
  const card=document.createElement('div'); card.className='tcard'+(done?' done':''); if(it&&it.id)card.dataset.id=it.id;
  const del=(it&&it.id)?`<button class="btn-mini" style="color:var(--primary);margin-left:auto" onclick="taskDel(this)"><i class="ti ti-trash"></i></button>`:'';
  const dt=(it&&it.task_date)||'', hr=(it&&it.task_hour)||'';
  const due=(dt||hr)?`<span class="tdue"><i class="ti ti-clock"></i> ${esc(dt)}${hr?(dt?' ':'')+esc(hr)+':00':''}</span>`:'';
  const note=(it&&it.note)?`<div class="tnote" style="font-size:11px;color:var(--text3);margin-top:2px">${esc(it.note)}</div>`:'';
  card.innerHTML=`<div class="ttitle"><span class="tcheck${done?' on':''}" onclick="chk(this)">${done?'<i class="ti ti-check"></i>':''}</span>${esc(content||'')}</div>${note}<div class="tmeta"><span class="badge ${s.c}">${esc(s.dept)}</span>${due}${del}</div>`;
  if(add)col.insertBefore(card,add); else col.appendChild(card); return card;
}
function addTaskCards(s,items){ (items||[]).forEach(t=>addTaskCard(s,t)); } // 兼容复盘回流 loopBack
let _taskScope=null;
function openTaskModal(dept){
  _taskScope=dept==='公司'?coScope():sFromDept(dept);
  const lbl=document.getElementById('task-deptlabel'); if(lbl)lbl.textContent=dept;
  const hs=document.getElementById('task-hour');
  if(hs&&hs.options.length<=1){ for(let h=0;h<24;h++){ const o=document.createElement('option'); const hh=String(h).padStart(2,'0'); o.value=hh; o.textContent=hh+':00'; hs.appendChild(o); } }
  const de=document.getElementById('task-date'); if(de)de.value=formatLocalDate(new Date());
  if(hs)hs.value=''; const tc=document.getElementById('task-content'); if(tc)tc.value='';
  const tn=document.getElementById('task-note'); if(tn)tn.value='';
  // Step C：经理/老板派发公司任务时可勾「设为紧急」；其他场景隐藏
  const role=(window.ME||{}).role; const canUrgent=(role==='manager'||role==='boss')&&dept==='公司';
  const uf=document.getElementById('task-urgent-fld'); if(uf)uf.style.display=canUrgent?'':'none';
  const uc=document.getElementById('task-urgent'); if(uc)uc.checked=false;
  openModal('taskMask'); if(tc)tc.focus();
}
async function submitTask(){
  const s=_taskScope; if(!s)return;
  const content=(document.getElementById('task-content').value||'').trim();
  if(!content){ toast('请填写任务内容'); return; }
  const task_date=document.getElementById('task-date').value||'';
  const task_hour=document.getElementById('task-hour').value||'';
  const note=(document.getElementById('task-note').value||'').trim();
  const ucEl=document.getElementById('task-urgent'); const urgent=(ucEl&&ucEl.checked&&document.getElementById('task-urgent-fld').style.display!=='none')?1:undefined;
  try{
    const body={kind:'task',dept:s.dept,content,owner:s.owner,status:'待办',task_date,task_hour,note};
    if(urgent)body.urgent=1;
    const {item}=await API.post('/api/loop-items',body);
    addTaskCard(s,item.content,item); closeModal('taskMask');
    toast((s.dept==='公司'?(urgent?'已派发紧急公司任务':'已派发公司任务'):'已新增'+s.dept+'任务')+' · 已入库');
    if(urgent)loadUrgent(); // Step C：紧急任务即时刷 banner
  }catch(e){ toast(persistFailMsg(e)); }
}
function taskDel(btn){ const card=btn.closest('.tcard'); if(!card||!card.dataset.id)return; if(!inlineConfirm(btn,'确认删除'))return; API.del('/api/loop-items/'+card.dataset.id).then(()=>card.remove()).catch(e=>toast('删除失败：'+(e.message||'请求失败'))); }
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
  try{ const {items}=await API.get('/api/loop-items');
    (items||[]).slice().reverse().forEach(it=>{ const s=sFromDept(it.dept);
      if(it.kind==='deposit'){ const tr=document.createElement('tr'); tr.dataset.id=it.id; tr.dataset.ep='/api/loop-items'; tr.innerHTML=depRowHtml(it); depTb&&depTb.appendChild(tr); window._aiDone[it.status==='采纳'?'采纳':'沉淀'].add(aiFp(it.dept,it.content)); }
      else if(it.kind==='test'){ addTest(s,it.content,it); window._aiDone.测试.add(aiFp(it.dept,it.content)); }
      else if(it.kind==='plan')addPlan(s,it.content,it);
      else if(it.kind==='task'){
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
  }catch(e){}
  const de=document.getElementById('dep-empty'); if(de)de.style.display=(depTb&&depTb.children.length)?'none':'block';
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
