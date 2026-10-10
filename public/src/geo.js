/* 总览页的 GEO 卡（2026-10-10）：AI 引擎带来的流量与询盘。
 *
 * 这张卡以前是个占位（还被写成了「地理位置监控」）。经理说的 GEO 是生成式引擎优化：
 * 我们在 ChatGPT / Perplexity 这些 AI 的回答里有没有被带出来、带来了多少访问和询盘。
 *
 * 能自动拿到的只有「访客从 AI 回答里点链接进站」这一部分（GA4 会话来源）。
 * AI 提到了我们但用户没点链接的，流量数据里一条都没有 —— 这句话必须一直挂在卡上，
 * 否则这里的数会被当成 GEO 的全部。口径在后端 services/geo.js，这里只照着画。
 *
 * 跟随总览页的时间范围（scope = dashboard），自己听 timerange。全部 createElement，没有 innerHTML。
 */
import { withRange, rangeText, getCurrentRange } from './timerange.js';

const $ = (id) => document.getElementById(id);
let seq = 0;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = String(text);
  return n;
}
const num = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 });

function deltaText(cur, prev) {
  if (prev == null) return '上期没有数据，无法对比';
  const d = cur - prev;
  if (!prev) return d ? '上期为 0，本期 ' + num(cur) : '与上期持平';
  return '较上期 ' + (d > 0 ? '+' : '') + num(d) + '（' + (d > 0 ? '+' : '') + Math.round((d / prev) * 100) + '%）';
}

function render(data) {
  const body = $('geo-body'); body.textContent = '';
  const sub = $('geo-range'); if (sub) sub.textContent = 'GA4 · ' + rangeText(data.range);

  if (data.status === 'NOT_SYNCED') {
    body.appendChild(el('div', 'geo-empty', '这段时间 GA4 没有同步数据，看不到 AI 引擎带来的流量。请到「数据看板 → GA4 流量」确认同步状态。'));
    return;
  }
  const t = data.totals;
  const grid = el('div', 'geo-grid');

  const head = el('div', 'geo-block');
  head.appendChild(el('div', 'geo-label', 'AI 引擎带来的访问'));
  head.appendChild(el('div', 'geo-big', num(t.sessions)));
  head.appendChild(el('div', 'geo-sub', '占全站 ' + (t.share == null ? '—' : (t.share * 100).toFixed(1) + '%') + '（全站 ' + num(t.site_sessions) + ' 次）'));
  head.appendChild(el('div', 'geo-sub', deltaText(t.sessions, t.prev_sessions)));
  if (data.data_days) head.appendChild(el('div', 'geo-sub', '区间内 GA4 有 ' + data.data_days + ' 天数据 · 关键事件 ' + num(t.key_events)));
  grid.appendChild(head);

  const list = el('div', 'geo-block');
  list.appendChild(el('div', 'geo-label', '按引擎'));
  if (!data.engines.length) {
    list.appendChild(el('div', 'geo-sub', '这段时间没有任何来自 AI 引擎的访问。'));
  } else {
    const max = Math.max(...data.engines.map((e) => e.sessions), 1);
    for (const e of data.engines) {
      const row = el('div', 'geo-row'); row.title = e.sources.length ? 'GA4 来源值：' + e.sources.join('、') : '本期没有访问';
      row.appendChild(el('span', 'geo-name', e.label));
      const track = el('span', 'geo-track'); const bar = el('span', 'geo-bar');
      bar.style.width = Math.round((e.sessions / max) * 100) + '%'; // CSSOM 赋值，不是 style 属性，CSP 允许
      track.appendChild(bar); row.appendChild(track);
      row.appendChild(el('span', 'geo-val', num(e.sessions) + (e.prevSessions == null ? '' : ' · 上期 ' + num(e.prevSessions))));
      list.appendChild(row);
    }
  }
  grid.appendChild(list);

  const inq = el('div', 'geo-block');
  inq.appendChild(el('div', 'geo-label', 'AI 引擎带来的询盘'));
  inq.appendChild(el('div', 'geo-big', data.inquiries.total));
  inq.appendChild(el('div', 'geo-sub', 'A ' + data.inquiries.a + ' · B ' + data.inquiries.b + ' · C ' + data.inquiries.c));
  inq.appendChild(el('div', 'geo-sub', '表单线索 ' + data.leads.total + ' 条' + (data.leads.ignored ? '（其中 ' + data.leads.ignored + ' 条被忽略）' : '')));
  inq.appendChild(el('div', 'geo-sub', '只数独立站表单带回来路的询盘；人工录入的询盘没有可信的来路，不计。'));
  grid.appendChild(inq);

  body.appendChild(grid);
  body.appendChild(el('div', 'geo-note', '这里只有「从 AI 回答里点链接进站」的访问。AI 提到了我们但用户没点链接的，流量数据里看不到，所以实际影响只会比这里多。被 AI 引用的情况要靠固定题库人工抽查，尚未建立。识别的引擎：' + data.known_engines.join('、') + '。'));
}

export async function loadGeo() {
  const body = $('geo-body'); if (!body) return;
  const range = getCurrentRange('dashboard');
  if (!range || !range.start_date) return;
  const my = ++seq;
  try {
    const data = await API.get(withRange('/api/geo/summary', range));
    if (my === seq) render(data);
  } catch (e) {
    if (my !== seq || (e && e.message === 'unauthorized')) return;
    body.textContent = '';
    body.appendChild(el('div', 'geo-empty', 'GEO 数据加载失败：' + ((e && e.message) || '请求失败') + ' '));
    const retry = el('button', 'btn-mini', '重试'); retry.type = 'button'; retry.addEventListener('click', loadGeo);
    body.appendChild(retry);
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('timerange', (e) => { if (e.detail && e.detail.scope === 'dashboard') loadGeo(); });
}
