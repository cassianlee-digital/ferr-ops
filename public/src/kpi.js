/* KPI 引擎 + 周数据（ES 模块 · esbuild 打包为 IIFE）。
   运行时依赖：window.API、toast()、openModal()/closeModal()、renderKPI()（kpi-view.js 兼容入口）。
   TOTAL/SEO/SEM/applyKpiServer/loadMetrics/loadWeeks 与两个提交入口由 main.js 挂到 window，
   供仍是经典脚本的 app.js 调用；评分内部状态仅供 kpi-view.js 显式导入。 */

import { loadSemBoardAds, loadSeoBoardGsc, refreshSeoWeekChart } from './charts.js';
import { getRangeRevision, withRange } from './timerange.js';

/* ================= KPI ENGINE ================= */
export const TOTAL=[{n:'询盘总量',w:25,t:60,a:0,m:'r',u:'封'},{n:'A级询盘数',w:35,t:10,a:0,m:'r',u:'封'},{n:'有效询盘成本',w:25,t:2000,a:0,m:'i',u:'¥'},{n:'闭环执行度',w:15,t:5,a:0,m:'r',u:'项'}];
export const SEO=[{n:'自然流量环比',w:25,t:10,a:0,m:'r',u:'%'},{n:'核心词 Top10 占比',w:25,t:40,a:0,m:'r',u:'%'},{n:'关键词覆盖/长尾',w:15,t:500,a:0,m:'r',u:'词'},{n:'新增收录页面',w:15,t:20,a:0,m:'r',u:'页'},{n:'跳出率',w:10,t:55,a:0,m:'i',u:'%'},{n:'页面停留时长',w:10,t:150,a:0,m:'r',u:'s'}];
export const SEM=[{n:'CPC',w:15,t:4.0,a:0,m:'i',u:'¥'},{n:'CTR',w:15,t:3.5,a:0,m:'r',u:'%'},{n:'质量分',w:15,t:7.5,a:0,m:'r',u:''},{n:'ROAS',w:20,t:3.5,a:0,m:'r',u:'x'},{n:'转化次数',w:15,t:60,a:0,m:'r',u:'次'},{n:'每次转化费用',w:20,t:300,a:0,m:'i',u:'¥'}];
export const ratio=k=>{
  const target=Number(k.t),actual=Number(k.a);
  if(!Number.isFinite(target)||!Number.isFinite(actual)||target<=0||actual<=0)return 0;
  return k.m==='i'?Math.min(target/actual,1):Math.min(actual/target,1);
};
const blockRate=a=>a.reduce((s,k)=>s+ratio(k)*k.w,0)/a.reduce((s,k)=>s+k.w,0);
let tR,seoR,semR;
export let liScore,chenScore,company;
export function recomputeScores(){ tR=blockRate(TOTAL);seoR=blockRate(SEO);semR=blockRate(SEM);liScore=(tR*.5+seoR*.5)*100;chenScore=(tR*.5+semR*.5)*100;company=(liScore+chenScore)/2; }
recomputeScores();

/* ============================================================
   live-data engine —— 让数据真的流动（录入→存储→回写图表/KPI）
   ============================================================ */
const METRICS_KEY='ferr:metrics', SEOWK_KEY='ferr:seo:weeks', SEMWK_KEY='ferr:sem:weeks', RANKSNAP_KEY='ferr:ranks';
window._seoWeeks=[]; window._semWeeks=[];
window._seoWeeksView=undefined; // 区间视图，仅 SEO 折线图使用；KPI 仍使用全量 _seoWeeks。

