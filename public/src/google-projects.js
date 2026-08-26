/* Google 接入 / 数据源状态（ES 模块 · esbuild 打包为 IIFE）。
   运行时依赖的全局（调用时解析）：API、esc()、toast()、window.DEMO_MODE（timerange 初始化）、
   loadGa4()（已迁入本包）。数据新鲜度刷新显式导入 charts.js。
   必须挂 window（main.js 统一处理）：
     - startGoogleAuth/backfillGoogle/syncGoogle —— Google 接入卡的局部事件委托调用；
     - loadDataSourcesStatus/loadIntegrations —— index.html 初始化调用。
   INTEG_LABEL、DS_LABEL/DS_ORDER/DS_TYPE_LABEL、dsRow、dsStatusMeta、googleProviderRow 无外部引用，收进模块作用域。 */

import { esc, toast } from './ui-kit.js';
import { loadDataFreshness } from './charts.js';

const INTEG_LABEL={gsc:'Google Search Console',ga4:'Google Analytics 4 (GA4)',ads:'Google Ads'};
const GOOGLE_PROVIDER_ORDER=['gsc','ga4','ads'];
/* ===== 1d-b: 数据源状态卡(只读 /api/data-sources/status，诚实展示，不伪装接入) ===== */
const DS_LABEL={inquiries:'询盘',seo_weeks:'SEO 周报',sem_weeks:'SEM 周报',gsc:'GSC',ga4:'GA4',ads:'Google Ads',ai:'AI Provider'};
const DS_ORDER=['inquiries','seo_weeks','sem_weeks','gsc','ga4','ads','ai'];
const DS_TYPE_LABEL={manual:'人工录入',sync:'自动同步',provider:'AI Provider'};
// status → [文案, badge色]。未知 status 一律兜底「状态获取失败」，绝不臆造「已接入/已同步」。
function dsStatusMeta(status,type){
  const map={
    available:[type==='sync'?'已授权 · 可同步':'人工录入 · 有数据',type==='sync'?'b-green':'b-blue'],
    no_records:['人工录入 · 暂无数据','b-gray'],
    not_configured: type==='sync' ? ['后端未配置','b-gray'] : ['未配置','b-gray'],
    configured_not_synced:['已配置 · 待 OAuth 授权','b-amber'],
    not_implemented:['未接入','b-gray'],
    configured_unverified:['已配置 · 未验证','b-amber'],
    error:['状态获取失败','b-red'],
  };
  return map[status] || ['状态获取失败','b-red'];
}
function dsRow(key,s){
  s=s||{};
  const name=DS_LABEL[key]||key;
  const typeText=DS_TYPE_LABEL[s.type]||s.type||'';
  const [text,cls]=dsStatusMeta(s.status,s.type);
  const time = s.type==='manual' ? (s.lastAt||'—') : (s.type==='sync' ? (s.lastSyncAt||'—') : '—');
  const count = s.type==='manual' || s.type==='sync' ? (s.count==null?0:s.count) : '—';
  // 错误仅在 error 非空时展示；Google 同步展示缺失配置/OAuth 提示；AI 已配置附 provider/model
  let extra='';
  if(s.error) extra=`<span class="csp-s-b0e08465c2"> · 错误：${esc(s.error)}</span>`;
  else if(s.type==='sync'&&s.missing&&s.missing.length) extra=`<span class="dim"> · 缺少 ${esc(s.missing.join(', '))}</span>`;
  else if(s.note==='google_oauth_required') extra=`<span class="dim"> · 需要 OAuth 授权</span>`;
  else if(s.note==='google_sync_ready') extra=`<span class="dim"> · 可手动同步</span>`;
  else if(s.type==='provider'&&s.status==='configured_unverified') extra=`<span class="dim"> · ${esc(s.provider||'')}${s.model?(' / '+esc(s.model)):''}</span>`;
  return `<div class="csp-s-6d1156dd83">`
    +`<div class="csp-s-22dccc46c7">${esc(name)}</div>`
    +`<div class="csp-s-b57829faf1">${esc(typeText)}</div>`
    +`<span class="badge ${cls}">${esc(text)}</span>`
    +`<div class="csp-s-83725d2c6e"></div>`
    +`<div class="csp-s-95144d7b86">时间 ${esc(String(time))} · 记录 ${esc(String(count))}</div>`
    +`<div class="csp-s-33ee298127">${extra}</div>`
  +`</div>`;
}
export async function loadDataSourcesStatus(){
  const box=document.getElementById('ds-status-rows'); if(!box)return; // 容器不存在直接返回，不报错
  const tag=document.getElementById('ds-demo-tag');
  if(tag) tag.innerHTML = window.DEMO_MODE ? '<span class="badge b-amber csp-s-9d5367afed">示例模式</span>' : '';
  try{
    const r=await API.get('/api/data-sources/status');
    const src=(r&&r.sources)||{};
    box.innerHTML = DS_ORDER.map(k=>dsRow(k,src[k])).join('')
      + (window.DEMO_MODE ? '<div class="dim csp-s-5698104cf1">当前为演示标记，下方仍为接口真实状态。</div>' : '');
  }catch(e){
    // 整卡显示「状态获取失败」，不渲染任何假数据源，不 fallback 成已接入
    box.innerHTML = `<div class="banner banner-red"><i class="ti ti-plug-connected-x csp-s-fd44150866"></i><div><div class="banner-t">状态获取失败</div><div class="banner-s">${esc(e&&e.message?e.message:'请求失败')}</div></div></div>`;
  }
}
export async function loadIntegrations(){
  const box=document.getElementById('integ-rows'); if(!box)return;
  try{
    const r=await API.get('/api/google/status');
    const providers=(r&&r.providers)||{};
    const project=r&&r.defaultProject;
    const projectText=project
      ? `默认项目：${esc(project.name||'未命名项目')}`
      : '未创建项目时使用 .env 中的默认站点 / Property / Customer';
    box.innerHTML=`<div class="sheet-tip csp-s-145afb7049"><i class="ti ti-info-circle"></i> ${projectText}</div>`
      +GOOGLE_PROVIDER_ORDER.map(p=>googleProviderRow(p,providers[p]||{},project)).join('');
    bindGoogleProviderActions(box);
  }catch(e){
    box.innerHTML = `<div class="banner banner-red"><i class="ti ti-plug-connected-x csp-s-fd44150866"></i><div><div class="banner-t">Google 接入状态获取失败</div><div class="banner-s">${esc(e&&e.message?e.message:'请求失败')}</div></div></div>`;
  }
}

