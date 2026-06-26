/* Inquiry distribution world map.
   Entry stays renderGlobe(); data still comes from window._inqCache.
   The world base map is real GeoJSON loaded at runtime, not a hand-drawn sketch. */

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
  '挪威':[8.5,60.5],'芬兰':[26.0,64.0],'爱尔兰':[-8.2,53.4]
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
  Czech:'捷克',Denmark:'丹麦',Norway:'挪威',Finland:'芬兰',Ireland:'爱尔兰'
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
  (window._inqCache || []).forEach(row => {
    const name = countryName(row.country);
    const geo = COUNTRY_GEO[name];
    if (!name || !geo) return;
    const group = map[name] || (map[name] = {
      country:name, geo, total:0, A:0, B:0, C:0, products:[], channels:[], rows:[]
    });
    group.total += 1;
    group[row.grade] = (group[row.grade] || 0) + 1;
    group.products.push(row.product);
    group.channels.push(row.channel);
    group.rows.push(row);
  });
  return Object.values(map).sort((a, b) => b.total - a.total || a.country.localeCompare(b.country));
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

function renderShell(el, groups, bodyHtml){
  el.innerHTML = `
    <div class="inq-flat-map inq-blue-map">
      <div class="inq-map-head">
        <div><span>真实世界地图</span><strong>全球询盘飞线</strong></div>
        <div class="inq-map-total">${groups.length} 个国家 · ${(window._inqCache || []).length} 条询盘</div>
      </div>
      ${bodyHtml}
      <div class="inq-map-panel">${topCountriesHtml(groups)}</div>
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

async function renderGlobe(){
  const el = document.getElementById('inqGlobe');
  if (!el) return;

  const seq = ++renderSeq;
  const groups = collectMapData();
  const empty = document.getElementById('inqGlobe-empty');
  if (empty) empty.style.display = 'none';

  disposeMap();
  renderShell(el, groups, '<div class="inq-map-loading">正在加载真实世界地图...</div>');

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
    `);
    return;
  }

  renderShell(el, groups, '<div class="inq-echarts-map"></div>');
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
      bottom:44,
      silent:false,
      selectedMode:false,
      label:{ show:false },
      itemStyle:{
        areaColor:'#2f7dcc',
        borderColor:'rgba(255,255,255,.86)',
        borderWidth:.8
      },
      emphasis:{
        disabled:true,
        itemStyle:{ areaColor:'#2f7dcc' }
      },
      regions:[
        { name:'Antarctica', itemStyle:{ areaColor:'#2f7dcc', borderColor:'rgba(255,255,255,.58)' } },
        { name:'Greenland', itemStyle:{ areaColor:'#2f7dcc', borderColor:'rgba(255,255,255,.58)' } }
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
          trailLength:.035,
          symbol:'arrow',
          symbolSize:9,
          color:'#f43f3a'
        },
        lineStyle:{
          color:'#f43f3a',
          width:2.2,
          opacity:.95,
          curveness:.24
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
        itemStyle:{ color:'#f43f3a', borderColor:'#fff', borderWidth:2.4 },
        label:{
          show:true,
          formatter:(params) => `${params.name} ${params.value[2] || ''}`,
          position:'right',
          color:'#1d2a3a',
          fontSize:15,
          fontWeight:900,
          fontFamily:'Inter, Microsoft YaHei, Arial, sans-serif',
          textBorderColor:'#ffffff',
          textBorderWidth:2.4
        }
      },
      {
        type:'scatter',
        name:'青岛',
        coordinateSystem:'geo',
        zlevel:5,
        data:[{ name:'青岛', value:[QINGDAO[0], QINGDAO[1], 1] }],
        symbolSize:19,
        itemStyle:{ color:'#08bde8', borderColor:'#fff', borderWidth:3 },
        label:{
          show:true,
          formatter:'青岛',
          position:'left',
          color:'#16243a',
          fontSize:16,
          fontWeight:900,
          fontFamily:'Inter, Microsoft YaHei, Arial, sans-serif',
          textBorderColor:'#ffffff',
          textBorderWidth:2.8
        }
      }
    ]
  }, true);
}
