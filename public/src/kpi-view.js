/* KPI 看板渲染（ES 模块 · esbuild 打包为 IIFE）。
   运行时全局依赖：esc()、API。评分数据和重算函数从 kpi.js 显式导入。
   仅 renderKPI/loadOverview 由 main.js 挂到 window，供 app.js 与 KPI 提交流程调用。 */

import { esc } from './ui-kit.js';
import { TOTAL, SEO, SEM, ratio, recomputeScores, company, liScore, chenScore, loadMetrics, loadWeeks } from './kpi.js';
import { activeScope, getRangeRevision, rangeText, withRange } from './timerange.js';
import { mountExecution } from './execution.js';
import { mountPeriods } from './kpi-periods.js';
import { mountLedger } from './ledger.js';

function grade(s){if(s>=90)return{t:'优秀',c:'var(--green)',bg:'var(--green-soft)',i:'ti-trophy'};if(s>=75)return{t:'合格',c:'var(--blue)',bg:'var(--blue-soft)',i:'ti-circle-check'};if(s>=60)return{t:'警告',c:'var(--amber)',bg:'var(--amber-soft)',i:'ti-alert-triangle'};return{t:'整改',c:'var(--primary)',bg:'var(--primary-soft)',i:'ti-flame'};}
function gauge(arc,sc,score){const C=364.4,g=grade(score),A=document.getElementById(arc),S=document.getElementById(sc);if(!A)return;A.style.stroke=g.c;S.style.color=g.c;let c=0;(function st(){c+=score/40;if(c>=score)c=score;A.style.strokeDashoffset=C-(C*c/100);S.textContent=c.toFixed(0);if(c<score)requestAnimationFrame(st);})();}
function badge(id,score){const b=document.getElementById(id);if(!b)return;const g=grade(score);b.style.background=g.bg;b.style.color=g.c;b.innerHTML='<i class="ti '+g.i+'"></i> '+g.t;}
function fmt(k,v){if(v==null||!Number.isFinite(Number(v)))return '—';return k.u==='¥'?'¥'+Number(v).toLocaleString():k.u==='%'?v+'%':k.u===''?v:v+k.u;}
function scoreTone(r){return r>=.9?'kpi-tone-green':r>=.7?'kpi-tone-blue':r>=.5?'kpi-tone-amber':'kpi-tone-primary';}
function rows(arr,box){const el=document.getElementById(box);if(!el)return;el.innerHTML=arr.map(k=>{const available=k.actualAvailable!==false&&k.a!=null,r=available?ratio(k):0,tone=available?scoreTone(r):'kpi-tone-muted',progress=Math.max(0,Math.min(100,Number.isFinite(r)?r*100:0));return `<div class="csp-s-1b8e8a2860"><div class="csp-s-83725d2c6e"><div class="csp-s-6e8bcfac8d">${esc(k.n)}</div><div class="csp-s-10a2cb4f9a">目标 ${fmt(k,k.t)} · 实际 ${available?fmt(k,k.a):'—'}</div></div><div class="csp-s-d3db975bed"><div class="progress-bar"><div class="progress-fill kpi-progress-fill ${tone}" data-progress="${progress}"></div></div></div><div class="kpi-score-value ${tone}">${available?Math.round(r*100):'—'}</div></div>`;}).join('');el.querySelectorAll('[data-progress]').forEach(fill=>{const progress=Number(fill.dataset.progress);fill.style.width=`${Number.isFinite(progress)?progress:0}%`;});}
function mini(ov){
  ov=ov||{current:{}}; const c=ov.current||{}; const d=ov.delta||{};
  const momTxt=(v)=> v==null?'':(v>0?'▲'+v:(v<0?'▼'+Math.abs(v):'—'));
  const m=[['有效询盘', (c.valid??'—'), '', ''],
           ['A级占比', (c.aRatio!=null?c.aRatio+'%':'—'), '', momTxt(d.aRatio)],
           ['有效询盘率', (c.validRate!=null?c.validRate+'%':'—'), '', momTxt(d.validRate)]];
  const el=document.getElementById('miniScores'); if(!el)return;
  el.innerHTML=m.map(x=>`<div class="csp-s-b478e20d45"><div class="csp-s-f9c9d2e5d2">${x[0]}</div><div class="csp-s-73eb966c81">${x[1]}<span class="csp-s-19439c522a">${x[2]}</span> <span class="kpi-mini-trend ${(x[3]||'').startsWith('▲')?'kpi-tone-green':((x[3]||'').startsWith('▼')?'kpi-tone-primary':'kpi-tone-muted')}">${x[3]||''}</span></div></div>`).join('');
}
/* 总览：拉真实数据 + 与上月环比，更新顶栏与表盘旁的环比。
   2026-08-26：时间范围分页面独立后，顶栏 KPI 与右上角日期一律「跟随当前所在页面」的区间——
   所以这里取 activeScope() 而不是某个固定 scope，并在切页时由 app.js go() 重新调用。 */
