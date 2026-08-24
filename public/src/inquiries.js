/* 询盘录入（真实弹框 + 持久化）（ES 模块 · esbuild 打包为 IIFE）。
   依赖（运行时解析，均由经典脚本或其他模块提供）：
   openModal()/closeModal()、window.API、esc()、toast()、formatLocalDate()、
   loadInquiries()、renderGlobe()（inquiry-globe.js）、loadArchive()（archive.js）。
   window._inqCache 由本模块初始化、loadInquiries() 填充，被 inquiry-globe.js / 图表 读取。
   仅 app.js 真实调用的 6 个入口由 main.js 挂到 window；行渲染辅助只供模块间显式导入。 */

import { loadDashboardInq } from './charts.js';
import { inlineConfirm } from './keywords.js';

/* ================= 询盘录入（真实弹框 + 持久化）================= */
const REGION_BADGE={'欧洲':'b-blue','西欧':'b-blue','南欧':'b-blue','北欧':'b-blue','中东欧':'b-teal','东欧/俄罗斯':'b-amber','俄罗斯':'b-amber','北美':'b-purple','拉美':'b-red','中东':'b-amber','北非':'b-amber','撒哈拉以南非洲':'b-gray','南亚':'b-teal','东南亚':'b-red','东南亚/巴西':'b-red','东亚':'b-green','中亚':'b-gray','大洋洲':'b-teal','其他':'b-gray'};
const CH_BADGE={'SEO自然':'b-blue','SEM付费':'b-purple','直接':'b-teal','其他':'b-gray'};
const PROD_BADGE={'铸造':'b-amber','锻造':'b-red','机加工':'b-blue','阀门':'b-purple','管件':'b-teal'};
export const GRADE_BADGE={A:'b-green',B:'b-blue',C:'b-gray'};
export const DEAL_BADGE={'已成交':'b-green','未成交':'b-gray'};
window._inqCache=[];

