// 诊断规则「点击率偏低」：排在首页、曝光够多，但点击率不到本站同位次中位数一半的词。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CTR_RULE, findCtrAnomalies } from '../src/services/ctrAnomaly.js';

// 第 3 位上 6 个正常的词，点击率 8%~12%
const peers = [8, 9, 10, 10, 11, 12].map((pct, i) => ({ query: 'peer' + i, page: '/p' + i, impressions: 1000, clicks: pct * 10, position: 3 }));

test('点击率不到同位次中位数一半的才报；按少拿的点击从多到少排', () => {
  const rows = [
    ...peers,
    { query: 'low', page: '/low', impressions: 1000, clicks: 20, position: 3.2 },     // 2%
    { query: 'lower', page: '/lower', impressions: 4000, clicks: 40, position: 2.8 }, // 1%
    { query: 'bit-low', page: '/bit', impressions: 1000, clicks: 60, position: 3 },   // 6%：没到一半，不报
  ];
  const { items, baselines } = findCtrAnomalies(rows);
  // 9 个词的点击率排序：1 2 6 8 9 10 10 11 12 → 中位数 9%
  assert.equal(baselines.length, 1);
  assert.equal(baselines[0].position, 3);
  assert.equal(baselines[0].rows, 9);
  assert.ok(Math.abs(baselines[0].ctr - 0.09) < 1e-9);
  assert.deepEqual(items.map((i) => [i.query, i.missedClicks]), [['lower', 320], ['low', 70]]); // 4000×9%−40、1000×9%−20
  assert.equal(items[1].ctr, 0.02);
  assert.ok(Math.abs(items[0].expectedCtr - 0.09) < 1e-9);
});

test('基准用中位数：一个曝光巨大的品牌词不会把同位次的正常词都判成偏低', () => {
  const brand = { query: '品牌词', page: '/', impressions: 500000, clicks: 300000, position: 1 }; // 60%
  const normal = [28, 30, 30, 32, 34].map((pct, i) => ({ query: 'n' + i, page: '/n' + i, impressions: 1000, clicks: pct * 10, position: 1 }));
  assert.deepEqual(findCtrAnomalies([brand, ...normal]).items, [], '加权平均会被品牌词拉到 60% 上下，这五个词就全中了');
});

test('没有基准就不判：一档里可比的词不够、或中位数是 0，那一档一条都不报，也不出现在 baselines 里', () => {
  const few = [{ query: 'a', page: '/a', impressions: 1000, clicks: 0, position: 5 }, { query: 'b', page: '/b', impressions: 1000, clicks: 100, position: 5 }];
  assert.deepEqual(findCtrAnomalies(few), { items: [], baselines: [] });
  const allZero = Array.from({ length: 6 }, (_, i) => ({ query: 'z' + i, page: '/z', impressions: 500, clicks: 0, position: 7 }));
  assert.deepEqual(findCtrAnomalies(allZero), { items: [], baselines: [] }, '整档都是 0：没法说谁偏低');
  assert.deepEqual(findCtrAnomalies([]), { items: [], baselines: [] });
  assert.deepEqual(findCtrAnomalies(null), { items: [], baselines: [] });
});

test('只看首页、只看曝光够多的；少拿的点击太少的不报', () => {
  const rows = [
    ...peers,
    { query: '曝光太少', page: '/x', impressions: CTR_RULE.minImpressions - 1, clicks: 0, position: 3 },
    { query: '第二页', page: '/y', impressions: 5000, clicks: 0, position: 11 },
    { query: '排名是空', page: '/n', impressions: 5000, clicks: 0, position: null },
    { query: '只少拿两次', page: '/w', impressions: 50, clicks: 2, position: 3 }, // 4% < 5%，但按 10% 算只少拿 3 次
  ];
  // 7 个可比的词：4 8 9 10 10 11 12 → 中位数 10%；「只少拿两次」少拿 50×10%−2 = 3 次，刚好到门槛
  assert.deepEqual(findCtrAnomalies(rows).items.map((i) => i.query), ['只少拿两次']);
  assert.deepEqual(findCtrAnomalies(rows, { minMissedClicks: 4 }).items, [], '门槛调高一次就不报了');
  // 10.4 仍算首页第 10 档，10.5 起不算
  const tenth = Array.from({ length: 6 }, (_, i) => ({ query: 't' + i, page: '/t' + i, impressions: 1000, clicks: 20, position: 10 }));
  assert.equal(findCtrAnomalies([...tenth, { query: 'edge', page: '/e', impressions: 1000, clicks: 0, position: 10.4 }]).items[0].query, 'edge');
  assert.deepEqual(findCtrAnomalies([...tenth, { query: 'edge', page: '/e', impressions: 1000, clicks: 0, position: 10.5 }]).items, []);
});

/* ---------- 接到诊断接口上 ---------- */
const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-ctr-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite'); // 必须在动态 import 之前：connection.js 在 import 期就开库
const { buildApp } = await import('../src/index.js');
const { db } = await import('../src/db/connection.js');
const app = await buildApp();
test.after(async () => { await app.close(); db.close(); rmSync(tmpDir, { recursive: true, force: true }); });

test('诊断接口：把同步表里的词按规则跑一遍，带出基准；没有数据时是空的而不是报错', async () => {
  const auth = { cookie: `ferr_token=${app.jwt.sign({ id: 1, username: 't', name: 't', role: 'seo' })}` };
  const get = () => app.inject({ method: 'GET', url: '/api/diagnostics?start_date=2026-09-01&end_date=2026-09-30', headers: auth });
  const empty = (await get()).json();
  assert.deepEqual(empty.seo.ctr, { items: [], baselines: [] });
  assert.equal(empty.counts.ctr, 0);

  const cols = db.prepare('PRAGMA table_info(gsc_query_daily)').all().map((c) => c.name);
  const put = db.prepare(`INSERT INTO gsc_query_daily (${cols.filter((c) => ['date', 'site_url', 'query', 'page', 'clicks', 'impressions', 'ctr', 'position'].includes(c)).join(', ')})
    VALUES (${cols.filter((c) => ['date', 'site_url', 'query', 'page', 'clicks', 'impressions', 'ctr', 'position'].includes(c)).map((c) => '@' + c).join(', ')})`);
  const day = (query, clicks, impressions, position, date = '2026-09-10') => put.run({ date, site_url: 'sc-domain:ferr.com', query, page: 'https://ferr.com/' + query, clicks, impressions, ctr: clicks / impressions, position });
  [8, 9, 10, 10, 11, 12].forEach((pct, i) => day('peer' + i, pct * 10, 1000, 3));
  // 同一个词分两天：要先按词汇总再判（单看哪一天曝光都不够）
  day('gate-valve', 1, 600, 3, '2026-09-10'); day('gate-valve', 1, 600, 3.4, '2026-09-11');
  const got = (await get()).json();
  assert.deepEqual(got.seo.ctr.items.map((i) => [i.query, i.impressions, i.clicks]), [['gate-valve', 1200, 2]]);
  assert.equal(got.seo.ctr.items[0].page, 'https://ferr.com/gate-valve');
  assert.equal(got.seo.ctr.baselines[0].position, 3);
  assert.equal(got.counts.ctr, 1);
  // 区间外的数据不算
  const other = (await app.inject({ method: 'GET', url: '/api/diagnostics?start_date=2026-08-01&end_date=2026-08-31', headers: auth })).json();
  assert.deepEqual(other.seo.ctr.items, []);
});