let overviewRequestSequence=0;
export async function loadOverview(){
  const scope=activeScope();
  const requestId=++overviewRequestSequence, revision=getRangeRevision(scope);
  try{
    const ov=await API.get(withRange('/api/overview',scope)); if(requestId!==overviewRequestSequence||revision!==getRangeRevision(scope))return false; const c=ov.current||{}, d=ov.delta||{}, comparison=ov.comparisonLabel||'vs 上月';
    const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
    set('topValid', (c.valid??'—')+' / '+(c.total??'—'));
    set('topAratio', c.aRatio!=null?c.aRatio+'%':'—');
    set('topRate', c.validRate!=null?c.validRate+'%':'—');
    const tg=document.getElementById('topGrade'); if(tg){ tg.textContent=c.grade||''; tg.className='kpi-delta '+(c.company>=75?'delta-pos':'delta-neg'); }
    const mom=(el,v)=>{ if(!el)return; if(v==null){el.textContent='';return;} el.textContent=(v>0?'▲'+v:(v<0?'▼'+Math.abs(v):'—'))+' '+comparison; el.className='kpi-delta '+(v>0?'delta-pos':(v<0?'delta-neg':'')); };
    mom(document.getElementById('topAratioMoM'), d.aRatio);
    mom(document.getElementById('topRateMoM'), d.validRate); // 条目 14-B：有效询盘率环比箭头（接现有 overview.delta.validRate）
    // 公司表盘旁的环比
    const g1b=document.getElementById('g1b');
    if(g1b){ let chip=document.getElementById('g1mom'); if(!chip){chip=document.createElement('span');chip.id='g1mom';chip.style.marginLeft='8px';chip.style.fontSize='11px';chip.style.fontWeight='800';g1b.parentElement&&g1b.parentElement.appendChild(chip);}
      if(d.company==null){chip.textContent='首月无环比';chip.style.color='var(--text3)';}
      else {chip.textContent=(d.company>0?'▲'+d.company:(d.company<0?'▼'+Math.abs(d.company):'—'))+' 分 '+comparison; chip.style.color=d.company>0?'var(--green)':(d.company<0?'var(--primary)':'var(--text3)');} }
    set('overviewKpiTitle','所选区间 KPI 考核总分');
    const rangeLabel=document.getElementById('kpiRangeLabel'); if(rangeLabel)rangeLabel.textContent='当前区间 '+rangeText(ov.range);
    mini(ov);
    return true;
  }catch(e){ if(requestId===overviewRequestSequence)mini(); }
  return false;
}
/* ===== KPI v2 渲染（后端 assessment 权威）：分层区段 + 数据状态 + 覆盖率地板 ===== */
const DS_LABEL={NOT_APPLICABLE:'不适用',MISSING_DATA:'待接入',INSUFFICIENT_DATA:'样本不足',PENDING:'观察中',TRACKING_ERROR:'追踪异常'};
function fmtU(unit,v){if(v==null||!Number.isFinite(Number(v)))return '—';return unit==='¥'?'¥'+Number(v).toLocaleString():unit==='%'?v+'%':(unit?v+unit:v);}
const pctCov=s=>Math.round(((s&&s.coverage)||0)*100);

