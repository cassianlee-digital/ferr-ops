/* 询盘录入（真实弹框 + 持久化）（ES 模块 · esbuild 打包为 IIFE）。
   依赖（运行时解析，均由经典脚本或其他模块提供）：
   openModal()/closeModal()、window.API、esc()、toast()、formatLocalDate()、
   loadInquiries()、renderGlobe()（inquiry-globe.js）、loadArchive()（archive.js）。
   window._inqCache 由本模块初始化、loadInquiries() 填充，被 inquiry-globe.js / 图表 读取。

   ★ 2026-08-26 改版：Hero 左栏「最新询盘」表已删除，全页只剩一张表：
     表头第二行按列筛选 → 日期倒序连续列表（跨月插一条月份分隔行）→ 底部分页。
     筛选是纯前端的（区间内数据本就一次取全），不改接口；地图跟随筛选结果，
     顶栏 KPI / KPI 页圆环一律不受筛选影响（那是考核口径，不能被临时筛选改写）。
     筛选条件刻意不持久化：每次进页面是干净全量，避免「打开发现询盘少了一半」的误判。 */

import { loadDashboardInq } from './charts.js';
import { inlineConfirm } from './keywords.js';

/* ================= 询盘录入（真实弹框 + 持久化）================= */
const REGION_BADGE={'欧洲':'b-blue','西欧':'b-blue','南欧':'b-blue','北欧':'b-blue','中东欧':'b-teal','东欧/俄罗斯':'b-amber','俄罗斯':'b-amber','北美':'b-purple','拉美':'b-red','中东':'b-amber','北非':'b-amber','撒哈拉以南非洲':'b-gray','南亚':'b-teal','东南亚':'b-red','东南亚/巴西':'b-red','东亚':'b-green','中亚':'b-gray','大洋洲':'b-teal','其他':'b-gray'};
const CH_BADGE={'SEO自然':'b-blue','SEM付费':'b-purple','直接':'b-teal','其他':'b-gray'};
const PROD_BADGE={'铸造':'b-amber','锻造':'b-red','机加工':'b-blue','阀门':'b-purple','管件':'b-teal','电力金具':'b-green'};
export const GRADE_BADGE={A:'b-green',B:'b-blue',C:'b-gray'};
export const DEAL_BADGE={'已成交':'b-green','未成交':'b-gray'};
export const COMPANY_BADGE={'贝孚特':'b-teal','费尔瑞':'b-purple'};
window._inqCache=[];

export function openInquiry(){
  document.getElementById('f-date').value=new Date().toISOString().slice(0,10);
  ['f-country','f-code','f-sales','f-source','f-note'].forEach(i=>document.getElementById(i).value='');
  document.getElementById('f-deal').value='未成交'; // 每次打开都回默认，避免沿用上一条
  document.getElementById('f-company').value=''; // 公司不给默认值：没选就是没选，别替业务瞎归属
  openModal('inqMask');
}
export async function submitInquiry(){
  const g=id=>document.getElementById(id).value.trim();
  const rec={date:document.getElementById('f-date').value||new Date().toISOString().slice(0,10),
    customer_code:g('f-code'), // 录入改版：客户编码（可选，取代客户姓名）
    company:g('f-company'),salesperson:g('f-sales'),deal_status:g('f-deal'), // 公司 / 业务员 / 是否成交
    country:g('f-country')||'🏳️ 未填',region:g('f-region'),channel:g('f-channel'),
    source:g('f-source')||'待补',product:g('f-product'),grade:g('f-grade'),note:g('f-note')};
  try{
    const {item}=await API.post('/api/inquiries',rec);
    closeModal('inqMask');
    await loadInquiries(); // BUG-15：按当前时间区间重拉，统计/趋势/列表全部一致；不再用 POST 返回的全量 stats 污染显示
    loadDashboardInq(); // 6.23 文档 2：总览趋势独立缓存，新增询盘后也同步重绘
    if(window._curTab==='inquiry'){try{renderGlobe();}catch(e){}}
    toast('已保存 1 条询盘（'+item.grade+'级）· 已入库，多人共享');
  }catch(e){ toast(e.status===403?'无权录入（需登录运营账号：李/陈/主管/老板）':'保存失败：'+e.message); }
}
// 6.23 文档 7/8/9 + 录入改版：客户编码/业务员(editable) + 等级/是否成交 tagselect 可点改 + 上调标红(⚠️) + 跟踪反馈弹框。共 14 td。
export function isUpgraded(r){ const ord={A:3,B:2,C:1}; return r.original_grade && ord[r.original_grade] && ord[r.grade] && ord[r.original_grade]<ord[r.grade]; }
/* ===== 跟踪反馈：一条询盘可以有多条带时间的记录（2026-08-27 改版）=====
   以前是 PATCH tracking_feedback 覆盖式写一段话 —— 跟进三次也只剩最后一次，还不知道哪天写的。
   现在每次跟进都 POST 一条新记录，时间由服务端盖章；弹框里是完整时间线，加完不关窗，可以接着加。 */