function googleProviderRow(provider,s,project){
  const configured=!!s.configured;
  const authorized=!!s.authorized;
  const ok=configured&&authorized;
  const badge=ok?'<span class="badge b-green">已授权</span>':(configured?'<span class="badge b-amber">待授权</span>':'<span class="badge b-gray">后端未配置</span>');
  const missing=s.missing&&s.missing.length ? `<div class="dim csp-s-c9f8cfee5a">缺少：${esc(s.missing.join(', '))}</div>` : '';
  const lastSync=s.lastSyncAt||'—';
  const lastStatus=s.lastSyncStatus||'未同步';
  const lastError=s.lastError ? `<div class="csp-s-5ade8bf698">最近错误：${esc(s.lastError)}</div>` : '';
  const providerConfigNote=provider==='gsc'
    ? ((s.siteUrlConfigured||project?.gsc_site_url)?'站点已配置':'还需要 GSC_SITE_URL 或项目站点')
    : provider==='ga4'
      ? ((s.propertyConfigured||project?.ga4_property_id)?'Property 已配置':'还需要 GA4_PROPERTY_ID 或项目 Property')
      : ((s.customerConfigured||project?.ads_customer_id)?'Customer 已配置':'还需要 GOOGLE_ADS_CUSTOMER_ID 或项目 Customer');
  const authDisabled=configured?'':'disabled';
  const syncDisabled=ok?'':'disabled';
  return `<div class="csp-s-98c17c8e1c">
    <div class="csp-s-fad0d7671e">${esc(INTEG_LABEL[provider]||provider)} ${badge}</div>
    <div class="csp-s-fd03ebc21e">
      <div>${esc(providerConfigNote)} · 最近同步：${esc(String(lastSync))} · 状态：${esc(String(lastStatus))}</div>
      ${missing}${lastError}
    </div>
    <button type="button" class="btn-ghost" data-google-action="auth" data-provider="${esc(provider)}" ${authDisabled}><i class="ti ti-brand-google"></i> 授权</button>
    <button type="button" class="btn-ghost" data-google-action="backfill" data-provider="${esc(provider)}" ${syncDisabled} title="回补最近 90 天历史（首次接入或图表前段空白时用，可能耗时较久）"><i class="ti ti-history"></i> 回补90天</button>
    <button type="button" class="btn-primary" data-google-action="sync" data-provider="${esc(provider)}" ${syncDisabled}><i class="ti ti-refresh"></i> 立即同步</button>
  </div>`;
}

