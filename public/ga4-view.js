/* GA4 流量看板（拆分自 index.html · 阶段2）
   经典 script + window 全局兼容。依赖（均在调用时解析）：window.API、esc()（index.html 内联）。
   第一期：骨架 + 空状态；第二期接 GA4 Data API 填充。 */
async function loadGa4(){
  let r={connected:false}; try{ r=await API.get('/api/ga4/overview'); }catch(e){}
  const st=document.getElementById('ga4-status'); if(st){ st.className='badge '+(r.connected?'b-green':'b-gray'); st.textContent=r.connected?'已接入':'未接入'; }
  const hint=document.getElementById('ga4-hint'); if(hint)hint.style.display=r.connected?'none':'flex';
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=(v==null?'—':v);};
  const m=r.metrics;
  if(m){ set('ga4-users',m.activeUsers); set('ga4-sessions',m.sessions); set('ga4-views',m.pageViews); set('ga4-bounce',m.bounceRate!=null?m.bounceRate+'%':'—'); set('ga4-dur',m.avgDuration); }
  const fill=(tbId,rows,cols)=>{ const tb=document.getElementById(tbId); if(!tb)return; if(rows&&rows.length){ tb.innerHTML=rows.map(x=>'<tr>'+cols.map(c=>`<td class="${c.cls||''}">${esc(x[c.k]??'')}</td>`).join('')+'</tr>').join(''); const card=tb.closest('.card'); const e=card&&card.querySelector('.ga4-empty'); if(e)e.style.display='none'; } };
  fill('ga4-sources',r.sources,[{k:'source'},{k:'sessions',cls:'num'},{k:'users',cls:'num'}]);
  fill('ga4-countries',r.countries,[{k:'country'},{k:'sessions',cls:'num'},{k:'users',cls:'num'}]);
  fill('ga4-landing',r.landingPages,[{k:'page'},{k:'sessions',cls:'num'},{k:'conversions',cls:'num'}]);
}
