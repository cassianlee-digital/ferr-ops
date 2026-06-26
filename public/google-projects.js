/* Google 接入 / 数据源状态（拆分自 index.html · 阶段2）
   经典 script + window 全局兼容。依赖（均在调用时解析）：window.API、esc()、toast()、window.DEMO_MODE（index.html 内联）。
   含：Google OAuth 配置状态 + 数据源只读状态卡。 */

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
  if(s.error) extra=`<span style="color:var(--primary)"> · 错误：${esc(s.error)}</span>`;
  else if(s.type==='sync'&&s.missing&&s.missing.length) extra=`<span class="dim"> · 缺少 ${esc(s.missing.join(', '))}</span>`;
  else if(s.note==='google_oauth_required') extra=`<span class="dim"> · 需要 OAuth 授权</span>`;
  else if(s.note==='google_sync_ready') extra=`<span class="dim"> · 可手动同步</span>`;
  else if(s.type==='provider'&&s.status==='configured_unverified') extra=`<span class="dim"> · ${esc(s.provider||'')}${s.model?(' / '+esc(s.model)):''}</span>`;
  return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)">`
    +`<div style="width:96px;font-weight:600">${esc(name)}</div>`
    +`<div style="width:74px;color:var(--text3);font-size:11px">${esc(typeText)}</div>`
    +`<span class="badge ${cls}">${esc(text)}</span>`
    +`<div style="flex:1"></div>`
    +`<div style="color:var(--text3);font-size:11px;white-space:nowrap">时间 ${esc(String(time))} · 记录 ${esc(String(count))}</div>`
    +`<div style="font-size:11px">${extra}</div>`
  +`</div>`;
}
async function loadDataSourcesStatus(){
  const box=document.getElementById('ds-status-rows'); if(!box)return; // 容器不存在直接返回，不报错
  const tag=document.getElementById('ds-demo-tag');
  if(tag) tag.innerHTML = window.DEMO_MODE ? '<span class="badge b-amber" style="margin-left:8px">示例模式</span>' : '';
  try{
    const r=await API.get('/api/data-sources/status');
    const src=(r&&r.sources)||{};
    box.innerHTML = DS_ORDER.map(k=>dsRow(k,src[k])).join('')
      + (window.DEMO_MODE ? '<div class="dim" style="font-size:11px;margin-top:6px">当前为演示标记，下方仍为接口真实状态。</div>' : '');
  }catch(e){
    // 整卡显示「状态获取失败」，不渲染任何假数据源，不 fallback 成已接入
    box.innerHTML = `<div class="banner banner-red"><i class="ti ti-plug-connected-x" style="color:var(--primary);font-size:18px"></i><div><div class="banner-t">状态获取失败</div><div class="banner-s">${esc(e&&e.message?e.message:'请求失败')}</div></div></div>`;
  }
}
async function loadIntegrations(){
  const box=document.getElementById('integ-rows'); if(!box)return;
  try{
    const r=await API.get('/api/google/status');
    const providers=(r&&r.providers)||{};
    const project=r&&r.defaultProject;
    const projectText=project
      ? `默认项目：${esc(project.name||'未命名项目')}`
      : '未创建项目时使用 .env 中的默认站点 / Property / Customer';
    box.innerHTML=`<div class="sheet-tip" style="margin-bottom:2px"><i class="ti ti-info-circle"></i> ${projectText}</div>`
      +GOOGLE_PROVIDER_ORDER.map(p=>googleProviderRow(p,providers[p]||{},project)).join('');
  }catch(e){
    box.innerHTML = `<div class="banner banner-red"><i class="ti ti-plug-connected-x" style="color:var(--primary);font-size:18px"></i><div><div class="banner-t">Google 接入状态获取失败</div><div class="banner-s">${esc(e&&e.message?e.message:'请求失败')}</div></div></div>`;
  }
}

function googleProviderRow(provider,s,project){
  const configured=!!s.configured;
  const authorized=!!s.authorized;
  const ok=configured&&authorized;
  const badge=ok?'<span class="badge b-green">已授权</span>':(configured?'<span class="badge b-amber">待授权</span>':'<span class="badge b-gray">后端未配置</span>');
  const missing=s.missing&&s.missing.length ? `<div class="dim" style="font-size:11px;margin-top:4px">缺少：${esc(s.missing.join(', '))}</div>` : '';
  const lastSync=s.lastSyncAt||'—';
  const lastStatus=s.lastSyncStatus||'未同步';
  const lastError=s.lastError ? `<div style="color:var(--primary);font-size:11px;margin-top:4px">最近错误：${esc(s.lastError)}</div>` : '';
  const providerConfigNote=provider==='gsc'
    ? ((s.siteUrlConfigured||project?.gsc_site_url)?'站点已配置':'还需要 GSC_SITE_URL 或项目站点')
    : provider==='ga4'
      ? ((s.propertyConfigured||project?.ga4_property_id)?'Property 已配置':'还需要 GA4_PROPERTY_ID 或项目 Property')
      : ((s.customerConfigured||project?.ads_customer_id)?'Customer 已配置':'还需要 GOOGLE_ADS_CUSTOMER_ID 或项目 Customer');
  const authDisabled=configured?'':'disabled';
  const syncDisabled=ok?'':'disabled';
  return `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">
    <div style="width:230px;font-weight:700">${esc(INTEG_LABEL[provider]||provider)} ${badge}</div>
    <div style="flex:1;min-width:260px;color:var(--text2);font-size:12px;line-height:1.6">
      <div>${esc(providerConfigNote)} · 最近同步：${esc(String(lastSync))} · 状态：${esc(String(lastStatus))}</div>
      ${missing}${lastError}
    </div>
    <button class="btn-ghost" onclick="startGoogleAuth('${provider}')" ${authDisabled}><i class="ti ti-brand-google"></i> 授权</button>
    <button class="btn-primary" onclick="syncGoogle('${provider}',this)" ${syncDisabled}><i class="ti ti-refresh"></i> 立即同步</button>
  </div>`;
}

function startGoogleAuth(provider){
  location.href='/api/google/auth/start?provider='+encodeURIComponent(provider);
}

async function syncGoogle(provider,btn){
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
