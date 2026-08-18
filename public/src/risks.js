const STATUS_LABELS={fail:'失败',unverified:'待验证',warn:'警告',pass:'通过'};
const SOURCE_LABELS={production_live:'最近生产验收',current_static:'当前配置与数据库'};
const EVIDENCE_LABELS={
  mode:'运行模式',provider:'AI 服务',model:'模型',project:'数据项目',missing:'缺失项',
  authorized:'已授权',updatedAt:'凭据更新时间',date:'验收日期',runId:'同步记录',
  rowsWritten:'写入行数',status:'同步状态',finishedAt:'完成时间',totalRows:'事实总行数',
  complete:'证据完整',missingTables:'缺失事实表',integrity:'数据库完整性',elapsedMs:'耗时',
};
const TABLE_LABELS={
  gsc_daily:'GSC 每日汇总',gsc_query_daily:'GSC 搜索词明细',ga4_daily:'GA4 每日汇总',
  ga4_event_daily:'GA4 转化事件',google_ads_campaign_daily:'Google Ads 广告系列',
  google_ads_search_term_daily:'Google Ads 搜索词',
};

let register=null;
let requestSequence=0;

function byId(id){return document.getElementById(id);}

function setText(id,value){const element=byId(id);if(element)element.textContent=String(value==null?'—':value);}

function formatDate(value){
  if(!value)return '尚未验证';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return String(value);
  return new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
}

function labelValue(key,value){
  if(key==='authorized'||key==='complete')return value?'是':'否';
  if(key==='rowsWritten'||key==='totalRows'||key==='elapsedMs')return key==='elapsedMs'?`${value} ms`:String(value);
  if(Array.isArray(value))return value.map(item=>TABLE_LABELS[item]||String(item)).join('、')||'无';
  return String(value==null?'—':value);
}

function evidenceLines(evidence){
  const lines=[];
  for(const [key,value] of Object.entries(evidence||{})){
    if(key==='rows'&&Array.isArray(value)){
      value.forEach(row=>{
        const name=TABLE_LABELS[row&&row.table]||'事实数据';
        lines.push(`${name}：${Number(row&&row.rowCount||0)} 行${row&&row.lastDate?`，最近 ${row.lastDate}`:''}`);
      });
      continue;
    }
    const label=EVIDENCE_LABELS[key];
    if(!label||value==null||value==='')continue;
    lines.push(`${label}：${labelValue(key,value)}`);
  }
  return lines.slice(0,6);
}

function make(tag,className,text){
  const element=document.createElement(tag);
  if(className)element.className=className;
  if(text!=null)element.textContent=String(text);
  return element;
}

function statusBadge(item){
  const badge=make('span',`risk-badge risk-status risk-status-${item.status}`,STATUS_LABELS[item.status]||item.status);
  badge.setAttribute('aria-label',`状态：${STATUS_LABELS[item.status]||item.status}`);
  return badge;
}

function severityBadge(item){
  const badge=make('span',`risk-badge risk-severity risk-severity-${item.severity.toLowerCase()}`,item.severity);
  badge.setAttribute('aria-label',`严重级别：${item.severity}`);
  return badge;
}

function renderSummary(summary){
  setText('risk-p0-open',summary.p0Open||0);
  setText('risk-p1-open',summary.p1Open||0);
  setText('risk-fail-count',summary.fail||0);
  setText('risk-unverified-count',summary.unverified||0);
  setText('risk-pass-count',summary.pass||0);
  const navDot=byId('nav-risks-dot');
  if(navDot)navDot.classList.toggle('is-hidden',!(summary.p0Open>0));
}

function renderAcceptance(acceptance){
  const status=byId('risk-acceptance-status');
  if(!status)return;
  if(!acceptance||!acceptance.available){
    status.textContent='生产实测：尚未执行或尚未保存';
    status.dataset.state='unverified';
    return;
  }
  const verdict={pass:'通过',fail:'失败',not_verified:'未完成'}[acceptance.verdict]||'未知';
  status.textContent=`生产实测：${verdict} · ${formatDate(acceptance.checkedAt)}`;
  status.dataset.state=acceptance.verdict;
}

