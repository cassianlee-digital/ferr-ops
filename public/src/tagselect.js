/* 彩色标签下拉 tag-select（ES 模块 · esbuild 打包为 IIFE）。
   运行时依赖的全局（事件时解析）：API、toast()、inqRowHtml()/isUpgraded()/window._inqCache（inquiries.js）。
   OPT 必须挂到 window：keywords.js 的 clsOf() 裸引用它（原为经典脚本的词法全局）。
   menu/curSel 已证无外部引用，收进模块作用域。
   注：const menu=getElementById('selMenu') 在模块求值时执行——bundle 以经典 <script> 加载且位于 body 之后，
       #selMenu 早已解析，安全（与旧脚本同一时机语义）。 */

/* ---------- colored tag-select ---------- */
export const OPT={
 channel:[['SEO自然','b-blue'],['SEM付费','b-purple'],['直接','b-teal'],['其他','b-gray']],
 product:[['铸造','b-amber'],['锻造','b-red'],['机加工','b-blue'],['阀门','b-purple'],['管件','b-teal']],
 status:[['待开始','b-gray'],['进行中','b-amber'],['已完成','b-green']],
 result:[['已改','b-green'],['进行中','b-amber'],['计划下周','b-blue'],['放弃','b-gray']],
 grade:[['A','b-green'],['B','b-blue'],['C','b-gray']], // 6.23 文档 8：询盘等级 tagselect 可点改
 owner:[['李','b-blue'],['陈','b-purple']],
 dept:[['SEO','b-blue'],['SEM','b-purple']],
 match:[['完全匹配','b-green'],['词组匹配','b-blue'],['广泛匹配','b-amber']],
 comp:[['低 (10-30)','b-green'],['中 (30-60)','b-amber'],['高 (60-90)','b-red']],
 kwtype:[['商业调查型','b-purple'],['信息型','b-blue'],['交易型','b-green']],
 intent:[['信息型','b-blue'],['商业调研型','b-purple'],['交易型','b-green'],['导航型','b-teal'],['规格/标准型','b-amber'],['灵感/案例型','b-red']],
 optstatus:[['未优化','b-red'],['优化中','b-amber'],['已优化','b-green']],
 priority:[['最高','b-red'],['高','b-amber'],['中','b-blue'],['持续','b-gray']],
 campaign:[['FERR-球铁-德国','b-purple'],['FERR-按图-美国','b-purple'],['Bafaw-阀门-西语','b-teal']],
 adgroup:[['广告组 ▾','b-gray']],kw:[['关键词 ▾','b-gray']],
 negmatch:[['精确','b-green'],['词组','b-blue'],['广泛','b-amber']],
 negstatus:[['生效','b-green'],['观察','b-amber'],['已移除','b-gray']],
 adstatus:[['采用中','b-green'],['测试中','b-amber'],['已弃用','b-gray']]
};
const menu=document.getElementById('selMenu'); let curSel=null;
document.addEventListener('click',e=>{
  const ts=e.target.closest('.tagselect');
  if(ts){ curSel=ts; const kind=ts.dataset.kind; const opts=OPT[kind]||[]; const r=ts.getBoundingClientRect();
    menu.innerHTML=opts.map(o=>`<div class="opt" data-v="${o[0]}" data-c="${o[1]}"><span class="badge ${o[1]}">${o[0]}</span></div>`).join('');
    menu.style.display='flex'; menu.style.left=Math.min(r.left,window.innerWidth-160)+'px'; menu.style.top=(r.bottom+4)+'px';
    return;
  }
  if(e.target.closest('#selMenu')){ const o=e.target.closest('.opt'); if(o&&curSel){ curSel.className='tagselect '+o.dataset.c; curSel.innerHTML=o.dataset.v+'<i class="ti ti-chevron-down"></i>'; persistTagChange(curSel,o.dataset.v); } menu.style.display='none'; return; }
  menu.style.display='none';
});
/* 否词/广告创意 的匹配方式/状态变更 → PATCH 入库（其余表的标签变更后续步骤再接）*/
export async function persistTagChange(el,value){
  const kind=el.dataset.kind; const tr=el.closest('tr'); const id=tr&&tr.dataset.id; if(!id)return;
  // 关键词库行：写入 attrs
  if(tr.dataset.kwType){
    const attrKey={comp:'comp',optstatus:'optstatus',match:'match',priority:'priority',intent:'searchIntent'}[kind]; if(!attrKey)return;
    try{ await API.patch('/api/keywords/'+id,{attrs:{[attrKey]:value}}); }catch(err){ toast(err.status===403?'无权修改':'保存失败'); }
    return;
  }
  // 任意带 data-ep 的行：标签 kind → 字段名 通用映射
  const ep=tr.dataset.ep; if(!ep)return;
  const fieldMap={negmatch:'match_type',negstatus:'status',adstatus:'status',match:'match_type',
    priority:'priority',owner:'owner',status:'status',result:'status',dept:'dept',grade:'grade'}; // 6.23 文档 8
  const field=fieldMap[kind]; if(!field)return;
  try{
    await API.patch(ep+'/'+id,{[field]:value});
    // 6.23 文档 9：询盘等级改完后，同步 _inqCache + 重渲染该行（上调标红 / ⚠️ 即时反映）
    if(ep==='/api/inquiries'&&field==='grade'){
      const it=(window._inqCache||[]).find(x=>String(x.id)===String(id));
      if(it){
        it.grade=value;
        if(tr){
          tr.innerHTML=inqRowHtml(it);
          tr.classList.toggle('inq-upgraded',isUpgraded(it));
        }
      }
    }
    // 归档②：月度计划 status='已完成' → 自动归档（条目16）
    if(ep==='/api/loop-items'&&kind==='status'&&value==='已完成'&&(tr.querySelector('[data-field="content"]')||{}).innerText){
      const dept=tr.querySelector('[data-kind="dept"]'); // plan 行未必有 dept tag，无则按表 id 推
      const isSem=tr.closest('#tb-plan-sem')!=null;
      const ak=isSem?'sem':'seo';
      await API.post(ep+'/'+id+'/archive',{archive_kind:ak});
      tr.remove(); toast('已完成 · 已自动归档');
    }
  }catch(err){ toast(err.status===403?'无权修改':'保存失败'); }
}
