/* 关键词库（4 类 · 增删改入库 · FR-9）（ES 模块 · esbuild 打包为 IIFE）。
   显式模块依赖：OPT 来自 ./tagselect.js —— 不再靠全局碰运气。
   运行时仍依赖的全局（尚未迁移的经典脚本/内联提供，调用/事件时解析）：
   esc()、toast()、API、renderSparklines()、placeCaretEnd()、
   validateEditableValue()/rollbackEditable()/showSaveError()/setSavingState()（Excel 化基建，内联）。
   必须挂 window（main.js 统一处理）：
     - inlineConfirm —— inquiries / closed-loop / archive / sop 显式导入；经典兼容层暂仍暴露。
     - addKeyword —— 内联 onclick（加词按钮 ×4）；filterKwByCat —— index.html:1135/1138 真实调用；
     - 其余函数保持原有全局暴露面，零行为差异。
   KW_TB/KW_PAGE_OPTS/_kwPage/_kwSize 无外部引用，收进模块作用域。 */
import { OPT } from './tagselect.js';
import { runAiAnalysis } from './ai.js';

/* ================= 关键词库（4 类 · 增删改入库 · FR-9）================= */
const KW_TB={seo:'tb-kw-seo',sem:'tb-kw-sem',high:'tb-kw-high',customer:'tb-kw-cust'};
// 6.23 文档 27：每页条数 per-type 可调（10/20/50/100/200/300）；持久化到 localStorage
const KW_PAGE_OPTS=[10,20,50,100,200,300];
const _kwPage={seo:0,sem:0,high:0,customer:0};
const _kwSize={seo:20,sem:20,high:20,customer:20};
try{ const saved=JSON.parse(localStorage.getItem('ferr:kwSize')||'null'); if(saved&&typeof saved==='object'){ ['seo','sem','high','customer'].forEach(t=>{ if(KW_PAGE_OPTS.includes(saved[t]))_kwSize[t]=saved[t]; }); } }catch(e){}
export function clsOf(kind,val){const o=(OPT[kind]||[]).find(x=>x[0]===val);return o?o[1]:'b-gray';}
export function kwRow(type,r){
  const a=r.attrs||{}; const tr=document.createElement('tr'); tr.dataset.id=r.id; tr.dataset.kwType=type; tr.dataset.cat=r.category||'';
  const aiBtn='<button class="btn-mini kw-ai"><i class="ti ti-bulb"></i> 分析意图</button>';
  const del='<button class="btn-mini kw-del csp-s-7ee38adc7c" title="删除"><i class="ti ti-trash"></i></button>';
  const ev=v=>v==null?'':v;
  const ed=(attr,val)=>`<td class="editable" contenteditable data-attr="${attr}">${esc(ev(val))}</td>`; // 可编辑→写入 attrs
  const ct=`<td class="dim csp-s-4a01f70563">${esc((r.created_at||'').slice(0,10))}</td>`; // 添加时间(只读，取 created_at)
  if(type==='seo'){
    tr.innerHTML=ct+`<td class="editable kw-name" contenteditable>${esc(r.keyword)}</td>`
      +`<td class="ctr"><span class="tagselect ${clsOf('intent',a.searchIntent)}" data-kind="intent">${esc(a.searchIntent||'选意图')}<i class="ti ti-chevron-down"></i></span></td>`
      +ed('gradeText',a.gradeText)+ed('volume',a.volume)+ed('gscRank',a.gscRank)+ed('landing',a.landing)+ed('spark',a.spark)
      +`<td class="ctr"><span class="tagselect ${clsOf('comp',a.comp)}" data-kind="comp">${esc(a.comp||'中 (30-60)')}<i class="ti ti-chevron-down"></i></span></td>`
      +`<td class="ctr"><span class="tagselect ${clsOf('optstatus',a.optstatus)}" data-kind="optstatus">${esc(a.optstatus||'优化中')}<i class="ti ti-chevron-down"></i></span></td>`
      +`<td class="ctr">${aiBtn} ${del}</td>`;
  }else if(type==='sem'){
    tr.innerHTML=ct+`<td class="editable" contenteditable data-cat="1">${esc(r.category||'')}</td>`
      +`<td class="editable kw-name" contenteditable>${esc(r.keyword)}</td>`
      +`<td class="ctr"><span class="tagselect ${clsOf('intent',a.searchIntent)}" data-kind="intent">${esc(a.searchIntent||'选意图')}<i class="ti ti-chevron-down"></i></span></td>`
      +`<td class="ctr"><span class="tagselect ${clsOf('match',a.match)}" data-kind="match">${esc(a.match||'词组匹配')}<i class="ti ti-chevron-down"></i></span></td>`
      +ed('landing',a.landing)
      +`<td class="ctr"><span class="tagselect ${clsOf('priority',a.priority)}" data-kind="priority">${esc(a.priority||'高')}<i class="ti ti-chevron-down"></i></span></td>`
      +`<td class="ctr">${aiBtn} ${del}</td>`;
  }else if(type==='high'){
    tr.innerHTML=ct+`<td class="editable kw-name" contenteditable>${esc(r.keyword)}</td>`
      +ed('ktype',a.ktype)+ed('channel',a.channel)+ed('inquiry',a.inquiry)+ed('gradeText',a.gradeText)
      +`<td class="ctr">${aiBtn} ${del}</td>`;
  }else{
    tr.innerHTML=ct+`<td class="editable kw-name" contenteditable>${esc(r.keyword)}</td>`
      +ed('sourceCustomer',a.sourceCustomer)+ed('mapped',a.mapped)
      +`<td class="ctr">${aiBtn} ${del}</td>`;
  }
  return tr;
}
/* 关键词单元格保存：data-attr → 写入 attrs；data-cat → 写入 category。失焦即存、失败回滚 */
document.addEventListener('focusin',e=>{ const c=e.target.closest&&e.target.closest('#panel-keywords td[contenteditable][data-attr],#panel-keywords td[contenteditable][data-cat]'); if(c)c._old=c.innerText; });
document.addEventListener('keydown',e=>{ if(e.key==='Enter'){ const c=e.target.closest&&e.target.closest('#panel-keywords td[contenteditable][data-attr],#panel-keywords td[contenteditable][data-cat]'); if(c){ e.preventDefault(); c.blur(); } } });
document.addEventListener('focusout',async e=>{
  const c=e.target.closest&&e.target.closest('#panel-keywords td[contenteditable][data-attr],#panel-keywords td[contenteditable][data-cat]'); if(!c)return;
  const tr=c.closest('tr'); if(!tr||!tr.dataset.id)return;
  const val=c.innerText.trim(); const oldVal=c._old!=null?c._old:c.innerText;
  if(val===String(oldVal).trim())return;
  const isCat=c.dataset.cat!=null; const body=isCat?{category:val}:{attrs:{[c.dataset.attr]:val}};
  try{ await API.patch('/api/keywords/'+tr.dataset.id,body); c._old=val; if(isCat){ tr.dataset.cat=val; renderCatTabs(tr.dataset.kwType); } }
  catch(err){ rollbackEditable(c,oldVal); toast(err.status===403?'无权修改，已恢复旧值':'保存失败，已恢复旧值'); }
});
/* 分类标签：渲染（按现有 category 去重）/ 筛选 / 新建 */
export function renderCatTabs(type){
  if(type!=='seo'&&type!=='sem')return;
  const sub=document.getElementById(type==='seo'?'sub-kw-seo':'sub-kw-sem'); const box=sub&&sub.querySelector('.cat-tabs'); const tb=document.getElementById(KW_TB[type]); if(!box||!tb)return;
  const active=(box.querySelector('.cat-tab.active')||{}).textContent; // 记住当前选中
  const cats=[...new Set([...tb.querySelectorAll('tr')].map(tr=>tr.dataset.cat).filter(Boolean))];
  box.innerHTML='<span class="cat-tab cat-all">全部</span>'+cats.map(c=>`<span class="cat-tab">${esc(c)}</span>`).join('')+'<span class="cat-tab add"><i class="ti ti-plus"></i> 新建分类</span>';
  const keep=[...box.querySelectorAll('.cat-tab')].find(x=>x.textContent.trim()===(active||'').trim())||box.querySelector('.cat-all');
  keep.classList.add('active'); filterKwByCat(type, keep.classList.contains('cat-all')?null:keep.textContent.trim());
}
export function filterKwByCat(type,cat){ _kwPage[type]=0; applyKwPaging(type); } // C-1：切分类回到第1页，可见性统一交给 applyKwPaging
/* C-1：统一计算可见行 = 命中当前分类(seo/sem) ∩ 当前页(每页20)；其余隐藏 */
export function applyKwPaging(type){
  const tb=document.getElementById(KW_TB[type]); if(!tb)return;
  const cat=(type==='seo'||type==='sem')?activeCat(type):null;
  const all=[...tb.querySelectorAll('tr')];
  const rows=all.filter(tr=>!cat||tr.dataset.cat===cat);
  const size=_kwSize[type]||20, total=rows.length, pages=Math.max(1,Math.ceil(total/size));
  let p=_kwPage[type]||0; if(p>pages-1)p=pages-1; if(p<0)p=0; _kwPage[type]=p;
  all.forEach(tr=>tr.style.display='none');
  rows.slice(p*size,(p+1)*size).forEach(tr=>tr.style.display='');
  renderKwPager(type,p,pages,total);
}
export function renderKwPager(type,p,pages,total){
  const tb=document.getElementById(KW_TB[type]); if(!tb)return;
  const card=tb.closest('.card')||(tb.closest('table')||{}).parentNode; if(!card)return;
  let pg=card.querySelector('.kw-pager'); if(!pg){ pg=document.createElement('div'); pg.className='kw-pager'; card.appendChild(pg); }
  // 6.23 文档 27：每页条数下拉常驻显示（即便单页/空表也方便切换）
  const sizeSel=`<select class="kw-pg-size" data-kwsize="${type}" title="每页条数">${KW_PAGE_OPTS.map(n=>`<option value="${n}"${n===_kwSize[type]?' selected':''}>${n}/页</option>`).join('')}</select>`;
  if(pages<=1){
    pg.innerHTML=(total?`<span class="kw-pg-info">共 ${total} 条</span>`:'<span class="kw-pg-info">暂无数据</span>')+sizeSel;
    return;
  }
  let btns=''; for(let i=0;i<pages;i++){ btns+=`<button class="kw-pg${i===p?' active':''}" data-kwpg="${type}" data-pg="${i}">${i+1}</button>`; }
  pg.innerHTML=`<button class="kw-pg" data-kwpg="${type}" data-pg="${p-1}"${p===0?' disabled':''}>‹</button>${btns}<button class="kw-pg" data-kwpg="${type}" data-pg="${p+1}"${p===pages-1?' disabled':''}>›</button><span class="kw-pg-info">共 ${total} 条 · 第 ${p+1}/${pages} 页</span>${sizeSel}`;
}
document.addEventListener('click',e=>{ const b=e.target.closest('[data-kwpg]'); if(!b||b.disabled)return; const type=b.dataset.kwpg; const pg=parseInt(b.dataset.pg,10); if(isNaN(pg))return; _kwPage[type]=pg; applyKwPaging(type); });
// 6.23 文档 27：每页条数下拉切换 → 改 size、回第1页、持久化
document.addEventListener('change',e=>{
  const sel=e.target.closest('[data-kwsize]'); if(!sel)return;
  const type=sel.dataset.kwsize; const n=parseInt(sel.value,10);
  if(!KW_PAGE_OPTS.includes(n))return;
  _kwSize[type]=n; _kwPage[type]=0;
  try{ localStorage.setItem('ferr:kwSize',JSON.stringify(_kwSize)); }catch(e){}
  applyKwPaging(type);
});
export function activeCat(type){ const sub=document.getElementById(type==='seo'?'sub-kw-seo':type==='sem'?'sub-kw-sem':null); const t=sub&&sub.querySelector('.cat-tab.active'); if(!t||t.classList.contains('cat-all')||t.classList.contains('add'))return null; return t.textContent.trim(); }
export async function loadKeywords(){
  try{
    const {items}=await API.get('/api/keywords');
    const byType={seo:[],sem:[],high:[],customer:[]};
    (items||[]).forEach(r=>{ if(byType[r.type])byType[r.type].push(r); });
    Object.keys(KW_TB).forEach(t=>{ const tb=document.getElementById(KW_TB[t]); if(!tb)return; tb.innerHTML=''; byType[t].forEach(r=>tb.appendChild(kwRow(t,r))); });
    renderSparklines(); renderCatTabs('seo'); renderCatTabs('sem'); applyKwPaging('high'); applyKwPaging('customer');
  }catch(e){ if(e&&e.message!=='unauthorized'){ Object.keys(KW_TB).forEach(t=>{const tb=document.getElementById(KW_TB[t]); if(tb)tb.innerHTML='';}); toast('关键词加载失败：'+(e.message||'未知错误')); } }
}
export async function addKeyword(type){
  try{
    const category=activeCat(type); // 当前选中的分类（若有）→ 新词归入该分类
    const {item}=await API.post('/api/keywords',{type,keyword:'新关键词',attrs:{},category});
    const tb=document.getElementById(KW_TB[type]); if(tb){ const tr=kwRow(type,item); tb.appendChild(tr); renderSparklines(); if(type==='seo'||type==='sem')renderCatTabs(type); _kwPage[type]=1e9; applyKwPaging(type); const c=tr.querySelector('.kw-name'); if(c){c.focus();placeCaretEnd(c);} }
    toast('已加一行 · 直接在表格里改');
  }catch(e){ toast(e.status===403?'无权操作':'保存失败：'+e.message); }
}
/* 通用就地两次点确认：第一次点→按钮变红「⚠️ 确认X」，3 秒内再点返回 true 执行，超时自动还原。
   用法：把 if(!confirm('…'))return; 换成 if(!inlineConfirm(btn,'确认删除'))return; */
