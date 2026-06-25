/* 时间范围筛选（拆分自 index.html · 阶段4-B）
   经典 script + window 全局兼容。依赖（运行时解析）：toast()、openModal()/closeModal()、
   loadInquiries()（inquiries.js）、loadSeoChartRange()/rebuildSeoChart()（charts.js）。
   导出全局：formatLocalDate()/ymd()/withRange()/getCurrentRange()/resolveRange()/rangeText()（被 charts.js/inquiries.js/sop.js/kpi.js 等运行时调用）、
   openCustomRange()/submitCustomRange()（onclick）、window._range 视图。
   注：底部 [data-time] forEach 在脚本加载时渲染时间条——时间条在 body(行 ~承载面板) 已先于本脚本解析，安全。 */

/* ---------- per-page inline time filter ---------- */
const RANGES=['近7天','近30天','近90天','近一年','自定义']; // C-2a 三框预设 + C组「可查看近一年」 + 6.23 文档 26「自定义」
// 6.23 文档 26：自定义区间持久化（YYYY-MM-DD 范围）
window._customRange=null;
try{ const cr=JSON.parse(localStorage.getItem('ferr:customRange')||'null');
  if(cr&&/^\d{4}-\d{2}-\d{2}$/.test(cr.start_date)&&/^\d{4}-\d{2}-\d{2}$/.test(cr.end_date)&&cr.start_date<=cr.end_date) window._customRange=cr;
}catch(e){}
/* BUG-31 B-1：时间范围+粒度持久化(避免刷新回默认)。读 localStorage，非法值回退默认 */
try{ const t=localStorage.getItem('ferr:timeRange'); window._timeRange=RANGES.includes(t)?t:'近30天'; }catch(e){ window._timeRange='近30天'; }
try{ const g=localStorage.getItem('ferr:gran'); window._gran=['day','week','month'].includes(g)?g:'week'; }catch(e){ window._gran='week'; }
const GRAN_LABEL={day:'按天',week:'按周',month:'按月'};
/* ===== 1e-a: 统一时间范围 → start_date/end_date/period_label(本地日期，避免 UTC 偏移) ===== */
function formatLocalDate(d){ const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
function ymd(v){ v=String(v==null?'':v).trim(); return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:''; } // 仅接受 YYYY-MM-DD，供 <input type=date> 回填
function resolveRange(label){
  const today=new Date(); today.setHours(0,0,0,0);
  const back=n=>{ const d=new Date(today); d.setDate(d.getDate()-n); return d; };
  const r=(s,e)=>({start_date:formatLocalDate(s),end_date:formatLocalDate(e),period_label:label});
  switch(label){
    case '近7天':  return r(back(6),today);
    case '近30天': return r(back(29),today);
    case '近90天': return r(back(89),today);
    case '近一年': return r(back(364),today);
    case '昨天':   { const y=back(1); return r(y,y); }
    case '上周':   { const day=(today.getDay()+6)%7; const thisMon=back(day); const lastMon=new Date(thisMon); lastMon.setDate(thisMon.getDate()-7); const lastSun=new Date(lastMon); lastSun.setDate(lastMon.getDate()+6); return r(lastMon,lastSun); }
    case '上半月': { const first=new Date(today.getFullYear(),today.getMonth(),1); const mid=new Date(today.getFullYear(),today.getMonth(),15); return r(first,mid); }
    case '近1月':  return r(back(29),today);
    case '近3月':  return r(back(89),today);
    case '近半年': return r(back(179),today);
    case '近1年':  return r(back(364),today);
    case '自定义': {
      const cr=window._customRange;
      if(!cr)return null; // 还没选过 → 返回 null 让调用方弹框
      return {start_date:cr.start_date,end_date:cr.end_date,period_label:'自定义 '+cr.start_date+'~'+cr.end_date};
    }
    default:       return r(back(29),today);
  }
}
let _range=resolveRange(window._timeRange); // BUG-31 B-1：跟随持久化值初始化
function getCurrentRange(){ return _range; }
function withRange(path,range){ range=range||_range; if(!range||!range.start_date||!range.end_date) return path; const sep=path.includes('?')?'&':'?'; return path+sep+'start_date='+encodeURIComponent(range.start_date)+'&end_date='+encodeURIComponent(range.end_date); }
function rangeText(r){ return (r&&r.start_date)?(r.start_date+' ~ '+r.end_date):'—'; }
/* C-2a 三框：框1 预设(7/30/90) + 框2 自动日期(只读) + 框3 粒度(按所在面板 data-gran 白名单动态给) */
function renderTimebar(bar){
  const grans=(bar.dataset.gran||'').split(',').map(s=>s.trim()).filter(Boolean);
  const onlyWeekly=grans.includes('week')&&!grans.includes('day'); // SEO/SEM：无日数据→标注「按周记录」
  const granHtml=grans.length
    ?'<span class="tlabel tlabel-gap"><i class="ti ti-chart-dots"></i> 粒度</span>'
      +'<select class="tgran">'+grans.map(g=>`<option value="${g}"${g===window._gran?' selected':''}>${GRAN_LABEL[g]||g}</option>`).join('')+'</select>'
      +(onlyWeekly?'<span class="tgran-note">· 按周记录</span>':'')
    :'';
  bar.innerHTML='<span class="tlabel"><i class="ti ti-calendar-stats"></i> 时间</span>'
    +RANGES.map(r=>`<button type="button" class="trange${r===window._timeRange?' active':''}">${r}</button>`).join('')
    +`<span class="tauto" data-tauto><i class="ti ti-calendar"></i> ${rangeText(_range)}</span>`
    +granHtml;
}
document.querySelectorAll('[data-time]').forEach(bar=>{
  renderTimebar(bar);
  bar.addEventListener('click',e=>{
    const btn=e.target.closest('.trange'); if(!btn)return;
    const rg=btn.textContent.trim();
    // 6.23 文档 26：点「自定义」打开日期弹框；保存后再应用。先把按钮态切回原 active（用户取消时不抖动）
    if(rg==='自定义'&&!window._customRange){ openCustomRange(); return; }
    document.querySelectorAll('[data-time] .trange').forEach(x=>x.classList.toggle('active', x.textContent===btn.textContent));
    window._timeRange=rg;
    const nr=resolveRange(rg);
    if(!nr){
      if(rg==='自定义'){ openCustomRange(); return; } // 兜底：自定义但没区间 → 弹框
      toast('该预设尚未实现，未改变筛选'); return;
    }
    _range=nr;
    try{ localStorage.setItem('ferr:timeRange',rg); }catch(e){} // BUG-31 B-1
    document.querySelectorAll('[data-tauto]').forEach(el=>el.innerHTML='<i class="ti ti-calendar"></i> '+rangeText(_range));
    document.dispatchEvent(new CustomEvent('timerange',{detail:{range:_range}}));
    loadInquiries();                 // 1e-a：询盘真实按区间重拉
    loadSeoChartRange();             // 1e-b：SEO 折线图真实按区间重拉(不动 KPI/看板的全量 _seoWeeks)
    toast('时间范围：'+_range.period_label);
  });
  bar.addEventListener('change',e=>{
    const sel=e.target.closest('.tgran'); if(!sel)return;
    window._gran=sel.value;
    try{ localStorage.setItem('ferr:gran',sel.value); }catch(e){} // BUG-31 B-1
    document.querySelectorAll('[data-time] .tgran').forEach(s=>{ if([...s.options].some(o=>o.value===sel.value)) s.value=sel.value; }); // 多条粒度联动
    document.dispatchEvent(new CustomEvent('granularity',{detail:{gran:window._gran}}));
    rebuildSeoChart();               // C-2a：粒度只重画 SEO 折线(数据已在区间视图)，周/月切换
    // 6.23 文档 2：总览询盘趋势固定「当月按日」，不再响应全局粒度切换
    toast('粒度：'+(GRAN_LABEL[window._gran]||window._gran));
  });
});

/* 6.23 文档 26：自定义时间区间弹框 - 打开/提交 */
function openCustomRange(){
  const cr=window._customRange||{};
  const today=formatLocalDate(new Date());
  const back=n=>{ const d=new Date(); d.setDate(d.getDate()-n); return formatLocalDate(d); };
  document.getElementById('cr-start').value=cr.start_date||back(29);
  document.getElementById('cr-end').value=cr.end_date||today;
  openModal('customRangeMask'); setTimeout(()=>document.getElementById('cr-start').focus(),50);
}
function submitCustomRange(){
  const s=document.getElementById('cr-start').value;
  const e=document.getElementById('cr-end').value;
  if(!s||!e){ toast('请选择开始和结束日期'); return; }
  if(s>e){ toast('开始日期不能晚于结束日期'); return; }
  // 区间最长 1 年（与「近一年」一致），防止误操作
  const days=Math.floor((new Date(e+'T00:00')-new Date(s+'T00:00'))/86400000);
  if(days>365){ toast('区间最长 1 年'); return; }
  window._customRange={start_date:s,end_date:e};
  try{ localStorage.setItem('ferr:customRange',JSON.stringify(window._customRange)); }catch(err){}
  window._timeRange='自定义';
  try{ localStorage.setItem('ferr:timeRange','自定义'); }catch(err){}
  _range=resolveRange('自定义');
  // 同步 UI：所有时间条按钮态 + 自动日期框
  document.querySelectorAll('[data-time] .trange').forEach(x=>x.classList.toggle('active', x.textContent==='自定义'));
  document.querySelectorAll('[data-tauto]').forEach(el=>el.innerHTML='<i class="ti ti-calendar"></i> '+rangeText(_range));
  document.dispatchEvent(new CustomEvent('timerange',{detail:{range:_range}}));
  loadInquiries(); loadSeoChartRange();
  closeModal('customRangeMask'); toast('已应用：'+_range.period_label);
}
