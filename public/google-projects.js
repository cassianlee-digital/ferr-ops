/* Google 接入 / 数据源状态（拆分自 index.html · 阶段2）
   经典 script + window 全局兼容。依赖（均在调用时解析）：window.API、esc()、toast()、window.DEMO_MODE（index.html 内联）。
   含：第三方 API 密钥（加密入库，不回显）+ 数据源只读状态卡。 */

/* V7 设置页 · 第三方 API 密钥（加密入库，不回显）*/
const INTEG_LABEL={gsc:'Google Search Console',ga4:'Google Analytics 4 (GA4)',ads:'Google Ads'};
/* ===== 1d-b: 数据源状态卡(只读 /api/data-sources/status，诚实展示，不伪装接入) ===== */
const DS_LABEL={inquiries:'询盘',seo_weeks:'SEO 周报',sem_weeks:'SEM 周报',gsc:'GSC',ga4:'GA4',ads:'Google Ads',ai:'AI Provider'};
const DS_ORDER=['inquiries','seo_weeks','sem_weeks','gsc','ga4','ads','ai'];
const DS_TYPE_LABEL={manual:'人工录入',sync:'自动同步',provider:'AI Provider'};
// status → [文案, badge色]。未知 status 一律兜底「状态获取失败」，绝不臆造「已接入/已同步」。
function dsStatusMeta(status,type){
  const map={
    available:['人工录入 · 有数据','b-blue'],
    no_records:['人工录入 · 暂无数据','b-gray'],
    not_configured: type==='sync' ? ['未配置 · 同步未实现（Phase 2）','b-gray'] : ['未配置','b-gray'],
    configured_not_synced:['已配置 · 同步未实现（Phase 2）','b-amber'],
    not_implemented:['未接入 · Phase 2','b-gray'],
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
  const count = s.type==='manual' ? (s.count==null?0:s.count) : '—';
  // 错误仅在 error 非空时展示；note=sync_not_implemented 仅作阶段说明；AI 已配置附 provider/model
  let extra='';
  if(s.error) extra=`<span style="color:var(--primary)"> · 错误：${esc(s.error)}</span>`;
  else if(s.note==='sync_not_implemented') extra=`<span class="dim"> · 同步未实现（Phase 2）</span>`;
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
  let status={}; try{ const r=await API.get('/api/settings/integrations'); status=r.integrations||{}; }catch(e){}
  box.innerHTML=Object.keys(INTEG_LABEL).map(p=>{
    const s=status[p]||{}; const badge=s.configured?'<span class="badge b-green">已配置</span>':'<span class="badge b-gray">未配置</span>';
    return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <div style="width:210px;font-weight:600">${INTEG_LABEL[p]} ${badge}</div>
      <input id="integ-${p}" type="password" placeholder="粘贴密钥/授权码" style="flex:1;min-width:200px;background:var(--bg3);border:1px solid var(--border);border-radius:9px;padding:8px 10px;color:var(--text1);font-size:12.5px;font-family:var(--font)">
      <button class="btn-ghost" onclick="saveIntegration('${p}')"><i class="ti ti-device-floppy"></i> 保存</button>
    </div>`;
  }).join('');
}
async function saveIntegration(p){
  const el=document.getElementById('integ-'+p); const secret=el?el.value:'';
  if(!secret){ toast('请先填写密钥'); return; }
  try{ await API.put('/api/settings/integrations',{provider:p,secret}); el.value=''; toast(INTEG_LABEL[p]+' 已保存（加密入库）'); loadIntegrations(); }
  catch(e){ toast(e.status===403?'无权操作':'保存失败：'+e.message); }
}
