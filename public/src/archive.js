/* 归档②：行级归档/沉淀委托 + 归档页加载（ES 模块 · esbuild 打包为 IIFE）。
   运行时依赖的全局（均在事件/调用时解析，仍由经典脚本或内联提供）：
   API、esc()、toast()、inlineConfirm()（keywords.js）、persistLoop()/depRowHtml()（closed-loop.js）、
   loadInquiries()、window.ME。
   仅 loadArchive 需挂 window（index.html 路由切换 + inquiries.js 调用）；
   archRowHtml/archInqRowHtml/deriveAk 无外部引用，收进模块作用域。
   两个 click 委托在模块求值时注册（bundle 为经典脚本，时机与旧脚本一致）。 */

import { GRADE_BADGE } from './inquiries.js';
import { loadDashboardInq } from './charts.js';

/* 归档②：行级「沉淀 / 归档」按钮事件委托——整改/测试/计划 通用 */
document.addEventListener('click',async e=>{
  const arc=e.target.closest('.row-archive');
  const dep=e.target.closest('.row-dep');
  if(!arc&&!dep)return;
  const tr=(arc||dep).closest('tr'); if(!tr)return;
  const id=tr.dataset.id, ep=tr.dataset.ep; if(!id||!ep)return;
  // 推 archive_kind：先看行 dept tag，再按所在表 id 推断；fixes 行 dept=SEM/SEO
  const dEl=tr.querySelector('[data-kind="dept"]');
  const deptTxt=dEl?dEl.textContent.trim():'';
  const isSem=deptTxt==='SEM'||/sem/i.test(tr.parentElement&&tr.parentElement.id||'');
  const isCompany=deptTxt==='公司';
  const ak=isCompany?'company':(isSem?'sem':'seo');
  // 整改/计划/测试都有 content/title 列；取行首单元格的文本作为内容
  const content=(tr.querySelector('[data-field="content"]')||tr.querySelector('[data-field="title"]')||tr.cells[0]).innerText.trim();
  if(arc){
    if(!inlineConfirm(arc,'确认归档'))return;
    arc.disabled=true;
    try{ await API.post(ep+'/'+id+'/archive',{archive_kind:ak}); tr.remove(); toast('已归档'); }
    catch(err){ arc.disabled=false; toast(err.status===403?'无权操作':'归档失败：'+(err.message||'请求失败')); }
  } else if(dep){
    dep.disabled=true;
    try{
      const s={dept:isCompany?'公司':(isSem?'SEM':'SEO'),owner:isSem?'陈':'李',c:isSem?'b-purple':'b-blue'};
      const {item}=await persistLoop('deposit',s,content,'沉淀');
      // 在沉淀表插入一行（如果当前已加载）
      const depTb=document.getElementById('tb-dep');
      if(depTb){ const ntr=document.createElement('tr'); ntr.dataset.id=item.id; ntr.dataset.ep='/api/loop-items'; ntr.innerHTML=depRowHtml(item); depTb.insertBefore(ntr,depTb.firstChild); const de=document.getElementById('dep-empty'); if(de)de.style.display='none'; }
      dep.disabled=false; toast('已沉淀到沉淀表 · 已入库');
    }catch(err){ dep.disabled=false; toast(err.status===403?'无权操作':'沉淀失败：'+(err.message||'请求失败')); }
  }
});

