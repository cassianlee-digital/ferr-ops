/* GA4 流量看板（ES 模块 · esbuild 打包为 IIFE）。
   运行时依赖的全局（调用时解析）：API、esc()、withRange()、Chart。
   loadGa4 由 main.js 挂到 window，供 tab 初始化和时间筛选调用。 */

import { esc } from './ui-kit.js';
let devicesChart = null;
let requestSequence = 0;

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value == null ? '—' : String(value);
}

function formatNumber(value, maximumFractionDigits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString('zh-CN', { maximumFractionDigits });
}

function formatDuration(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return minutes ? `${minutes}分${String(remainder).padStart(2, '0')}秒` : `${remainder}秒`;
}

function setHint({ visible, mode = 'warning', title = '', detail = '', retry = false }) {
  const hint = document.getElementById('ga4-hint');
  if (!hint) return;
  hint.classList.toggle('ga4-hint-visible', visible);
  hint.classList.toggle('ga4-hint-error', mode === 'error');
  setText('ga4-hint-title', title);
  setText('ga4-hint-detail', detail);
  const icon = document.getElementById('ga4-hint-icon');
  if (icon) icon.className = `ti ${mode === 'error' ? 'ti-alert-triangle' : 'ti-plug-connected-x'} csp-s-fd44150866`;
  const button = document.getElementById('ga4-retry');
  if (button) button.classList.toggle('is-hidden', !retry);
}

function setStatus(connected, failed = false) {
  const status = document.getElementById('ga4-status');
  if (!status) return;
  status.className = `badge ${failed ? 'b-red' : connected ? 'b-green' : 'b-gray'}`;
  status.textContent = failed ? '读取失败' : connected ? '已接入' : '未接入';
}

function clearMetrics() {
  ['ga4-users', 'ga4-sessions', 'ga4-views', 'ga4-key-events', 'ga4-bounce', 'ga4-dur'].forEach((id) => setText(id, '—'));
}

function fillTable(tableId, emptyId, rows, renderCells, emptyText) {
  const body = document.getElementById(tableId);
  const empty = document.getElementById(emptyId);
  if (!body) return;
  const items = Array.isArray(rows) ? rows : [];
  body.innerHTML = items.map((row) => `<tr>${renderCells(row).map((cell) => {
    const value = cell.html == null ? esc(cell.value ?? '') : cell.html;
    return `<td class="${cell.cls || ''}">${value}</td>`;
  }).join('')}</tr>`).join('');
  if (empty) {
    empty.textContent = emptyText || '暂无数据';
    empty.classList.toggle('is-hidden', items.length > 0);
  }
}

function clearTables(message = '暂无数据') {
  const pairs = [
    ['ga4-sources', 'ga4-sources-empty'], ['ga4-countries', 'ga4-countries-empty'],
    ['ga4-landing', 'ga4-landing-empty'], ['ga4-campaigns', 'ga4-campaigns-empty'],
    ['ga4-events', 'ga4-events-empty'],
  ];
  pairs.forEach(([tableId, emptyId]) => fillTable(tableId, emptyId, [], () => [], message));
  renderDevices([], message);
}

function renderDevices(rows, emptyText = '暂无数据') {
  const wrap = document.getElementById('ga4-devices-chart');
  const empty = document.getElementById('ga4-devices-empty');
  const canvas = document.getElementById('ga4Devices');
  const items = Array.isArray(rows) ? rows.filter((row) => Number(row.sessions || 0) > 0) : [];
  if (devicesChart) {
    devicesChart.destroy();
    devicesChart = null;
  }
  if (!items.length || !canvas || typeof Chart === 'undefined') {
    if (wrap) wrap.classList.add('is-hidden');
    if (empty) {
      empty.textContent = items.length ? '图表组件未加载' : emptyText;
      empty.classList.remove('is-hidden');
    }
    return;
  }
  if (wrap) wrap.classList.remove('is-hidden');
  if (empty) empty.classList.add('is-hidden');
  devicesChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: items.map((row) => row.device || '未知设备'),
      datasets: [{
        data: items.map((row) => Number(row.sessions || 0)),
        backgroundColor: ['#1677ff', '#00b42a', '#f59e0b', '#86909c', '#722ed1'],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '64%',
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } } },
    },
  });
}

