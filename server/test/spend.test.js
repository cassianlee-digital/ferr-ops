// 投入台账：外链 / 其它支出 / 「钱花在哪」汇总。
// 要守住的是三件事：脏值进不了台账；不同币种绝不相加；没有数据源不冒充成 0。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  backlinkStats, domainOf, summarizeSpend, validateBacklink, validateExpense,
} from '../src/services/spend.js';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-spend-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite'); // 必须在动态 import 之前：connection.js 在 import 期就开库

const { buildApp } = await import('../src/index.js');
const { db } = await import('../src/db/connection.js');
const app = await buildApp();
db.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, name, role) VALUES (1, 'spend-test', 'x', '测试', 'boss')").run();

test.after(async () => {
  await app.close();
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

const auth = (role) => ({ cookie: `ferr_token=${app.jwt.sign({ id: 1, username: 't', name: 't', role })}` });
const call = (method, url, role, payload) => app.inject({ method, url, headers: auth(role), payload });

/* ---------- 规则（纯函数） ---------- */

test('外链校验：来源页必填且须是完整网址，域名自动推出', () => {
  assert.equal(validateBacklink({}).ok, false);
  assert.equal(validateBacklink({ source_url: 'example.com/post' }).ok, false);
  assert.equal(validateBacklink({ source_url: 'javascript:alert(1)' }).ok, false);
  const v = validateBacklink({ source_url: ' https://www.Example.com/post ', anchor: '  gate valve  ', dr: '55' });
  assert.equal(v.ok, true);
  assert.equal(v.value.source_url, 'https://www.Example.com/post');
  assert.equal(v.value.source_domain, 'example.com', '去掉 www、转小写，才能按站汇总');
  assert.equal(v.value.anchor, 'gate valve');
  assert.equal(v.value.dr, 55);
  assert.equal(domainOf('not a url'), null);
});

test('外链校验：枚举值只收目录里的；DR 0~100；花了钱必须有币种和日期', () => {
  const base = { source_url: 'https://a.com/x' };
  assert.equal(validateBacklink({ ...base, method: '白嫖' }).ok, false);
  assert.equal(validateBacklink({ ...base, rel: 'follow' }).ok, false);
  assert.equal(validateBacklink({ ...base, status: '还行' }).ok, false);
  assert.equal(validateBacklink({ ...base, dr: 101 }).ok, false);
  assert.equal(validateBacklink({ ...base, cost: -5 }).ok, false);
  assert.equal(validateBacklink({ ...base, acquired_date: '2026/10/01' }).ok, false);
  assert.equal(validateBacklink({ ...base, acquired_date: '2026-13-40' }).ok, false, '格式对但不是真日期');
  assert.match(validateBacklink({ ...base, cost: 300 }).detail, /币种/);
  assert.match(validateBacklink({ ...base, cost: 300, currency: 'USD' }).detail, /日期/);
  assert.equal(validateBacklink({ ...base, cost: 300, currency: 'USD', acquired_date: '2026-10-01' }).ok, true);
  assert.equal(validateBacklink({ ...base, cost: 0 }).ok, true, '免费外链不需要币种');
  // PATCH：只改一个字段时，要按「合并后的样子」判
  const current = { cost: 300, currency: 'USD', acquired_date: '2026-10-01' };
  assert.equal(validateBacklink({ currency: '' }, { partial: true, current }).ok, false, '不能把付费外链的币种清掉');
  assert.equal(validateBacklink({ status: '失效' }, { partial: true, current }).ok, true);
  assert.deepEqual(validateBacklink({ status: '失效' }, { partial: true, current }).value, { status: '失效' }, '没传的字段不许被动到');
});

test('支出校验：日期/类别/金额/币种/用途缺一不可；外链费不在类别里（防同一笔钱数两遍）', () => {
  const ok = { spend_date: '2026-10-03', category: '工具订阅', amount: '99', currency: 'USD', purpose: 'Ahrefs 月费' };
  assert.equal(validateExpense(ok).ok, true);
  assert.equal(validateExpense(ok).value.amount, 99);
  for (const k of Object.keys(ok)) {
    const partial = { ...ok }; delete partial[k];
    assert.equal(validateExpense(partial).ok, false, `缺 ${k} 应被拒`);
    assert.equal(validateExpense({ ...ok, [k]: '' }).ok, false, `${k} 为空应被拒`);
  }
  assert.equal(validateExpense({ ...ok, category: '外链' }).ok, false);
  assert.equal(validateExpense({ ...ok, currency: 'BTC' }).ok, false);
  assert.equal(validateExpense({ ...ok, amount: 'abc' }).ok, false);
  assert.equal(validateExpense({ ...ok, evidence: 'javascript:alert(1)' }).ok, false);
  assert.equal(validateExpense({ ...ok, task_id: -1 }).ok, false);
  assert.deepEqual(validateExpense({ note: 'x' }, { partial: true }).value, { note: 'x' });
});

test('汇总：不同币种分开记，绝不相加；广告费没有数据源时不冒充成 0', () => {
  const s = summarizeSpend({
    ads: { value: null, source: null },
    backlinks: [
      { cost: 300, currency: 'USD', status: '有效', rel: 'dofollow', dr: 60, source_domain: 'a.com', checked_date: '2026-10-05' },
      { cost: 800, currency: 'CNY', status: '失效', rel: 'nofollow', dr: null, source_domain: 'b.com' },
      { cost: null, status: '有效', rel: 'dofollow', dr: 40, source_domain: 'a.com' },
    ],
    expenses: [
      { category: '工具订阅', amount: 99, currency: 'USD' },
      { category: '工具订阅', amount: 0.1, currency: 'USD' },
      { category: '内容外包', amount: 1200, currency: 'CNY' },
    ],
  });
  assert.deepEqual(s.totals, { USD: 399.1, CNY: 2000 });
  const ads = s.groups.find((g) => g.key === 'ads');
  assert.deepEqual(ads.amounts, {}, '没有数据源 = 没有金额，不是 0');
  assert.equal(ads.source, null);
  assert.deepEqual(s.groups.find((g) => g.key === 'backlinks').amounts, { USD: 300, CNY: 800 });
  assert.equal(s.groups.find((g) => g.key === 'backlinks').count, 2, '只数付费的');
  assert.deepEqual(s.groups.find((g) => g.key === 'expense:工具订阅').amounts, { USD: 99.1 }, '浮点和要归整到分');
});

test('汇总：Ads 同步的金额标「账户币种」，人工周报才是人民币', () => {
  const synced = summarizeSpend({ ads: { value: 1234.5, source: 'google_ads' } });
  assert.deepEqual(synced.groups[0].amounts, { ADS_ACCOUNT: 1234.5 });
  assert.deepEqual(synced.totals, { ADS_ACCOUNT: 1234.5 }, '不知道是哪种币，就不能并进人民币或美元');
  const manual = summarizeSpend({ ads: { value: 500, source: 'sem_weeks' } });
  assert.deepEqual(manual.totals, { CNY: 500 });
});

test('外链质量对比：付费与免费并排；没录 DR 的不进均值，并报出录了几条', () => {
  const st = backlinkStats([
    { cost: 300, currency: 'USD', status: '有效', rel: 'dofollow', dr: 60, source_domain: 'a.com', checked_date: '2026-10-05' },
    { cost: 500, currency: 'USD', status: '失效', rel: 'nofollow', dr: null, source_domain: 'b.com' },
    { cost: 0, status: '有效', rel: 'dofollow', dr: 40, source_domain: 'a.com' },
    { cost: null, status: '待上线', rel: 'dofollow', dr: 20, source_domain: 'c.com' },
  ]);
  assert.equal(st.total, 4);
  assert.equal(st.domains, 3);
  assert.deepEqual(st.paid, { count: 2, live: 1, dead: 1, pending: 0, dofollow: 1, avg_dr: 60, dr_known: 1, never_checked: 1, auto_lost: 0, cost: { USD: 800 } });
  assert.deepEqual(st.free, { count: 2, live: 1, dead: 0, pending: 1, dofollow: 2, avg_dr: 30, dr_known: 2, never_checked: 2, auto_lost: 0 });
  assert.equal(backlinkStats([]).paid.avg_dr, null, '一条都没有时均值是空，不是 0');
});

/* ---------- 路由 ---------- */

test('外链台账：建、按区间读、改、软删；失败回得出原因', async () => {
  const bad = await call('POST', '/api/backlinks', 'seo', { source_url: 'nope' });
  assert.equal(bad.statusCode, 400);
  assert.match(bad.json().detail, /完整网址/);

  const created = await call('POST', '/api/backlinks', 'seo', {
    source_url: 'https://blog.example.com/valve-guide', target_url: 'https://ferr.com/valves', anchor: 'gate valve',
    method: '购买', rel: 'dofollow', cost: 300, currency: 'USD', vendor: 'LinkShop', dr: 58, traffic: 12000,
    status: '有效', acquired_date: '2026-10-03', owner: '李',
  });
  assert.equal(created.statusCode, 201);
  const id = created.json().item.id;
  assert.equal(created.json().item.source_domain, 'blog.example.com');
  await call('POST', '/api/backlinks', 'seo', { source_url: 'https://forum.example.org/t/1', method: '自然获得', rel: 'nofollow', acquired_date: '2026-09-20' });

  const oct = (await call('GET', '/api/backlinks?start_date=2026-10-01&end_date=2026-10-31', 'boss')).json();
  assert.equal(oct.items.length, 1);
  assert.equal(oct.stats.paid.count, 1);
  assert.deepEqual(oct.stats.paid.cost, { USD: 300 });
  assert.equal((await call('GET', '/api/backlinks', 'boss')).json().items.length, 2, '不带区间 = 全部');
  assert.equal((await call('GET', '/api/backlinks?start_date=2026-10-01', 'boss')).statusCode, 400, '区间只给一半要报错，不能悄悄回全部');

  const patched = await call('PATCH', `/api/backlinks/${id}`, 'seo', { status: '失效', checked_date: '2026-10-09' });
  assert.equal(patched.json().item.status, '失效');
  assert.equal(patched.json().item.cost, 300, '没传的字段原样保留');
  assert.equal((await call('PATCH', `/api/backlinks/${id}`, 'seo', { currency: '' })).statusCode, 400);
  assert.equal((await call('PATCH', '/api/backlinks/999999', 'seo', { status: '失效' })).statusCode, 404);

  assert.equal((await call('DELETE', `/api/backlinks/${id}`, 'seo')).statusCode, 200);
  assert.equal((await call('DELETE', `/api/backlinks/${id}`, 'seo')).statusCode, 404, '删过的再删是 404');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM backlinks WHERE id=?').get(id).n, 1, '软删：行还在，台账要留痕');
});

test('支出台账 + 汇总：三处的钱合成一张「钱花在哪」，区间必填', async () => {
  const exp = await call('POST', '/api/expenses', 'sem', { spend_date: '2026-11-05', category: '工具订阅', amount: 99, currency: 'USD', vendor: 'Ahrefs', purpose: '外链分析工具月费', evidence: 'https://billing.example.com/inv/1' });
  assert.equal(exp.statusCode, 201);
  await call('POST', '/api/expenses', 'sem', { spend_date: '2026-11-08', category: '内容外包', amount: 1500, currency: 'CNY', purpose: '两篇产品文章代写' });
  await call('POST', '/api/backlinks', 'seo', { source_url: 'https://news.example.net/a', method: '购买', cost: 200, currency: 'USD', acquired_date: '2026-11-10' });
  // 人工周报里的广告费（本地没有 Ads 同步数据时的回退口径）
  await call('POST', '/api/sem-weeks', 'sem', { week_date: '2026-11-03', cost: 4000 });

  const res = await call('GET', '/api/spend/summary?start_date=2026-11-01&end_date=2026-11-30', 'boss');
  assert.equal(res.statusCode, 200);
  const body = res.json();
  const group = (k) => body.groups.find((g) => g.key === k);
  assert.deepEqual(group('backlinks').amounts, { USD: 200 });
  assert.deepEqual(group('expense:工具订阅').amounts, { USD: 99 });
  assert.deepEqual(group('expense:内容外包').amounts, { CNY: 1500 });
  assert.equal(body.totals.USD, 299);
  assert.deepEqual(group('ads').amounts, { CNY: 4000 }, '没有 Ads 同步数据时回退人工周报，按人民币记');
  assert.equal(group('ads').source, 'sem_weeks');
  assert.deepEqual(body.totals, { USD: 299, CNY: 5500 });
  const empty = (await call('GET', '/api/spend/summary?start_date=2025-01-01&end_date=2025-01-31', 'boss')).json();
  assert.deepEqual(empty.groups.find((g) => g.key === 'ads').amounts, {}, '既没同步也没周报：没有金额，不是 0');
  assert.deepEqual(empty.totals, {});

  assert.equal((await call('GET', '/api/spend/summary', 'boss')).statusCode, 400);
  const opts = (await call('GET', '/api/spend/options', 'seo')).json();
  assert.ok(opts.expense_categories.includes('工具订阅') && !opts.expense_categories.includes('外链'));
  assert.ok(opts.currencies.includes('CNY'));
});

test('花了钱的任务自动变「重要」：挂上付费外链或支出后，完成时必须交证据', async () => {
  const task = (await call('POST', '/api/loop-items', 'seo', { kind: 'task', dept: 'SEO', content: '买一条行业站外链' })).json().item;
  assert.equal(task.is_important, false);

  const ghost = await call('POST', '/api/expenses', 'seo', { spend_date: '2026-10-05', category: '其他', amount: 10, currency: 'CNY', purpose: 'x', task_id: 999999 });
  assert.equal(ghost.statusCode, 400);
  assert.equal(ghost.json().error, 'bad_task', '不能指向不存在的任务');
  const plan = (await call('POST', '/api/loop-items', 'seo', { kind: 'plan', content: '月度计划' })).json().item;
  assert.equal((await call('POST', '/api/backlinks', 'seo', { source_url: 'https://x.com/1', task_id: plan.id })).statusCode, 400, '计划不是任务');

  const link = await call('POST', '/api/backlinks', 'seo', { source_url: 'https://industry.example.com/p', method: '购买', cost: 150, currency: 'USD', acquired_date: '2026-10-06', task_id: task.id });
  assert.equal(link.json().item.task_content, '买一条行业站外链', '台账行带出任务名，不用再点进去查');

  const listed = (await call('GET', '/api/loop-items?kind=task', 'seo')).json().items.find((t) => t.id === task.id);
  assert.equal(listed.is_important, true);
  assert.deepEqual(listed.important_reasons, ['spend']);

  const denied = await call('PATCH', `/api/loop-items/${task.id}`, 'seo', { state: 'done', status: 'done', result: '外链已上线' });
  assert.equal(denied.statusCode, 400);
  assert.deepEqual(denied.json().missing, ['evidence']);
  const ok = await call('PATCH', `/api/loop-items/${task.id}`, 'seo', { state: 'done', status: 'done', result: '外链已上线', evidence: 'https://industry.example.com/p' });
  assert.equal(ok.statusCode, 200);
});
