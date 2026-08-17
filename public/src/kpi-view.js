/* KPI 看板渲染（ES 模块 · esbuild 打包为 IIFE）。
   运行时依赖的全局（调用时解析，非加载期）：esc()、API（index.html 内联）、
   ratio()/recomputeScores()/TOTAL/SEO/SEM/company/liScore/chenScore（kpi.js，仍为经典脚本）。
   导出由 main.js 挂到 window：renderKPI/loadOverview 有真实外部调用方（index.html、kpi.js），
   其余保持与旧全局脚本一致的暴露面，确保零行为差异。 */

export function grade(s){if(s>=90)return{t:'优秀',c:'var(--green)',bg:'var(--green-soft)',i:'ti-trophy'};if(s>=75)return{t:'合格',c:'var(--blue)',bg:'var(--blue-soft)',i:'ti-circle-check'};if(s>=60)return{t:'警告',c:'var(--amber)',bg:'var(--amber-soft)',i:'ti-alert-triangle'};return{t:'整改',c:'var(--primary)',bg:'var(--primary-soft)',i:'ti-flame'};}
export function gauge(arc,sc,score){const C=364.4,g=grade(score),A=document.getElementById(arc),S=document.getElementById(sc);if(!A)return;A.style.stroke=g.c;S.style.color=g.c;let c=0;(function st(){c+=score/40;if(c>=score)c=score;A.style.strokeDashoffset=C-(C*c/100);S.textContent=c.toFixed(0);if(c<score)requestAnimationFrame(st);})();}
export function badge(id,score){const b=document.getElementById(id);if(!b)return;const g=grade(score);b.style.background=g.bg;b.style.color=g.c;b.innerHTML='<i class="ti '+g.i+'"></i> '+g.t;}
export function fmt(k,v){return k.u==='¥'?'¥'+v.toLocaleString():k.u==='%'?v+'%':k.u===''?v:v+k.u;}
function scoreTone(r){return r>=.9?'kpi-tone-green':r>=.7?'kpi-tone-blue':r>=.5?'kpi-tone-amber':'kpi-tone-primary';}
export function rows(arr,box){const el=document.getElementById(box);if(!el)return;el.innerHTML=arr.map(k=>{const r=ratio(k),tone=scoreTone(r),progress=Math.max(0,Math.min(100,Number.isFinite(r)?r*100:0));return `<div class="csp-s-1b8e8a2860"><div class="csp-s-83725d2c6e"><div class="csp-s-6e8bcfac8d">${esc(k.n)}</div><div class="csp-s-10a2cb4f9a">目标 ${fmt(k,k.t)} · 实际 ${fmt(k,k.a)}</div></div><div class="csp-s-d3db975bed"><div class="progress-bar"><div class="progress-fill kpi-progress-fill ${tone}" data-progress="${progress}"></div></div></div><div class="kpi-score-value ${tone}">${Math.round(r*100)}</div></div>`;}).join('');el.querySelectorAll('[data-progress]').forEach(fill=>{const progress=Number(fill.dataset.progress);fill.style.width=`${Number.isFinite(progress)?progress:0}%`;});}
export function mini(ov){
  ov=ov||{current:{}}; const c=ov.current||{}; const d=ov.delta||{};
  const momTxt=(v)=> v==null?'':(v>0?'▲'+v:(v<0?'▼'+Math.abs(v):'—'));
  const m=[['有效询盘', (c.valid??'—'), '', ''],
           ['A级占比', (c.aRatio!=null?c.aRatio+'%':'—'), '', momTxt(d.aRatio)],
           ['有效询盘率', (c.validRate!=null?c.validRate+'%':'—'), '', momTxt(d.validRate)]];
  const el=document.getElementById('miniScores'); if(!el)return;
  el.innerHTML=m.map(x=>`<div class="csp-s-b478e20d45"><div class="csp-s-f9c9d2e5d2">${x[0]}</div><div class="csp-s-73eb966c81">${x[1]}<span class="csp-s-19439c522a">${x[2]}</span> <span class="kpi-mini-trend ${(x[3]||'').startsWith('▲')?'kpi-tone-green':((x[3]||'').startsWith('▼')?'kpi-tone-primary':'kpi-tone-muted')}">${x[3]||''}</span></div></div>`).join('');
}
/* 总览：拉真实数据 + 与上月环比，更新顶栏与表盘旁的环比 */
export async function loadOverview(){
  try{
    const ov=await API.get('/api/overview'); const c=ov.current||{}, d=ov.delta||{};
    const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
    set('topValid', (c.valid??'—')+' / '+(c.total??'—'));
    set('topAratio', c.aRatio!=null?c.aRatio+'%':'—');
    set('topRate', c.validRate!=null?c.validRate+'%':'—');
    const tg=document.getElementById('topGrade'); if(tg){ tg.textContent=c.grade||''; tg.className='kpi-delta '+(c.company>=75?'delta-pos':'delta-neg'); }
    const mom=(el,v)=>{ if(!el)return; if(v==null){el.textContent='';return;} el.textContent=(v>0?'▲'+v:(v<0?'▼'+Math.abs(v):'—'))+' vs上月'; el.className='kpi-delta '+(v>0?'delta-pos':(v<0?'delta-neg':'')); };
    mom(document.getElementById('topAratioMoM'), d.aRatio);
    mom(document.getElementById('topRateMoM'), d.validRate); // 条目 14-B：有效询盘率环比箭头（接现有 overview.delta.validRate）
    // 公司表盘旁的环比
    const g1b=document.getElementById('g1b');
    if(g1b){ let chip=document.getElementById('g1mom'); if(!chip){chip=document.createElement('span');chip.id='g1mom';chip.style.marginLeft='8px';chip.style.fontSize='11px';chip.style.fontWeight='800';g1b.parentElement&&g1b.parentElement.appendChild(chip);}
      if(d.company==null){chip.textContent='首月无环比';chip.style.color='var(--text3)';}
      else {chip.textContent=(d.company>0?'▲'+d.company:(d.company<0?'▼'+Math.abs(d.company):'—'))+' 分 vs上月'; chip.style.color=d.company>0?'var(--green)':(d.company<0?'var(--primary)':'var(--text3)');} }
    mini(ov);
  }catch(e){ mini(); }
}
/* 任何目标/实际变动后，一处重算+重渲染所有考核展示 */
export function renderKPI(){
  recomputeScores();
  rows(TOTAL,'totalRows');rows(SEO,'seoRows');rows(SEM,'semRows');
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  // 6.23 文档 5：李/陈 也用 gauge 进度图；gauge() 内部会动画填充 #liScore/#chenScore 数字 + 按 score 等级覆盖 arc 颜色
  set('topScore',company.toFixed(0));
  badge('liBadge',liScore);badge('chenBadge',chenScore);
  gauge('g1','g1s',company);gauge('g2','g2s',company);badge('g1b',company);badge('g2b',company);
  gauge('liArc','liScore',liScore);gauge('chenArc','chenScore',chenScore);
}
