/* 复盘周报：手风琴 + 李/陈并排 + 四段可编辑 + 测试/采纳联动（拆分自 index.html · 阶段4-A）
   经典 script + window 全局兼容。依赖（运行时解析，均在 index.html 内联或闭环模块）：
   esc()、toast()、toastGo()、window.API、sFromDept()、persistLoop()、addTest()、addDeposit()、persistFailMsg()。
   renderReview() 由 window load 初始化调用。 */

/* ===== V7 复盘周报：手风琴 + 李/陈并排 + 四段可编辑 + 测试/采纳联动 ===== */
function curWeekKey(){ const d=new Date(); const w=Math.ceil(d.getDate()/7); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+w; }
function weekLabel(key){ const p=(key||'').split('-'); return p.length>=3?(p[0]+'年'+p[1]+'月第'+p[2]+'周'):key; }
const RV_SECTIONS=[['summary','① 本周工作总结',[]],['problems','② 遇到的问题',['测试','采纳']],['analysis','③ 分析',['采纳']],['next_plan','④ 下周工作计划',[]]];
function rvItemHtml(text,acts){
  const btns=(acts||[]).map(a=>`<button class="aibtn ${a==='采纳'?'adopt':'test'}" onclick="rvAct(this,'${a}')">${a}</button>`).join('');
  return `<div class="rv-item"><span class="txt" contenteditable>${esc(text)}</span>${btns}<span class="rv-del" onclick="rvDel(this)" title="删除"><i class="ti ti-x"></i></span></div>`;
}
function rvColHtml(dept,rec,week,prevPlan){
  const name=dept==='SEM'?'SEM · 陈':'SEO · 李';
  let h=`<div class="rv-col ${dept==='SEM'?'sem':'seo'}"><div style="font-weight:800;margin-bottom:10px;color:${dept==='SEM'?'var(--purple)':'var(--blue)'}">${name}</div>`;
  RV_SECTIONS.forEach(([field,title,acts])=>{
    const items=(rec&&rec[field])||[];
    h+=`<div class="rv-sec" data-field="${field}" data-dept="${dept}" data-week="${week}"><h5>${title}</h5>`;
    if(field==='summary'&&!items.length&&prevPlan&&prevPlan.length){ h+=`<div style="font-size:11px;color:var(--text3);margin-bottom:4px">上周计划：${prevPlan.map(x=>esc(x)).join('；')}</div>`; }
    h+=`<div class="rv-list">${items.map(t=>rvItemHtml(t,acts)).join('')}</div>`;
    h+=`<span class="rv-add" onclick="rvAdd(this)"><i class="ti ti-plus"></i> 添加</span></div>`;
  });
  return h+'</div>';
}
async function renderReview(){
  const cur=curWeekKey(); let items=[];
  try{ const r=await API.get('/api/weekly-reports?current='+encodeURIComponent(cur)); items=r.items||[]; }catch(e){}
  const byWeek={}; items.forEach(it=>{ (byWeek[it.week_key]=byWeek[it.week_key]||{})[it.dept]=it; });
  if(!byWeek[cur])byWeek[cur]={};
  const keys=Object.keys(byWeek).sort((a,b)=>a<b?1:-1); // 倒序，最新在上
  // 上周 next_plan 作为本周 summary 的参考
  const prevOf=(week,dept)=>{ const idx=keys.indexOf(week); for(let i=idx+1;i<keys.length;i++){ const r=byWeek[keys[i]][dept]; if(r&&r.next_plan&&r.next_plan.length)return r.next_plan; } return null; };
  const acc=document.getElementById('review-acc'); if(!acc)return;
  acc.innerHTML=keys.map(week=>{
    const collapsed= week!==cur; // 仅当前周展开
    return `<div class="acc-week${collapsed?' collapsed':''}"><div class="acc-bar" onclick="this.parentElement.classList.toggle('collapsed')"><i class="ti ti-chevron-down hicon"></i> ${weekLabel(week)} ${week===cur?'<span class="badge b-green" style="margin-left:6px">本周</span>':''}</div><div class="acc-body">${rvColHtml('SEO',byWeek[week].SEO,week,prevOf(week,'SEO'))}${rvColHtml('SEM',byWeek[week].SEM,week,prevOf(week,'SEM'))}</div></div>`;
  }).join('');
}
function rvSectionSave(sec){
  if(!sec)return; const field=sec.dataset.field, dept=sec.dataset.dept, week=sec.dataset.week;
  const items=[...sec.querySelectorAll('.rv-list .txt')].map(t=>t.innerText.trim()).filter(Boolean);
  API.put('/api/weekly-reports',{week_key:week,dept,field,items}).catch(err=>toast(err.status===403?'无权修改':'保存失败'));
}
function rvAdd(el){ const sec=el.closest('.rv-sec'); const list=sec.querySelector('.rv-list'); const acts=(RV_SECTIONS.find(s=>s[0]===sec.dataset.field)||[])[2]||[]; const tmp=document.createElement('div'); tmp.innerHTML=rvItemHtml('',acts); const node=tmp.firstChild; list.appendChild(node); const t=node.querySelector('.txt'); if(t)t.focus(); }
function rvDel(el){ const sec=el.closest('.rv-sec'); el.closest('.rv-item').remove(); rvSectionSave(sec); }
async function rvAct(el,kind){ const item=el.closest('.rv-item'); const text=item.querySelector('.txt').innerText.trim(); if(!text){toast('请先填写内容');return;} const sec=el.closest('.rv-sec'); const s=sFromDept(sec.dataset.dept);
  try{
    if(kind==='测试'){ await persistLoop('test',s,text,'观察中'); addTest(s,text); toastGo('已加入测试登记 · 已入库','test'); }
    else { await persistLoop('deposit',s,text,'采纳'); addDeposit(s,text,'采纳'); toastGo('已采纳 → 沉淀表 · 已入库','deposit'); }
  }catch(e){ toast(persistFailMsg(e)); }
}
/* 复盘周报单元格失焦保存 */
document.addEventListener('focusout',e=>{ const t=e.target.closest&&e.target.closest('#review-acc .rv-list .txt'); if(!t)return; rvSectionSave(t.closest('.rv-sec')); });