let _trackEditing=null;
function fbList(r){ return (r&&Array.isArray(r.feedbacks))?r.feedbacks:[]; } // 服务端保证新的在前
// 服务端存的是 UTC 的 'YYYY-MM-DD HH:MM:SS'；转成本地时间显示，转不动就如实回退原文
function fbDate(iso,withTime){
  if(!iso)return '';
  const d=new Date(String(iso).replace(' ','T')+'Z');
  if(isNaN(d))return String(iso);
  const p=n=>String(n).padStart(2,'0');
  const md=p(d.getMonth()+1)+'-'+p(d.getDate());
  return withTime?(d.getFullYear()+'-'+md+' '+p(d.getHours())+':'+p(d.getMinutes())):md;
}
function fbDateLabel(f,withTime){
  // created_at 为 NULL = 老的单条 tracking_feedback 迁过来的，本来就没时间戳，不编日期
  return f.created_at?fbDate(f.created_at,withTime):'日期不详';
}
function renderTrackLog(){
  const box=document.getElementById('track-log'); if(!box)return;
  const list=fbList(_trackEditing);
  if(!list.length){ box.innerHTML='<div class="track-log-empty">还没有跟踪记录，在下面写第一条。</div>'; return; }
  box.innerHTML='<div class="track-log-head">跟踪记录 · '+list.length+' 条（新的在上）</div>'
    +list.map(f=>`<div class="track-item" data-fb="${f.id}">`
      +`<div class="track-item-meta"><span class="track-item-date${f.created_at?'':' track-item-nodate'}"><i class="ti ti-clock"></i>${esc(fbDateLabel(f,true))}</span>`
      +(f.created_by_name?`<span class="track-item-who">${esc(f.created_by_name)}</span>`:'')
      +`<button type="button" class="track-item-del" data-fb-del="${f.id}" title="删除这条记录"><i class="ti ti-trash"></i></button></div>`
      +`<div class="track-item-text">${esc(f.text)}</div></div>`).join('');
}
function openTrack(tr){
  const id=tr&&tr.dataset.id; if(!id)return;
  const it=(window._inqCache||[]).find(x=>String(x.id)===String(id)); if(!it)return;
  _trackEditing=it;
  document.getElementById('track-cust').textContent=it.customer_code||it.customer_name||it.country||('#'+it.id);
  document.getElementById('track-text').value='';
  renderTrackLog();
  openModal('trackMask'); setTimeout(()=>document.getElementById('track-text').focus(),50);
}
// 只重渲某行的跟踪反馈列；操作列位于其后，不能依赖 lastElementChild。
function repaintTrackCell(it){
  const tr=document.querySelector('.inq-tb tr[data-id="'+it.id+'"]');
  const cell=tr&&tr.querySelector('.inq-track-feedback');
  if(cell)cell.innerHTML=trackCellHtml(it);
}
export async function submitTrack(){
  if(!_trackEditing)return;
  const box=document.getElementById('track-text');
  const text=box.value.trim();
  if(!text){ toast('先写点内容再添加'); box.focus(); return; }
  try{
    const {item}=await API.post('/api/inquiries/'+_trackEditing.id+'/feedbacks',{text});
    _trackEditing.feedbacks=[item].concat(fbList(_trackEditing)); // 新的在前，与服务端排序一致
    box.value='';
    renderTrackLog();          // 弹框不关：跟进往往一次要补好几条
    repaintTrackCell(_trackEditing);
    renderInqTable();          // 「有/无反馈」筛选与计数同步
    box.focus();
    toast('已添加 1 条跟踪记录（'+fbDateLabel(item,false)+'）');
  }catch(e){ toast(e.status===403?'无权操作':'添加失败：'+(e.message||'')); }
}
// 委托：点单元格里的芯片/添加钮打开弹框
document.addEventListener('click',e=>{
  const t=e.target.closest('.inq-tb [data-track-open]'); if(!t)return;
  const tr=t.closest('tr'); if(tr)openTrack(tr);
});
// 委托：弹框内删除某条记录（写错了要能改回来，改版前那一条本来就是可编辑的）
document.addEventListener('click',async e=>{
  const btn=e.target.closest('#track-log [data-fb-del]'); if(!btn||!_trackEditing)return;
  if(!inlineConfirm(btn,'确认删除'))return;
  const fid=btn.dataset.fbDel;
  try{
    await API.del('/api/inquiries/'+_trackEditing.id+'/feedbacks/'+fid);
    _trackEditing.feedbacks=fbList(_trackEditing).filter(f=>String(f.id)!==String(fid));
    renderTrackLog();
    repaintTrackCell(_trackEditing);
    renderInqTable();
    toast('已删除该条跟踪记录');
  }catch(err){ toast(err&&err.status===403?'无权操作':'删除失败：'+(err.message||'')); }
});