/* 归档②：加载归档页（三 subtab 分桶）+ 操作（恢复 / 彻底删除-仅 boss） */
function archRowHtml(it,from){
  const date=(it.archived_at||'').slice(0,10);
  const dept=it.dept||'—';
  const content=esc(it.content||it.title||it.detail||'');
  const fromBadge='<span class="badge '+(from==='fix'?'b-amber':'b-blue')+'">'+(from==='fix'?'整改':(it.kind==='task'?'任务':(it.kind==='plan'?'计划':(it.kind==='test'?'测试':(it.kind==='deposit'?'沉淀':'闭环')))))+'</span>';
  const isBoss=(window.ME||{}).role==='boss';
  const ops='<button class="btn-mini arch-restore" title="恢复到原页"><i class="ti ti-rotate"></i> 恢复</button>'
    +(isBoss?' <button class="btn-mini arch-hard csp-s-b0e08465c2" title="彻底删除（不可恢复）"><i class="ti ti-trash"></i> 彻底删除</button>':'');
  return `<td class="archive-date num">${esc(date||'—')}</td><td class="archive-source ctr">${fromBadge}</td><td class="archive-content"><span class="archive-text" title="${content}">${content}</span></td><td class="archive-dept ctr">${esc(dept)}</td><td class="archive-actions ctr">${ops}</td>`;
}
// P3：询盘归档行（7 列，对齐 #sub-arc-inquiry 表头）；恢复/彻删复用 arch-restore/arch-hard 委托
function archInqRowHtml(it){
  const date=(it.archived_at||'').slice(0,10);
  const isBoss=(window.ME||{}).role==='boss';
  const ops='<button class="btn-mini arch-restore" title="恢复到询盘列表"><i class="ti ti-rotate"></i> 恢复</button>'
    +(isBoss?' <button class="btn-mini arch-hard csp-s-b0e08465c2" title="彻底删除（不可恢复）"><i class="ti ti-trash"></i> 彻底删除</button>':'');
  const cust=(it.customer_name?esc(it.customer_name)+' · ':'')+esc(it.country||'');
  const source=esc(it.source||'');
  return `<td class="archive-date num">${esc(date||'—')}</td><td class="archive-short-date num">${esc((it.date||'').slice(5))}</td><td class="archive-customer"><span class="archive-text" title="${cust}">${cust}</span></td><td class="archive-source-term dim"><span class="archive-text" title="${source}">${source}</span></td><td class="archive-grade ctr"><span class="badge ${GRADE_BADGE[it.grade]||'b-gray'}">${esc(it.grade||'')}</span></td><td class="archive-channel ctr dim">${esc(it.channel||'')}</td><td class="archive-actions ctr">${ops}</td>`;
}
export async function loadArchive(){
  // 拉两类归档：fixes 与 loop_items
  const bucket={sem:[],seo:[],company:[]};
  try{
    const {items}=await API.get('/api/fixes?archived=1');
    (items||[]).forEach(f=>{ const k=f.archive_kind||deriveAk(f.dept); if(bucket[k])bucket[k].push({...f,_from:'fix'}); });
  }catch(e){}
  try{
    const {items}=await API.get('/api/loop-items?archived=1');
    (items||[]).forEach(it=>{ const k=it.archive_kind||deriveAk(it.dept); if(bucket[k])bucket[k].push({...it,_from:'loop'}); });
  }catch(e){}
  ['sem','seo','company'].forEach(k=>{
    const tb=document.getElementById('tb-arc-'+k); if(!tb)return; tb.innerHTML='';
    const rows=bucket[k].slice().sort((a,b)=>String(b.archived_at||'').localeCompare(String(a.archived_at||'')));
    rows.forEach(it=>{ const tr=document.createElement('tr'); tr.dataset.id=it.id; tr.dataset.ep=it._from==='fix'?'/api/fixes':'/api/loop-items'; tr.innerHTML=archRowHtml(it,it._from); tb.appendChild(tr); });
    const e=document.getElementById('arc-'+k+'-empty'); if(e)e.style.display=rows.length?'none':'block';
  });
  // P3：询盘归档桶
  const itb=document.getElementById('tb-arc-inquiry');
  if(itb){
    itb.innerHTML='';
    let inqs=[];
    try{ const {items}=await API.get('/api/inquiries?archived=1'); inqs=items||[]; }catch(e){}
    inqs.forEach(it=>{ const tr=document.createElement('tr'); tr.dataset.id=it.id; tr.dataset.ep='/api/inquiries'; tr.innerHTML=archInqRowHtml(it); itb.appendChild(tr); });
    const e=document.getElementById('arc-inquiry-empty'); if(e)e.style.display=inqs.length?'none':'block';
  }
}
function deriveAk(dept){ return dept==='SEM'?'sem':(dept==='公司'?'company':'seo'); }
document.addEventListener('click',async e=>{
  const r=e.target.closest('.arch-restore'); const h=e.target.closest('.arch-hard');
  if(!r&&!h)return;
  const tr=(r||h).closest('tr'); if(!tr)return;
  const id=tr.dataset.id, ep=tr.dataset.ep; if(!id||!ep)return;
  if(r){
    if(!inlineConfirm(r,'确认恢复'))return;
    try{ await API.post(ep+'/'+id+'/restore'); tr.remove(); if(ep==='/api/inquiries'){ loadInquiries(); loadDashboardInq(); } toast('已恢复 · 请回原页查看'); }
    catch(err){ toast(err.status===403?'无权操作':'恢复失败：'+(err.message||'请求失败')); }
  } else {
    if(!inlineConfirm(h,'确认彻底删除'))return;
    try{ await API.del(ep+'/'+id+'?hard=1'); tr.remove(); toast('已彻底删除'); }
    catch(err){ toast(err.status===403?'无权操作':'删除失败：'+(err.message||'请求失败')); }
  }
});
