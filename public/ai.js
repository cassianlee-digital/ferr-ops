/* AI 协同（弹框/内嵌分析 + 服务端记录 + 对话框）（拆分自 index.html · 阶段4-B）
   经典 script + window 全局兼容。依赖（运行时解析，均在 index.html 内联或其他模块）：
   callClaude()/esc()/mdToHtml()（内联）、openModal()/closeModal()/toast()/toastGo()/window.API、
   window._lastAi（内联 snapshot 区）、persistLoop()/addDeposit()/persistFailMsg()/injectAiActions()（closed-loop.js）、adoptAi()（内联）。
   aiAsk/aiBox/ai 被全站大量 onclick 引用；loadAiAnalyses()/applyAiAnalysisStates() 由 init/渲染流程在运行时调用。
   注：aiAsk/aiBox/ai 早版(弹框/内嵌)在前、V2 版在后——保持原顺序，函数声明后者覆盖前者，行为与拆分前一致。 */

const apiUnavailableMsg='<div class="api-warn"><i class="ti ti-plug-connected-x"></i> AI 暂时不可用：请确认后端 <b>.env</b> 已正确配置 <b>ANTHROPIC_API_KEY</b>，或稍后重试。</div>';

/* 弹框版：用于行内「分析意图」「AI生成」等无内嵌位置的按钮 */
function aiAsk(prompt,title){
  document.getElementById('aiModalTitle').textContent=title||'AI 分析';
  const body=document.getElementById('aiModalBody');
  const adoptBtn=document.getElementById('aiAdoptBtn');
  document.getElementById('aiModalFoot').style.display='none'; if(adoptBtn)adoptBtn.style.display='none';
  _lastAi={text:'',dept:/SEM|Ads|广告|CPC|CTR|ROAS|否词|出价|系列|预算/i.test((title||'')+prompt)?'SEM':'SEO'};
  body.innerHTML='<div class="ai-loading"><span class="spin"></span> Claude 正在基于本页真实数据分析…</div>';
  openModal('aiMask');
  callClaude(prompt).then(txt=>{
    _lastAi.text=txt;
    body.innerHTML='<div class="ai-render">'+mdToHtml(txt)+'</div>';
    document.getElementById('aiModalFoot').style.display='flex'; if(adoptBtn)adoptBtn.style.display='inline-flex';
  }).catch(e=>{
    body.innerHTML=apiUnavailableMsg+'<div class="csp-s-df928149c5"><button type="button" class="btn-primary ai-fallback-send">发送提示词到对话</button></div>';
    const fallback=body.querySelector('.ai-fallback-send'); if(fallback)fallback.addEventListener('click',()=>sendOrToast(prompt));
    document.getElementById('aiModalFoot').style.display='flex';
  });
}
/* 内嵌版：用于 ai-box 里的「重新诊断/研判/生成」，结果替换 .ai-render */
function aiBox(btn,prompt){
  const box=btn.closest('.ai-box'); if(!box)return aiAsk(prompt);
  let render=box.querySelector('.ai-render');
  if(!render){ render=document.createElement('div'); render.className='ai-render'; box.appendChild(render); }
  const old=render.innerHTML;
  render.innerHTML='<div class="ai-loading"><span class="spin"></span> Claude 正在基于本页真实数据生成…</div>';
  btn.disabled=true;
  callClaude(prompt).then(txt=>{
    render.innerHTML=mdToHtml(txt);
    box.querySelectorAll('.ai-render .ai-item').forEach(()=>{});
    injectAiActions(); btn.disabled=false;
  }).catch(e=>{
    render.innerHTML=old+apiUnavailableMsg+'<div class="csp-s-43a97fe494"><button type="button" class="btn-ghost ai-fallback-send">发送提示词到对话</button></div>';
    const fallback=render.querySelector('.ai-fallback-send'); if(fallback)fallback.addEventListener('click',()=>sendOrToast(prompt));
    btn.disabled=false;
  });
}
function sendOrToast(p){ if(typeof sendPrompt==='function'){sendPrompt(p);toast('已发送到对话');} else {toast('提示词：'+p);} }
/* 兼容旧调用：无内嵌位置的 ai() 一律走弹框 */
function ai(p){ aiAsk(p,'AI 分析'); }

