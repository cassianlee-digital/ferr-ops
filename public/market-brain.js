/* 市场分析（表格化）+ AI 记忆体联动（拆分自 index.html · 阶段3）
   经典 script + window 全局兼容。依赖（均在调用/事件时解析）：window.API、esc()、mdToHtml()、toast()（index.html 内联）。 */

/* ===== V7 市场分析（表格化）+ AI 记忆体联动 ===== */
window._marketById={};
function mktEsc(s){return esc(s);} // 合并到统一 esc()，保留别名避免改动调用点
function renderMarket(items){
  const tb=document.getElementById('tb-market'); if(!tb)return; tb.innerHTML=''; window._marketById={};
  let lastSec=null;
  items.forEach(it=>{
    let ans={}; try{ans=JSON.parse(it.answers||'{}');}catch{} it._ans=ans; window._marketById[it.id]=it;
    if(it.section!==lastSec){ lastSec=it.section; const hr=document.createElement('tr');
      hr.innerHTML=`<td colspan="5" style="background:var(--bg3);font-weight:800;color:var(--primary)">${mktEsc(it.section)}</td>`; tb.appendChild(hr); }
    const tr=document.createElement('tr'); tr.dataset.id=it.id;
    tr.innerHTML=`<td class="dim" style="font-size:11px">${mktEsc(it.section)}</td>`
      +`<td class="mkt-q editable" contenteditable style="font-size:11.5px">${mktEsc(it.question)}</td>`
      +['孟雪','王璐平','燕敏'].map(r=>`<td class="mkt-ans editable" contenteditable data-resp="${r}" style="font-size:11.5px;white-space:pre-wrap">${mktEsc(ans[r]||'')}</td>`).join('');
    tb.appendChild(tr);
  });
  const empty=document.getElementById('market-empty'); if(empty)empty.style.display=items.length?'none':'block';
}
async function loadMarket(){ try{ const {items}=await API.get('/api/market/research'); renderMarket(items||[]); }catch(e){} }
/* 市场表格单元格失焦保存 */
document.addEventListener('focusout',e=>{
  const cell=e.target.closest&&e.target.closest('#tb-market [contenteditable]'); if(!cell)return;
  const tr=cell.closest('tr'); const id=tr&&tr.dataset.id; if(!id)return; const it=window._marketById[id]; if(!it)return;
  const body={};
  if(cell.classList.contains('mkt-q')) body.question=cell.innerText.trim();
  else if(cell.classList.contains('mkt-ans')){ it._ans=it._ans||{}; it._ans[cell.dataset.resp]=cell.innerText; body.answers=JSON.stringify(it._ans); }
  else return;
  API.patch('/api/market/research/'+id,body).catch(err=>toast(err.status===403?'无权修改':'保存失败'));
});
async function loadBrain(){
  try{
    const {state,summary}=await API.get('/api/market/brain');
    const chip=document.getElementById('brainStatus');
    if(chip){
      if(!state.hasSummary){chip.className='badge b-gray';chip.textContent='AI 记忆：未学习';}
      else if(state.needsUpdate){chip.className='badge b-amber';chip.textContent=state.reason==='new_month'?'AI 记忆：已跨月，建议更新':'AI 记忆：资料有变，建议更新';}
      else {chip.className='badge b-green';chip.textContent='AI 记忆：已是最新';}
    }
    const card=document.getElementById('brainSummaryCard');
    if(card){ if(summary){ card.style.display='block'; document.getElementById('brainSummary').innerHTML=mdToHtml(summary); document.getElementById('brainUpdatedAt').textContent=state.updatedAt?('更新于 '+state.updatedAt):''; } else card.style.display='none'; }
  }catch(e){}
}
async function refreshBrain(btn){
  if(btn){btn.disabled=true;btn.innerHTML='<i class="ti ti-loader"></i> 学习中…';}
  try{
    const r=await API.post('/api/market/brain/refresh',{});
    if(r&&r.updated) toast('AI 已重新学习市场资料，记忆已更新');
    else if(r&&r.reason==='no_source') toast('暂无市场资料可学习');
    else toast('记忆已更新');
    await loadBrain();
  }catch(e){ toast(e.status===503?'请先配置 ANTHROPIC_API_KEY 再更新记忆':'更新失败：'+((e.body&&e.body.error)||e.message)); }
  if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-brain"></i> 同步 / 更新 AI 记忆';}
}
