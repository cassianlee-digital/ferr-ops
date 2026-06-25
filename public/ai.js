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
    body.innerHTML=apiUnavailableMsg+'<div style="margin-top:10px"><button class="btn-primary" onclick="sendOrToast('+JSON.stringify(prompt).replace(/"/g,'&quot;')+')">发送提示词到对话</button></div>';
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
    render.innerHTML=old+apiUnavailableMsg+'<div style="margin-top:8px"><button class="btn-ghost" onclick="sendOrToast('+JSON.stringify(prompt).replace(/"/g,'&quot;')+')">发送提示词到对话</button></div>';
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
function triggerPrompt(btn){ const raw=(btn&&btn.getAttribute&&btn.getAttribute('onclick'))||''; let m=raw.match(/aiAsk\('([\s\S]*?)'\s*,\s*'([\s\S]*?)'\)/); if(m)return {prompt:m[1],title:m[2]}; m=raw.match(/aiBox\(this\s*,\s*'([\s\S]*?)'\)/); if(m)return {prompt:m[1],title:null}; m=raw.match(/ai\('([\s\S]*?)'\)/); if(m)return {prompt:m[1],title:'AI 分析'}; return null; }
function markAiTrigger(btn,item){ if(!btn||!item)return; btn.classList.add('analyzed'); btn.innerHTML='<i class="ti ti-check"></i> 已分析'; const tr=btn.closest('tr'); if(tr)tr.classList.add('ai-analyzed-row'); }
function applyAiAnalysisStates(root){ const base=root||document; base.querySelectorAll('button[onclick*="ai"]').forEach(btn=>{ const p=triggerPrompt(btn); if(!p)return; const meta=aiMeta(btn,p.prompt,p.title); const item=window._aiAnalyses.get(meta.scope_key); if(item)markAiTrigger(btn,item); }); base.querySelectorAll('.kw-ai').forEach(btn=>{ const tr=btn.closest('tr'); if(!tr)return; const n=tr.querySelector('.kw-name'); const kw=(n?n.textContent:tr.cells[0].textContent).trim(); const prompt='分析关键词「'+kw+'」的搜索意图与落地建议'; const title='「'+kw+'」意图'; const item=window._aiAnalyses.get(aiMeta(btn,prompt,title).scope_key); if(item)markAiTrigger(btn,item); }); }
async function loadAiAnalyses(){ try{ const {items}=await API.get('/api/ai/analyses'); window._aiAnalyses=new Map((items||[]).map(x=>[x.scope_key,x])); applyAiAnalysisStates(); }catch(e){} }
function setupAiFooter(){ const foot=document.getElementById('aiModalFoot'); if(!foot)return; foot.className='ai-chat-compose'; foot.style.display='block'; foot.innerHTML='<textarea id="aiChatInput" placeholder="继续追问、补充判断或让 AI 重写成整改动作"></textarea><div class="ai-chat-tools"><label class="btn-ghost" for="aiChatFiles"><i class="ti ti-paperclip"></i> 上传文件/图片</label><input id="aiChatFiles" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" style="display:none"><span id="aiFileList" style="display:flex;gap:6px;flex-wrap:wrap"></span><button class="btn-ghost" onclick="archiveAiAnalysis()"><i class="ti ti-archive"></i> 归档</button><button class="btn-ghost" onclick="depositAi()"><i class="ti ti-database-heart"></i> 沉淀</button><button class="btn-primary" id="aiAdoptBtn" onclick="adoptAi()"><i class="ti ti-clipboard-check"></i> 采纳到整改清单</button><button class="btn-primary" style="margin-left:auto" onclick="sendAiChat()"><i class="ti ti-send"></i> 发送</button></div>'; const files=document.getElementById('aiChatFiles'); if(files)files.onchange=()=>{ const list=document.getElementById('aiFileList'); if(list)list.innerHTML=[...files.files].slice(0,5).map(f=>'<span class="ai-file-chip">'+esc(f.name)+'</span>').join(''); }; }
function aiMessages(item){ const msgs=(item&&item.messages&&item.messages.length)?item.messages:[{role:'assistant',content:item&&item.result_text||''}]; return msgs.filter(m=>m.content).map(m=>'<div class="ai-chat-item '+(m.role==='user'?'user':'assistant')+'"><div class="bubble ai-render">'+mdToHtml(m.content)+'</div></div>').join(''); }
function renderAiItem(item){ window._activeAi=item; _lastAi={text:item.result_text||'',dept:aiDeptFromText((item.title||'')+' '+(item.prompt||''))}; document.getElementById('aiModalTitle').textContent=item.title||'AI 分析'; document.getElementById('aiModalBody').innerHTML=aiMessages(item); setupAiFooter(); setTimeout(()=>{ const b=document.getElementById('aiModalBody'); if(b)b.scrollTop=b.scrollHeight; },30); }
async function runAiAnalysis(btn,prompt,title,force){ const meta=aiMeta(btn,prompt,title); document.getElementById('aiModalTitle').textContent=meta.title; document.getElementById('aiModalBody').innerHTML='<div class="ai-loading"><span class="spin"></span> AI 正在结合当前页面数据和市场记忆分析...</div>'; document.getElementById('aiModalFoot').style.display='none'; openModal('aiMask'); try{ const {item}=await API.post('/api/ai/analyze',{...meta,force:force===true}); window._aiAnalyses.set(item.scope_key,item); markAiTrigger(btn,item); renderAiItem(item); }catch(e){ document.getElementById('aiModalBody').innerHTML=apiUnavailableMsg+'<p class="dim">失败原因：'+esc(e.message||'ai_failed')+'</p>'; setupAiFooter(); } }
function aiTriggerEl(){ return (window.event&&window.event.currentTarget)||document.activeElement; }
function aiAsk(prompt,title){ runAiAnalysis(aiTriggerEl(),prompt,title,false); }
function aiBox(btn,prompt){ runAiAnalysis(btn,prompt,(btn.closest('.ai-box')&&btn.closest('.ai-box').querySelector('.ai-title')||{}).textContent,false); }
function ai(p){ runAiAnalysis(aiTriggerEl(),p,'AI 分析',false); }
async function sendAiChat(){ const item=window._activeAi; if(!item)return; const input=document.getElementById('aiChatInput'); const msg=(input&&input.value||'').trim(); if(!msg){toast('请输入要继续问 AI 的内容');return;} const files=[...((document.getElementById('aiChatFiles')||{}).files||[])].slice(0,5).map(f=>({name:f.name,type:f.type,size:f.size})); if(input)input.value=''; document.getElementById('aiModalBody').insertAdjacentHTML('beforeend','<div class="ai-chat-item user"><div class="bubble">'+esc(msg)+'</div></div><div class="ai-loading"><span class="spin"></span> AI 正在继续分析...</div>'); try{ const {item:next}=await API.post('/api/ai/analyses/'+item.id+'/chat',{message:msg,attachments:files}); window._aiAnalyses.set(next.scope_key,next); renderAiItem(next); }catch(e){ toast('AI 追问失败：'+(e.message||'ai_failed')); } }
async function archiveAiAnalysis(){ const item=window._activeAi; if(!item)return; try{ await API.post('/api/ai/analyses/'+item.id+'/archive',{}); window._aiAnalyses.delete(item.scope_key); closeModal('aiMask'); toast('已归档 AI 分析'); }catch(e){ toast(persistFailMsg(e)); } }
async function depositAi(){ const item=window._activeAi; if(!item||!item.result_text){toast('暂无可沉淀的 AI 内容');return;} const s=aiDeptFromText((item.title||'')+' '+(item.prompt||''))==='SEM'?{dept:'SEM',owner:'陈',c:'b-purple'}:{dept:'SEO',owner:'李',c:'b-blue'}; try{ await persistLoop('deposit',s,item.result_text,'沉淀'); addDeposit(s,item.result_text,'沉淀'); await API.post('/api/ai/analyses/'+item.id+'/action',{action:'deposited'}); toastGo('已沉淀到沉淀表 · 已入库','deposit'); }catch(e){ toast(persistFailMsg(e)); } }
