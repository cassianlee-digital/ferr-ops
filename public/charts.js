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

async function loadSeoChartRange(){
  try{ const seo=await API.get(withRange('/api/seo-weeks')); window._seoWeeksView=(seo.items||[]).map(mapSeoWeek); }
  catch(e){ window._seoWeeksView=[]; toast('SEO trend failed: '+(e.message||'unknown error')); }
  rebuildSeoChart();
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