/* ===== AI 协同 V2：服务端记录 + 对话框 ===== */
window._aiAnalyses=new Map();
window._activeAi=null;
function hashText(s){ let h=5381; s=String(s||''); for(let i=0;i<s.length;i++)h=((h<<5)+h)+s.charCodeAt(i); return (h>>>0).toString(36); }
function currentAiPage(){ const p=document.querySelector('.panel.active'); return {tab:(p&&p.id||'').replace('panel-',''),title:(p&&p.querySelector('.page-title')||{}).textContent||'',sub:(p&&p.querySelector('.page-sub')||{}).textContent||''}; }
function rowContext(btn){ const tr=btn&&btn.closest&&btn.closest('tr'); if(!tr)return null; const th=[...((tr.closest('table')||document).querySelectorAll('thead th'))].map(x=>x.innerText.trim()); const td=[...tr.children].map(x=>x.innerText.trim()); const cells={}; td.forEach((v,i)=>cells[th[i]||('col'+(i+1))]=v); return {text:td.join(' | '),cells}; }
function aiDeptFromText(t){ return /SEM|Ads|广告|CPC|CTR|ROAS|否词|出价|系列|预算/i.test(t||'')?'SEM':'SEO'; }
function aiMeta(btn,prompt,title){ const page=currentAiPage(); const row=rowContext(btn); const box=btn&&btn.closest&&btn.closest('.ai-box'); const boxTitle=box?(box.querySelector('.ai-title')||{}).textContent:''; const finalTitle=title||boxTitle||'AI 分析'; const scope_type=page.tab||'general'; const seed=[scope_type,finalTitle,prompt,row&&row.text].filter(Boolean).join('|'); return {scope_key:scope_type+':'+hashText(seed),scope_type,title:finalTitle,prompt,context:{page,row,boxTitle},dept:aiDeptFromText((finalTitle||'')+' '+(prompt||''))}; }
function triggerPrompt(btn){ if(!btn||!btn.dataset||!btn.dataset.aiPrompt)return null; return {prompt:btn.dataset.aiPrompt,title:btn.dataset.aiTitle||null}; }
function markAiTrigger(btn,item){ if(!btn||!item||!btn.classList)return; btn.classList.add('analyzed'); btn.innerHTML='<i class="ti ti-check"></i> 已分析'; const tr=btn.closest('tr'); if(tr)tr.classList.add('ai-analyzed-row'); }
function applyAiAnalysisStates(root){ const base=root||document; base.querySelectorAll('button[data-ai-prompt]').forEach(btn=>{ const p=triggerPrompt(btn); if(!p)return; const meta=aiMeta(btn,p.prompt,p.title); const item=window._aiAnalyses.get(meta.scope_key); if(item)markAiTrigger(btn,item); }); base.querySelectorAll('.kw-ai').forEach(btn=>{ const tr=btn.closest('tr'); if(!tr)return; const n=tr.querySelector('.kw-name'); const kw=(n?n.textContent:tr.cells[0].textContent).trim(); const prompt='分析关键词「'+kw+'」的搜索意图与落地建议'; const title='「'+kw+'」意图'; const item=window._aiAnalyses.get(aiMeta(btn,prompt,title).scope_key); if(item)markAiTrigger(btn,item); }); }
async function loadAiAnalyses(){ try{ const {items}=await API.get('/api/ai/analyses'); window._aiAnalyses=new Map((items||[]).map(x=>[x.scope_key,x])); applyAiAnalysisStates(); }catch(e){} }
function setupAiFooter(){ const foot=document.getElementById('aiModalFoot'); if(!foot)return; foot.className='ai-chat-compose'; foot.style.display='block'; foot.innerHTML='<textarea id="aiChatInput" placeholder="继续追问、补充判断或让 AI 重写成整改动作"></textarea><div class="ai-chat-tools"><label class="btn-ghost" for="aiChatFiles"><i class="ti ti-paperclip"></i> 上传文件/图片</label><input class="csp-s-6aa34d7432" id="aiChatFiles" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xlsx,.csv,.txt"><span class="csp-s-ed524873cf" id="aiFileList"></span><button type="button" class="btn-ghost" data-ai-command="reanalyze"><i class="ti ti-refresh"></i> 重新分析</button><button type="button" class="btn-ghost" data-ai-command="split"><i class="ti ti-list-check"></i> 拆成整改动作</button><button type="button" class="btn-ghost" data-ai-command="archive"><i class="ti ti-archive"></i> 归档</button><button type="button" class="btn-ghost" data-ai-command="deposit"><i class="ti ti-database-heart"></i> 沉淀</button><button type="button" class="btn-primary" id="aiAdoptBtn" data-ai-command="adopt"><i class="ti ti-clipboard-check"></i> 采纳到整改清单</button><button type="button" class="btn-primary csp-s-ca6fc035af" data-ai-command="send"><i class="ti ti-send"></i> 发送</button></div>'; foot.onclick=e=>{ const btn=e.target.closest('[data-ai-command]'); if(!btn||!foot.contains(btn))return; const cmd=btn.dataset.aiCommand; if(cmd==='reanalyze')reanalyzeActive(); else if(cmd==='split')splitActions(); else if(cmd==='archive')archiveAiAnalysis(); else if(cmd==='deposit')depositAi(); else if(cmd==='adopt')adoptAi(); else if(cmd==='send')sendAiChat(); }; const files=document.getElementById('aiChatFiles'); if(files)files.onchange=()=>{ const list=document.getElementById('aiFileList'); if(list)list.innerHTML=[...files.files].slice(0,5).map(f=>'<span class="ai-file-chip">'+esc(f.name)+'</span>').join(''); }; }
function aiMessages(item){ const msgs=(item&&item.messages&&item.messages.length)?item.messages:[{role:'assistant',content:item&&item.result_text||''}]; return msgs.filter(m=>m.content).map(m=>'<div class="ai-chat-item '+(m.role==='user'?'user':'assistant')+'"><div class="bubble ai-render">'+mdToHtml(m.content)+'</div></div>').join(''); }
function fmtAiTime(v){ if(!v)return ''; const d=new Date(String(v).replace(' ','T')+(/[Z+]/.test(String(v))?'':'Z')); if(isNaN(d))return String(v).slice(5,16); const p=n=>String(n).padStart(2,'0'); return (d.getMonth()+1)+'/'+d.getDate()+' '+p(d.getHours())+':'+p(d.getMinutes()); }
function aiTimeline(item){
  const hist=(item&&item.history)||[]; if(!hist.length)return '';
  const idx=window._aiViewIdx;
  let chips='<button type="button" class="ai-tl-chip'+(idx<0?' active':'')+'" data-ai-snapshot="-1">本次 · '+fmtAiTime(item.updated_at)+'</button>';
  hist.forEach((h,i)=>{ chips+='<button type="button" class="ai-tl-chip'+(idx===i?' active':'')+'" data-ai-snapshot="'+i+'">'+(i===0?'上次':'上'+(i+1)+'次')+' · '+fmtAiTime(h.at)+'</button>'; });
  return '<div class="ai-timeline"><span class="ai-tl-label"><i class="ti ti-history"></i> 历史对比</span>'+chips+'</div>';
}
function showAiSnapshot(i){ window._aiViewIdx=i; renderAiBody(); }
function renderAiBody(){
  const item=window._activeAi; const body=document.getElementById('aiModalBody'); if(!item||!body)return;
  const idx=window._aiViewIdx;
  let html=aiTimeline(item)+'<div id="aiActionsBox"></div>';
  if(idx>=0 && item.history && item.history[idx]){
    html+='<div class="ai-snap-note dim">— 历史快照（'+fmtAiTime(item.history[idx].at)+'）· 只读，点「本次」回到最新 —</div>';
    html+='<div class="ai-chat-item assistant"><div class="bubble ai-render">'+mdToHtml(item.history[idx].result_text||'')+'</div></div>';
  } else {
    html+=aiMessages(item);
  }
  body.innerHTML=html;
  body.onclick=e=>{ const chip=e.target.closest('[data-ai-snapshot]'); if(chip&&body.contains(chip))showAiSnapshot(Number(chip.dataset.aiSnapshot)); };
}
function renderAiItem(item){ window._activeAi=item; window._aiViewIdx=-1; _lastAi={text:item.result_text||'',dept:aiDeptFromText((item.title||'')+' '+(item.prompt||''))}; document.getElementById('aiModalTitle').textContent=item.title||'AI 分析'; renderAiBody(); setupAiFooter(); setTimeout(()=>{ const b=document.getElementById('aiModalBody'); if(b)b.scrollTop=b.scrollHeight; },30); }
// 对当前页最新数据重新分析（旧结论自动存为历史快照）
async function reanalyzeActive(){
  const item=window._activeAi; if(!item){toast('暂无可重新分析的项');return;}
  document.getElementById('aiModalBody').innerHTML='<div class="ai-loading"><span class="spin"></span> AI 正在基于当前最新数据重新分析…</div>';
  try{
    const {item:next}=await API.post('/api/ai/analyze',{scope_key:item.scope_key,scope_type:item.scope_type,title:item.title,prompt:item.prompt,context:item.context,force:true});
    window._aiAnalyses.set(next.scope_key,next); renderAiItem(next); toast('已基于最新数据重新分析，上次结论已存入历史');
  }catch(e){ renderAiBody(); toast('重新分析失败：'+(e.message||'ai_failed')); }
}
// 把当前分析结论拆成可逐条采纳的整改动作
async function splitActions(){
  const item=window._activeAi; if(!item){toast('暂无可拆解的分析');return;}
  let box=document.getElementById('aiActionsBox'); if(!box){ renderAiBody(); box=document.getElementById('aiActionsBox'); }
  if(box)box.innerHTML='<div class="ai-loading"><span class="spin"></span> 正在拆解成整改动作…</div>';
  try{
    const {actions}=await API.post('/api/ai/analyses/'+item.id+'/actions',{});
    if(!box)return;
    if(!actions||!actions.length){ box.innerHTML='<div class="dim csp-s-46909fa053">未能从结论中提取到明确可执行的动作。</div>'; return; }
    box.innerHTML='<div class="ai-actions-list"><div class="ai-actions-h"><i class="ti ti-list-check"></i> 可采纳的整改动作（逐条）</div>'+actions.map(a=>{
      const dp=a.dept==='SEM'?'SEM':'SEO';
      return '<div class="ai-action-row"><div class="ai-action-main"><div class="ai-action-t"><span class="badge '+(dp==='SEM'?'b-purple':'b-blue')+'">'+dp+'</span> '+esc(a.title)+'</div><div class="ai-action-d">'+esc(a.detail||'')+'</div>'+(a.evidence?'<div class="ai-action-e dim">依据：'+esc(a.evidence)+'</div>':'')+'</div><button type="button" class="btn-mini"'+_adoptActionAttrs(dp,a.title,a.detail,a.evidence)+'><i class="ti ti-clipboard-check"></i> 采纳</button></div>';
    }).join('')+'</div>';
  }catch(e){ if(box)box.innerHTML='<div class="dim csp-s-46909fa053">拆解失败：'+esc(e.message||'ai_failed')+'</div>'; }
}
async function runAiAnalysis(btn,prompt,title,force){ const meta=aiMeta(btn,prompt,title); document.getElementById('aiModalTitle').textContent=meta.title; document.getElementById('aiModalBody').innerHTML='<div class="ai-loading"><span class="spin"></span> AI 正在结合当前页面数据和市场记忆分析...</div>'; document.getElementById('aiModalFoot').style.display='none'; openModal('aiMask'); try{ const {item}=await API.post('/api/ai/analyze',{...meta,force:force===true}); window._aiAnalyses.set(item.scope_key,item); markAiTrigger(btn,item); renderAiItem(item); }catch(e){ document.getElementById('aiModalBody').innerHTML=apiUnavailableMsg+'<p class="dim">失败原因：'+esc(e.message||'ai_failed')+'</p>'; setupAiFooter(); } }
function aiTriggerEl(){ const ev=window.event; if(ev&&ev.target&&ev.target.closest){ const b=ev.target.closest('button,.kw-ai,.btn-ai,.btn-mini'); if(b)return b; } if(ev&&ev.currentTarget&&ev.currentTarget.classList)return ev.currentTarget; const a=document.activeElement; return (a&&a.classList)?a:null; }
function aiAsk(prompt,title){ runAiAnalysis(aiTriggerEl(),prompt,title,false); }
function aiBox(btn,prompt){ runAiAnalysis(btn,prompt,(btn.closest('.ai-box')&&btn.closest('.ai-box').querySelector('.ai-title')||{}).textContent,false); }
function ai(p){ runAiAnalysis(aiTriggerEl(),p,'AI 分析',false); }
async function sendAiChat(){ const item=window._activeAi; if(!item)return; const input=document.getElementById('aiChatInput'); const msg=(input&&input.value||'').trim(); if(!msg){toast('请输入要继续问 AI 的内容');return;} const files=[...((document.getElementById('aiChatFiles')||{}).files||[])].slice(0,5).map(f=>({name:f.name,type:f.type,size:f.size})); if(input)input.value=''; document.getElementById('aiModalBody').insertAdjacentHTML('beforeend','<div class="ai-chat-item user"><div class="bubble">'+esc(msg)+'</div></div><div class="ai-loading"><span class="spin"></span> AI 正在继续分析...</div>'); try{ const {item:next}=await API.post('/api/ai/analyses/'+item.id+'/chat',{message:msg,attachments:files}); window._aiAnalyses.set(next.scope_key,next); renderAiItem(next); }catch(e){ toast('AI 追问失败：'+(e.message||'ai_failed')); } }
async function archiveAiAnalysis(){ const item=window._activeAi; if(!item)return; try{ await API.post('/api/ai/analyses/'+item.id+'/archive',{}); window._aiAnalyses.delete(item.scope_key); closeModal('aiMask'); toast('已归档 AI 分析'); }catch(e){ toast(persistFailMsg(e)); } }
async function depositAi(){ const item=window._activeAi; if(!item||!item.result_text){toast('暂无可沉淀的 AI 内容');return;} const s=aiDeptFromText((item.title||'')+' '+(item.prompt||''))==='SEM'?{dept:'SEM',owner:'陈',c:'b-purple'}:{dept:'SEO',owner:'李',c:'b-blue'}; try{ await persistLoop('deposit',s,item.result_text,'沉淀'); addDeposit(s,item.result_text,'沉淀'); await API.post('/api/ai/analyses/'+item.id+'/action',{action:'deposited'}); toastGo('已沉淀到沉淀表 · 已入库','deposit'); }catch(e){ toast(persistFailMsg(e)); } }
