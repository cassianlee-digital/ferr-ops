/* 图表层：DEMO fixture + 询盘/渠道 donut + SEO 折线 + 总览询盘趋势（拆分自 index.html · 阶段4-B）
   经典 script + window 全局兼容。依赖（运行时解析）：Chart（CDN）、window.API、toast()、formatLocalDate()/withRange()（timerange 内联）、
   mapSeoWeek()（KPI 内联）、window._inqCache（inquiries.js）、window._seoWeeks/_seoWeeksView/_semWeeks/_gran（KPI/timerange）、window.DEMO_MODE。
   charts()/loadDashboardInq()/renderInqDonuts()/rebuildSeoChart()/loadSeoChartRange() 由 window load 初始化、路由、时间筛选、载入流程在运行时调用。 */

/* ===== 1a: DEMO_MODE —— 真实模式(false)禁止任何硬编码示例数据；仅 true 时展示下方 fixture ===== */
window.DEMO_MODE = window.DEMO_MODE || false;
const DEMO = {
  inqTrend: { a:[2,1,2,1,2,1,2,1], total:[6,5,7,8,6,7,8,8] },
  seoMini:  [95,98,92,100,104,99,108,112],
  semMini:  [2.8,2.9,3.0,2.95,3.1,3.0,3.15,3.2],
  inqDonut: { a:7, b:5, c:43, rate:'22%' },
  chanDonut:{ seo:42, sem:33, direct:17, other:8 },
  seoSeries:{ labels:Array.from({length:14},(_,i)=>5+'/'+(4+i*2)),
              clicks:[95,98,92,100,104,99,108,112,109,115,118,114,120,124],
              impr:[120,128,124,132,140,134,145,150,148,155,160,156,165,170] },
};
// 在图表容器内显示「暂无真实数据」空状态(纯静态文案,无外部数据)
function chartEmpty(id){
  const cv=document.getElementById(id); if(!cv) return;
  const wrap=cv.closest('.chart-wrap')||cv.parentElement; if(!wrap) return;
  cv.style.display='none';
  if(wrap.querySelector('.chart-empty')) return;
  const box=document.createElement('div'); box.className='chart-empty';
  const a=document.createElement('div'); a.textContent='暂无真实数据';
  const b=document.createElement('div'); b.className='ce-sub'; b.textContent='请录入数据或完成同步';
  box.appendChild(a); box.appendChild(b); wrap.appendChild(box);
}
function setDonutLegend(map){ Object.keys(map).forEach(id=>{ const e=document.getElementById(id); if(e)e.textContent=map[id]; }); }
function fillDonutLegendDemo(){ setDonutLegend({lgInqA:DEMO.inqDonut.a,lgInqB:DEMO.inqDonut.b,lgInqC:DEMO.inqDonut.c,lgInqRate:DEMO.inqDonut.rate,lgChSeo:DEMO.chanDonut.seo+'%',lgChSem:DEMO.chanDonut.sem+'%',lgChDirect:DEMO.chanDonut.direct+'%',lgChOther:DEMO.chanDonut.other+'%'}); }
function blankDonutLegend(){ setDonutLegend({lgInqA:'—',lgInqB:'—',lgInqC:'—',lgInqRate:'—',lgChSeo:'—',lgChSem:'—',lgChDirect:'—',lgChOther:'—'}); }
/* BUG-6：KPI 页两个 donut 用真实询盘聚合（_inqCache 按当前 range 已过滤），无数据→诚实空状态 */
let _inqDonutChart=null,_chanDonutChart=null;
function renderInqDonuts(){
  if(window.DEMO_MODE)return; // DEMO_MODE 仍走 charts() 示例
  const rows=window._inqCache||[];
  const cv1=document.getElementById('inqDonut'), cv2=document.getElementById('chanDonut');
  if(_inqDonutChart){ try{_inqDonutChart.destroy();}catch(e){} _inqDonutChart=null; }
  if(_chanDonutChart){ try{_chanDonutChart.destroy();}catch(e){} _chanDonutChart=null; }
  if(!rows.length){ if(cv1)chartEmpty('inqDonut'); if(cv2)chartEmpty('chanDonut'); blankDonutLegend(); return; }
  // 质量分布
  const q={A:0,B:0,C:0}; rows.forEach(r=>{ if(q[r.grade]!=null)q[r.grade]++; });
  const total=q.A+q.B+q.C; const eff=q.A+q.B; const rate=total?Math.round(eff*100/total)+'%':'—';
  if(cv1){
    const w=cv1.closest('.chart-wrap')||cv1.parentElement; if(w){ const ce=w.querySelector('.chart-empty'); if(ce)ce.remove(); } cv1.style.display='';
    _inqDonutChart=new Chart(cv1,{type:'doughnut',data:{labels:['A','B','C'],datasets:[{data:[q.A,q.B,q.C],backgroundColor:['#15a85a','#2f72e8','#dfe2e8'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'66%'}});
  }
  // 有效询盘按渠道占比
  const ch={SEO:0,SEM:0,direct:0,other:0}; rows.forEach(r=>{ if(r.grade!=='A'&&r.grade!=='B')return;
    const c=String(r.channel||'').trim(); if(/SEO自然|SEO/i.test(c))ch.SEO++; else if(/SEM付费|SEM/i.test(c))ch.SEM++; else if(/直接/.test(c))ch.direct++; else ch.other++;
  });
  const chTotal=ch.SEO+ch.SEM+ch.direct+ch.other;
  const pct=v=>chTotal?Math.round(v*100/chTotal)+'%':'—';
  if(cv2){
    const w=cv2.closest('.chart-wrap')||cv2.parentElement; if(w){ const ce=w.querySelector('.chart-empty'); if(ce)ce.remove(); } cv2.style.display='';
    _chanDonutChart=new Chart(cv2,{type:'doughnut',data:{labels:['SEO','SEM','直接','其他'],datasets:[{data:[ch.SEO,ch.SEM,ch.direct,ch.other],backgroundColor:['#2f72e8','#7b54e0','#0b9d8f','#ef9514'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'66%'}});
  }
  setDonutLegend({lgInqA:q.A,lgInqB:q.B,lgInqC:q.C,lgInqRate:rate,lgChSeo:pct(ch.SEO),lgChSem:pct(ch.SEM),lgChDirect:pct(ch.direct),lgChOther:pct(ch.other)});
}

let seoChart=null, seoFull=null;
function seoSeriesFromWeeks(){
  // 优先用当前区间视图；真实模式下无数据返回 null(显示空状态),仅 DEMO_MODE 用示例
  let w=(window._seoWeeksView!==undefined)?window._seoWeeksView:window._seoWeeks;
  if(w&&w.length){
    if(window._gran==='month'){ // C-2a：按月汇总(对真实周行求和)。SEO 无日数据，故只支持 周/月，不提供「天」。
      const m=new Map();
      w.forEach(x=>{ const k=x.ym||x.date; if(!m.has(k))m.set(k,{date:k,clicks:0,impr:0}); const o=m.get(k); o.clicks+=(+x.clicks||0); o.impr+=(+x.impr||0); });
      w=[...m.values()];
    }
    return {labels:w.map(x=>x.date), clicks:w.map(x=>x.clicks), impr:w.map(x=>Math.round(x.impr/20))};
  }
  return window.DEMO_MODE ? DEMO.seoSeries : null;
}
function buildSeoData(s){return {labels:s.labels,datasets:[{label:'点击',data:s.clicks,borderColor:'#2f72e8',backgroundColor:'rgba(47,114,232,.1)',fill:true,tension:.4,pointRadius:0,borderWidth:2},{label:'展现÷20',data:s.impr,borderColor:'#9aa1ae',borderDash:[4,3],tension:.4,pointRadius:0,borderWidth:1.5}]};}
function updateSeoChart(range){
  if(!seoChart)return; const s=seoFull; const total=s.labels.length;
  // 数据按周记录：把时间区间换算成「最近 N 周」并按可用数据裁剪
  const weeks={'昨天':1,'上周':1,'上半月':2,'近1月':4,'近3月':13,'近半年':26,'近1年':52,'自定义':total};
  let n=range&&weeks[range]?Math.min(weeks[range],total):total; n=Math.max(n,1);
  const sl=a=>a.slice(-n);
  seoChart.data.labels=sl(s.labels); seoChart.data.datasets[0].data=sl(s.clicks); seoChart.data.datasets[1].data=sl(s.impr); seoChart.update();
}

function rebuildSeoChart(){
  // SEO 看板已改读 GSC 同步数据；有缓存则按当前粒度重渲染，否则走旧的周报兜底
  if(window._gscBoard){ renderSeoBoard(); return; }
  const cv=document.getElementById('seoBoard'); if(!cv)return;
  const wrap=cv.closest('.chart-wrap')||cv.parentElement;
  if(wrap){ const ce=wrap.querySelector('.chart-empty'); if(ce)ce.remove(); }
  cv.style.display='';
  if(seoChart){ try{seoChart.destroy();}catch(e){} seoChart=null; }
  seoFull=seoSeriesFromWeeks();
  const so={responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{maxTicksLimit:7}}}};
  if(seoFull&&seoFull.labels&&seoFull.labels.length) seoChart=new Chart(cv,{type:'line',data:buildSeoData(seoFull),options:so});
  else chartEmpty('seoBoard');
}

// 时间范围变化 → SEO 看板按区间重拉 GSC（旧名保留，调用方无需改）
async function loadSeoChartRange(){ return loadSeoBoardGsc(); }

/* ===== SEO 看板：真实 GSC 同步数据（趋势图 + 顶部卡 + 页面明细，环比上一等长窗口） ===== */
window._gscBoard=null;
function _shiftRange(r){
  const day=86400000;
  const s=new Date(r.start_date+'T00:00:00'), e=new Date(r.end_date+'T00:00:00');
  const len=Math.round((e-s)/day)+1;
  const prevEnd=new Date(s.getTime()-day);
  const prevStart=new Date(prevEnd.getTime()-(len-1)*day);
  return {start_date:formatLocalDate(prevStart), end_date:formatLocalDate(prevEnd)};
}
async function loadSeoBoardGsc(){
  const cur=getCurrentRange();
  let data=null, prev=null;
  try{ data=await API.get(withRange('/api/google/gsc/summary')); }
  catch(e){ window._gscBoard=null; renderSeoBoard(); return; }
  if(cur){ try{ prev=await API.get(withRange('/api/google/gsc/summary', _shiftRange(cur))); }catch(e){ prev=null; } }
  window._gscBoard={data,prev};
  renderSeoBoard();
}
function _aggByGran(byDate, gran){
  if(!gran||gran==='day') return (byDate||[]).map(x=>({label:(x.date||'').slice(5), clicks:+x.clicks||0, impr:+x.impressions||0}));
  const m=new Map();
  (byDate||[]).forEach(x=>{ const d=(x.date||'').slice(0,10); if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return;
    const k= gran==='month'? d.slice(0,7) : _weekStart(d);
    if(!m.has(k))m.set(k,{clicks:0,impr:0}); const o=m.get(k); o.clicks+=(+x.clicks||0); o.impr+=(+x.impressions||0);
  });
  return [...m.keys()].sort().map(k=>({label: gran==='month'?k:k.slice(5), clicks:m.get(k).clicks, impr:m.get(k).impr}));
}
function _seoDelta(id, cur, prev, lowerBetter, fmt){
  const el=document.getElementById(id); if(!el)return;
  if(prev==null||!isFinite(prev)||prev===0||cur==null){ el.textContent=''; el.className='metric-delta'; return; }
  const diff=cur-prev; const better= lowerBetter ? diff<0 : diff>0;
  const arrow= diff>0?'▲':(diff<0?'▼':'—');
  const txt= fmt==='pct' ? Math.abs(diff/prev*100).toFixed(1)+'%' : Math.abs(diff).toFixed(1);
  el.textContent=arrow+' '+txt;
  el.className='metric-delta '+(better?'delta-pos':'delta-neg');
}
function _seoPath(u){ try{ return new URL(u).pathname || u; }catch(e){ return u||'(未知)'; } }
function renderSeoBoard(){
  const cv=document.getElementById('seoBoard');
  const board=window._gscBoard, data=board&&board.data, prev=board&&board.prev;
  const t=(data&&data.totals)||null;
  const _t=(id,v)=>{ const e=document.getElementById(id); if(e)e.textContent=v; };
  // 顶部卡
  if(t){
    _t('sb-clicks',(t.clicks||0).toLocaleString());
    _t('sb-impr',(t.impressions||0).toLocaleString());
    _t('sb-pos',t.position!=null?Number(t.position).toFixed(1):'—');
    _t('sb-cov',(data.queryCount||0).toLocaleString());
    const pt=prev&&prev.totals;
    _seoDelta('sb-clicks-d', t.clicks, pt?pt.clicks:null, false, 'pct');
    _seoDelta('sb-impr-d',   t.impressions, pt?pt.impressions:null, false, 'pct');
    _seoDelta('sb-pos-d',    t.position, pt?pt.position:null, true, 'abs');
    _seoDelta('sb-cov-d',    data.queryCount, prev?prev.queryCount:null, false, 'abs');
  } else {
    ['sb-clicks','sb-impr','sb-pos','sb-cov'].forEach(id=>_t(id,'—'));
    ['sb-clicks-d','sb-impr-d','sb-pos-d','sb-cov-d'].forEach(id=>{ const e=document.getElementById(id); if(e){e.textContent='';e.className='metric-delta';} });
  }
  // 趋势图（双轴：左点击 / 右展现）
  if(cv){
    const wrap=cv.closest('.chart-wrap')||cv.parentElement;
    if(seoChart){ try{seoChart.destroy();}catch(e){} seoChart=null; }
    const series=_aggByGran(data&&data.byDate, window._gran);
    if(series.length){
      if(wrap){ const ce=wrap.querySelector('.chart-empty'); if(ce)ce.remove(); } cv.style.display='';
      seoChart=new Chart(cv,{type:'line',data:{labels:series.map(x=>x.label),datasets:[
        {label:'点击',data:series.map(x=>x.clicks),borderColor:'#2f72e8',backgroundColor:'rgba(47,114,232,.1)',fill:true,tension:.4,pointRadius:0,borderWidth:2,yAxisID:'y'},
        {label:'展现',data:series.map(x=>x.impr),borderColor:'#9aa1ae',borderDash:[4,3],tension:.4,pointRadius:0,borderWidth:1.5,yAxisID:'y1'}
      ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
        plugins:{legend:{display:false},tooltip:{enabled:true}},
        scales:{x:{ticks:{maxTicksLimit:7}},y:{position:'left',beginAtZero:true,ticks:{precision:0}},y1:{position:'right',beginAtZero:true,grid:{drawOnChartArea:false}}}}});
    } else chartEmpty('seoBoard');
  }
  // 页面明细
  const tb=document.getElementById('seoPageRows');
  if(tb){
    const pages=(data&&data.topPages)||[];
    if(!pages.length){ tb.innerHTML='<tr><td colspan="7" class="dim" style="text-align:center;padding:14px">暂无真实数据 · 请完成 GSC 同步</td></tr>'; }
    else{
      const clean=s=>String(s).replace(/["'<>]/g,''); // 用于 onclick 单引号参数，去掉会破坏属性的字符
      tb.innerHTML=pages.slice(0,20).map(p=>{
        const path=_seoPath(p.page);
        const ctr=p.ctr!=null?(p.ctr*100).toFixed(1)+'%':'—';
        const pos=p.position!=null?Number(p.position).toFixed(1):'—';
        const q=clean('分析页面 '+path+' 的SEO表现：点击'+(p.clicks||0)+'、展现'+(p.impressions||0)+'、CTR'+ctr+'、均排名'+pos+'。给出最该先改的3个动作。');
        const title=clean(path+' 诊断');
        return '<tr><td class="dim" style="font-size:11px">'+esc(path)+'</td><td class="num">'+(p.clicks||0).toLocaleString()+'</td><td class="num">'+(p.impressions||0).toLocaleString()+'</td><td class="num">'+ctr+'</td><td class="num">'+pos+'</td><td class="num dim">—</td><td class="ctr"><button class="btn-mini" onclick="aiAsk(\''+q+'\',\''+title+'\')"><i class="ti ti-bulb"></i> 诊断</button></td></tr>';
      }).join('');
    }
  }
}

// 标签切换后重算可见 ECharts 尺寸（隐藏容器里 init 会拿到 0 尺寸→切过来需 resize）
function _resizeScatters(){
  setTimeout(()=>{ [window._seoScatterChart,window._semScatterChart].forEach(c=>{ if(c){ try{c.resize();}catch(e){} } }); },60);
}

/* ===== SEO 富看板（Looker 风格）：本周要点 + Δ表 + 机会词散点 + GA4 来源 ===== */
window._seoSrcDonut=null; window._seoSrcArea=null; window._seoScatterChart=null;
function _median(a){ const s=(a||[]).filter(x=>x!=null).sort((x,y)=>x-y); if(!s.length)return 0; const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; }
// 返回带色 Δ 的 HTML（lowerBetter=true 时数值越小越好，如排名/CPC）
function _deltaHtml(cur,prev,lowerBetter,fmt){
  if(prev==null||!isFinite(prev)||prev===0||cur==null) return '<span class="dim">—</span>';
  const diff=cur-prev; if(diff===0) return '<span class="dim">—</span>';
  const better=lowerBetter?diff<0:diff>0;
  const arrow=diff>0?'▲':'▼';
  const txt=fmt==='pct'?Math.abs(diff/prev*100).toFixed(0)+'%':Math.abs(diff).toFixed(fmt==='abs1'?1:0);
  return '<span class="'+(better?'delta-pos':'delta-neg')+'">'+arrow+txt+'</span>';
}
async function loadSeoBoardFull(){
  let d=null;
  try{ d=await API.get(withRange('/api/google/seo/board')); }catch(e){ d=null; }
  renderSeoHighlights(d); renderSeoDeltaTables(d); renderSeoScatter(d); renderSeoSources(d);
}
function renderSeoHighlights(d){
  const box=document.getElementById('seoHighlights'); if(!box)return;
  const hs=(d&&d.highlights)||[];
  if(!hs.length){ box.style.display='none'; box.innerHTML=''; return; }
  box.style.display='';
  box.innerHTML='<span class="seo-hl-t"><i class="ti ti-flame"></i> 本周要点</span>'+hs.map(h=>'<span class="seo-hl-chip '+(h.tone==='good'?'good':'bad')+'">'+esc(h.text)+'</span>').join('');
}
function renderSeoDeltaTables(d){
  const pt=document.getElementById('seoPagesDelta');
  if(pt){
    const pages=(d&&d.pages)||[];
    pt.innerHTML=pages.length?pages.map(p=>{
      const path=_seoPath(p.page);
      const q=_attr('分析落地页 '+path+' 的SEO表现：本期点击'+(p.clicks||0)+'(上期'+(p.clicksPrev||0)+')、展现'+(p.impressions||0)+'。给出最该先改的3个动作。');
      return '<tr><td class="dim" style="font-size:11px">'+esc(path)+'</td><td class="num">'+(p.clicks||0).toLocaleString()+'</td><td class="num">'+_deltaHtml(p.clicks,p.clicksPrev,false,'pct')+'</td><td class="num">'+(p.impressions||0).toLocaleString()+'</td><td class="ctr"><button class="btn-mini" onclick="aiAsk(\''+q+'\',\'落地页诊断\')"><i class="ti ti-bulb"></i> 诊断</button></td></tr>';
    }).join(''):'<tr><td colspan="5" class="dim" style="text-align:center;padding:14px">暂无数据 · 完成 GSC 同步</td></tr>';
  }
  const qt=document.getElementById('seoQueriesDelta');
  if(qt){
    const qs=(d&&d.queries)||[];
    qt.innerHTML=qs.length?qs.map(q=>{
      const pos=q.position!=null?Number(q.position).toFixed(1):'—';
      return '<tr><td>'+esc(q.query)+'</td><td class="num">'+(q.impressions||0).toLocaleString()+'</td><td class="num">'+_deltaHtml(q.impressions,q.imprPrev,false,'pct')+'</td><td class="num">'+(q.clicks||0).toLocaleString()+'</td><td class="num">'+pos+'</td><td class="num">'+_deltaHtml(q.position,q.positionPrev,true,'abs1')+'</td></tr>';
    }).join(''):'<tr><td colspan="6" class="dim" style="text-align:center;padding:14px">暂无数据 · 完成 GSC 同步</td></tr>';
  }
}
function _seoScatterTitles(t,s){ const a=document.getElementById('seoScatterTitle'),b=document.getElementById('seoScatterSub'); if(a)a.textContent=t; if(b)b.textContent=s; }
function renderSeoScatterTargets(list){
  const box=document.getElementById('seoScatterTargets'); if(!box)return;
  if(!list||!list.length){ box.innerHTML=''; return; }
  box.innerHTML='<div class="scatter-targets"><div class="st-head"><i class="ti ti-target-arrow"></i> 重点优化对象 · 高流量高跳出（'+list.length+'）</div>'+list.slice(0,8).map(p=>{
    const path=_seoPath(p.page), b=Math.round((p.bounceRate||0)*100), dur=Math.round(p.avgDuration||0);
    const q=_attr('落地页 '+path+' 会话'+p.sessions+'、跳出率'+b+'%、均时长'+dur+'s，流量不小但跳出偏高。给出降低跳出、提升留存与转化的具体优化动作（首屏/内容匹配/CTA/加载速度）。');
    const ti=_attr('降跳出：'+path), de=_attr('落地页 '+path+' 高流量('+p.sessions+'会话)高跳出('+b+'%)，优化首屏/内容匹配/CTA 降低跳出、提升转化。'), ev=_attr('GA4 会话'+p.sessions+' 跳出'+b+'% 时长'+dur+'s');
    return '<div class="st-row"><div class="st-main"><span class="st-path">'+esc(path)+'</span><span class="st-meta dim">'+p.sessions.toLocaleString()+' 会话 · 跳出 <b style="color:#c93338">'+b+'%</b> · '+dur+'s</span></div><div class="st-acts"><button class="btn-mini" onclick="aiAsk(\''+q+'\',\'降跳出诊断\')"><i class="ti ti-bulb"></i> 诊断</button><button class="btn-mini" onclick="adoptFinding(this,\'SEO\',\''+ti+'\',\''+de+'\',\''+ev+'\')"><i class="ti ti-clipboard-check"></i> 采纳</button></div></div>';
  }).join('')+'</div>';
}
function renderSeoScatter(d){
  const el=document.getElementById('seoScatter'), empty=document.getElementById('seoScatterEmpty'); if(!el)return;
  const _tb=document.getElementById('seoScatterTargets'); if(_tb)_tb.innerHTML='';
  const ps=(d&&d.pageScatter)||[];
  // 首选：GA4 页面级 会话 × 跳出率（参考图；高流量+高跳出=重点优化对象，自动标红）
  if(ps.length && typeof echarts!=='undefined'){
    el.style.display=''; if(empty)empty.style.display='none';
    _seoScatterTitles('找出需要优化的页面 · 会话 × 跳出率','右上红区=高流量+高跳出=重点优化对象；中位线分四象限；点=落地页');
    if(window._seoScatterChart){ try{window._seoScatterChart.dispose();}catch(e){} }
    window._seoScatterChart=echarts.init(el);
    const medS=_median(ps.map(p=>p.sessions)), medB=_median(ps.map(p=>(p.bounceRate||0)*100));
    const maxS=Math.max(...ps.map(p=>p.sessions),1)*1.6;
    const isTarget=p=>p.sessions>=medS && (p.bounceRate||0)*100>=medB;
    const short=u=>{ const s=_seoPath(u); return s.length>22?'…'+s.slice(-21):s; };
    const data=ps.map(p=>{ const t=isTarget(p); return { value:[p.sessions,+(((p.bounceRate||0)*100).toFixed(1)),_seoPath(p.page),p.avgDuration||0],
      itemStyle:{color:t?'#e5484d':'#2f72e8',opacity:t?.85:.6},
      label:{show:t,position:'right',fontSize:9,color:'#c93338',formatter:o=>short(o.value[2])} }; });
    window._seoScatterChart.setOption({
      grid:{left:52,right:120,top:16,bottom:44},
      xAxis:{type:'log',name:'会话',nameLocation:'middle',nameGap:26,axisLabel:{fontSize:10}},
      yAxis:{type:'value',name:'跳出率%',min:0,max:100,nameGap:30,axisLabel:{fontSize:10}},
      tooltip:{formatter:o=>esc(o.value[2])+'<br/>会话 '+o.value[0].toLocaleString()+' · 跳出率 '+o.value[1]+'% · 均时长 '+Math.round(o.value[3])+'s'},
      series:[{type:'scatter',symbolSize:v=>Math.min(32,8+Math.sqrt(v[0]||0)),data,
        markLine:{silent:true,symbol:'none',lineStyle:{type:'dashed',color:'#c2c7d0'},label:{show:true,fontSize:9,color:'#9aa1ae',formatter:o=>o.dataType==='max'?'':'中位'},data:[{xAxis:medS},{yAxis:medB}]},
        markArea:{silent:true,itemStyle:{color:'rgba(229,72,77,.07)'},label:{show:true,position:['85%','6%'],color:'#e5484d',fontSize:11,fontWeight:'bold',formatter:'重点优化对象'},data:[[{xAxis:medS,yAxis:medB},{xAxis:maxS,yAxis:100}]]}}]
    });
    renderSeoScatterTargets(ps.filter(isTarget).sort((a,b)=>b.sessions-a.sessions));
    return;
  }
  // 回退：GA4 跳出率数据未重新同步时，用 GSC 展现 × 排名 机会词散点
  const pts=(d&&d.scatter)||[];
  if(typeof echarts==='undefined'||!pts.length){ el.style.display='none'; if(empty)empty.style.display=''; return; }
  el.style.display=''; if(empty)empty.style.display='none';
  _seoScatterTitles('机会词象限 · 展现 × 排名','（GA4 跳出率待重新同步后切换为“会话×跳出率”）右上=高展现差排名=重点攻；点=关键词');
  if(window._seoScatterChart){ try{window._seoScatterChart.dispose();}catch(e){} }
  window._seoScatterChart=echarts.init(el);
  const data=pts.map(p=>[p.impressions,p.position,p.clicks,p.query]);
  const medImpr=_median(pts.map(p=>p.impressions)), medPos=_median(pts.map(p=>p.position));
  window._seoScatterChart.setOption({
    grid:{left:52,right:24,top:16,bottom:44},
    xAxis:{type:'log',name:'展现',nameLocation:'middle',nameGap:26,axisLabel:{fontSize:10}},
    yAxis:{type:'value',name:'排名(越低越好)',inverse:true,min:1,nameGap:30,axisLabel:{fontSize:10}},
    tooltip:{formatter:o=>esc(o.data[3])+'<br/>展现 '+o.data[0].toLocaleString()+' · 排名 '+o.data[1].toFixed(1)+' · 点击 '+o.data[2]},
    series:[{type:'scatter',symbolSize:v=>Math.min(30,7+Math.sqrt(v[2]||0)*2.2),data,itemStyle:{color:'#2f72e8',opacity:.68},
      markLine:{silent:true,symbol:'none',lineStyle:{type:'dashed',color:'#c2c7d0'},label:{show:false},data:[{xAxis:medImpr},{yAxis:medPos}]}}]
  });
}
function renderSeoSources(d){
  const palette=['#2f72e8','#7b54e0','#0b9d8f','#ef9514','#e5484d','#9aa1ae'];
  const srcs=(d&&d.sources)||[];
  const donutCv=document.getElementById('seoSrcDonut'), legend=document.getElementById('seoSrcLegend');
  if(donutCv){
    if(window._seoSrcDonut){ try{window._seoSrcDonut.destroy();}catch(e){} window._seoSrcDonut=null; }
    const top=srcs.slice(0,6);
    if(top.length){
      window._seoSrcDonut=new Chart(donutCv,{type:'doughnut',data:{labels:top.map(s=>s.source),datasets:[{data:top.map(s=>s.sessions),backgroundColor:palette,borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'62%'}});
      const total=top.reduce((a,s)=>a+(s.sessions||0),0)||1;
      if(legend)legend.innerHTML=top.map((s,i)=>{ const b=s.bounceRate!=null?'<span class="dim" style="font-size:10.5px"> · 跳出'+Math.round(s.bounceRate*100)+'%</span>':''; return '<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span><span style="color:'+palette[i%palette.length]+'">●</span> '+esc(s.source)+b+'</span><b>'+Math.round((s.sessions||0)/total*100)+'%</b></div>'; }).join('');
    } else if(legend){ legend.innerHTML='<span class="dim">暂无 GA4 来源数据 · 完成同步后显示</span>'; }
  }
  const areaCv=document.getElementById('seoSrcArea');
  if(areaCv){
    if(window._seoSrcArea){ try{window._seoSrcArea.destroy();}catch(e){} window._seoSrcArea=null; }
    const ss=d&&d.sourceSeries;
    if(ss&&ss.dates&&ss.dates.length){
      window._seoSrcArea=new Chart(areaCv,{type:'line',data:{labels:ss.dates.map(x=>x.slice(5)),datasets:ss.series.map((se,i)=>({label:se.source,data:se.values,borderColor:palette[i%palette.length],backgroundColor:palette[i%palette.length]+'55',fill:true,stack:'s',tension:.3,pointRadius:0,borderWidth:1.4}))},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{boxWidth:10,font:{size:10}}}},scales:{x:{ticks:{maxTicksLimit:8,font:{size:10}}},y:{stacked:true,beginAtZero:true,ticks:{precision:0}}}}});
    } else { chartEmpty('seoSrcArea'); }
  }
}

/* ===== SEM 看板：真实 Google Ads 同步数据（顶部卡 + 系列→关键词层级，按所选时间范围） ===== */
window._adsBoard=null;
function _money(m){ return m==null?'—':(m/1e6).toLocaleString(undefined,{maximumFractionDigits:2}); }
function _conv(v){ return v==null?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:2}); }
function _adsBadge(cost,conv){ // 诚实的轻量评估
  if((cost||0)===0) return '<span class="badge b-gray">无花费</span>';
  if((conv||0)>0)   return '<span class="badge b-green">有转化</span>';
  return '<span class="badge b-red">零有效</span>';
}
async function loadSemBoardAds(){
  let data=null;
  try{ data=await API.get(withRange('/api/google/ads/summary')); }
  catch(e){ window._adsBoard=null; renderSemBoard(); return; }
  window._adsBoard=data; renderSemBoard();
}
function renderSemBoard(){
  const data=window._adsBoard, t=data&&data.totals;
  const _t=(id,v)=>{ const e=document.getElementById(id); if(e)e.textContent=v; };
  if(t){
    _t('sm-conv',_conv(t.conversions));
    _t('sm-cpconv',_money(t.costPerConversionMicros));
    _t('sm-cost',_money(t.costMicros));
  } else { ['sm-conv','sm-cpconv','sm-cost'].forEach(id=>_t(id,'—')); }
  const tb=document.getElementById('semHierRows');
  if(!tb)return;
  const camps=(data&&data.campaigns)||[], kws=(data&&data.keywords)||[];
  if(!camps.length){ tb.innerHTML='<tr><td colspan="5" class="dim" style="text-align:center;padding:14px">暂无真实数据 · 请完成 Google Ads 同步</td></tr>'; return; }
  const byCamp=new Map(); kws.forEach(k=>{ const n=k.campaignName||''; if(!byCamp.has(n))byCamp.set(n,[]); byCamp.get(n).push(k); });
  const cpc=(cost,conv)=> (conv&&conv>0)? _money(cost/conv) : '—';
  let html='';
  camps.forEach(c=>{
    html+='<tr class="h-camp" onclick="toggleHier(this)"><td><i class="ti ti-chevron-down hicon"></i> <b>'+esc(c.campaignName||'(未命名)')+'</b></td>'
        +'<td class="num">'+_money(c.costMicros)+'</td><td class="num">'+_conv(c.conversions)+'</td><td class="num">'+cpc(c.costMicros,c.conversions)+'</td><td class="ctr">'+_adsBadge(c.costMicros,c.conversions)+'</td></tr>';
    (byCamp.get(c.campaignName||'')||[]).forEach(k=>{
      const mt=k.matchType?(' · '+esc(k.matchType)):'';
      html+='<tr class="h-kw"><td>　• '+esc(k.keyword||'')+'<span class="dim" style="font-size:11px">'+mt+'</span></td>'
          +'<td class="num">'+_money(k.costMicros)+'</td><td class="num">'+_conv(k.conversions)+'</td><td class="num">'+cpc(k.costMicros,k.conversions)+'</td><td class="ctr">'+_adsBadge(k.costMicros,k.conversions)+'</td></tr>';
    });
  });
  tb.innerHTML=html;
}

/* ===== SEM 富看板：本周要点 + Δ表 + 花费×转化散点 + 系列甜甜圈/日趋势 ===== */
window._semCostDonut=null; window._semTrend=null; window._semScatterChart=null;
async function loadSemBoardFull(){
  let d=null; try{ d=await API.get(withRange('/api/google/ads/board')); }catch(e){ d=null; }
  renderSemHighlights(d); renderSemDeltaTables(d); renderSemScatter(d); renderSemCostCharts(d);
}
function renderSemHighlights(d){
  const box=document.getElementById('semHighlights'); if(!box)return;
  const hs=(d&&d.highlights)||[];
  if(!hs.length){ box.style.display='none'; box.innerHTML=''; return; }
  box.style.display='';
  box.innerHTML='<span class="seo-hl-t"><i class="ti ti-flame"></i> 本周要点</span>'+hs.map(h=>'<span class="seo-hl-chip '+(h.tone==='good'?'good':'bad')+'">'+esc(h.text)+'</span>').join('');
}
function renderSemDeltaTables(d){
  const cpc=(cost,conv)=> (conv&&conv>0)? _money(cost/conv) : '—';
  const rate=(a,b)=> (b&&b>0)? (a/b*100).toFixed(1)+'%' : '—';
  // 投放中广告系列 · 全量（像 Ads 后台）
  const ct=document.getElementById('semCampFull');
  if(ct){ const cs=(d&&d.campaigns)||[];
    ct.innerHTML=cs.length?cs.map(c=>{
      const ctr=rate(c.clicks,c.impressions), cvr=rate(Number(c.conversions||0),c.clicks);
      const cpcCost=(c.clicks&&c.clicks>0)?_money(c.costMicros/c.clicks):'—';
      return '<tr><td>'+esc(c.name||'(未命名)')+'</td><td class="num">'+(c.impressions||0).toLocaleString()+'</td><td class="num">'+(c.clicks||0).toLocaleString()+'</td><td class="num">'+ctr+'</td><td class="num">'+_money(c.costMicros)+'</td><td class="num">'+cpcCost+'</td><td class="num">'+_conv(c.conversions)+'</td><td class="num">'+cvr+'</td><td class="num">'+cpc(c.costMicros,c.conversions)+'</td><td class="ctr">'+_adsBadge(c.costMicros,c.conversions)+'</td></tr>';
    }).join(''):'<tr><td colspan="10" class="dim" style="text-align:center;padding:14px">暂无数据 · 完成 Ads 同步</td></tr>';
  }
  // 关键词 · 花费/转化 环比
  const kt=document.getElementById('semKwRows');
  if(kt){ const ks=(d&&d.keywords)||[];
    kt.innerHTML=ks.length?ks.map(k=>'<tr><td>'+esc(k.keyword||'')+'</td><td class="num">'+_money(k.costMicros)+'</td><td class="num">'+_conv(k.conversions)+'</td><td class="num">'+_deltaHtml(k.conversions,k.convPrev,false,'abs1')+'</td><td class="num">'+cpc(k.costMicros,k.conversions)+'</td><td class="ctr">'+_adsBadge(k.costMicros,k.conversions)+'</td></tr>').join(''):'<tr><td colspan="6" class="dim" style="text-align:center;padding:14px">暂无数据 · 完成 Ads 同步</td></tr>';
  }
}
function _semScatterTitles(t,s){ const a=document.getElementById('semScatterTitle'),b=document.getElementById('semScatterSub'); if(a)a.textContent=t; if(b)b.textContent=s; }
function renderSemScatterTargets(list){
  const box=document.getElementById('semScatterTargets'); if(!box)return;
  if(!list||!list.length){ box.innerHTML=''; return; }
  box.innerHTML='<div class="scatter-targets"><div class="st-head"><i class="ti ti-scissors"></i> 零转化烧钱词 · 该砍/暂停（'+list.length+'）</div>'+list.slice(0,10).map(p=>{
    const cost=(p.costMicros/1e6), c=Number(p.conversions||0);
    const q=_attr('关键词「'+p.keyword+'」花费'+cost.toFixed(0)+'、转化'+c+'、点击'+(p.clicks||0)+'，花钱多但转化低。判断该暂停/降价/改精准匹配/换落地页，给出具体动作与验证指标。');
    const ti=_attr('该砍词：'+p.keyword), de=_attr('关键词「'+p.keyword+'」('+(p.campaignName||'')+') 花'+cost.toFixed(0)+' 仅转化'+c+'，暂停或降价/改精准匹配止损。'), ev=_attr('Ads 花费'+cost.toFixed(0)+' 转化'+c+' 点击'+(p.clicks||0));
    return '<div class="st-row"><div class="st-main"><span class="st-path">'+esc(p.keyword)+'</span><span class="st-meta dim">'+esc(p.campaignName||'')+' · 花 <b style="color:#c93338">'+cost.toFixed(0)+'</b> · 转化 '+c+'</span></div><div class="st-acts"><button class="btn-mini" onclick="aiAsk(\''+q+'\',\'该砍诊断\')"><i class="ti ti-bulb"></i> 诊断</button><button class="btn-mini" onclick="adoptFinding(this,\'SEM\',\''+ti+'\',\''+de+'\',\''+ev+'\')"><i class="ti ti-clipboard-check"></i> 采纳</button></div></div>';
  }).join('')+'</div>';
}
function renderSemScatter(d){
  const el=document.getElementById('semScatter'), empty=document.getElementById('semScatterEmpty'); if(!el)return;
  const _tb=document.getElementById('semScatterTargets'); if(_tb)_tb.innerHTML='';
  const all=(d&&d.scatter)||[];
  // 有转化的词进散点(按每转化成本散开)；零转化烧钱词进下方「该砍」清单
  const conv=all.filter(p=>Number(p.conversions||0)>0).map(p=>({...p,cost:p.costMicros/1e6,cpa:(p.costMicros/1e6)/Number(p.conversions)}));
  const zero=all.filter(p=>Number(p.conversions||0)===0 && p.costMicros>0).sort((a,b)=>b.costMicros-a.costMicros);
  _semScatterTitles('花费 × 每转化成本 · 找又贵又不划算的词','点=有转化的词；上方红带=每转化成本偏高→优化出价/落地页；零转化烧钱词见下方清单');
  if(typeof echarts!=='undefined' && conv.length){
    el.style.display=''; if(empty)empty.style.display='none';
    if(window._semScatterChart){ try{window._semScatterChart.dispose();}catch(e){} }
    window._semScatterChart=echarts.init(el);
    const medCpa=_median(conv.map(p=>p.cpa));
    const short=s=>{ s=String(s||''); return s.length>20?s.slice(0,19)+'…':s; };
    const data=conv.map(p=>{ const t=p.cpa>=medCpa; return { value:[+p.cost.toFixed(0),+p.cpa.toFixed(0),p.keyword,p.conversions], itemStyle:{color:t?'#e5484d':'#7b54e0',opacity:t?.85:.62}, label:{show:t,position:'right',fontSize:9,color:'#c93338',formatter:o=>short(o.value[2])} }; });
    window._semScatterChart.setOption({
      grid:{left:56,right:120,top:16,bottom:44},
      xAxis:{type:'log',name:'花费',nameLocation:'middle',nameGap:26,axisLabel:{fontSize:10}},
      yAxis:{type:'log',name:'每转化成本',nameGap:8,axisLabel:{fontSize:10}},
      tooltip:{formatter:o=>esc(o.value[2])+'<br/>花费 '+o.value[0]+' · 每转化成本 '+o.value[1]+' · 转化 '+o.value[3]},
      series:[{type:'scatter',symbolSize:v=>Math.min(30,8+Math.sqrt(v[0]||0)/3),data,
        markLine:{silent:true,symbol:'none',lineStyle:{type:'dashed',color:'#c2c7d0'},label:{show:true,fontSize:9,color:'#9aa1ae',formatter:'中位每转化'},data:[{yAxis:medCpa}]},
        markArea:{silent:true,itemStyle:{color:'rgba(229,72,77,.07)'},label:{show:true,position:['50%','8%'],color:'#e5484d',fontSize:11,fontWeight:'bold',formatter:'每转化偏贵'},data:[[{yAxis:medCpa},{yAxis:'max'}]]}}]
    });
  } else {
    el.style.display='none'; if(window._semScatterChart){ try{window._semScatterChart.dispose();}catch(e){} window._semScatterChart=null; }
    if(empty){ empty.style.display=''; empty.textContent=all.length?'本区间暂无「有转化」的关键词；零转化烧钱词见下方「该砍」清单':'暂无足够数据 · 完成 Google Ads 同步后显示'; }
  }
  renderSemScatterTargets(zero);
}
function renderSemCostCharts(d){
  const palette=['#7b54e0','#2f72e8','#0b9d8f','#ef9514','#e5484d','#9aa1ae'];
  const cs=(d&&d.campaigns)||[];
  const donutCv=document.getElementById('semCostDonut'), legend=document.getElementById('semCostLegend');
  if(donutCv){
    if(window._semCostDonut){ try{window._semCostDonut.destroy();}catch(e){} window._semCostDonut=null; }
    const top=cs.slice(0,6);
    if(top.length){
      window._semCostDonut=new Chart(donutCv,{type:'doughnut',data:{labels:top.map(c=>c.name),datasets:[{data:top.map(c=>c.costMicros/1e6),backgroundColor:palette,borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'62%'}});
      const total=top.reduce((a,c)=>a+(c.costMicros||0),0)||1;
      if(legend)legend.innerHTML=top.map((c,i)=>'<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span><span style="color:'+palette[i%palette.length]+'">●</span> '+esc(c.name)+'</span><b>'+Math.round((c.costMicros||0)/total*100)+'%</b></div>').join('');
    } else if(legend){ legend.innerHTML='<span class="dim">暂无 Ads 数据 · 完成同步后显示</span>'; }
  }
  const trendCv=document.getElementById('semTrend');
  if(trendCv){
    if(window._semTrend){ try{window._semTrend.destroy();}catch(e){} window._semTrend=null; }
    const s=(d&&d.series)||[];
    if(s.length){
      window._semTrend=new Chart(trendCv,{type:'line',data:{labels:s.map(x=>x.date.slice(5)),datasets:[
        {label:'花费',data:s.map(x=>+(x.costMicros/1e6).toFixed(0)),borderColor:'#7b54e0',backgroundColor:'rgba(123,84,224,.12)',fill:true,tension:.3,pointRadius:0,borderWidth:2,yAxisID:'y'},
        {label:'转化',data:s.map(x=>x.conversions),borderColor:'#15a85a',tension:.3,pointRadius:0,borderWidth:1.6,yAxisID:'y1'}
      ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{boxWidth:10,font:{size:10}}}},scales:{x:{ticks:{maxTicksLimit:8,font:{size:10}}},y:{position:'left',beginAtZero:true},y1:{position:'right',beginAtZero:true,grid:{drawOnChartArea:false}}}}});
    } else { chartEmpty('semTrend'); }
  }
}

/* ===== 诊断引擎：基于真实同步数据填充 SEO 三子面板 + 角标计数 ===== */
function _attr(s){ return String(s==null?'':s).replace(/["'<>]/g,''); }
function _badgeCount(id,n){ const e=document.getElementById(id); if(!e)return; if(n>0){ e.textContent=n; e.style.display=''; } else { e.textContent=''; e.style.display='none'; } }
// 诊断 finding 一键采纳进整改清单（依据数据证据,source=诊断引擎）。复用 closed-loop 的全局
async function adoptFinding(btn,dept,title,detail,evidence){
  try{
    const s=(typeof sFromDept==='function')?sFromDept(dept):{dept,owner:''};
    const {item}=await API.post('/api/fixes',{title:(typeof clip==='function'?clip(title,40):title),dept:s.dept,detail,evidence,owner:s.owner,due_date:(typeof plusDays==='function'?plusDays(7):''),status:'计划下周',source:'诊断引擎'});
    if(typeof addFixFromObj==='function') addFixFromObj(item);
    btn.disabled=true; btn.innerHTML='<i class="ti ti-check"></i> 已采纳';
    if(typeof toastGo==='function') toastGo('已采纳 → 整改清单 · 已入库','fix'); else toast('已采纳 → 整改清单');
  }catch(e){ toast((typeof persistFailMsg==='function')?persistFailMsg(e):'保存失败,未入库'); }
}
async function loadDiagnostics(){
  let d=null;
  try{ d=await API.get(withRange('/api/diagnostics')); }catch(e){ d=null; }
  renderDiagnostics(d);
}
function renderDiagnostics(d){
  const seo=(d&&d.seo)||{}, opp=seo.opportunities||[], dec=seo.decay||[], can=seo.cannibalization||[];
  _badgeCount('diag-opp-n',opp.length); _badgeCount('diag-decay-n',dec.length); _badgeCount('diag-cann-n',can.length);
  // 站点机会
  const t1=document.getElementById('diagOppRows');
  if(t1){
    t1.innerHTML = opp.length ? opp.map(o=>{
      const path=_seoPath(o.page), pos=o.position!=null?Number(o.position).toFixed(1):'—';
      const q=_attr('关键词「'+o.query+'」当前排名'+pos+'、页面'+path+'、区间曝光'+(o.impressions||0)+'，给出冲进Top10的具体优化清单（标题/内容/内链/外链）。');
      const ti=_attr('机会词冲首页：'+o.query), de=_attr('关键词「'+o.query+'」当前排名'+pos+'（页面'+path+'），区间曝光'+(o.impressions||0)+'。优化标题/内容/内链冲进 Top10。'), ev=_attr('GSC机会词 排名'+pos+' 展现'+(o.impressions||0)+' 点击'+(o.clicks||0));
      return '<tr><td>'+esc(o.query)+'</td><td class="dim" style="font-size:11px">'+esc(path)+'</td><td class="num"><span class="badge b-amber">'+pos+'</span></td><td class="num">'+(o.impressions||0).toLocaleString()+'</td><td class="ctr"><button class="btn-mini" onclick="aiAsk(\''+q+'\',\'机会词诊断\')"><i class="ti ti-bulb"></i> 怎么冲首页</button> <button class="btn-mini" onclick="adoptFinding(this,\'SEO\',\''+ti+'\',\''+de+'\',\''+ev+'\')"><i class="ti ti-clipboard-check"></i> 采纳</button></td></tr>';
    }).join('') : '<tr><td colspan="5" class="dim" style="text-align:center;padding:14px">暂无机会词 · 完成 GSC 同步后按规则自动识别</td></tr>';
  }
  // 流量衰退
  const t2=document.getElementById('diagDecayRows');
  if(t2){
    t2.innerHTML = dec.length ? dec.map(p=>{
      const path=_seoPath(p.page);
      const posChg=(p.positionPrev!=null&&p.positionCur!=null)?(Number(p.positionPrev).toFixed(1)+'→'+Number(p.positionCur).toFixed(1)):'—';
      const q=_attr(path+' 点击近一窗跌'+p.dropPct+'%（'+p.clicksPrev+'→'+p.clicksCur+'），排名'+posChg+'。给出排查与止损步骤。');
      const ti=_attr('衰退止损：'+path), de=_attr('页面'+path+' 点击环比跌'+p.dropPct+'%（'+p.clicksPrev+'→'+p.clicksCur+'），排名'+posChg+'。排查原因并止损。'), ev=_attr('GSC环比 点击↓'+p.dropPct+'% 排名'+posChg);
      return '<tr><td class="dim" style="font-size:11px">'+esc(path)+'</td><td class="num" style="color:var(--primary)">▼'+p.dropPct+'%</td><td class="num">'+esc(posChg)+'</td><td class="ctr"><span class="badge b-gray">需排查</span></td><td class="ctr"><button class="btn-mini" onclick="aiAsk(\''+q+'\',\'衰退止损\')"><i class="ti ti-bulb"></i> 止损方案</button> <button class="btn-mini" onclick="adoptFinding(this,\'SEO\',\''+ti+'\',\''+de+'\',\''+ev+'\')"><i class="ti ti-clipboard-check"></i> 采纳</button></td></tr>';
    }).join('') : '<tr><td colspan="5" class="dim" style="text-align:center;padding:14px">暂无明显衰退页 · 需≥2 个等长窗口数据才能比较</td></tr>';
  }
  // 关键词蚕食
  const t3=document.getElementById('diagCannRows');
  if(t3){
    t3.innerHTML = can.length ? can.map(g=>{
      const urls=g.pages.map(p=>esc(_seoPath(p.page))).join('<br>');
      const ranks=g.pages.map(p=>p.position!=null?Number(p.position).toFixed(0):'—').join(' / ');
      const detail=g.pages.map(p=>_seoPath(p.page)+'(排名'+(p.position!=null?Number(p.position).toFixed(1):'—')+')').join('、');
      const q=_attr('关键词「'+g.query+'」被'+g.pages.length+'个URL同时竞争：'+detail+'。给出合并方案：保留哪个为主页、其余如何301或改写差异化意图、内链怎么调。');
      const ti=_attr('蚕食合并：'+g.query), de=_attr('关键词「'+g.query+'」被'+g.pages.length+'个URL竞争：'+detail+'。合并/差异化意图、调整内链。'), ev=_attr('GSC '+g.pages.length+'页分散排名 '+ranks);
      return '<tr><td>'+esc(g.query)+'</td><td class="dim" style="font-size:11px">'+urls+'</td><td class="num"><span class="badge b-red">'+esc(ranks)+'</span></td><td class="ctr"><span class="badge b-amber">'+g.pages.length+'页抢1意图</span></td><td class="ctr"><button class="btn-mini" onclick="aiAsk(\''+q+'\',\'蚕食合并建议\')"><i class="ti ti-git-merge"></i> AI 合并建议</button> <button class="btn-mini" onclick="adoptFinding(this,\'SEO\',\''+ti+'\',\''+de+'\',\''+ev+'\')"><i class="ti ti-clipboard-check"></i> 采纳</button></td></tr>';
    }).join('') : '<tr><td colspan="5" class="dim" style="text-align:center;padding:14px">暂无蚕食组 · 完成 GSC 同步后按规则自动识别</td></tr>';
  }
}

/* C-2b：有效询盘趋势——真实数据按粒度(天/周/月)聚合。询盘按天入库，三种粒度都诚实可做 */
let inqChart=null;
function _weekStart(dateStr){ const d=new Date(dateStr+'T00:00:00'); const day=(d.getDay()+6)%7; d.setDate(d.getDate()-day); return formatLocalDate(d); } // 周一为周起点
function inqSeriesByGran(rows,gran){
  const keyOf=r=>{ const d=(r.date||'').slice(0,10); if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return null; if(gran==='month')return d.slice(0,7); if(gran==='week')return _weekStart(d); return d; };
  const m=new Map(); // key -> {eff,total}
  (rows||[]).forEach(r=>{ const k=keyOf(r); if(!k)return; if(!m.has(k))m.set(k,{eff:0,total:0}); const o=m.get(k); o.total++; if(r.grade==='A'||r.grade==='B')o.eff++; });
  const keys=[...m.keys()].sort();
  const lab=k=> gran==='month'?k:k.slice(5); // 月:YYYY-MM；天/周:MM-DD
  return {labels:keys.map(lab), eff:keys.map(k=>m.get(k).eff), total:keys.map(k=>m.get(k).total)};
}
/* 6.23 文档 2：总览询盘趋势 = 当月、按日，独立于全局 _range/_gran；启用悬停 tooltip 显示当日有效/总量。
   独立缓存 window._inqMonthCache，由 loadDashboardInq() 拉取（始终拉当月 1 号 ~ 今天）。 */
window._inqMonthCache=[];
async function loadDashboardInq(){
  const today=formatLocalDate(new Date());
  const first=today.slice(0,7)+'-01';
  try{
    const {items}=await API.get(withRange('/api/inquiries',{start_date:first,end_date:today}));
    window._inqMonthCache=items||[];
  }catch(e){ window._inqMonthCache=[]; }
  renderInqTrend();
}
function renderInqTrend(){
  const cv=document.getElementById('inqTrend'); if(!cv||window.DEMO_MODE)return;
  const rows=window._inqMonthCache||[];
  const sub=document.getElementById('inqTrendSub'); if(sub){
    const today=formatLocalDate(new Date());
    sub.textContent='当月 · 按日（'+today.slice(0,7)+'）';
  }
  if(inqChart){ try{inqChart.destroy();}catch(e){} inqChart=null; }
  if(!rows.length){ chartEmpty('inqTrend'); return; }
  const wrap=cv.closest('.chart-wrap')||cv.parentElement; if(wrap){ const ce=wrap.querySelector('.chart-empty'); if(ce)ce.remove(); } cv.style.display='';
  const s=inqSeriesByGran(rows,'day');
  inqChart=new Chart(cv,{type:'line',data:{labels:s.labels,datasets:[
    {label:'有效询盘',data:s.eff,borderColor:'#15a85a',backgroundColor:'rgba(21,168,90,.1)',fill:true,tension:.4,pointRadius:3,pointHoverRadius:5,borderWidth:2},
    {label:'询盘总量',data:s.total,borderColor:'#9aa1ae',backgroundColor:'rgba(154,161,174,.06)',fill:true,tension:.4,pointRadius:2,pointHoverRadius:4,borderWidth:1.5}
  ]},options:{
    responsive:true,maintainAspectRatio:false,
    interaction:{mode:'index',intersect:false}, // 鼠标对到 x 轴某天，两条线同时高亮
    plugins:{
      legend:{display:false},
      tooltip:{enabled:true,callbacks:{title:items=>items[0]?items[0].label:'',label:ctx=>ctx.dataset.label+'：'+ctx.parsed.y}} // 6.23 文档 2：悬停显示当日
    },
    scales:{y:{beginAtZero:true,ticks:{precision:0}}}
  }});
}
function charts(){
  Chart.defaults.color='#9aa1ae';Chart.defaults.borderColor='rgba(128,128,128,.12)';Chart.defaults.font.size=10;
  const wk=['W1','W2','W3','W4','W5','W6','W7','W8'];
  const sp={responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{display:false},y:{display:false}}};
  if(window.DEMO_MODE){
    // 仅 DEMO_MODE：用集中 fixture 画示例图(便于演示/截图，绝不在真实模式触发)
    new Chart(inqTrend,{type:'line',data:{labels:wk,datasets:[{data:DEMO.inqTrend.a,borderColor:'#15a85a',backgroundColor:'rgba(21,168,90,.1)',fill:true,tension:.4,pointRadius:0,borderWidth:2},{data:DEMO.inqTrend.total,borderColor:'#9aa1ae',backgroundColor:'rgba(154,161,174,.06)',fill:true,tension:.4,pointRadius:0,borderWidth:1.5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});
    new Chart(seoMini,{type:'line',data:{labels:wk,datasets:[{data:DEMO.seoMini,borderColor:'#2f72e8',backgroundColor:'rgba(47,114,232,.1)',fill:true,tension:.4,pointRadius:0,borderWidth:2}]},options:sp});
    new Chart(semMini,{type:'line',data:{labels:wk,datasets:[{data:DEMO.semMini,borderColor:'#7b54e0',backgroundColor:'rgba(123,84,224,.1)',fill:true,tension:.4,pointRadius:0,borderWidth:2}]},options:sp});
    new Chart(inqDonut,{type:'doughnut',data:{labels:['A','B','C'],datasets:[{data:[DEMO.inqDonut.a,DEMO.inqDonut.b,DEMO.inqDonut.c],backgroundColor:['#15a85a','#2f72e8','#dfe2e8'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'66%'}});
    new Chart(chanDonut,{type:'doughnut',data:{labels:['SEO','SEM','直接','其他'],datasets:[{data:[DEMO.chanDonut.seo,DEMO.chanDonut.sem,DEMO.chanDonut.direct,DEMO.chanDonut.other],backgroundColor:['#2f72e8','#7b54e0','#0b9d8f','#ef9514'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'66%'}});
    fillDonutLegendDemo();
  }else{
    // 真实模式：询盘趋势(C-2b)、KPI 两个 donut(BUG-6) 由 loadInquiries 真实重绘；seoMini/semMini 仍待后续接入
    ['seoMini','semMini'].forEach(chartEmpty);
    // 首屏先占位(诚实空状态)，待 hydrate→loadInquiries 末尾真实重绘，避免 _inqCache 未就绪闪烁
    chartEmpty('inqTrend'); chartEmpty('inqDonut'); chartEmpty('chanDonut'); blankDonutLegend();
  }
  // SEO 看板：有真实周数据则画(DEMO_MODE 下用 fixture)，否则空状态
  seoFull=seoSeriesFromWeeks();
  const so={responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{maxTicksLimit:7}}}};
  if(document.getElementById('seoBoard')){
    if(seoFull&&seoFull.labels&&seoFull.labels.length) seoChart=new Chart(seoBoard,{type:'line',data:buildSeoData(seoFull),options:so});
    else chartEmpty('seoBoard');
  }
}