/* 表格里的跟踪反馈格：**每条跟进各占一行、各带自己的日期、正文完整显示不截断**，
   最新的在最上（左侧竖条高亮），下面永远跟着「添加」按钮。整块可点，开的是同一个时间线弹框。
   不做行数截断是刻意的：跟踪反馈是给人读的证据，读不到就得点开，等于每条都多两下操作。
   代价是跟进多、话又长的那几行会明显变高——这是用行高换可读性，接受。 */
function trackCellHtml(r){
  const list=fbList(r);
  if(!list.length){
    return `<button type="button" class="track-add track-add-first" data-track-open><i class="ti ti-plus"></i>反馈</button>`;
  }
  const title=list.map(f=>fbDateLabel(f,true)+'　'+f.text).join('\n\n'); // 悬停给带时分的完整原文
  return `<div class="track-cell-wrap">`
    +`<button type="button" class="track-list" data-track-open title="${esc(title)}">`
      +list.map(f=>`<span class="track-line">`
        +`<span class="track-line-date${f.created_at?'':' track-line-nodate'}">${esc(fbDateLabel(f,false))}</span>`
        +`<span class="track-line-text">${esc(f.text)}</span>`
      +`</span>`).join('')
    +`</button>`
    +`<button type="button" class="track-add" data-track-open><i class="ti ti-plus"></i>添加<span class="track-count">${list.length}</span></button>`
    +`</div>`;
}
export function inqRowHtml(r){
  const up=isUpgraded(r);
  const upMark=up?` <i class="ti ti-alert-triangle csp-s-d6508e1886" title="等级已上调（原 ${esc(r.original_grade)} → 现 ${esc(r.grade)}） · 重点处理"></i>`:'';
  return `<td>${esc(r.date.slice(5))}</td>`
    +`<td class="editable" contenteditable data-field="customer_code">${esc(r.customer_code||'')}</td>`
    +`<td>${esc(r.country)}</td>`
    +`<td class="ctr"><span class="badge ${REGION_BADGE[r.region]||'b-gray'}">${esc(r.region)}</span></td>`
    +`<td class="ctr"><span class="tagselect ${CH_BADGE[r.channel]||'b-gray'}" data-kind="channel">${esc(r.channel)}<i class="ti ti-chevron-down"></i></span></td>`
    +`<td>${esc(r.source)}</td>`
    +`<td class="ctr"><span class="tagselect ${PROD_BADGE[r.product]||'b-gray'}" data-kind="product">${esc(r.product)}<i class="ti ti-chevron-down"></i></span></td>`
    +`<td class="ctr"><span class="tagselect ${GRADE_BADGE[r.grade]||'b-gray'}" data-kind="grade">${esc(r.grade)}<i class="ti ti-chevron-down"></i></span>${upMark}</td>`
    +`<td class="ctr"><span class="tagselect ${COMPANY_BADGE[r.company]||'b-gray'}" data-kind="company">${esc(r.company||'未标注')}<i class="ti ti-chevron-down"></i></span></td>`
    +`<td class="ctr editable" contenteditable data-field="salesperson">${esc(r.salesperson||'')}</td>`
    +`<td class="ctr"><span class="tagselect ${DEAL_BADGE[r.deal_status]||'b-gray'}" data-kind="deal">${esc(r.deal_status||'未标记')}<i class="ti ti-chevron-down"></i></span></td>`
    +`<td class="dim csp-s-33ee298127">${esc(r.note||'')}</td>`
    +`<td class="ctr inq-track-feedback">${trackCellHtml(r)}</td>`
    +`<td class="ctr"><button class="btn-mini inq-del csp-s-7ee38adc7c" title="删除（归档到归档页）"><i class="ti ti-trash"></i></button></td>`;
}
function monthLabel(ym){ const p=ym.split('-'); return p[0]+'年'+(+p[1])+'月'; }

