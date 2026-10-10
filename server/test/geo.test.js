// GEO：AI 引擎带来的流量与询盘。要守住的是：没同步不显示成 0；询盘只数有表单证据的；归类看得见原始来源。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { summarizeGeo } from '../src/services/geo.js';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-geo-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite'); // 必须在动态 import 之前：connection.js 在 import 期就开库

const { buildApp } = await import('../src/index.js');
const { db } = await import('../src/db/connection.js');
const app = await buildApp();

test.after(async () => {
  await app.close();
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

const auth = { cookie: `ferr_token=${app.jwt.sign({ id: 1, username: 't', name: 't', role: 'seo' })}` };
const get = (url) => app.inject({ method: 'GET', url, headers: auth });

test('按引擎归类：同一引擎的多个来源值合并，原始来源值保留；非 AI 来源不计', () => {
  const s = summarizeGeo({
    current: {
      dataDays: 7, sessions: 1000,
      sources: [
        { source: 'chatgpt.com / referral', sessions: 30, users: 25, keyEvents: 2 },
        { source: 'chatgpt.com / (not set)', sessions: 10, users: 9, keyEvents: 0.5 },
        { source: 'perplexity.ai / referral', sessions: 8, users: 8, keyEvents: 0 },
        { source: 'google / organic', sessions: 600, users: 500, keyEvents: 20 },
        { source: 'evilchatgpt.com / referral', sessions: 99, users: 99, keyEvents: 0 },
      ],
    },
    previous: { dataDays: 7, sessions: 900, sources: [{ source: 'chatgpt.com / referral', sessions: 20, users: 18, keyEvents: 1 }, { source: 'claude.ai / referral', sessions: 5, users: 5, keyEvents: 0 }] },
  });
  assert.equal(s.status, 'OK');
  assert.deepEqual(s.engines.map((e) => [e.key, e.sessions, e.prevSessions]), [['chatgpt', 40, 20], ['perplexity', 8, 0], ['claude', 0, 5]],
    '上期有本期没了的引擎也要列出来');
  assert.deepEqual(s.engines[0].sources, ['chatgpt.com / referral', 'chatgpt.com / (not set)']);
  assert.equal(s.engines[0].keyEvents, 2.5);
  assert.equal(s.totals.sessions, 48);
  assert.equal(s.totals.share, 0.048);
  assert.equal(s.totals.prev_sessions, 25);
});

test('没同步的区间：所有数留空，不显示成 0；上期没同步时不给对比', () => {
  const none = summarizeGeo({ current: { dataDays: 0, sessions: 0, sources: [] } });
  assert.equal(none.status, 'NOT_SYNCED');
  assert.equal(none.totals.sessions, null);
  assert.equal(none.totals.share, null);
  assert.deepEqual(none.engines, []);
  const noPrev = summarizeGeo({
    current: { dataDays: 3, sessions: 100, sources: [{ source: 'chatgpt.com / referral', sessions: 4, users: 4, keyEvents: 0 }] },
    previous: { dataDays: 0, sessions: 0, sources: [] },
  });
  assert.equal(noPrev.totals.prev_sessions, null, '上期没数据 ≠ 上期是 0');
  assert.equal(noPrev.engines[0].prevSessions, null);
  // 同步了但确实没有 AI 流量：这才是真实的 0
  const zero = summarizeGeo({ current: { dataDays: 7, sessions: 500, sources: [{ source: 'google / organic', sessions: 500, users: 400, keyEvents: 3 }] } });
  assert.equal(zero.totals.sessions, 0);
  assert.equal(zero.totals.share, 0);
});

test('AI 引擎带来的询盘与线索：按表单带回的来路 / utm_source 认', () => {
  const s = summarizeGeo({
    current: { dataDays: 7, sessions: 100, sources: [] },
    inquiries: [
      { id: 1, grade: 'A', src_referrer: 'https://chatgpt.com/' },
      { id: 2, grade: 'C', src_referrer: null, src_utm: JSON.stringify({ source: 'perplexity.ai' }) },
      { id: 3, grade: 'A', src_referrer: 'https://www.google.com/' },
      { id: 4, grade: 'B', src_referrer: null, src_utm: '不是 JSON' },
    ],
    leads: [
      { id: 1, state: 'ignored', referrer: 'https://chatgpt.com/' },
      { id: 2, state: 'new', utm_source: 'chatgpt.com' },
      { id: 3, state: 'new', referrer: 'https://bing.com/' },
    ],
  });
  assert.deepEqual(s.inquiries, { total: 2, a: 1, b: 0, c: 1 });
  assert.deepEqual(s.leads, { total: 2, ignored: 1 });
});

test('路由：真实取数、带上期对比；区间必填', async () => {
  const ins = db.prepare("INSERT INTO ga4_dimension_daily (date, property_id, dimension_type, dimension_value, sessions, active_users, key_events) VALUES (?, 'p1', ?, ?, ?, ?, ?)");
  const day = db.prepare("INSERT INTO ga4_daily (date, property_id, sessions) VALUES (?, 'p1', ?)");
  for (let d = 1; d <= 14; d++) {
    const date = `2026-09-${String(d).padStart(2, '0')}`;
    day.run(date, 100);
    ins.run(date, 'source_medium', 'chatgpt.com / referral', d > 7 ? 6 : 2, 2, 0.5);
    ins.run(date, 'source_medium', 'google / organic', 60, 50, 3);
    ins.run(date, 'country', 'chatgpt.com', 999, 999, 9); // 别的维度里长得像的值不能被算进来
  }
  const res = await get('/api/geo/summary?start_date=2026-09-08&end_date=2026-09-14');
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.deepEqual(body.previous_range, { start_date: '2026-09-01', end_date: '2026-09-07' });
  assert.equal(body.status, 'OK');
  assert.equal(body.data_days, 7);
  assert.equal(body.totals.sessions, 42);
  assert.equal(body.totals.site_sessions, 700);
  assert.equal(body.totals.share, 0.06);
  assert.equal(body.totals.prev_sessions, 14);
  assert.equal(body.engines.length, 1);
  assert.ok(body.known_engines.includes('ChatGPT'));

  const empty = (await get('/api/geo/summary?start_date=2025-01-01&end_date=2025-01-07')).json();
  assert.equal(empty.status, 'NOT_SYNCED');
  assert.equal((await get('/api/geo/summary')).statusCode, 400);
  assert.equal((await get('/api/geo/summary?start_date=2026-09-08')).statusCode, 400);
});