function renderGa4(data) {
  const connected = Boolean(data.connected);
  const metrics = data.metrics;
  setStatus(connected);

  if (!connected) {
    setHint({
      visible: true,
      title: 'GA4 尚未接入',
      detail: '请前往「设置 · API 接入」配置 Google OAuth 与 Property ID，授权后执行一次同步。',
    });
  } else if (!metrics) {
    setHint({
      visible: true,
      title: 'GA4 已授权，但所选区间没有同步数据',
      detail: '请在「设置 · API 接入」执行 GA4 同步；后台不会用示例数据填充空白。',
      retry: true,
    });
  } else {
    setHint({ visible: false });
  }

  clearMetrics();
  if (metrics) {
    setText('ga4-users', formatNumber(metrics.activeUsers));
    setText('ga4-sessions', formatNumber(metrics.sessions));
    setText('ga4-views', formatNumber(metrics.pageViews));
    setText('ga4-key-events', formatNumber(metrics.keyEvents, 1));
    setText('ga4-bounce', metrics.bounceRate == null ? '—' : `${formatNumber(metrics.bounceRate, 1)}%`);
    setText('ga4-dur', formatDuration(metrics.avgDuration));
  }

  const baseEmpty = connected ? '所选区间暂无数据' : '接入并同步后显示';
  fillTable('ga4-sources', 'ga4-sources-empty', data.sources, (row) => [
    { value: row.source || '(not set)' },
    { value: formatNumber(row.sessions), cls: 'num' },
    { value: formatNumber(row.users), cls: 'num' },
  ], baseEmpty);
  fillTable('ga4-countries', 'ga4-countries-empty', data.countries, (row) => [
    { value: row.country || '(not set)' },
    { value: formatNumber(row.sessions), cls: 'num' },
    { value: formatNumber(row.users), cls: 'num' },
  ], baseEmpty);
  fillTable('ga4-landing', 'ga4-landing-empty', data.landingPages, (row) => [
    { value: row.page || '(not set)' },
    { value: formatNumber(row.sessions), cls: 'num' },
    { value: formatNumber(row.conversions, 1), cls: 'num' },
  ], baseEmpty);
  fillTable('ga4-campaigns', 'ga4-campaigns-empty', data.campaigns, (row) => [
    { value: row.campaign || '(not set)' },
    { value: formatNumber(row.sessions), cls: 'num' },
    { value: formatNumber(row.users), cls: 'num' },
    { value: formatNumber(row.conversions, 1), cls: 'num' },
  ], metrics ? '所选区间没有广告系列数据' : baseEmpty);

  const eventEmpty = !connected
    ? '接入并同步后显示'
    : !data.eventCoverage?.synced
      ? '关键事件尚未同步，请重新执行 GA4 同步'
      : '已同步事件，但没有匹配的转化或关键事件';
  fillTable('ga4-events', 'ga4-events-empty', data.conversionEvents, (row) => [
    { html: `<div class="ga4-event-label">${esc(row.label || '自定义事件')}</div><div class="ga4-event-code">${esc(row.eventName || '')}</div>` },
    { value: formatNumber(row.eventCount), cls: 'num' },
    { value: formatNumber(row.keyEvents, 1), cls: 'num' },
    { value: formatNumber(row.users), cls: 'num' },
  ], eventEmpty);
  renderDevices(data.devices, baseEmpty);
}

export async function loadGa4() {
  const requestId = ++requestSequence;
  const retry = document.getElementById('ga4-retry');
  if (retry) retry.disabled = true;
  try {
    const data = await API.get(withRange('/api/ga4/overview','data')); // GA4 已嵌进数据看板，跟数据看板同一个时间条
    if (requestId !== requestSequence) return;
    renderGa4(data || { connected: false });
  } catch (error) {
    if (requestId !== requestSequence) return;
    setStatus(false, true);
    clearMetrics();
    clearTables('读取失败');
    setHint({
      visible: true,
      mode: 'error',
      title: 'GA4 数据读取失败',
      detail: `原因：${error?.message || '接口请求失败'}。请检查登录状态、后端服务和 GA4 配置后重试。`,
      retry: true,
    });
  } finally {
    if (requestId === requestSequence && retry) retry.disabled = false;
  }
}

/* 2026-08-26：时间范围分页面独立。GA4 面板已被 mountGa4IntoData() 嵌进「数据看板」作为子页签，
   同一屏上不该有两个互不相干的时间条，故与数据看板共用 data 这一个 scope。 */
document.addEventListener('timerange', e => {
  if (e.detail && e.detail.scope === 'data') loadGa4();
});
