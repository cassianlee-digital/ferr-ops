/* Inquiry distribution world map（ES 模块 · esbuild 打包为 IIFE）。
   Entry stays renderGlobe(); data still comes from window._inqCache.
   The world base map is real GeoJSON loaded at runtime, not a hand-drawn sketch.

   迁移说明：唯一入口 renderGlobe 由 main.js 挂到 window —— inquiries.js:32 与 index.html:1109/1195 真实调用它。
   其余 20 个符号（COUNTRY_GEO/COUNTRY_ALIAS/collectMapData/tooltipHtml/ensureWorldMap/... ）经审计无任何外部引用，
   全部收进模块作用域（index.html:1146 提到 COUNTRY_GEO 只是注释）。
   本模块无加载期副作用，且用 window.echarts 显式取图表库，不依赖裸全局。 */

const QINGDAO = [120.38, 36.07];
const WORLD_MAP_NAME = 'ferrWorld';
const WORLD_MAP_URLS = [
  '/world.geo.json'
];

const COUNTRY_GEO = {
  '德国':[10.45,51.17],'美国':[-98.5,39.8],'西班牙':[-3.7,40.4],'印度':[78.96,20.59],
  '意大利':[12.57,41.87],'加拿大':[-106.3,56.13],'荷兰':[5.29,52.13],
  '墨西哥':[-102.55,23.63],'新西兰':[174.0,-40.9],'哥伦比亚':[-74.3,4.6],
  '克罗地亚':[15.2,45.1],'俄罗斯':[105.0,61.5],'瑞典':[18.6,60.1],
  '巴西':[-51.9,-14.2],'英国':[-1.5,52.4],'法国':[2.2,46.2],
  '澳大利亚':[133.8,-25.3],'日本':[138.25,36.2],'韩国':[127.8,36.5],
  '土耳其':[35.2,39.0],'越南':[108.3,14.1],'印度尼西亚':[113.9,-0.8],
  '印尼':[113.9,-0.8],'波兰':[19.1,51.9],'比利时':[4.5,50.5],
  '瑞士':[8.2,46.8],'奥地利':[14.6,47.5],'葡萄牙':[-8.2,39.4],
  '希腊':[21.8,39.1],'阿联酋':[54.0,24.0],'沙特':[45.0,24.0],
  '埃及':[30.8,26.8],'南非':[24.0,-29.0],'阿根廷':[-64.0,-34.0],
  '智利':[-71.5,-35.7],'泰国':[101.0,15.0],'马来西亚':[101.97,4.2],
  '乌克兰':[31.2,49.0],'捷克':[15.5,49.8],'丹麦':[9.5,56.3],
  '挪威':[8.5,60.5],'芬兰':[26.0,64.0],'爱尔兰':[-8.2,53.4],
  // 拉美(本站主力市场)
  '乌拉圭':[-56.0,-32.8],'秘鲁':[-75.0,-9.2],'厄瓜多尔':[-78.2,-1.5],
  '委内瑞拉':[-66.6,6.4],'玻利维亚':[-64.7,-16.3],'巴拉圭':[-58.4,-23.4],
  '危地马拉':[-90.4,15.7],'哥斯达黎加':[-84.1,9.9],'巴拿马':[-80.1,8.5],
  '尼加拉瓜':[-85.2,12.9],'洪都拉斯':[-86.6,15.0],'萨尔瓦多':[-88.9,13.8],
  '多米尼加':[-70.2,18.7],'古巴':[-79.0,21.5],'波多黎各':[-66.5,18.2],
  // 非洲 / 中东
  '乌干达':[32.3,1.4],'肯尼亚':[37.9,0.0],'尼日利亚':[8.7,9.1],
  '加纳':[-1.0,7.9],'摩洛哥':[-7.1,31.8],'阿尔及利亚':[2.6,28.0],
  '突尼斯':[9.5,33.9],'埃塞俄比亚':[40.5,9.1],'坦桑尼亚':[34.9,-6.4],
  '以色列':[34.9,31.0],'伊朗':[53.7,32.4],'伊拉克':[43.7,33.2],
  '卡塔尔':[51.2,25.3],'科威特':[47.5,29.3],'约旦':[36.2,31.2],
  '黎巴嫩':[35.9,33.9],'阿曼':[56.0,21.5],'巴林':[50.6,26.1],
  // 亚洲 / 其他
  '巴基斯坦':[69.3,30.4],'孟加拉国':[90.4,23.7],'孟加拉':[90.4,23.7],
  '斯里兰卡':[80.8,7.9],'菲律宾':[122.9,12.9],'新加坡':[103.8,1.35],
  '缅甸':[96.0,21.9],'柬埔寨':[104.9,12.6],'尼泊尔':[84.1,28.4],
  '哈萨克斯坦':[66.9,48.0],'蒙古':[103.8,46.9],'匈牙利':[19.5,47.2],
  '罗马尼亚':[24.97,45.9],'保加利亚':[25.5,42.7],'塞尔维亚':[20.8,44.0],
  '斯洛伐克':[19.7,48.7],'斯洛文尼亚':[14.8,46.1],'立陶宛':[23.9,55.2]
};