function appendEvidence(cell,item){
  cell.appendChild(make('div','risk-evidence-main',item.detail||'没有可展示的证据说明。'));
  const lines=evidenceLines(item.evidence);
  if(lines.length){
    const list=make('ul','risk-evidence-list');
    lines.forEach(line=>list.appendChild(make('li','',line)));
    cell.appendChild(list);
  }
  cell.appendChild(make('div','risk-evidence-source',SOURCE_LABELS[item.source]||'当前检查'));
}

function renderRows(){
  if(!register)return;
  const tbody=byId('risk-rows');
  const state=byId('risk-state');
  const wrap=byId('risk-table-wrap');
  if(!tbody||!state||!wrap)return;
  const severity=byId('risk-filter-severity')?.value||'all';
  const status=byId('risk-filter-status')?.value||'open';
  const items=register.items.filter(item=>(
    (severity==='all'||item.severity===severity)
    && (status==='all'||(status==='open'?item.status!=='pass':item.status===status))
  ));
  tbody.replaceChildren();
  state.replaceChildren();
  if(!items.length){
    wrap.hidden=true;
    state.appendChild(make('div','risk-state-message','当前筛选条件下没有风险项。'));
    return;
  }
  wrap.hidden=false;
  items.forEach(item=>{
    const row=document.createElement('tr');
    const severityCell=document.createElement('td');
    severityCell.appendChild(severityBadge(item));
    const statusCell=document.createElement('td');
    statusCell.appendChild(statusBadge(item));
    const titleCell=make('td','risk-title-cell');
    titleCell.appendChild(make('strong','',item.title));
    const evidenceCell=make('td','risk-evidence-cell');
    appendEvidence(evidenceCell,item);
    const ownerCell=make('td','risk-owner-cell',item.owner);
    const updatedCell=make('td','risk-updated-cell',formatDate(item.updatedAt));
    const actionCell=make('td','risk-action-cell',item.nextAction);
    row.append(severityCell,statusCell,titleCell,evidenceCell,ownerCell,updatedCell,actionCell);
    tbody.appendChild(row);
  });
}

function renderError(error){
  const state=byId('risk-state');
  const wrap=byId('risk-table-wrap');
  if(wrap)wrap.hidden=true;
  if(!state)return;
  state.replaceChildren();
  const message=make('div','risk-state-message risk-state-error');
  message.appendChild(make('strong','','风险清单加载失败'));
  message.appendChild(make('span','',`：${error&&error.message?error.message:'未知错误'}`));
  const retry=make('button','btn-ghost','重试');
  retry.type='button';
  retry.addEventListener('click',loadRisks);
  message.appendChild(retry);
  state.appendChild(message);
}

function bindControls(){
  const refresh=byId('risk-refresh');
  if(refresh&&refresh.dataset.bound!=='1'){
    refresh.dataset.bound='1';
    refresh.addEventListener('click',loadRisks);
  }
  ['risk-filter-severity','risk-filter-status'].forEach(id=>{
    const control=byId(id);
    if(control&&control.dataset.bound!=='1'){
      control.dataset.bound='1';
      control.addEventListener('change',renderRows);
    }
  });
}

export async function loadRisks(){
  bindControls();
  const requestId=++requestSequence;
  const refresh=byId('risk-refresh');
  const state=byId('risk-state');
  const wrap=byId('risk-table-wrap');
  if(refresh){refresh.disabled=true;refresh.setAttribute('aria-busy','true');}
  if(wrap)wrap.hidden=true;
  if(state){state.replaceChildren(make('div','risk-state-message','正在核对当前配置、数据库证据和最近生产验收…'));}
  try{
    const result=await API.get('/api/risks');
    if(requestId!==requestSequence)return;
    register=result;
    renderSummary(result.summary||{});
    renderAcceptance(result.latestLiveAcceptance);
    renderRows();
  }catch(error){
    if(requestId===requestSequence)renderError(error);
  }finally{
    if(requestId===requestSequence&&refresh){refresh.disabled=false;refresh.removeAttribute('aria-busy');}
  }
}