export function inlineConfirm(btn,label){
  if(!btn)return true;
  if(btn.dataset.confirm==='1'){ // 第二次点：确认执行
    clearTimeout(btn._t); btn.dataset.confirm='';
    if(btn.dataset.old!=null)btn.innerHTML=btn.dataset.old;
    btn.classList.remove('confirming');
    return true;
  }
  btn.dataset.confirm='1'; if(btn.dataset.old==null)btn.dataset.old=btn.innerHTML;
  btn.innerHTML='<i class="ti ti-alert-triangle"></i> '+(label||'确认');
  btn.classList.add('confirming');
  clearTimeout(btn._t); btn._t=setTimeout(()=>{ btn.dataset.confirm=''; if(btn.dataset.old!=null)btn.innerHTML=btn.dataset.old; btn.classList.remove('confirming'); },3000);
  return false;
}
export async function kwDelete(tr,btn){
  if(!tr||!tr.dataset.id)return;
  if(btn&&btn.dataset.confirm!=='1'){ // 第一次点：就地变「确认删除」，3 秒内再点才真删（不再用顶部弹框）
    btn.dataset.confirm='1'; if(!btn.dataset.old)btn.dataset.old=btn.innerHTML;
    btn.innerHTML='<i class="ti ti-alert-triangle"></i> 确认删除'; btn.classList.add('confirming');
    clearTimeout(btn._t); btn._t=setTimeout(()=>{ btn.dataset.confirm=''; btn.innerHTML=btn.dataset.old; btn.classList.remove('confirming'); },3000);
    return;
  }
  if(btn)clearTimeout(btn._t);
  try{ const type=tr.dataset.kwType; await API.del('/api/keywords/'+tr.dataset.id); tr.remove(); if(type==='seo'||type==='sem')renderCatTabs(type); else applyKwPaging(type); toast('已删除 · 已入库'); }
  catch(e){ if(btn){ btn.dataset.confirm=''; btn.innerHTML=btn.dataset.old; btn.classList.remove('confirming'); } toast(e.status===403?'无权删除（该词库非你负责）':'删除失败：'+(e.message||'请求失败')); }
}
/* 关键词行：AI 按钮 / 删除 / 词文本编辑 委托处理 */
document.addEventListener('click',e=>{
  const ai=e.target.closest('.kw-ai'); if(ai){ const tr=ai.closest('tr'); const n=tr.querySelector('.kw-name'); const kw=(n?n.textContent:tr.cells[0].textContent).trim(); runAiAnalysis(ai,'分析关键词「'+kw+'」的搜索意图与落地建议','「'+kw+'」意图',false); return; }
  const del=e.target.closest('.kw-del'); if(del){ kwDelete(del.closest('tr'),del); return; }
});
// 关键词名编辑:focusin 缓存旧值 → Enter 触发 blur → 校验/保存中/成功/失败回滚
document.addEventListener('focusin',e=>{ const cell=e.target.closest&&e.target.closest('.kw-name'); if(cell)cell.dataset.kwOld=cell.textContent; });
document.addEventListener('keydown',e=>{ if(e.key==='Enter'){ const cell=e.target.closest&&e.target.closest('.kw-name'); if(cell){ e.preventDefault(); cell.blur(); } } });
document.addEventListener('focusout',async e=>{
  const cell=e.target.closest&&e.target.closest('.kw-name'); if(!cell)return; const tr=cell.closest('tr'); if(!tr||!tr.dataset.id)return;
  const oldVal=cell.dataset.kwOld!=null?cell.dataset.kwOld:cell.textContent;
  const vr=validateEditableValue(cell.textContent,'text',{nonempty:true,emptyMsg:'关键词不能为空'});
  if(!vr.ok){ rollbackEditable(cell,oldVal); showSaveError(cell,vr.msg); return; }   // 空值 → 回滚 + 提示
  const v=vr.value;
  if(v===String(oldVal).trim()){ cell.textContent=v; setSavingState(cell,null); return; } // 无变化:不请求
  setSavingState(cell,'saving');
  try{
    await API.patch('/api/keywords/'+tr.dataset.id,{keyword:v});
    cell.textContent=v; cell.dataset.kwOld=v; setSavingState(cell,'ok'); toast('已更新关键词 · 已入库');
  }catch(err){ rollbackEditable(cell,oldVal); showSaveError(cell,err.status===403?'无权限修改':'保存失败，已恢复旧值'); }
});