const COUNTRY_ALIAS = {
  Germany:'德国',USA:'美国','UnitedStates':'美国','UnitedStatesofAmerica':'美国',
  Spain:'西班牙',India:'印度',Italy:'意大利',Canada:'加拿大',Netherlands:'荷兰',
  Mexico:'墨西哥',Russia:'俄罗斯',Sweden:'瑞典',Brazil:'巴西',UK:'英国',
  UnitedKingdom:'英国',France:'法国',Australia:'澳大利亚',Japan:'日本',
  Korea:'韩国',SouthKorea:'韩国',Turkey:'土耳其',Vietnam:'越南',
  Indonesia:'印度尼西亚',Poland:'波兰',Belgium:'比利时',Switzerland:'瑞士',
  Austria:'奥地利',Portugal:'葡萄牙',Greece:'希腊',UAE:'阿联酋',
  SaudiArabia:'沙特',Egypt:'埃及',SouthAfrica:'南非',Argentina:'阿根廷',
  Chile:'智利',Thailand:'泰国',Malaysia:'马来西亚',Ukraine:'乌克兰',
  Czech:'捷克',Denmark:'丹麦',Norway:'挪威',Finland:'芬兰',Ireland:'爱尔兰',
  Uruguay:'乌拉圭',Peru:'秘鲁',Ecuador:'厄瓜多尔',Venezuela:'委内瑞拉',
  Bolivia:'玻利维亚',Paraguay:'巴拉圭',Guatemala:'危地马拉',CostaRica:'哥斯达黎加',
  Panama:'巴拿马',Nicaragua:'尼加拉瓜',Honduras:'洪都拉斯',ElSalvador:'萨尔瓦多',
  DominicanRepublic:'多米尼加',Cuba:'古巴',PuertoRico:'波多黎各',
  Uganda:'乌干达',Kenya:'肯尼亚',Nigeria:'尼日利亚',Ghana:'加纳',
  Morocco:'摩洛哥',Algeria:'阿尔及利亚',Tunisia:'突尼斯',Ethiopia:'埃塞俄比亚',
  Tanzania:'坦桑尼亚',Israel:'以色列',Iran:'伊朗',Iraq:'伊拉克',Qatar:'卡塔尔',
  Kuwait:'科威特',Jordan:'约旦',Lebanon:'黎巴嫩',Oman:'阿曼',Bahrain:'巴林',
  Pakistan:'巴基斯坦',Bangladesh:'孟加拉国',SriLanka:'斯里兰卡',Philippines:'菲律宾',
  Singapore:'新加坡',Myanmar:'缅甸',Cambodia:'柬埔寨',Nepal:'尼泊尔',
  Kazakhstan:'哈萨克斯坦',Mongolia:'蒙古',Hungary:'匈牙利',Romania:'罗马尼亚',
  Bulgaria:'保加利亚',Serbia:'塞尔维亚',Slovakia:'斯洛伐克',Slovenia:'斯洛文尼亚',
  Lithuania:'立陶宛'
};

let inqGlobeChart = null;
let worldMapPromise = null;
let worldMapReady = false;
let renderSeq = 0;
let resizeBound = false;

function inqMapEsc(value){
  return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

function countryName(raw){
  const cleaned = String(raw || '')
    .replace(/[\uD800-\uDFFF]/g, '')
    .replace(/[^\u4e00-\u9fa5A-Za-z]/g, '')
    .trim();
  return COUNTRY_ALIAS[cleaned] || cleaned;
}

function modeOf(arr){
  const counts = {};
  let best = '—';
  let bestCount = 0;
  (arr || []).forEach(v => {
    if (!v) return;
    counts[v] = (counts[v] || 0) + 1;
    if (counts[v] > bestCount) {
      best = v;
      bestCount = counts[v];
    }
  });
  return best;
}

function collectMapData(){
  const map = {};
  const unmapped = {};
  (window._inqCache || []).forEach(row => {
    const name = countryName(row.country);
    const geo = COUNTRY_GEO[name];
    if (!name) return;
    if (!geo) {
      // 有国家名但坐标表里没有 —— 记下来，别让这条询盘从图上凭空消失
      unmapped[name] = (unmapped[name] || 0) + 1;
      return;
    }
    const group = map[name] || (map[name] = {
      country:name, geo, total:0, A:0, B:0, C:0, products:[], channels:[], rows:[]
    });
    group.total += 1;
    group[row.grade] = (group[row.grade] || 0) + 1;
    group.products.push(row.product);
    group.channels.push(row.channel);
    group.rows.push(row);
  });
  const groups = Object.values(map).sort((a, b) => b.total - a.total || a.country.localeCompare(b.country));
  const unmappedList = Object.entries(unmapped)
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count);
  const unmappedTotal = unmappedList.reduce((sum, u) => sum + u.count, 0);
  return { groups, unmappedList, unmappedTotal };
}