/* ================= 表头筛选 + 分页（2026-08-26 新增）=================
   14 列与表头一一对应；日期列不给筛选（时间条已经在管时间），操作列放「清空」。
   select 的候选值只列「当前区间数据里真实出现过的」——不臆造选项，选了必有结果。 */
const BLANK='__blank__'; // 空值哨兵：区别于「没筛选」，用来专门筛「没填的那些」
const FILTER_COLS=[
  null,
  {key:'customer_code',type:'text',ph:'客户编码'},
  {key:'country',type:'select',ph:'国家',blank:'未填'},
  {key:'region',type:'select',ph:'大区',blank:'未填'},
  {key:'channel',type:'select',ph:'渠道',blank:'未填'},
  {key:'source',type:'text',ph:'来源词'},
  {key:'product',type:'select',ph:'产品',blank:'未填'},
  {key:'grade',type:'select',ph:'等级'},
  {key:'company',type:'select',ph:'公司',blank:'未标注'},
  {key:'salesperson',type:'select',ph:'业务员',blank:'未填'},
  {key:'deal_status',type:'select',ph:'是否成交',blank:'未标记'},
  {key:'note',type:'text',ph:'备注'},
  {key:'feedbacks',type:'has',ph:'反馈'}, // 有没有跟进记录（数组，不是文本列）
  {key:'__clear',type:'clear'}
];
const FILTERS={};                     // key -> 已选值（'' = 该列未筛选）；刻意不写 localStorage
const PAGE_SIZES=[20,50,100];
let _page=1;
let _pageSize=(()=>{ try{ const n=+localStorage.getItem('ferr:inqPageSize'); return PAGE_SIZES.indexOf(n)>=0?n:50; }catch(e){ return 50; } })();

