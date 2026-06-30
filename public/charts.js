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