// 表盘：可评分→按等级着色+动画；不可评分→灰环，绝不造假分数/不继承公司分。
// 无可评分指标(NO_METRICS/NO_VALID_DATA)→「待评估」；有指标但覆盖率不足→「数据不足·覆盖率N%」。
function gaugeScope(arcId,scoreId,badgeId,s){
  const C=364.4,A=document.getElementById(arcId),S=document.getElementById(scoreId),B=document.getElementById(badgeId);
  if(!A||!S)return;
  if(!s||!s.gradable||s.score==null){
    A.style.stroke='var(--bg4)';A.style.strokeDashoffset=C;S.style.color='var(--text3)';S.textContent='—';
    if(B){B.style.background='var(--bg3)';B.style.color='var(--text3)';
      let txt;
      if(!s||s.status==='NO_METRICS')txt='<i class="ti ti-hourglass"></i> 待评估 · 暂未配置绩效指标';
      else if(s.status==='CONFIG_INCOMPLETE')txt='<i class="ti ti-settings-exclamation"></i> 绩效配置未完成'+(s.provisionalScore!=null?(' · 参考表现 '+s.provisionalScore):'')+' · 正式绩效待评估';
      else if(s.status==='NO_VALID_DATA')txt='<i class="ti ti-hourglass"></i> 待评估 · 暂无有效数据';
      else txt='<i class="ti ti-alert-circle"></i> 参考表现 '+(s.provisionalScore??'—')+' · 覆盖率'+pctCov(s)+'% · 未足以正式评分';
      B.innerHTML=txt;}
    return;
  }
  const g=grade(s.score);A.style.stroke=g.c;S.style.color=g.c;
  let c=0;(function st(){c+=s.score/40;if(c>=s.score)c=s.score;A.style.strokeDashoffset=C-(C*c/100);S.textContent=c.toFixed(0);if(c<s.score)requestAnimationFrame(st);})();
  if(B){B.style.background=g.bg;B.style.color=g.c;B.innerHTML='<i class="ti '+g.i+'"></i> '+g.t+' · 覆盖率'+pctCov(s)+'%';}
}
// 绩效分组中文名（点10 catalog）；SEM 的 business 组是「Lead 价值」，其余通用。
const PG_LABEL={business:'业务贡献',visibility:'搜索 & GEO 可见度',asset:'内容资产',efficiency:'获客效率',quality:'流量质量',execution:'执行与优化',experiment:'实验与学习'};
function pgLabel(grp,g){ if(grp==='sem'&&g==='business')return 'Lead 价值'; return PG_LABEL[g]||g||'其他'; }
// 单条绩效指标（计分）：included→分数条；未纳入→灰 + 数据状态徽章，不按 0 分。
// display_value（如 CPVI「无有效询盘」）优先于数值展示；included 但强制 0 分仍显示。
function metricRow(m){
  const included=m.included,r=included&&Number.isFinite(m.ratio)?m.ratio:0;
  const tone=included?scoreTone(r):'kpi-tone-muted',prog=Math.max(0,Math.min(100,r*100));
  const ds=included?'':'<span class="kpi-ds-badge">'+(DS_LABEL[m.data_status]||'待接入')+'</span>';
  const actualTxt=included?(m.display_value?esc(m.display_value):fmtU(m.unit,m.actual)):'—';
  return `<div class="csp-s-1b8e8a2860"><div class="csp-s-83725d2c6e"><div class="csp-s-6e8bcfac8d">${esc(m.name)}${ds}</div><div class="csp-s-10a2cb4f9a">目标 ${fmtU(m.unit,m.target)} · 实际 ${actualTxt}</div></div><div class="csp-s-d3db975bed"><div class="progress-bar"><div class="progress-fill kpi-progress-fill ${tone}" data-progress="${prog}"></div></div></div><div class="kpi-score-value ${tone}">${included?Math.round(r*100):'—'}</div></div>`;
}
// 诊断芯片（不计分）：绿达标/黄关注/红异常/灰无数据（§27）
function diagChip(d){
  let tone='kpi-tone-muted';
  if(d.available&&d.target>0&&d.actual>0){const ach=d.mode==='i'?d.target/d.actual:d.actual/d.target;tone=ach>=1?'kpi-tone-green':ach>=0.8?'kpi-tone-amber':'kpi-tone-primary';}
  return `<div class="kpi-diag-chip"><span class="kpi-diag-dot ${tone}"></span><span class="kpi-diag-name">${esc(d.name)}</span><span class="kpi-diag-val ${tone}">${d.available?fmtU(d.unit,d.actual):'—'}</span></div>`;
}
function renderBlock(grp,containerId,a){
  const el=document.getElementById(containerId);if(!el)return;
  const block=(a.blocks&&a.blocks[grp])||{metrics:[]};
  const diags=(a.diagnostics||[]).filter(d=>d.grp===grp);
  const summaries=(a.summaries||[]).filter(d=>d.grp===grp);
  const metrics=block.metrics||[];
  let html='<div class="kpi-sec-label">绩效指标（计分）</div>';
  if(metrics.length){
    // 按 perf_group 分组（保序），组头显示中文名 + 组权重合计
    const groups=[],idx={};
    for(const m of metrics){const g=m.perf_group||'other';if(!(g in idx)){idx[g]=groups.length;groups.push([g,[]]);}groups[idx[g]][1].push(m);}
    html+=groups.map(([g,ms])=>{const wt=ms.reduce((s,m)=>s+(Number(m.weight)||0),0);
      return '<div class="kpi-pg"><div class="kpi-pg-head">'+esc(pgLabel(grp,g))+'<span class="kpi-pg-wt">'+wt+'%</span></div>'+ms.map(metricRow).join('')+'</div>';}).join('');
  } else html+='<div class="kpi-empty">暂无可评分指标 · 待接入</div>';
  if(diags.length)html+='<div class="kpi-sec-label kpi-sec-diag">诊断指标（不计分）</div><div class="kpi-diag-grid">'+diags.map(diagChip).join('')+'</div>';
  if(summaries.length)html+='<div class="kpi-sec-label kpi-sec-diag">业务汇总（不计分）</div><div class="kpi-diag-grid">'+summaries.map(diagChip).join('')+'</div>';
  el.innerHTML=html;
  el.querySelectorAll('[data-progress]').forEach(f=>{const p=Number(f.dataset.progress);f.style.width=(Number.isFinite(p)?p:0)+'%';});
}