function isBlank(v){ return v==null||String(v).trim()===''; }
function activeFilterCount(){ return Object.keys(FILTERS).filter(k=>FILTERS[k]!=='' && FILTERS[k]!=null).length; }
function matches(r){
  for(const col of FILTER_COLS){
    if(!col||col.type==='clear')continue;
    const want=FILTERS[col.key];
    if(want==null||want==='')continue;
    const val=r[col.key];
    if(col.type==='text'){ if(String(val||'').toLowerCase().indexOf(String(want).toLowerCase())<0)return false; }
    else if(col.type==='has'){ const yes=Array.isArray(val)?val.length>0:!isBlank(val); if((want==='有')!==yes)return false; }
    else { if(want===BLANK){ if(!isBlank(val))return false; } else if(String(val||'')!==want)return false; }
  }
  return true;
}
/* 当前筛选后的询盘（日期倒序）。地图与计数都读它 —— 一处口径，表格和地图不会打架。 */
export function filteredInquiries(){
  const rows=(window._inqCache||[]).filter(r=>r&&r.date&&matches(r));
  // 服务端已按 date DESC,id DESC 返回；这里用稳定排序按日期再兜一次，同日顺序保持不变
  return rows.slice().sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);
}
function optionsFor(col){
  const seen=new Map(); let blanks=0;
  (window._inqCache||[]).forEach(r=>{
    const v=r&&r[col.key];
    if(isBlank(v)){ blanks++; return; }
    const s=String(v); seen.set(s,(seen.get(s)||0)+1);
  });
  const list=[...seen.keys()].sort((a,b)=>a.localeCompare(b,'zh-Hans-CN'));
  const out=list.map(v=>({value:v,label:v}));
  if(blanks&&col.blank)out.push({value:BLANK,label:col.blank});
  return out;
}
export function renderInqFilterRow(){
  const row=document.getElementById('inqFilterRow'); if(!row)return;
  row.innerHTML=FILTER_COLS.map(col=>{
    if(!col)return '<td class="inq-f-none"></td>';
    if(col.type==='clear'){
      const n=activeFilterCount();
      return `<td class="ctr"><button type="button" class="inq-f-clear${n?' on':''}" data-inq-clear title="清空全部筛选条件"><i class="ti ti-filter-off"></i>${n?' '+n:''}</button></td>`;
    }
    const cur=FILTERS[col.key]||'';
    if(col.type==='text')
      return `<td><input type="search" class="inq-f-input" data-inq-filter="${col.key}" placeholder="${esc(col.ph)}" value="${esc(cur)}"></td>`;
    const opts=col.type==='has'
      ?[{value:'有',label:'有反馈'},{value:'无',label:'无反馈'}]
      :optionsFor(col);
    return `<td class="ctr"><select class="inq-f-select${cur?' on':''}" data-inq-filter="${col.key}">`
      +`<option value="">${esc(col.ph)}</option>`
      +opts.map(o=>`<option value="${esc(o.value)}"${o.value===cur?' selected':''}>${esc(o.label)}</option>`).join('')
      +'</select></td>';
  }).join('');
  // 渲染完再显式回写一遍值：浏览器有「刷新后恢复表单控件」的行为，
  // 一旦它把某个下拉恢复成别的选项，界面就会和 FILTERS 对不上（表格明明筛着，控件却显示没筛，或反过来）。
  // 以 FILTERS 为唯一真相强制覆盖，杜绝「莫名其妙少了一半询盘」。
  row.querySelectorAll('[data-inq-filter]').forEach(el=>{ el.value=FILTERS[el.dataset.inqFilter]||''; });
}
/* 只更新「清空筛选」按钮的角标：文本输入时不重建整行，但角标得跟上 */
function syncClearBadge(){
  const btn=document.querySelector('#inqFilterRow .inq-f-clear'); if(!btn)return;
  const n=activeFilterCount();
  btn.classList.toggle('on',!!n);
  btn.innerHTML='<i class="ti ti-filter-off"></i>'+(n?' '+n:'');
}
function renderInqSummary(total,shown){
  const el=document.getElementById('inqSummary'); if(!el)return;
  const n=activeFilterCount();
  if(!n){ el.innerHTML=`<span class="dim">共 ${total} 条询盘</span>`; return; }
  el.innerHTML=`<span class="inq-filtered"><i class="ti ti-filter"></i> 已筛选 <b>${shown}</b> / ${total} 条</span>`
    +`<button type="button" class="inq-f-clear-link" data-inq-clear>清空筛选</button>`;
}
function pageNumbers(page,pages){
  if(pages<=7)return Array.from({length:pages},(_,i)=>i+1);
  const out=[1];
  let s=Math.max(2,page-1), e=Math.min(pages-1,page+1);
  if(page<=3){ s=2; e=4; }
  if(page>=pages-2){ s=pages-3; e=pages-1; }
  if(s>2)out.push('…');
  for(let i=s;i<=e;i++)out.push(i);
  if(e<pages-1)out.push('…');
  out.push(pages);
  return out;
}
function renderInqPager(total,pages,from,to){
  const el=document.getElementById('inqPager'); if(!el)return;
  if(!total){ el.innerHTML=''; return; }
  const nums=pageNumbers(_page,pages).map(n=>n==='…'
    ?'<span class="pg-gap">…</span>'
    :`<button type="button" class="pg-num${n===_page?' on':''}" data-inq-page="${n}">${n}</button>`).join('');
  el.innerHTML=`<span class="pg-info">第 ${from}-${to} 条 · 共 ${total} 条 · ${pages} 页</span>`
    +`<span class="pg-mid">`
    +`<button type="button" class="pg-num" data-inq-page="${_page-1}"${_page<=1?' disabled':''}><i class="ti ti-chevron-left"></i></button>`
    +nums
    +`<button type="button" class="pg-num" data-inq-page="${_page+1}"${_page>=pages?' disabled':''}><i class="ti ti-chevron-right"></i></button>`
    +`</span>`
    +`<span class="pg-size">每页 <select data-inq-size>`
    +PAGE_SIZES.map(n=>`<option value="${n}"${n===_pageSize?' selected':''}>${n}</option>`).join('')
    +`</select> 条</span>`;
}
/* P3：询盘删除 → 就地确认 → 软删归档（进归档页「询盘」桶）→ 重拉列表/统计/总览/归档 */
document.addEventListener('click',async e=>{
  const btn=e.target.closest('.inq-tb .inq-del'); if(!btn)return;
  const tr=btn.closest('tr'); const id=tr&&tr.dataset.id; if(!id)return;
  if(!inlineConfirm(btn,'确认删除'))return;
  try{
    await API.del('/api/inquiries/'+id);
    await loadInquiries();   // 列表/统计随之刷新（已归档项被排除）
    loadDashboardInq();      // 总览当月趋势同步
    if(window._curTab==='archive'){try{loadArchive();}catch(_){}}
    toast('已删除 · 已归档到「归档」页');
  }catch(err){ toast(err&&err.status===403?'无权操作':'删除失败：'+(err.message||'请求失败')); }
});
/* 唯一一张询盘表：筛选 → 日期倒序 → 分页 → 跨月插月份分隔行。
   月份分隔行只是视觉分段（不再折叠）：翻页后每页开头都会带上本页第一条所属月份，不会「不知道自己看的是哪个月」。 */
