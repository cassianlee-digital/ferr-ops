// GEO 引用抽查：固定题库 + 每轮记录。要守住的是「前后可比」：问题文字不能改、引擎固定、没查的格子不算没提到。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHECK_ENGINES, roundExpected, summarizeRound, validateCheck, validateQuestion } from '../src/services/geoChecks.js';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-geochk-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite'); // 必须在动态 import 之前：connection.js 在 import 期就开库

const { buildApp } = await import('../src/index.js');
const { db } = await import('../src/db/connection.js');
const app = await buildApp();
db.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, name, role) VALUES (1, 'geo-test', 'x', '测试', 'boss')").run();

test.after(async () => {
  await app.close();
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

const auth = { cookie: `ferr_token=${app.jwt.sign({ id: 1, username: 't', name: 't', role: 'seo' })}` };
const call = (method, url, payload) => app.inject({ method, url, headers: auth, payload });
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]).toString('base64');

test('规则：问题要是一句完整的话；记录的引擎与日期要合法；没被引用就不留引用网址', () => {
  assert.equal(validateQuestion({ question: '阀门' }).ok, false);
  assert.equal(validateQuestion({ question: '  best   gate valve manufacturer in China ' }).value.question, 'best gate valve manufacturer in China');
  assert.equal(validateQuestion({}).ok, false);
  const base = { question_id: 1, engine: 'chatgpt', round_date: '2026-10-10' };
  assert.equal(validateCheck({ ...base, engine: 'bing' }).ok, false, '引擎固定，不在表里的不收');
  assert.equal(validateCheck({ ...base, round_date: '2026/10/10' }).ok, false);
  assert.equal(validateCheck({ ...base, question_id: 0 }).ok, false);
  assert.equal(validateCheck({ ...base, cited: true, cited_url: 'javascript:alert(1)' }).ok, false);
  const v = validateCheck({ ...base, mentioned: true, cited: false, cited_url: 'https://ferr.com/valves', note: '  第三段提到  ' });
  assert.deepEqual(v.value, { ...base, mentioned: 1, cited: 0, cited_url: null, note: '第三段提到' });
  assert.equal(validateCheck({ ...base, cited: 1, cited_url: 'https://ferr.com/valves' }).value.cited_url, 'https://ferr.com/valves');
  assert.ok(CHECK_ENGINES.every((e) => e.label && e.key));
});

test('汇总：分母是已查的格子，没查的单独报出来；没截图的也单独数', () => {
  const s = summarizeRound(3, [
    { engine: 'chatgpt', mentioned: 1, cited: 1, images: 1 },
    { engine: 'chatgpt', mentioned: 0, cited: 0, images: 0 },
    { engine: 'perplexity', mentioned: 1, cited: 0, images: 2 },
  ]);
  const gpt = s.engines.find((e) => e.key === 'chatgpt');
  assert.deepEqual(gpt, { key: 'chatgpt', label: 'ChatGPT', checked: 2, expected: 3, mentioned: 1, cited: 1, no_screenshot: 1 });
  assert.equal(s.engines.find((e) => e.key === 'gemini').checked, 0, '没查的引擎是 0 条已查，不是 0 次提到');
  assert.deepEqual(s.totals, { checked: 3, expected: 3 * CHECK_ENGINES.length, mentioned: 2, cited: 1, no_screenshot: 1 });
});

test('题库：能加、不能重复、只能启用停用，问题文字改不了', async () => {
  const q1 = await call('POST', '/api/geo/questions', { question: 'best gate valve manufacturer in China' });
  assert.equal(q1.statusCode, 201);
  assert.equal((await call('POST', '/api/geo/questions', { question: 'best gate valve manufacturer in China' })).statusCode, 409);
  assert.equal((await call('POST', '/api/geo/questions', { question: '太短' })).statusCode, 400);
  const id = q1.json().item.id;
  const renamed = await call('PATCH', `/api/geo/questions/${id}`, { question: '改成别的问题' });
  assert.equal(renamed.statusCode, 400, '改文字 = 换了一个问题，之前各轮就对不上了');
  assert.equal((await call('PATCH', `/api/geo/questions/${id}`, { active: false })).json().item.active, 0);
  assert.equal((await call('PATCH', `/api/geo/questions/${id}`, { active: true })).json().item.active, 1);
  assert.equal((await call('PATCH', '/api/geo/questions/999999', { active: false })).statusCode, 404);
  assert.equal((await call('GET', '/api/geo/questions')).json().items.length, 1);
});

