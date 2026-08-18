/* AI 协同（ES 模块 · 服务端分析记录 + 对话框）。
   closed-loop 依赖显式导入；API、esc/mdToHtml、弹窗和 toast 仍由经典 app.js 在调用时提供。
   main.js 仅向 app.js 暴露静态动作和初始化真正需要的兼容入口。 */

import { addDeposit, addFixFromObj, clip, createEvidenceFix, persistFailMsg, persistFix, persistLoop } from './closed-loop.js';

const apiUnavailableMsg='<div class="api-warn"><i class="ti ti-plug-connected-x"></i> AI 服务暂时不可用：请检查后台 AI Provider、API Key 与模型配置，或稍后重试。</div>';
let aiAnalyses=new Map();
let activeAi=null;
let aiViewIdx=-1;
let lastAi={text:'',dept:'SEO',quality:null};
let splitActionItems=[];
let modalRequestVersion=0;
function hashText(s){ let h=5381; s=String(s||''); for(let i=0;i<s.length;i++)h=((h<<5)+h)+s.charCodeAt(i); return (h>>>0).toString(36); }
function currentAiPage(){ const p=document.querySelector('.panel.active'); return {tab:(p&&p.id||'').replace('panel-',''),title:(p&&p.querySelector('.page-title')||{}).textContent||'',sub:(p&&p.querySelector('.page-sub')||{}).textContent||''}; }
function rowContext(btn){ const tr=btn&&btn.closest&&btn.closest('tr'); if(!tr)return null; const th=[...((tr.closest('table')||document).querySelectorAll('thead th'))].map(x=>x.innerText.trim()); const td=[...tr.children].map(x=>x.innerText.trim()); const cells={}; td.forEach((v,i)=>cells[th[i]||('col'+(i+1))]=v); return {text:td.join(' | '),cells}; }
function aiDeptFromText(t){ return /SEM|Ads|广告|CPC|CTR|ROAS|否词|出价|系列|预算/i.test(t||'')?'SEM':'SEO'; }
function aiMeta(btn,prompt,title){ const page=currentAiPage(); const row=rowContext(btn); const box=btn&&btn.closest&&btn.closest('.ai-box'); const boxTitle=box?(box.querySelector('.ai-title')||{}).textContent:''; const finalTitle=title||boxTitle||'AI 分析'; const scope_type=page.tab||'general'; const seed=[scope_type,finalTitle,prompt,row&&row.text].filter(Boolean).join('|'); return {scope_key:scope_type+':'+hashText(seed),scope_type,title:finalTitle,prompt,context:{page,row,boxTitle},dept:aiDeptFromText((finalTitle||'')+' '+(prompt||''))}; }
function triggerPrompt(btn){ if(!btn||!btn.dataset||!btn.dataset.aiPrompt)return null; return {prompt:btn.dataset.aiPrompt,title:btn.dataset.aiTitle||null}; }
function markAiTrigger(btn,item){ if(!btn||!item||!btn.classList)return; btn.classList.add('analyzed'); btn.innerHTML='<i class="ti ti-check"></i> 已分析'; const tr=btn.closest('tr'); if(tr)tr.classList.add('ai-analyzed-row'); }
function applyAiAnalysisStates(root){ const base=root||document; base.querySelectorAll('button[data-ai-prompt]').forEach(btn=>{ const p=triggerPrompt(btn); if(!p)return; const meta=aiMeta(btn,p.prompt,p.title); const item=aiAnalyses.get(meta.scope_key); if(item)markAiTrigger(btn,item); }); base.querySelectorAll('.kw-ai').forEach(btn=>{ const tr=btn.closest('tr'); if(!tr)return; const n=tr.querySelector('.kw-name'); const kw=(n?n.textContent:tr.cells[0].textContent).trim(); const prompt='分析关键词「'+kw+'」的搜索意图与落地建议'; const title='「'+kw+'」意图'; const item=aiAnalyses.get(aiMeta(btn,prompt,title).scope_key); if(item)markAiTrigger(btn,item); }); }
export async function loadAiAnalyses(){
  try{
    const {items}=await API.get('/api/ai/analyses');
    aiAnalyses=new Map((items||[]).filter(x=>x&&x.scope_key).map(x=>[x.scope_key,x]));
    applyAiAnalysisStates();
  }catch(e){
    aiAnalyses=new Map();
    if(e&&e.message!=='unauthorized')toast('AI 分析记录加载失败：'+(e.message||'未知错误')+'，可刷新页面重试');
  }
}
function onAiFooterClick(e){
  const foot=e.currentTarget; const btn=e.target.closest('[data-ai-command]'); if(!btn||!foot.contains(btn))return;
  const cmd=btn.dataset.aiCommand;
  if(cmd==='reanalyze')reanalyzeActive(); else if(cmd==='split')splitActions(); else if(cmd==='archive')archiveAiAnalysis(); else if(cmd==='deposit')depositAi(); else if(cmd==='adopt')adoptAi(); else if(cmd==='send')sendAiChat();
}
function setupAiFooter(){
  const foot=document.getElementById('aiModalFoot'); if(!foot)return;
  foot.className='ai-chat-compose'; foot.style.display='block';
  foot.innerHTML='<textarea id="aiChatInput" placeholder="继续追问、补充判断或让 AI 重写成整改动作"></textarea><div class="ai-chat-tools"><label class="btn-ghost" for="aiChatFiles"><i class="ti ti-paperclip"></i> 上传文件/图片</label><input class="csp-s-6aa34d7432" id="aiChatFiles" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xlsx,.csv,.txt"><span class="csp-s-ed524873cf" id="aiFileList"></span><button type="button" class="btn-ghost" data-ai-command="reanalyze"><i class="ti ti-refresh"></i> 重新分析</button><button type="button" class="btn-ghost" data-ai-command="split"><i class="ti ti-list-check"></i> 拆成整改动作</button><button type="button" class="btn-ghost" data-ai-command="archive"><i class="ti ti-archive"></i> 归档</button><button type="button" class="btn-ghost" data-ai-command="deposit"><i class="ti ti-database-heart"></i> 沉淀</button><button type="button" class="btn-primary" id="aiAdoptBtn" data-ai-command="adopt"><i class="ti ti-clipboard-check"></i> 采纳到整改清单</button><button type="button" class="btn-primary csp-s-ca6fc035af" data-ai-command="send"><i class="ti ti-send"></i> 发送</button></div>';
  if(!foot.dataset.aiBound){ foot.addEventListener('click',onAiFooterClick); foot.dataset.aiBound='1'; }
  const blocked=!aiIsActionable(activeAi);
  ['adopt','deposit','split'].forEach(cmd=>{ const btn=foot.querySelector('[data-ai-command="'+cmd+'"]'); if(btn&&blocked){ btn.disabled=true; btn.title='该结论未通过可执行性评分，需重新分析或补充数据'; } });
  const files=document.getElementById('aiChatFiles'); if(files)files.addEventListener('change',()=>{ const list=document.getElementById('aiFileList'); if(list)list.innerHTML=[...files.files].slice(0,5).map(f=>'<span class="ai-file-chip">'+esc(f.name)+'</span>').join(''); });
}
function aiMessages(item){ const msgs=(item&&item.messages&&item.messages.length)?item.messages:[{role:'assistant',content:item&&item.result_text||''}]; return msgs.filter(m=>m.content).map(m=>'<div class="ai-chat-item '+(m.role==='user'?'user':'assistant')+'"><div class="bubble ai-render">'+mdToHtml(m.content)+'</div></div>').join(''); }
function aiQualityBanner(quality,historical){
  const q=quality&&quality.confidenceAssessment;
  if(!q)return '<div class="hermes-confidence not_applicable"><div class="hermes-confidence-head"><strong>'+(historical?'历史回答未评分':'当前回答未评分')+'</strong><span>该回答生成时尚未启用证据评分，需重新分析后再决定是否执行。</span></div></div>';
  const dims=q.dimensions||{}; const labels={evidenceCoverage:'证据覆盖',sourceQuality:'来源质量',freshness:'数据时效',inferenceDiscipline:'推理约束',numericConsistency:'数字一致',temporalConsistency:'时间一致'};
  const entries=Object.keys(labels).filter(k=>Number.isFinite(Number(dims[k]))).map(k=>'<span>'+labels[k]+' '+Number(dims[k])+'</span>').join('');
  const title=q.applicable?'置信度 '+Number(q.score||0)+'/100 · '+esc(q.label||'') : esc(q.label||'非数据型回答');
  return '<div class="hermes-confidence '+esc(q.level||'not_applicable')+'"><div class="hermes-confidence-head"><strong>'+title+'</strong><span>'+esc(q.decision||'')+'</span></div>'+(entries?'<div class="hermes-confidence-grid">'+entries+'</div>':'')+'</div>';
}
function aiIsActionable(item){ const q=item&&item.quality&&item.quality.confidenceAssessment; return !!(q&&q.level&&q.level!=='low'); }
function fmtAiTime(v){ if(!v)return ''; const d=new Date(String(v).replace(' ','T')+(/[Z+]/.test(String(v))?'':'Z')); if(isNaN(d))return String(v).slice(5,16); const p=n=>String(n).padStart(2,'0'); return (d.getMonth()+1)+'/'+d.getDate()+' '+p(d.getHours())+':'+p(d.getMinutes()); }
function aiTimeline(item){
  const hist=(item&&item.history)||[]; if(!hist.length)return '';
  const idx=aiViewIdx;
  let chips='<button type="button" class="ai-tl-chip'+(idx<0?' active':'')+'" data-ai-snapshot="-1">本次 · '+fmtAiTime(item.updated_at)+'</button>';
  hist.forEach((h,i)=>{ chips+='<button type="button" class="ai-tl-chip'+(idx===i?' active':'')+'" data-ai-snapshot="'+i+'">'+(i===0?'上次':'上'+(i+1)+'次')+' · '+fmtAiTime(h.at)+'</button>'; });
  return '<div class="ai-timeline"><span class="ai-tl-label"><i class="ti ti-history"></i> 历史对比</span>'+chips+'</div>';
}
function showAiSnapshot(i){ aiViewIdx=i; renderAiBody(); }
function onAiBodyClick(e){
  const body=e.currentTarget;
  const chip=e.target.closest('[data-ai-snapshot]'); if(chip&&body.contains(chip)){ showAiSnapshot(Number(chip.dataset.aiSnapshot)); return; }
  const adopt=e.target.closest('[data-ai-split-index]'); if(adopt&&body.contains(adopt))adoptSplitAction(adopt,splitActionItems[Number(adopt.dataset.aiSplitIndex)]);
}
function renderAiBody(){
  const item=activeAi; const body=document.getElementById('aiModalBody'); if(!item||!body)return;
  const idx=aiViewIdx;
  splitActionItems=[];
  let html=aiTimeline(item)+'<div id="aiActionsBox"></div>';
  if(idx>=0 && item.history && item.history[idx]){
    html+=aiQualityBanner(item.history[idx].quality,true);
    html+='<div class="ai-snap-note dim">— 历史快照（'+fmtAiTime(item.history[idx].at)+'）· 只读，点「本次」回到最新 —</div>';
    html+='<div class="ai-chat-item assistant"><div class="bubble ai-render">'+mdToHtml(item.history[idx].result_text||'')+'</div></div>';
  } else {
    html+=aiQualityBanner(item.quality,false);
    html+=aiMessages(item);
  }
  body.innerHTML=html;
  if(!body.dataset.aiBound){ body.addEventListener('click',onAiBodyClick); body.dataset.aiBound='1'; }
}
function renderAiItem(item){ activeAi=item; aiViewIdx=-1; lastAi={text:item.result_text||'',dept:aiDeptFromText((item.title||'')+' '+(item.prompt||'')),quality:item.quality||null}; document.getElementById('aiModalTitle').textContent=item.title||'AI 分析'; renderAiBody(); setupAiFooter(); setTimeout(()=>{ const b=document.getElementById('aiModalBody'); if(b)b.scrollTop=b.scrollHeight; },30); }
// 对当前页最新数据重新分析（旧结论自动存为历史快照）
async function reanalyzeActive(){
  const item=activeAi; if(!item){toast('暂无可重新分析的项');return;}
  const requestVersion=++modalRequestVersion;
  document.getElementById('aiModalBody').innerHTML='<div class="ai-loading"><span class="spin"></span> AI 正在基于当前最新数据重新分析…</div>';
  try{
    const {item:next}=await API.post('/api/ai/analyze',{scope_key:item.scope_key,scope_type:item.scope_type,title:item.title,prompt:item.prompt,context:item.context,force:true});
    if(requestVersion!==modalRequestVersion)return;
    aiAnalyses.set(next.scope_key,next); renderAiItem(next); toast('已基于最新数据重新分析，上次结论已存入历史');
  }catch(e){ if(requestVersion!==modalRequestVersion)return; renderAiBody(); toast('重新分析失败：'+(e.message||'ai_failed')); }
}
async function adoptSplitAction(btn,action){
  if(!action||!btn)return;
  btn.disabled=true;
  try{
    await createEvidenceFix(action.dept,action.title,action.detail,action.evidence,'AI动作拆解');
    btn.innerHTML='<i class="ti ti-check"></i> 已采纳';
    toastGo('已采纳 → 整改清单 · 已入库','fix');
  }catch(e){ btn.disabled=false; toast(persistFailMsg(e)); }
}
// 把当前分析结论拆成可逐条采纳的整改动作
async function splitActions(){
  const item=activeAi; if(!item){toast('暂无可拆解的分析');return;}
  if(!aiIsActionable(item)){toast('当前结论未通过可执行性评分，需重新分析或补充数据，不能拆成可执行动作');return;}
  let box=document.getElementById('aiActionsBox'); if(!box){ renderAiBody(); box=document.getElementById('aiActionsBox'); }
  if(box)box.innerHTML='<div class="ai-loading"><span class="spin"></span> 正在拆解成整改动作…</div>';
  try{
    const {actions,blocked}=await API.post('/api/ai/analyses/'+item.id+'/actions',{});
    if(!box)return;
    if(blocked){ box.innerHTML='<div class="dim csp-s-46909fa053">当前结论置信度低，不能拆成可执行动作。</div>'; return; }
    splitActionItems=(actions||[]).map(a=>({dept:a&&a.dept==='SEM'?'SEM':'SEO',title:String(a&&a.title||'AI 整改动作'),detail:String(a&&a.detail||''),evidence:String(a&&a.evidence||''),confidence:a&&a.confidence||null}));
    if(!splitActionItems.length){ box.innerHTML='<div class="dim csp-s-46909fa053">未能从结论中提取到明确可执行的动作。</div>'; return; }
    box.innerHTML='<div class="ai-actions-list"><div class="ai-actions-h"><i class="ti ti-list-check"></i> 可采纳的整改动作（逐条）</div>'+splitActionItems.map((a,i)=>'<div class="ai-action-row"><div class="ai-action-main"><div class="ai-action-t"><span class="badge '+(a.dept==='SEM'?'b-purple':'b-blue')+'">'+a.dept+'</span> '+esc(a.title)+'</div><div class="ai-action-d">'+esc(a.detail)+'</div>'+(a.evidence?'<div class="ai-action-e dim">依据：'+esc(a.evidence)+'</div>':'')+'</div><button type="button" class="btn-mini" data-ai-split-index="'+i+'"><i class="ti ti-clipboard-check"></i> 采纳</button></div>').join('')+'</div>';
  }catch(e){ splitActionItems=[]; if(box)box.innerHTML='<div class="dim csp-s-46909fa053">拆解失败：'+esc(e.message||'ai_failed')+'</div>'; }
}
export async function runAiAnalysis(btn,prompt,title,force){
  const meta=aiMeta(btn,prompt,title);
  const requestVersion=++modalRequestVersion;
  activeAi=null; aiViewIdx=-1; splitActionItems=[]; lastAi={text:'',dept:meta.dept,quality:null};
  document.getElementById('aiModalTitle').textContent=meta.title;
  document.getElementById('aiModalBody').innerHTML='<div class="ai-loading"><span class="spin"></span> AI 正在结合当前页面数据和市场记忆分析...</div>';
  document.getElementById('aiModalFoot').style.display='none';
  if(btn)btn.disabled=true;
  openModal('aiMask');
  try{
    const {item}=await API.post('/api/ai/analyze',{...meta,force:force===true});
    if(requestVersion!==modalRequestVersion)return;
    aiAnalyses.set(item.scope_key,item); markAiTrigger(btn,item); renderAiItem(item);
  }catch(e){
    if(requestVersion!==modalRequestVersion)return;
    document.getElementById('aiModalBody').innerHTML=apiUnavailableMsg+'<p class="dim">失败原因：'+esc(e.message||'ai_failed')+'</p>';
    setupAiFooter();
  }finally{ if(requestVersion===modalRequestVersion&&btn)btn.disabled=false; }
}
export function aiBox(btn,prompt){ const box=btn&&btn.closest('.ai-box'); runAiAnalysis(btn,prompt,(box&&box.querySelector('.ai-title')||{}).textContent,false); }
async function sendAiChat(){
  const item=activeAi; if(!item)return;
  const input=document.getElementById('aiChatInput'); const msg=(input&&input.value||'').trim(); if(!msg){toast('请输入要继续问 AI 的内容');return;}
  const files=[...((document.getElementById('aiChatFiles')||{}).files||[])].slice(0,5).map(f=>({name:f.name,type:f.type,size:f.size}));
  const requestVersion=++modalRequestVersion;
  if(input)input.value='';
  document.getElementById('aiModalBody').insertAdjacentHTML('beforeend','<div class="ai-chat-item user"><div class="bubble">'+esc(msg)+'</div></div><div class="ai-loading"><span class="spin"></span> AI 正在继续分析...</div>');
  try{
    const {item:next}=await API.post('/api/ai/analyses/'+item.id+'/chat',{message:msg,attachments:files});
    if(requestVersion!==modalRequestVersion)return;
    aiAnalyses.set(next.scope_key,next); renderAiItem(next);
  }catch(e){ if(requestVersion!==modalRequestVersion)return; if(input)input.value=msg; renderAiBody(); toast('AI 追问失败：'+(e.message||'ai_failed')); }
}
async function archiveAiAnalysis(){ const item=activeAi; if(!item)return; const requestVersion=++modalRequestVersion; try{ await API.post('/api/ai/analyses/'+item.id+'/archive',{}); if(requestVersion!==modalRequestVersion)return; aiAnalyses.delete(item.scope_key); activeAi=null; lastAi={text:'',dept:'SEO',quality:null}; closeModal('aiMask'); toast('已归档 AI 分析'); }catch(e){ if(requestVersion===modalRequestVersion)toast(persistFailMsg(e)); } }
async function depositAi(){ const item=activeAi; if(!item||!item.result_text){toast('暂无可沉淀的 AI 内容');return;} if(!aiIsActionable(item)){toast('当前结论未通过可执行性评分，需重新分析或补充数据，不能沉淀');return;} const s=aiDeptFromText((item.title||'')+' '+(item.prompt||''))==='SEM'?{dept:'SEM',owner:'陈',c:'b-purple'}:{dept:'SEO',owner:'李',c:'b-blue'}; try{ await API.post('/api/ai/analyses/'+item.id+'/action',{action:'deposited'}); await persistLoop('deposit',s,item.result_text,'沉淀'); addDeposit(s,item.result_text,'沉淀'); toastGo('已沉淀到沉淀表 · 已入库','deposit'); }catch(e){ toast(persistFailMsg(e)); } }
export async function adoptAi(){
  if(!lastAi.text){toast('暂无可采纳的 AI 内容');return;}
  if(!lastAi.quality||!lastAi.quality.confidenceAssessment||lastAi.quality.confidenceAssessment.level==='low'){toast('当前结论未通过可执行性评分，需重新分析或补充数据，不能采纳');return;}
  const s=lastAi.dept==='SEM'?{dept:'SEM',owner:'陈',c:'b-purple'}:{dept:'SEO',owner:'李',c:'b-blue'};
  const first=lastAi.text.split('\n').map(x=>x.trim().replace(/^[•\-\*\d\.、:：\s]+/,'')).filter(Boolean)[0]||lastAi.text;
  const fixText=clip(first.replace(/\*\*/g,''),140), depText=clip(first.replace(/\*\*/g,''),40);
  const btn=document.getElementById('aiAdoptBtn'); if(btn)btn.disabled=true;
  try{
    const [fx]=await Promise.all([persistFix(s,fixText),persistLoop('deposit',s,depText,'采纳')]);
    addFixFromObj(fx.item); addDeposit(s,depText,'采纳');
    if(activeAi&&activeAi.id)await API.post('/api/ai/analyses/'+activeAi.id+'/action',{action:'adopted'});
    closeModal('aiMask'); toastGo('已采纳 → 整改清单（'+s.dept+'）· 已入库','fix');
  }catch(e){ toast(persistFailMsg(e)); }
  finally{ if(btn)btn.disabled=false; }
}