export function renderInqList(){
  renderInqFilterRow();   // 下拉候选随数据变；文本输入时不走这里，免得重渲把光标顶掉
  renderInqTable();
}
function renderInqTable(){
  const tb=document.getElementById('tb-inq'); if(!tb)return;
  syncClearBadge();
  const total=(window._inqCache||[]).filter(r=>r&&r.date).length;
  const rows=filteredInquiries();
  const pages=Math.max(1,Math.ceil(rows.length/_pageSize));
  if(_page>pages)_page=pages;
  if(_page<1)_page=1;
  renderInqSummary(total,rows.length);
  tb.innerHTML='';
  if(!rows.length){
    const why=activeFilterCount()?'当前筛选条件下没有询盘 —— 换个条件或点右上角「清空筛选」':'所选时间区间暂无询盘';
    tb.innerHTML=`<tr><td colspan="14" class="dim csp-s-d48bfa87bb">${why}</td></tr>`;
    renderInqPager(0,1,0,0);
    return;
  }
  const start=(_page-1)*_pageSize, slice=rows.slice(start,start+_pageSize);
  let curMonth=null;
  slice.forEach(r=>{
    const ym=r.date.slice(0,7);
    if(ym!==curMonth){
      curMonth=ym;
      const n=rows.filter(x=>x.date.slice(0,7)===ym).length; // 当前筛选下该月总条数（不只本页）
      const sep=document.createElement('tr');
      sep.className='inq-msep'; sep.dataset.month=ym;
      sep.innerHTML=`<td colspan="14"><i class="ti ti-calendar-month hicon"></i> ${esc(monthLabel(ym))} <span class="dim csp-s-8bde36d0d6">· ${n} 条</span></td>`;
      tb.appendChild(sep);
    }
    const tr=document.createElement('tr');
    tr.className='inq-mrow'+(isUpgraded(r)?' inq-upgraded':''); // 6.23 文档 9：上调行加红色左边框
    tr.dataset.month=ym;
    // 6.23 文档 7/8 + 录入改版：行级 dataset 让 PATCH 链路通（等级/是否成交 tagselect / 客户编码·业务员 editable / 跟踪反馈弹框）
    if(r.id){ tr.dataset.id=r.id; tr.dataset.ep='/api/inquiries'; }
    tr.innerHTML=inqRowHtml(r);
    tb.appendChild(tr);
  });
  renderInqPager(rows.length,pages,start+1,start+slice.length);
}
/* 筛选变化 → 回第 1 页 → 重渲表格 + 地图（地图只跟筛选，不跟分页：翻页不该让地图闪）。
   full=true 才重渲筛选行本身（下拉候选可能变）；文本输入时 false，否则输入框会被重建、光标丢失。 */
