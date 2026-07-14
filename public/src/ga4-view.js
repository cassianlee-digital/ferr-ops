/* GA4 流量看板（ES 模块 · esbuild 打包为 IIFE）。
   运行时依赖的全局（调用时解析）：API、esc()、withRange()（index.html 内联）。
   loadGa4 由 main.js 挂到 window，供 tab 初始化调用。 */
export async function loadGa4() {
  let r = { connected: false }; try { r = await API.get(withRange('/api/ga4/overview')); } catch (e) {} // 阶段5：跟随所选时间范围
  const st = document.getElementById('ga4-status'); if (st) { st.className = 'badge ' + (r.connected ? 'b-green' : 'b-gray'); st.textContent = r.connected ? '已接入' : '未接入'; }
  const hint = document.getElementById('ga4-hint'); if (hint) hint.style.display = r.connected ? 'none' : 'flex';
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = (v == null ? '—' : v); };
  const m = r.metrics;
  if (m) { set('ga4-users', m.activeUsers); set('ga4-sessions', m.sessions); set('ga4-views', m.pageViews); set('ga4-bounce', m.bounceRate != null ? m.bounceRate + '%' : '—'); set('ga4-dur', m.avgDuration); }
  const fill = (tbId, rows, cols) => { const tb = document.getElementById(tbId); if (!tb) return; if (rows && rows.length) { tb.innerHTML = rows.map(x => '<tr>' + cols.map(c => `<td class="${c.cls || ''}">${esc(x[c.k] ?? '')}</td>`).join('') + '</tr>').join(''); const card = tb.closest('.card'); const e = card && card.querySelector('.ga4-empty'); if (e) e.style.display = 'none'; } };
  fill('ga4-sources', r.sources, [{ k: 'source' }, { k: 'sessions', cls: 'num' }, { k: 'users', cls: 'num' }]);
  fill('ga4-countries', r.countries, [{ k: 'country' }, { k: 'sessions', cls: 'num' }, { k: 'users', cls: 'num' }]);
  fill('ga4-landing', r.landingPages, [{ k: 'page' }, { k: 'sessions', cls: 'num' }, { k: 'conversions', cls: 'num' }]);
}
