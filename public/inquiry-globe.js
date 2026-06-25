/* 询盘 3D 地球仪（拆分自 index.html · 阶段4-A）
   经典 script + window 全局兼容。依赖（运行时解析）：echarts/echarts-gl（CDN）、window._inqCache。
   渲染入口 renderGlobe() 由路由切换/hydrate/renderInqList 在运行时调用。 */

/* ===== 询盘 3D 地球仪（青岛飞线，读表格实时数据）===== */
const QINGDAO=[120.38,36.07];
const COUNTRY_GEO={'德国':[10.45,51.17],'美国':[-98.5,39.8],'西班牙':[-3.7,40.4],'印度':[78.96,20.59],'意大利':[12.57,41.87],'加拿大':[-106.3,56.13],'荷兰':[5.29,52.13],'墨西哥':[-102.55,23.63],'新西兰':[174.0,-40.9],'哥伦比亚':[-74.3,4.6],'克罗地亚':[15.2,45.1],'俄罗斯':[105.0,61.5],'瑞典':[18.6,60.1],'巴西':[-51.9,-14.2],'英国':[-1.5,52.4],'法国':[2.2,46.2],'澳大利亚':[133.8,-25.3],'日本':[138.25,36.2],'韩国':[127.8,36.5],'土耳其':[35.2,39.0],'越南':[108.3,14.1],'印度尼西亚':[113.9,-0.8],'印尼':[113.9,-0.8],'波兰':[19.1,51.9],'比利时':[4.5,50.5],'瑞士':[8.2,46.8],'奥地利':[14.6,47.5],'葡萄牙':[-8.2,39.4],'希腊':[21.8,39.1],'阿联酋':[54.0,24.0],'沙特':[45.0,24.0],'埃及':[30.8,26.8],'南非':[24.0,-29.0],'阿根廷':[-64.0,-34.0],'智利':[-71.5,-35.7],'泰国':[101.0,15.0],'马来西亚':[101.97,4.2],'乌克兰':[31.2,49.0],'捷克':[15.5,49.8],'丹麦':[9.5,56.3],'挪威':[8.5,60.5],'芬兰':[26.0,64.0],'爱尔兰':[-8.2,53.4]};
function countryName(raw){ return String(raw||'').replace(/[\uD800-\uDFFF]/g,'').replace(/[^一-龥A-Za-z]/g,'').trim(); }
function modeOf(arr){ const m={}; let best='—',bc=0; (arr||[]).forEach(v=>{ if(!v)return; m[v]=(m[v]||0)+1; if(m[v]>bc){bc=m[v];best=v;} }); return best; }
function aggInqByCountry(){ const map={}; (window._inqCache||[]).forEach(r=>{ const n=countryName(r.country); if(!n||!COUNTRY_GEO[n])return; const g=map[n]||(map[n]={total:0,A:0,B:0,C:0,products:[],channels:[]}); g.total++; g[r.grade]=(g[r.grade]||0)+1; g.products.push(r.product); g.channels.push(r.channel); }); return map; }
let inqGlobeChart=null;
function renderGlobe(){
  const el=document.getElementById('inqGlobe'); if(!el||typeof echarts==='undefined')return;
  const map=aggInqByCountry(); const names=Object.keys(map);
  const empty=document.getElementById('inqGlobe-empty'); if(empty)empty.style.display=names.length?'none':'block';
  const points=names.map(n=>{ const g=map[n]; const valid=(g.A||0)+(g.B||0); return {name:n,value:[COUNTRY_GEO[n][0],COUNTRY_GEO[n][1],g.total],stats:{total:g.total,aRatio:valid?Math.round((g.A||0)/valid*100):0,product:modeOf(g.products),channel:modeOf(g.channels)}}; });
  const lines=names.map(n=>({coords:[QINGDAO,COUNTRY_GEO[n]]}));
  try{
    if(!inqGlobeChart) inqGlobeChart=echarts.init(el);
    inqGlobeChart.setOption({
      backgroundColor:'transparent',
      tooltip:{formatter:p=>{const s=p.data&&p.data.stats; if(!s)return p.name; return `<b>${p.name}</b><br/>询盘总量 ${s.total}<br/>A级占比 ${s.aRatio}%<br/>主询产品 ${s.product}<br/>主要渠道 ${s.channel}`;}},
      globe:{baseColor:'#13233a',shading:'color',atmosphere:{show:true},light:{ambient:{intensity:.6},main:{intensity:.6}},viewControl:{autoRotate:true,autoRotateAfterStill:3,distance:210}},
      series:[
        {type:'lines3D',coordinateSystem:'globe',effect:{show:true,trailWidth:2,trailLength:.25,trailOpacity:1,trailColor:'#ff6f68'},lineStyle:{width:1,color:'#F6423A',opacity:.4},data:lines},
        {type:'scatter3D',coordinateSystem:'globe',symbolSize:10,itemStyle:{color:'#F6423A'},label:{show:false},data:points}
      ]
    });
    inqGlobeChart.resize();
  }catch(e){ if(empty){empty.style.display='block';empty.textContent='地球仪组件加载失败（需联网加载 echarts-gl）';} }
}