/* 任何目标/实际变动后，一处重算+重渲染所有考核展示 */
export function renderKPI(){
  recomputeScores(); // 总览页镜像 g1 仍用旧客户端算法（总览改版不在本次范围）
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  set('topScore',company.toFixed(0));gauge('g1','g1s',company);badge('g1b',company);
  mountLedger(); // 运营总账卡：花费→询盘→优质→成交→效率。与 v2 评分无关的业务漏斗，
                 // 故放在 assessment 判空之前——评分加载失败时它照样该显示。幂等挂载，区间变化由自身监听重拉。
  const a=window._kpiAssessment;
  if(!a){ // assessment 缺失（加载失败）→ 退回旧展示，避免空白
    rows(TOTAL,'totalRows');rows(SEO,'seoRows');rows(SEM,'semRows');
    gauge('g2','g2s',company);badge('g2b',company);
    gauge('liArc','liScore',liScore);gauge('chenArc','chenScore',chenScore);badge('liBadge',liScore);badge('chenBadge',chenScore);
    return;
  }
  gaugeScope('g2','g2s','g2b',a.scores.company);
  gaugeScope('liArc','liScore','liBadge',a.scores.li);
  gaugeScope('chenArc','chenScore','chenBadge',a.scores.chen);
  renderBlock('total','totalRows',a);renderBlock('seo','seoRows',a);renderBlock('sem','semRows',a);
  mountExecution(); // Execution 明细面板（SEO/SEM 各一块，注入 seoRows/semRows 卡片内）
  mountPeriods();   // 考核期结算与冻结历史（Phase 5C，注入 panel-kpi 末尾）
}

let kpiRefreshSequence=0;
async function refreshKpiRange(){
  const requestId=++kpiRefreshSequence, revision=getRangeRevision('kpi');
  await Promise.all([loadMetrics(),loadWeeks(),loadOverview()]);
  if(requestId!==kpiRefreshSequence||revision!==getRangeRevision('kpi'))return;
  renderKPI();
}
document.addEventListener('timerange',e=>{
  const scope=e.detail&&e.detail.scope;
  if(scope==='kpi'){ refreshKpiRange(); return; } // KPI 页自己的目标/周数据/总分
  if(scope===activeScope())loadOverview();       // 别页改时间 → 只把顶栏那三个 pill 跟到当前页区间
});
