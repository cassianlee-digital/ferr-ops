/* SEO opportunity keyword rank snapshots and first-to-latest trend display. */
function renderRankTrend(snapshots){
  if(!snapshots||snapshots.length<2)return;
  const first=snapshots[0];
  const latest=snapshots[snapshots.length-1];
  [...document.querySelectorAll('#mp-seo-opp tbody tr')].forEach(row=>{
    const keyword=row.cells[0].textContent.trim();
    const start=first.items.find(item=>item.keyword===keyword);
    const end=latest.items.find(item=>item.keyword===keyword);
    if(!start||!end||start.rank==null||end.rank==null)return;
    const difference=start.rank-end.rank;
    let trend=row.querySelector('.rk-trend');
    if(!trend){
      trend=document.createElement('span');
      trend.className='rk-trend';
      trend.style.marginLeft='6px';
      trend.style.fontSize='11px';
      trend.style.fontWeight='800';
      row.cells[2].appendChild(trend);
    }
    trend.textContent=difference>0?'▲'+difference:difference<0?'▼'+(-difference):'—';
    trend.style.color=difference>0?'var(--green)':difference<0?'var(--primary)':'var(--text3)';
  });
  const note=document.getElementById('rankTrendNote');
  if(note)note.textContent='已记录 '+snapshots.length+' 周 · 对比首末快照（▲升 ▼降）';
}

export async function loadRankSnapshots(){
  try{
    const {snapshots}=await API.get('/api/rank-snapshots');
    if(snapshots&&snapshots.length>=2)renderRankTrend(snapshots);
  }catch(error){}
}

export async function snapshotRanks(){
  const rows=[...document.querySelectorAll('#mp-seo-opp tbody tr')];
  const items=rows.map(row=>({
    keyword:row.cells[0].textContent.trim(),
    rank:parseInt(row.cells[2].textContent,10)||null
  }));
  try{
    const {weeks,snapshots}=await API.post('/api/rank-snapshots',{items});
    renderRankTrend(snapshots);
    toast('已记录本周排名快照（'+items.length+' 词）· 共 '+weeks+' 周，可看趋势');
  }catch(error){
    toast(error&&error.status===403?'无权操作（仅李/SEO 可记录快照）':'保存失败：'+(error&&error.message||'未知错误'));
  }
}