function tooltipHtml(group){
  const valid = (group.A || 0) + (group.B || 0);
  const aRatio = valid ? Math.round((group.A || 0) / valid * 100) : 0;
  const rows = group.rows.slice(0, 4).map(r => `
    <div class="inq-map-tip-row">
      <b>${inqMapEsc(r.customer_name || r.country || '未填客户')}</b>
      <span>${inqMapEsc(r.product || '未填产品')} · ${inqMapEsc(r.grade || '—')}级 · ${inqMapEsc(r.channel || '未填渠道')}</span>
      <em>${inqMapEsc(r.source || r.note || '')}</em>
    </div>
  `).join('');
  const more = group.rows.length > 4 ? `<div class="inq-map-tip-more">还有 ${group.rows.length - 4} 条询盘</div>` : '';
  return `
    <div class="inq-map-tip-title">${inqMapEsc(group.country)} · ${group.total} 条询盘</div>
    <div class="inq-map-tip-stats">
      <span>A级 ${group.A || 0}</span><span>B级 ${group.B || 0}</span><span>C级 ${group.C || 0}</span><span>A级占比 ${aRatio}%</span>
    </div>
    <div class="inq-map-tip-meta">主询产品：${inqMapEsc(modeOf(group.products))} · 主要渠道：${inqMapEsc(modeOf(group.channels))}</div>
    ${rows}${more}
  `;
}

