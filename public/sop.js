/* SOP 引擎（拆分自 index.html · 阶段4-A）
   经典 script + window 全局兼容。依赖（运行时解析，均在 index.html 内联或其他模块）：
   formatLocalDate()、window.API、esc()、toast()、chk()、openModal()/closeModal()、inlineConfirm()（keywords.js）。
   loadSops()/loadUrgent() 由 window load 初始化调用；refreshNavTaskDot/updateSopCounts/renderSopOverdueBanner 亦被 chk()/路由 在运行时调用。 */

/* ===== SOP 引擎 Step B：周期 key / 加载 / 渲染 / 设置页 CRUD ===== */
// period_key 按本地时间算，daily=YYYY-MM-DD / weekly=YYYY-Www / monthly=YYYY-MM
function sopPeriodKey(freq){
  const d=new Date(); d.setHours(0,0,0,0);
  if(freq==='monthly'){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'); return y+'-'+m; }
  if(freq==='weekly'){
    // ISO 周：周四确定年份；周一为本周起点
    const tmp=new Date(d); tmp.setDate(tmp.getDate()+4-(tmp.getDay()||7));
    const yearStart=new Date(tmp.getFullYear(),0,1);
    const week=Math.ceil((((tmp-yearStart)/86400000)+1)/7);
    return tmp.getFullYear()+'-W'+String(week).padStart(2,'0');
  }
  return formatLocalDate(d);
}
window._sops=[]; window._sopDone={daily:new Set(),weekly:new Set(),monthly:new Set()};
const DEPT_BADGE={SEM:'b-purple',SEO:'b-blue','公司':'b-red'};
const FREQ_LABEL={daily:'每日必做',weekly:'每周必做',monthly:'每月必做'};
const FREQ_ICON={daily:'ti-repeat',weekly:'ti-calendar-week',monthly:'ti-calendar-month'};
async function loadSops(){
  try{ const {items}=await API.get('/api/sop'); window._sops=items||[]; }
  catch(e){ window._sops=[]; if(e&&e.message!=='unauthorized')toast('SOP 加载失败：'+(e.message||'')); }
  try{
    const q='daily='+encodeURIComponent(sopPeriodKey('daily'))
      +'&weekly='+encodeURIComponent(sopPeriodKey('weekly'))
      +'&monthly='+encodeURIComponent(sopPeriodKey('monthly'));
    const {items}=await API.get('/api/sop/completions?'+q);
    window._sopDone={daily:new Set(),weekly:new Set(),monthly:new Set()};
    const keyToFreq={[sopPeriodKey('daily')]:'daily',[sopPeriodKey('weekly')]:'weekly',[sopPeriodKey('monthly')]:'monthly'};
    (items||[]).forEach(c=>{ const f=keyToFreq[c.period_key]; if(f)window._sopDone[f].add(c.sop_id); });
  }catch(e){}
  renderSopCards();
  renderSopSettingsTable();
  updateSopCounts();
  renderSopOverdueBanner(); // Step C：SOP 未做提示
  refreshNavTaskDot();      // Step C：侧栏红感叹号
}
function renderSopCards(){
  ['SEM','SEO','公司'].forEach(dept=>{
    const anchor=document.getElementById(dept==='公司'?'sop-company':('sop-'+dept.toLowerCase()));
    if(!anchor)return;
    const list=window._sops.filter(s=>s.dept===dept);
    // 三栏统一：公司块也带「SOP 固定任务」colcap
    anchor.innerHTML='<div class="colcap"><i class="ti ti-pin"></i> SOP 固定任务</div>';
    if(!list.length){
      anchor.insertAdjacentHTML('beforeend','<div class="sop-empty-hint" style="font-size:11px;color:var(--text3);padding:8px 0">暂无 SOP，去「设置 · SOP 设置」添加</div>');
      return;
    }
    ['daily','weekly','monthly'].forEach(freq=>{
      const subset=list.filter(s=>s.freq===freq);
      if(!subset.length)return;
      anchor.insertAdjacentHTML('beforeend',`<div class="freq-cap"><i class="ti ${FREQ_ICON[freq]}"></i> ${FREQ_LABEL[freq]}</div>`);
      subset.forEach(s=>anchor.appendChild(sopCardEl(s)));
    });
  });
}
function sopCardEl(s){
  const done=window._sopDone[s.freq]&&window._sopDone[s.freq].has(s.id);
  const card=document.createElement('div');
  card.className='tcard must'+(done?' done':'');
  card.dataset.sopId=s.id; card.dataset.sopFreq=s.freq;
  const badge=DEPT_BADGE[s.dept]||'b-gray';
  const due=s.time_hint?`<span class="tdue"><i class="ti ti-clock"></i> ${esc(s.time_hint)}</span>`:(done?'<span class="tdue">已完成</span>':'');
  card.innerHTML=`<div class="ttitle"><span class="tcheck${done?' on':''}" onclick="chk(this)">${done?'<i class="ti ti-check"></i>':''}</span>${esc(s.title)}</div><div class="tmeta"><span class="badge ${badge}">${esc(s.dept)}</span>${due}</div>`;
  return card;
}
function updateSopCounts(){
  // SEM/SEO：SOP N · 新增 M；公司：SOP N · 派发 M（容器 id 用 newtask-company / kcount-company）
  [['SEM','sem','新增'],['SEO','seo','新增'],['公司','company','派发']].forEach(([dept,key,verb])=>{
    const el=document.getElementById('kcount-'+key); if(!el)return;
    const sopN=window._sops.filter(s=>s.dept===dept).length;
    const addCol=document.getElementById('newtask-'+key);
    const addN=addCol?addCol.querySelectorAll('.tcard').length:0;
    el.textContent='SOP '+sopN+' · '+verb+' '+addN;
  });
}

/* SOP 设置页：列表 + 弹框 + CRUD（仅 manager/boss 可写，其他只读） */
function isSopWritable(){ const r=(window.ME||{}).role; return r==='manager'||r==='boss'; }
function renderSopSettingsTable(){
  const tb=document.getElementById('tb-sop'); if(!tb)return;
  const addBtn=document.getElementById('sop-add-btn');
  const writable=isSopWritable();
  if(addBtn)addBtn.style.display=writable?'':'none';
  tb.innerHTML='';
  const list=window._sops;
  if(!list.length){ const e=document.getElementById('sop-empty'); if(e)e.style.display='block'; return; }
  const e=document.getElementById('sop-empty'); if(e)e.style.display='none';
  list.forEach(s=>{
    const tr=document.createElement('tr'); tr.dataset.sopId=s.id;
    const ops=writable
      ? `<button class="btn-mini sop-edit"><i class="ti ti-edit"></i></button> <button class="btn-mini sop-del" style="color:var(--primary)"><i class="ti ti-trash"></i></button>`
      : '<span class="dim" style="font-size:11px">只读</span>';
    tr.innerHTML=`<td>${esc(s.dept)}</td><td>${esc(FREQ_LABEL[s.freq]||s.freq)}</td><td>${esc(s.title)}</td><td class="dim" style="font-size:11px">${esc(s.content||'')}</td><td>${esc(s.time_hint||'')}</td><td class="ctr">${ops}</td>`;
    tb.appendChild(tr);
  });
}
let _sopEditing=null;
function openSopModal(sop){
  if(!isSopWritable()){ toast('仅经理 / 老板可编辑 SOP'); return; }
  _sopEditing=sop||null;
  document.getElementById('sop-mod-title').textContent=sop?'编辑 SOP':'新增 SOP';
  document.getElementById('sop-dept').value=sop?sop.dept:'SEM';
  document.getElementById('sop-freq').value=sop?sop.freq:'daily';
  document.getElementById('sop-title').value=sop?sop.title:'';
  document.getElementById('sop-content').value=sop?(sop.content||''):'';
  document.getElementById('sop-time').value=sop?(sop.time_hint||''):'';
  openModal('sopMask'); setTimeout(()=>document.getElementById('sop-title').focus(),50);
}
async function submitSop(){
  const dept=document.getElementById('sop-dept').value;
  const freq=document.getElementById('sop-freq').value;
  const title=document.getElementById('sop-title').value.trim();
  const content=document.getElementById('sop-content').value.trim();
  const time_hint=document.getElementById('sop-time').value.trim();
  if(!title){ toast('请填写标题'); return; }
  try{
    if(_sopEditing){ await API.patch('/api/sop/'+_sopEditing.id,{dept,freq,title,content,time_hint}); toast('已更新 SOP'); }
    else { await API.post('/api/sop',{dept,freq,title,content,time_hint}); toast('已新增 SOP'); }
    closeModal('sopMask'); await loadSops();
  }catch(e){ toast(e&&e.status===403?'无权操作（仅经理/老板）':'保存失败：'+(e.message||'')); }
}
document.addEventListener('click',async e=>{
  const edit=e.target.closest('.sop-edit'); const del=e.target.closest('.sop-del');
  if(!edit&&!del)return;
  const tr=(edit||del).closest('tr'); const id=tr&&tr.dataset.sopId; if(!id)return;
  if(edit){ const s=window._sops.find(x=>String(x.id)===String(id)); if(s)openSopModal(s); return; }
  if(del){
    if(!inlineConfirm(del,'确认停用'))return;
    try{ await API.del('/api/sop/'+id); toast('已停用'); await loadSops(); }
    catch(err){ toast(err&&err.status===403?'无权操作（仅经理/老板）':'操作失败'); }
  }
});

/* ===== Step C：未做 SOP 提示 banner + 公司新派 banner + 侧栏红点 ===== */
/* 未做 SOP banner：只在周期首日 08:00 后展示一天（避免天天弹）。daily=每天 08:00 起；weekly=周一 08:00 起；monthly=1 号 08:00 起。 */
function isOverduePeriodFirstDay(freq){
  const now=new Date(); const h=now.getHours();
  if(h<8)return false; // 早 8 点前不催
  if(freq==='daily')return true; // 每天都是首日
  if(freq==='weekly')return now.getDay()===1; // 周一
  if(freq==='monthly')return now.getDate()===1; // 1 号
  return false;
}
function buildSopOverdueList(){
  const today=formatLocalDate(new Date()).replace(/-/g,'.').replace(/^\d{4}\./,''); // MM.DD
  const lines=[];
  ['daily','weekly','monthly'].forEach(freq=>{
    if(!isOverduePeriodFirstDay(freq))return;
    (window._sops||[]).forEach(s=>{
      if(s.freq!==freq)return;
      const done=window._sopDone[freq]&&window._sopDone[freq].has(s.id);
      if(done)return;
      lines.push(esc(s.dept)+'-'+today+'-'+esc(FREQ_LABEL[freq]||freq)+'：'+esc(s.title)+' 任务未做，请及时处理。');
    });
  });
  return lines;
}
function renderSopOverdueBanner(){
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
async function loadUrgent(){
  try{
    const {items}=await API.get('/api/loop-items?urgent=1');
    // 仅显示未完成的（state!=='done' 且 status!=='done'）；done 的 banner 自然消失
    window._urgentTasks=(items||[]).filter(it=>{ const st=it.state||''; const ss=it.status||''; return st!=='done' && ss!=='done'; });
  }catch(e){ window._urgentTasks=[]; }
  renderUrgentBanner();
  refreshNavTaskDot();
}
function renderUrgentBanner(){
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
function refreshNavTaskDot(){
  const dot=document.getElementById('nav-tasks-dot'); if(!dot)return;
  const overdue=buildSopOverdueList().length>0;
  const urgent=(window._urgentTasks||[]).length>0;
  dot.style.display=(overdue||urgent)?'':'none';
}