/* KPI 以后端为权威：把服务端 rows 写回前端 TOTAL/SEO/SEM 数组（含目标/实际/id）*/
export function applyKpiServer(rows){
  const byGrp={total:TOTAL,seo:SEO,sem:SEM};
  (rows||[]).forEach(r=>{ const arr=byGrp[r.grp]; if(!arr)return; const k=arr.find(x=>x.n===r.name);
    if(k){
      if(typeof r.target==='number')k.t=r.target;
      if(Object.prototype.hasOwnProperty.call(r,'actual'))k.a=r.actual;
      k.actualAvailable=r.actual_available!==false&&r.actual!=null;
      k.actualSource=r.actual_source||'';
      k.id=r.id;
    } });
}
// 把后端 KPI 目标值回填到设置页可编辑 span（否则刷新后 span 仍显示静态默认值，看着像没保存）
function syncKpiInputs(){ document.querySelectorAll('#panel-settings [data-kpi]').forEach(el=>{ const p=el.dataset.kpi.split(':'),arr=({TOTAL,SEO,SEM})[p[0]],idx=+p[1]; if(arr&&arr[idx]&&arr[idx].t!=null){ el.textContent=String(arr[idx].t); el.dataset.kpiOld=String(arr[idx].t); } }); }
let metricsRequestSequence=0;
export async function loadMetrics(){
  const requestId=++metricsRequestSequence, revision=getRangeRevision('kpi');
  try{ const {rows}=await API.get(withRange('/api/kpi-targets','kpi')); if(requestId!==metricsRequestSequence||revision!==getRangeRevision('kpi'))return false; applyKpiServer(rows); syncKpiInputs(); return true; }
  catch(e){ if(e&&e.message!=='unauthorized')toast('KPI 加载失败：'+(e.message||'未知错误')); }
  return false;
}

/* 后端周报字段 → 前端原有字段名映射，保持下游逻辑不变 */
function mapSeoWeek(w){return {date:(w.week_date||'').slice(5),ym:(w.week_date||'').slice(0,7),clicks:w.clicks,impr:w.impressions,pos:w.avg_position,top10:w.top10_ratio,coverage:w.coverage,indexed:w.indexed_pages,bounce:w.bounce_rate,dwell:w.dwell_seconds};}
function mapSemWeek(w){return {date:(w.week_date||'').slice(5),cost:w.cost,impr:w.impressions,clicks:w.clicks,conv:w.conversions,roas:w.roas,qs:w.quality_score,cpc:w.cpc,ctr:w.ctr,cpconv:w.cost_per_conv};}
let weeksRequestSequence=0;
export async function loadWeeks(){
  const requestId=++weeksRequestSequence, revision=getRangeRevision('kpi');
  try{
    const [seo,sem]=await Promise.all([API.get(withRange('/api/seo-weeks','kpi')),API.get(withRange('/api/sem-weeks','kpi'))]);
    if(requestId!==weeksRequestSequence||revision!==getRangeRevision('kpi'))return false;
    window._seoWeeks=(seo.items||[]).map(mapSeoWeek);
    window._semWeeks=(sem.items||[]).map(mapSemWeek);
    renderBoardCards();
    return true;
  }catch(e){
    if(requestId!==weeksRequestSequence||revision!==getRangeRevision('kpi'))return false;
    window._seoWeeks=[]; window._semWeeks=[];
    if(e&&e.message!=='unauthorized')toast('周报加载失败：'+(e.message||'未知错误'));
  }
  return false;
}
/* 数据看板顶部指标卡：从最新一周回填，无数据显示 — */
function renderBoardCards(){
  // SEO 顶部卡（sb-*）改由 GSC 同步 loadSeoBoardGsc 单一驱动；SEM「账户体检」卡由 Ads 同步 renderSemBoard 驱动。均不再用人工周报覆盖，避免来源混用（人工周报只回写 KPI）
}
/* SEM 层级筛选下拉 */
document.addEventListener('change',e=>{
  if(!e.target||e.target.id!=='sem-hlevel')return; const v=e.target.value;
  document.querySelectorAll('#sub-data-sem table.hierarchy tbody tr').forEach(tr=>{
    let show=true;
    if(v==='camp') show=tr.classList.contains('h-camp');
    else if(v==='grp') show=tr.classList.contains('h-camp')||tr.classList.contains('h-grp');
    tr.style.display=show?'':'none';
  });
});
/* 周数据 → 回写 KPI 实际值（自然流量环比按周环比自动算）*/
function applySeoActuals(){ const w=window._seoWeeks; if(!w.length)return; const last=w[w.length-1],prev=w.length>1?w[w.length-2]:null;
  if(prev&&prev.clicks)SEO[0].a=Math.round((last.clicks/prev.clicks-1)*1000)/10;
  if(last.top10!=null)SEO[1].a=last.top10; if(last.coverage!=null)SEO[2].a=last.coverage;
  if(last.indexed!=null)SEO[3].a=last.indexed; if(last.bounce!=null)SEO[4].a=last.bounce; if(last.dwell!=null)SEO[5].a=last.dwell; }