async function ensureWorldMap(){
  if (!window.echarts) throw new Error('图表组件没有加载成功');
  if (worldMapReady) return;
  if (!worldMapPromise) {
    worldMapPromise = (async () => {
      let lastError = null;
      for (const url of WORLD_MAP_URLS) {
        try {
          const res = await fetch(url, { cache:'force-cache' });
          if (!res.ok) throw new Error(`地图数据返回 ${res.status}`);
          const geoJson = await res.json();
          window.echarts.registerMap(WORLD_MAP_NAME, geoJson);
          worldMapReady = true;
          return;
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError || new Error('世界地图数据加载失败');
    })();
  }
  await worldMapPromise;
}

function topCountriesHtml(groups){
  return groups.slice(0, 4).map(g => `
    <div><span>${inqMapEsc(g.country)}</span><b>${g.total}</b></div>
  `).join('') || '<div><span>暂无国家分布</span><b>—</b></div>';
}

function unmappedNoteHtml(unmappedList, unmappedTotal){
  if (!unmappedTotal) return '';
  const names = unmappedList.map(u => `${inqMapEsc(u.country)}${u.count > 1 ? ` ×${u.count}` : ''}`).join('、');
  return `
    <div class="inq-map-note">
      有 ${unmappedTotal} 条询盘因国家暂无地图坐标未画上飞线:${names}。数据没丢,只是地图缺该国坐标,请补充坐标表。
    </div>
  `;
}

function renderShell(el, groups, bodyHtml, unmappedList, unmappedTotal){
  el.innerHTML = `
    <div class="inq-flat-map inq-blue-map">
      <div class="inq-map-head">
        <div><span>真实世界地图</span><strong>全球询盘飞线</strong></div>
        <div class="inq-map-total">${groups.length} 个国家 · ${(window._inqCache || []).length} 条询盘</div>
      </div>
      ${unmappedNoteHtml(unmappedList, unmappedTotal)}
      ${bodyHtml}
    </div>
  `;
}

function disposeMap(){
  try {
    if (window.echarts && inqGlobeChart) inqGlobeChart.dispose();
  } catch (_) {}
  inqGlobeChart = null;
}

function bindResize(){
  if (resizeBound) return;
  resizeBound = true;
  window.addEventListener('resize', () => {
    try {
      if (inqGlobeChart) inqGlobeChart.resize();
    } catch (_) {}
  });
}

export async function renderGlobe(){
  const el = document.getElementById('inqGlobe');
  if (!el) return;

  const seq = ++renderSeq;
  const { groups, unmappedList, unmappedTotal } = collectMapData();
  const empty = document.getElementById('inqGlobe-empty');
  if (empty) empty.style.display = 'none';

  disposeMap();
  renderShell(el, groups, '<div class="inq-map-loading">正在加载真实世界地图...</div>', unmappedList, unmappedTotal);

  try {
    await ensureWorldMap();
    if (seq !== renderSeq) return;
  } catch (err) {
    if (seq !== renderSeq) return;
    const msg = inqMapEsc(err && err.message ? err.message : '世界地图数据加载失败');
    renderShell(el, groups, `
      <div class="inq-map-error">
        <b>世界地图加载失败</b>
        <span>${msg}</span>
        <em>请确认 public/world.geo.json 已随项目一起部署。询盘数据没有丢，只是地图底图没有加载。</em>
      </div>
    `, unmappedList, unmappedTotal);
    return;
  }

  renderShell(el, groups, '<div class="inq-echarts-map"></div>', unmappedList, unmappedTotal);
  const chartEl = el.querySelector('.inq-echarts-map');
  if (!chartEl || !window.echarts) return;

  inqGlobeChart = window.echarts.init(chartEl, null, { renderer:'svg' });
  bindResize();

  const lineData = groups.map(group => ({
    name:`青岛 → ${group.country}`,
    coords:[QINGDAO, group.geo],
    value:group.total,
    group,
    lineStyle:{ width:Math.min(4.8, 2 + group.total * 0.35) }
  }));
  const pointData = groups.map(group => ({
    name:group.country,
    value:[group.geo[0], group.geo[1], group.total],
    group
  }));

  inqGlobeChart.setOption({
    backgroundColor:'transparent',
    tooltip:{
      trigger:'item',
      confine:true,
      borderWidth:1,
      borderColor:'#d8e3ec',
      backgroundColor:'rgba(255,255,255,.96)',
      extraCssText:'border-radius:8px;box-shadow:0 18px 42px rgba(38,57,79,.20);',
      textStyle:{ color:'#243244', fontSize:12 },
      formatter:(params) => {
        const group = params && params.data && params.data.group;
        if (group) return tooltipHtml(group);
        if (params && params.name === '青岛') return '<b>青岛</b><br/>询盘飞线出发点';
        return '';
      }
    },
    geo:{
      map:WORLD_MAP_NAME,
      roam:false,
      aspectScale:1,
      left:18,
      right:18,
      top:40,
      bottom:16,
      silent:false,
      selectedMode:false,
      label:{ show:false },
      itemStyle:{
        areaColor:'#ffffff',
        borderColor:'#1a1a1a',
        borderWidth:.8
      },
      emphasis:{
        disabled:false,
        itemStyle:{ areaColor:'#eef1f5', borderColor:'#000' }
      },
      regions:[
        { name:'Antarctica', itemStyle:{ areaColor:'#ffffff', borderColor:'rgba(0,0,0,.28)' } },
        { name:'Greenland', itemStyle:{ areaColor:'#ffffff', borderColor:'rgba(0,0,0,.28)' } }
      ]
    },
    series:[
      {
        type:'lines',
        name:'询盘飞线',
        coordinateSystem:'geo',
        zlevel:3,
        data:lineData,
        symbol:['none','arrow'],
        symbolSize:9,
        effect:{
          show:true,
          period:4.2,
          trailLength:.05,
          symbol:'arrow',
          symbolSize:8,
          color:'#7dd3fc'
        },
        lineStyle:{
          color:'#38bdf8',
          width:1.8,
          opacity:.85,
          curveness:.28
        },
        emphasis:{
          lineStyle:{ opacity:1, width:3.2 }
        }
      },
      {
        type:'effectScatter',
        name:'询盘国家',
        coordinateSystem:'geo',
        zlevel:4,
        data:pointData,
        symbolSize:(value) => Math.min(20, 10 + (value[2] || 0) * 1.4),
        rippleEffect:{ brushType:'stroke', scale:2.5, period:3.6 },
        itemStyle:{ color:'#38bdf8', borderColor:'rgba(255,255,255,.9)', borderWidth:1.6, shadowBlur:12, shadowColor:'rgba(56,189,248,.7)' },
        label:{
          show:true,
          formatter:(params) => `${params.name} ${params.value[2] || ''}`,
          position:'right',
          color:'#172033',
          fontSize:14,
          fontWeight:800,
          fontFamily:'Inter, Microsoft YaHei, Arial, sans-serif',
          textBorderColor:'rgba(255,255,255,.95)',
          textBorderWidth:3
        }
      },
      {
        type:'scatter',
        name:'青岛',
        coordinateSystem:'geo',
        zlevel:5,
        data:[{ name:'青岛', value:[QINGDAO[0], QINGDAO[1], 1] }],
        symbolSize:19,
        itemStyle:{ color:'#fbbf24', borderColor:'rgba(255,255,255,.9)', borderWidth:2.4, shadowBlur:14, shadowColor:'rgba(251,191,36,.7)' },
        label:{
          show:true,
          formatter:'青岛',
          position:'left',
          color:'#b45309',
          fontSize:15,
          fontWeight:800,
          fontFamily:'Inter, Microsoft YaHei, Arial, sans-serif',
          textBorderColor:'#ffffff',
          textBorderWidth:3
        }
      }
    ]
  }, true);
}