function bindGoogleProviderActions(box){
  box.onclick=e=>{ const btn=e.target.closest('[data-google-action]'); if(!btn||!box.contains(btn))return; const provider=btn.dataset.provider; if(!GOOGLE_PROVIDER_ORDER.includes(provider))return; const action=btn.dataset.googleAction; if(action==='auth')startGoogleAuth(provider); else if(action==='backfill')backfillGoogle(provider,90,btn); else if(action==='sync')syncGoogle(provider,btn); };
}

export function startGoogleAuth(provider){
  location.href='/api/google/auth/start?provider='+encodeURIComponent(provider);
}

// 回补历史：默认同步只拉 7 天，早期数据从未进库 → 一键拉最近 N 天填补图表空白段
export async function backfillGoogle(provider,days,btn){
  const old=btn?btn.innerHTML:'';
  if(btn){ btn.disabled=true; btn.innerHTML='<i class="ti ti-loader-2"></i> 回补中…'; }
  try{
    const end=new Date(); end.setUTCDate(end.getUTCDate()-1);
    const start=new Date(end); start.setUTCDate(start.getUTCDate()-(days-1));
    const iso=d=>d.toISOString().slice(0,10);
    const r=await API.post('/api/sync/'+encodeURIComponent(provider),{start_date:iso(start),end_date:iso(end)});
    toast(`${INTEG_LABEL[provider]||provider} 回补 ${days} 天完成，写入 ${r.rowsWritten||0} 行`);
    await loadDataSourcesStatus(); await loadIntegrations();
    if(provider==='ga4'&&typeof loadGa4==='function') await loadGa4();
    loadDataFreshness();
  }catch(e){
    const missing=e&&e.body&&e.body.missing&&e.body.missing.length ? `，缺少：${e.body.missing.join(', ')}` : '';
    toast(`回补失败：${e.message}${missing}`);
  }finally{
    if(btn){ btn.disabled=false; btn.innerHTML=old; }
  }
}
export async function syncGoogle(provider,btn){
  const old=btn?btn.innerHTML:'';
  if(btn){ btn.disabled=true; btn.innerHTML='<i class="ti ti-loader-2"></i> 同步中'; }
  try{
    const r=await API.post('/api/sync/'+encodeURIComponent(provider),{});
    toast(`${INTEG_LABEL[provider]||provider} 同步完成，写入 ${r.rowsWritten||0} 行`);
    await loadDataSourcesStatus();
    await loadIntegrations();
    if(provider==='ga4'&&typeof loadGa4==='function') await loadGa4();
  }catch(e){
    const missing=e&&e.body&&e.body.missing&&e.body.missing.length ? `，缺少：${e.body.missing.join(', ')}` : '';
    toast(`同步失败：${e.message}${missing}`);
  }finally{
    if(btn){ btn.disabled=false; btn.innerHTML=old; }
  }
}