test('一轮抽查：同格再存是更新；带出上一轮对比；截图挂得上、删记录时一并清掉', async () => {
  const q = (await call('GET', '/api/geo/questions')).json().items[0];
  const q2 = (await call('POST', '/api/geo/questions', { question: 'ductile iron casting supplier for valves' })).json().item;
  const put = (body) => call('PUT', '/api/geo/checks', body);

  // 上一轮（09-26）：一格，没提到
  await put({ question_id: q.id, engine: 'chatgpt', round_date: '2026-09-26', mentioned: false });
  // 这一轮（10-10）
  const first = await put({ question_id: q.id, engine: 'chatgpt', round_date: '2026-10-10', mentioned: true, cited: true, cited_url: 'https://ferr.com/valves' });
  assert.equal(first.statusCode, 200);
  const checkId = first.json().item.id;
  const again = await put({ question_id: q.id, engine: 'chatgpt', round_date: '2026-10-10', mentioned: true, cited: false, note: '看错了，没给链接' });
  assert.equal(again.json().item.id, checkId, '同一轮同一题同一引擎只有一条');
  assert.equal(again.json().item.cited, 0);
  assert.equal(again.json().item.cited_url, null);
  await put({ question_id: q2.id, engine: 'perplexity', round_date: '2026-10-10', mentioned: false });
  assert.equal((await put({ question_id: 999999, engine: 'chatgpt', round_date: '2026-10-10' })).statusCode, 404);
  assert.equal((await put({ question_id: q.id, engine: 'nope', round_date: '2026-10-10' })).statusCode, 400);

  const img = await call('POST', '/api/attachments', { owner_type: 'geo_check', owner_id: checkId, name: 'chatgpt.png', dataBase64: PNG });
  assert.equal(img.statusCode, 201);
  assert.equal((await call('POST', '/api/attachments', { owner_type: 'geo_check', owner_id: 999999, name: 'x.png', dataBase64: PNG })).statusCode, 404);

  const round = (await call('GET', '/api/geo/checks?round_date=2026-10-10')).json();
  assert.equal(round.items.length, 2);
  assert.equal(round.items.find((i) => i.id === checkId).evidence_images.length, 1);
  assert.deepEqual(round.rounds.map((r) => r.round_date), ['2026-10-10', '2026-09-26']);
  assert.equal(round.summary.totals.checked, 2);
  assert.equal(round.summary.totals.expected, 2 * CHECK_ENGINES.length);
  assert.equal(round.summary.totals.mentioned, 1);
  assert.equal(round.summary.totals.no_screenshot, 1);
  assert.equal(round.previous.round_date, '2026-09-26');
  assert.equal(round.previous.totals.mentioned, 0);
  assert.equal((await call('GET', '/api/geo/checks')).statusCode, 400);

  // 总览 GEO 卡：区间结束日之前最近的一轮；区间早于任何一轮时是 null 而不是 0
  const sum = (await call('GET', '/api/geo/summary?start_date=2026-10-01&end_date=2026-10-31')).json();
  assert.equal(sum.citations.round_date, '2026-10-10');
  assert.equal(sum.citations_previous.round_date, '2026-09-26');
  assert.equal((await call('GET', '/api/geo/summary?start_date=2026-08-01&end_date=2026-08-31')).json().citations, null);

  assert.equal((await call('DELETE', `/api/geo/checks/${checkId}`)).statusCode, 200);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM attachments WHERE owner_type='geo_check' AND owner_id=?").get(checkId).n, 0);
  assert.equal((await call('DELETE', `/api/geo/checks/${checkId}`)).statusCode, 404);
});

test('「应查几题」每轮定格：题库变了，旧轮次的分母不跟着变；没记下题数的旧轮次明说是估的', async () => {
  // 规矩本身
  assert.deepEqual(roundExpected({ snapshot: 5, hasLaterRound: false, activeNow: 7 }), { count: 7, note: null }, '最新一轮还在进行：题库现在有几道就查几道');
  assert.deepEqual(roundExpected({ snapshot: 5, hasLaterRound: true, activeNow: 7 }), { count: 5, note: null }, '之前的轮次用定格的题数');
  const guess = roundExpected({ snapshot: null, hasLaterRound: true, activeNow: 7 });
  assert.equal(guess.count, 7);
  assert.match(guess.note, /估算/, '没记下题数只能估，但要明说');

  // 走一遍接口：上面那条测试留下了两轮（09-26、10-10），当时题库里是 2 道题
  const expectedOf = async (round) => (await call('GET', '/api/geo/checks?round_date=' + round)).json().summary;
  const E = CHECK_ENGINES.length;
  assert.equal((await expectedOf('2026-09-26')).totals.expected, 2 * E);
  const q3 = (await call('POST', '/api/geo/questions', { question: 'which Chinese foundry exports valve castings to Europe' })).json().item;
  assert.equal((await expectedOf('2026-10-10')).totals.expected, 3 * E, '最新一轮：加了题就该多查');
  const old = await expectedOf('2026-09-26');
  assert.equal(old.totals.expected, 2 * E, '旧轮次：加题不该让它的完成情况凭空变差');
  assert.equal(old.expected_note, null);
  // 新轮次开始之后回头更正旧记录：不能把旧轮次的分母改成现在的题库
  const q = (await call('GET', '/api/geo/questions')).json().items[0];
  await call('PUT', '/api/geo/checks', { question_id: q.id, engine: 'chatgpt', round_date: '2026-09-26', mentioned: true, note: '更正' });
  assert.equal((await expectedOf('2026-09-26')).totals.expected, 2 * E);
  // 总览卡和周度审核用的是同一个算法
  const sum = (await call('GET', '/api/geo/summary?start_date=2026-10-01&end_date=2026-10-31')).json();
  assert.equal(sum.citations.totals.expected, 3 * E);
  assert.equal(sum.citations_previous.totals.expected, 2 * E);
  // 这条规矩之前查的轮次没有记下题数：按现在的估，并带一句说明
  db.prepare("DELETE FROM geo_rounds WHERE round_date = '2026-09-26'").run();
  const legacy = await expectedOf('2026-09-26');
  assert.equal(legacy.totals.expected, 3 * E);
  assert.match(legacy.expected_note, /估算/);
  // 一条记录都没有的日期不是「一轮」，不该冒出「估算」的说明
  assert.equal((await expectedOf('2026-08-01')).expected_note, null);
  await call('PATCH', '/api/geo/questions/' + q3.id, { active: false });
});