export function openInquiry(){
  document.getElementById('f-date').value=new Date().toISOString().slice(0,10);
  ['f-country','f-code','f-sales','f-source','f-note'].forEach(i=>document.getElementById(i).value='');
  document.getElementById('f-deal').value='未成交'; // 每次打开都回默认，避免沿用上一条
  openModal('inqMask');
}
export async function submitInquiry(){
  const g=id=>document.getElementById(id).value.trim();
  const rec={date:document.getElementById('f-date').value||new Date().toISOString().slice(0,10),
    customer_code:g('f-code'), // 录入改版：客户编码（可选，取代客户姓名）
    salesperson:g('f-sales'),deal_status:g('f-deal'), // 业务员 / 是否成交
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
// 6.23 文档 7/8/9 + 录入改版：客户编码/业务员(editable) + 等级/是否成交 tagselect 可点改 + 上调标红(⚠️) + 跟踪反馈点开编辑。共 13 td。
export function isUpgraded(r){ const ord={A:3,B:2,C:1}; return r.original_grade && ord[r.original_grade] && ord[r.grade] && ord[r.original_grade]<ord[r.grade]; }
/* 6.23 文档 7：跟踪反馈点开弹框 → PATCH → 同步缓存 + 重渲该 td */
let _trackEditing=null;
function openTrack(tr){
  const id=tr&&tr.dataset.id; if(!id)return;
  const it=(window._inqCache||[]).find(x=>String(x.id)===String(id)); if(!it)return;
  _trackEditing=it;
  document.getElementById('track-cust').textContent=it.customer_code||it.customer_name||it.country||('#'+it.id);
  document.getElementById('track-text').value=it.tracking_feedback||'';
  openModal('trackMask'); setTimeout(()=>document.getElementById('track-text').focus(),50);
}
export async function submitTrack(){
  if(!_trackEditing)return;
  const text=document.getElementById('track-text').value.trim();
  try{
    await API.patch('/api/inquiries/'+_trackEditing.id,{tracking_feedback:text});
    _trackEditing.tracking_feedback=text;
    // 只重渲跟踪反馈列；操作列位于其后，不能依赖 lastElementChild。
    const tr=document.querySelector('.inq-tb tr[data-id="'+_trackEditing.id+'"]');
    const cell=tr&&tr.querySelector('.inq-track-feedback');
    if(cell)cell.innerHTML=trackCellHtml(_trackEditing);
    closeModal('trackMask'); toast('已保存跟踪反馈');
  }catch(e){ toast(e.status===403?'无权操作':'保存失败：'+(e.message||'')); }
}
// 委托：点 .track-cell 打开弹框
document.addEventListener('click',e=>{
  const t=e.target.closest('.inq-tb .track-cell'); if(!t)return;
  const tr=t.closest('tr'); if(tr)openTrack(tr);
});

function trackCellHtml(r){
  const has=(r.tracking_feedback||'').trim();
  if(has){
    const short=has.length>15?has.slice(0,15)+'…':has; // CSS max-width 120px 兜底；这里也截一刀防极长串撑 DOM
    return `<span class="track-cell" title="${esc(has)}"><i class="ti ti-message-2"></i>${esc(short)}</span>`;
  }
  return `<span class="track-cell track-empty"><i class="ti ti-plus"></i>反馈</span>`;
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
    +`<td class="ctr editable" contenteditable data-field="salesperson">${esc(r.salesperson||'')}</td>`
    +`<td class="ctr"><span class="tagselect ${DEAL_BADGE[r.deal_status]||'b-gray'}" data-kind="deal">${esc(r.deal_status||'未标记')}<i class="ti ti-chevron-down"></i></span></td>`
    +`<td class="dim csp-s-33ee298127">${esc(r.note||'')}</td>`
    +`<td class="ctr inq-track-feedback">${trackCellHtml(r)}</td>`
    +`<td class="ctr"><button class="btn-mini inq-del csp-s-7ee38adc7c" title="删除（归档到归档页）"><i class="ti ti-trash"></i></button></td>`;
}
function monthLabel(ym){ const p=ym.split('-'); return p[0]+'年'+(+p[1])+'月'; }
function latestVisibleMonth(){
  return (window._inqCache||[]).reduce((latest,row)=>row&&/^\d{4}-\d{2}-\d{2}$/.test(row.date||'')&&row.date.slice(0,7)>latest?row.date.slice(0,7):latest,'');
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
/* 明细表(下方)：只渲染「之前月份」，当月不在此显示（当月见上方「最新询盘」表）。
   历史月份按月分组、默认折叠（点月份条展开/收起）。*/
export function renderInqList(){
  const tb=document.getElementById('tb-inq'); if(!tb)return; tb.innerHTML='';
  const latestMonth=latestVisibleMonth();
  const rows=(window._inqCache||[]).filter(r=>r&&r.date&&r.date.slice(0,7)!==latestMonth).slice().sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);
  if(!rows.length){ tb.innerHTML='<tr><td colspan="13" class="dim csp-s-d48bfa87bb">所选区间暂无更早月份询盘</td></tr>'; return; }
  const groups=[]; const idx={};
  rows.forEach(r=>{ const ym=r.date.slice(0,7); if(idx[ym]==null){ idx[ym]=groups.length; groups.push({ym,items:[]}); } groups[idx[ym]].items.push(r); });
  groups.forEach(g=>{
    const sep=document.createElement('tr'); sep.className='inq-msep collapsed'; sep.dataset.month=g.ym;
    sep.innerHTML=`<td colspan="13" class="inq-month-toggle"><i class="ti ti-chevron-down hicon"></i> ${esc(monthLabel(g.ym))} <span class="dim csp-s-8bde36d0d6">· ${g.items.length} 条</span></td>`;
    sep.querySelector('.inq-month-toggle').addEventListener('click',e=>toggleInqMonth(e.currentTarget));
    tb.appendChild(sep);
    g.items.forEach(r=>{
      const tr=document.createElement('tr');
      tr.className='inq-mrow'+(isUpgraded(r)?' inq-upgraded':''); // 6.23 文档 9：上调行加红色左边框
      tr.dataset.month=g.ym;
      // 6.23 文档 7/8 + 录入改版：行级 dataset 让 PATCH 链路通（等级/是否成交 tagselect / 客户编码·业务员 editable / 跟踪反馈弹框）
      if(r.id){ tr.dataset.id=r.id; tr.dataset.ep='/api/inquiries'; }
      tr.style.display='none'; // 历史月份默认折叠
      tr.innerHTML=inqRowHtml(r);
      tb.appendChild(tr);
    });
  });
}
function toggleInqMonth(td){
  const sep=td.closest('tr'); if(!sep)return; sep.classList.toggle('collapsed');
  const hidden=sep.classList.contains('collapsed');
  let n=sep.nextElementSibling;
  while(n&&!n.classList.contains('inq-msep')){ if(n.classList.contains('inq-mrow'))n.style.display=hidden?'none':''; n=n.nextElementSibling; }
}
// 条目 13：metric-row 四框已删（顶栏 KPI pill 已覆盖三个，询盘总量看月份折叠分隔行）。
// 保留 stats 写入 _inqStats 缓存，供其他地方读取；不再回填已删除的 DOM。
export function refreshInqStats(stats){
  if(stats)window._inqStats=stats;
}
/* 「最新询盘」(上方左栏)：只渲染「当月」，表格形式、与下方明细表同款（同 inqRowHtml，可编辑/评级/跟踪/删除）。
   询盘多时容器内下滑显示。*/
export function renderInqFeed(){
  const tb=document.getElementById('tb-inq-cur'); if(!tb)return; tb.innerHTML='';
  const latestMonth=latestVisibleMonth();
  const rows=(window._inqCache||[]).filter(r=>r&&r.date&&r.date.slice(0,7)===latestMonth).slice().sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);
  const cnt=document.getElementById('inqFeedCount'); if(cnt)cnt.textContent=rows.length?(monthLabel(latestMonth)+' · '+rows.length+' 条'):'所选区间暂无';
  if(!rows.length){ tb.innerHTML='<tr><td colspan="13" class="dim csp-s-651d52088e">所选区间暂无询盘</td></tr>'; return; }
  const p=latestMonth.split('-');
  const sep=document.createElement('tr'); sep.className='inq-msep'; sep.dataset.month=latestMonth;
  sep.innerHTML=`<td colspan="13" class="inq-month-toggle"><i class="ti ti-chevron-down hicon"></i> ${p[0]}年${(+p[1])}月 <span class="dim csp-s-8bde36d0d6">· ${rows.length} 条</span><span class="badge b-green csp-s-4b17347c23">区间最新</span></td>`;
  sep.querySelector('.inq-month-toggle').addEventListener('click',e=>toggleInqMonth(e.currentTarget));
  tb.appendChild(sep);
  rows.forEach(r=>{
    const tr=document.createElement('tr');
    tr.className='inq-mrow'+(isUpgraded(r)?' inq-upgraded':'');
    tr.dataset.month=latestMonth;
    if(r.id){ tr.dataset.id=r.id; tr.dataset.ep='/api/inquiries'; }
    tr.innerHTML=inqRowHtml(r);
    tb.appendChild(tr);
  });
}