function afterFilterChange(full){
  _page=1;
  if(full)renderInqList(); else renderInqTable();
  if(window._curTab==='inquiry'){ try{ renderGlobe(); }catch(e){} }
}
document.addEventListener('input',e=>{
  const el=e.target.closest('#inqFilterRow input[data-inq-filter]'); if(!el)return;
  FILTERS[el.dataset.inqFilter]=el.value.trim();
  afterFilterChange(false);
});
document.addEventListener('change',e=>{
  const sel=e.target.closest('#inqFilterRow select[data-inq-filter]');
  if(sel){ FILTERS[sel.dataset.inqFilter]=sel.value; sel.classList.toggle('on',!!sel.value); afterFilterChange(false); return; }
  const size=e.target.closest('#inqPager [data-inq-size]');
  if(size){ _pageSize=+size.value||50; try{ localStorage.setItem('ferr:inqPageSize',String(_pageSize)); }catch(_){} _page=1; renderInqTable(); }
});
document.addEventListener('click',e=>{
  const clear=e.target.closest('[data-inq-clear]');
  if(clear){ Object.keys(FILTERS).forEach(k=>delete FILTERS[k]); afterFilterChange(true); toast('已清空询盘筛选'); return; }
  const pg=e.target.closest('#inqPager [data-inq-page]');
  if(pg&&!pg.disabled){
    const n=+pg.dataset.inqPage; if(!n||n===_page)return;
    _page=n; renderInqTable(); // 翻页不动筛选行、不动地图
    const tbl=document.querySelector('#panel-inquiry .inq-table');
    if(tbl)tbl.scrollIntoView({block:'start',behavior:'smooth'});
  }
});
// 条目 13：metric-row 四框已删（顶栏 KPI pill 已覆盖三个）。
// 保留 stats 写入 _inqStats 缓存，供其他地方读取；不再回填已删除的 DOM。
export function refreshInqStats(stats){
  if(stats)window._inqStats=stats;
}