function applySemActuals(){ const w=window._semWeeks; if(!w.length)return; const last=w[w.length-1];
  if(last.cpc!=null)SEM[0].a=last.cpc; if(last.ctr!=null)SEM[1].a=last.ctr; if(last.qs!=null)SEM[2].a=last.qs;
  if(last.roas!=null)SEM[3].a=last.roas; if(last.conv!=null)SEM[4].a=last.conv; if(last.cpconv!=null)SEM[5].a=last.cpconv; }

const _fnum=id=>{const el=document.getElementById(id);if(!el)return null;const v=parseFloat(el.value);return isNaN(v)?null:v;};
const _setTxt=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};

function openSeoWeek(){ const d=document.getElementById('sw-date'); if(d)d.value=new Date().toISOString().slice(0,10);
  ['sw-clicks','sw-impr','sw-pos','sw-top10','sw-cov','sw-idx','sw-bounce','sw-dwell'].forEach(i=>{const e=document.getElementById(i);if(e)e.value='';}); openModal('seoWkMask'); }
export async function submitSeoWeek(){
  const body={week_date:document.getElementById('sw-date').value||new Date().toISOString().slice(0,10),
    clicks:_fnum('sw-clicks')||0,impressions:_fnum('sw-impr')||0,avg_position:_fnum('sw-pos'),
    top10_ratio:_fnum('sw-top10'),coverage:_fnum('sw-cov'),indexed_pages:_fnum('sw-idx'),
    bounce_rate:_fnum('sw-bounce'),dwell_seconds:_fnum('sw-dwell')};
  try{
    await API.post('/api/seo-weeks',body);
    await Promise.all([loadMetrics(),loadWeeks()]);
    loadSeoBoardGsc(); // 顶部卡由 GSC 同步单一驱动，录入后刷新（人工周报仍回写 KPI 与趋势）
    refreshSeoWeekChart();
    renderKPI(); closeModal('seoWkMask');
    const wow=SEO[0].actualAvailable?('，自然流量环比 '+(SEO[0].a>=0?'+':'')+SEO[0].a+'%'):'';
    toast('已录入本周 GSC 数据 · 已入库, 图表+KPI 已更新'+wow);
  }catch(e){ toast(e.status===403?'无权录入（仅李/SEO 可录）':'保存失败：'+e.message); }
}
function openSemWeek(){ const d=document.getElementById('mw-date'); if(d)d.value=new Date().toISOString().slice(0,10);
  ['mw-cost','mw-impr','mw-clicks','mw-conv','mw-roas','mw-qs'].forEach(i=>{const e=document.getElementById(i);if(e)e.value='';}); openModal('semWkMask'); }
export async function submitSemWeek(){
  const body={week_date:document.getElementById('mw-date').value||new Date().toISOString().slice(0,10),
    cost:_fnum('mw-cost')||0,impressions:_fnum('mw-impr')||0,clicks:_fnum('mw-clicks')||0,
    conversions:_fnum('mw-conv')||0,roas:_fnum('mw-roas'),quality_score:_fnum('mw-qs')};
  try{
    const {item}=await API.post('/api/sem-weeks',body); // CPC/CTR/每次转化费用由后端计算
    const rec=mapSemWeek(item);
    await Promise.all([loadMetrics(),loadWeeks()]);
    loadSemBoardAds(); // 账户体检卡由 Ads 同步单一驱动，导入后刷新（人工周报仅回写 KPI）
    renderKPI(); closeModal('semWkMask');
    toast('已导入本周 Ads 数据 · CPC ¥'+(rec.cpc??'-')+' / CTR '+(rec.ctr??'-')+'% / 每询盘 ¥'+(rec.cpconv??'-')+'（后端计算）, KPI 已更新');
  }catch(e){ toast(e.status===403?'无权录入（仅陈/SEM 可录）':'保存失败：'+e.message); }
}
