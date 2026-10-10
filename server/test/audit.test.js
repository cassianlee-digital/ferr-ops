// 周度审核：任务状态与疑点的规则、审核包、导出（CSV / XLSX / JSON）、AI 审核意见的解析。
// 审核页、导出、AI 吃的是同一个包 —— 这里测的是「包里的每个数都说得清来历」，以及导出不会把人填的文字变成公式。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import readExcelFile from 'read-excel-file/node';
import { auditAiPayload, auditAiPrompt, auditScopeKey, parseAuditAi } from '../src/services/auditAi.js';
import { personOf, summarizeTasks, taskFlags, taskState } from '../src/services/auditRules.js';
import { toCsv, toXlsx } from '../src/services/exporters.js';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-audit-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite'); // 必须在动态 import 之前：connection.js 在 import 期就开库

const { buildApp } = await import('../src/index.js');
const { db } = await import('../src/db/connection.js');
const app = await buildApp();
db.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, name, role) VALUES (1, 'audit-test', 'x', '测试', 'boss')").run();

test.after(async () => {
  await app.close();
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

const auth = { cookie: `ferr_token=${app.jwt.sign({ id: 1, username: 't', name: 't', role: 'boss' })}` };
const call = (method, url, payload) => app.inject({ method, url, headers: auth, payload });
const WEEK = { start_date: '2026-09-14', end_date: '2026-09-20' };
const Q = `start_date=${WEEK.start_date}&end_date=${WEEK.end_date}`;

/* ---------- 规则（纯函数） ---------- */

test('任务归谁：写了负责人算负责人，没写按部门，公司任务不归个人', () => {
  assert.equal(personOf({ owner: '陈', dept: 'SEO' }), '陈');
  assert.equal(personOf({ dept: 'SEO' }), '李');
  assert.equal(personOf({ dept: 'SEM', owner: '' }), '陈');
  assert.equal(personOf({ dept: '公司' }), null);
});

test('任务在区间里的状态：完成日按北京时间；逾期包含上周拖下来的；没完成时刻的老任务不硬塞', () => {
  const st = (item, today) => taskState(item, WEEK, today);
  assert.equal(st({ state: 'done', done_at: '2026-09-15 03:00:00' }), 'completed');
  assert.equal(st({ state: 'done', done_at: '2026-09-13 17:00:00' }), 'completed', 'UTC 13 号 17 点 = 北京 14 号凌晨 1 点，算这一周');
  assert.equal(st({ state: 'done', done_at: '2026-09-20 16:30:00' }), null, '北京时间已经是 21 号');
  assert.equal(st({ state: 'archived', status: 'done', done_at: '2026-09-16 02:00:00' }), 'completed', '做完后被自动归档的仍是完成');
  assert.equal(st({ state: 'archived', archived_at: '2026-09-17 02:00:00' }), 'abandoned');
  assert.equal(st({ state: 'archived', archived_at: '2026-08-01 02:00:00' }), null);
  assert.equal(st({ state: 'done' }), null, '只有 done 没有完成时刻：不知道是哪天做完的');
  // 被删除的任务：区间内删的要列出来（否则逾期任务删掉就等于没发生过）；区间外删的与这一周无关
  assert.equal(st({ state: 'deleted', done_at: '2026-09-15 03:00:00' }), null, '没有删除时刻：不知道哪天删的');
  assert.equal(st({ state: 'deleted', done_at: '2026-09-15 03:00:00', deleted_at: '2026-09-30 03:00:00' }), null);
  const gone = { state: 'deleted', created_at: '2026-09-01 02:00:00', task_date: '2026-09-10', deleted_at: '2026-09-16 02:00:00' };
  assert.equal(st(gone), 'deleted');
  assert.deepEqual(taskFlags(gone, { state: 'deleted' }), ['DELETED_OVERDUE']);
  assert.deepEqual(taskFlags({ ...gone, task_date: '2026-09-20' }, { state: 'deleted' }), ['DELETED']);
  assert.deepEqual(taskFlags({ ...gone, done_at: '2026-09-09 02:00:00' }, { state: 'deleted' }), ['DELETED_DONE']);
  // 建出来当天就删、没完成过：录错了改正，不进审核；完成过的即使当天删也要列
  assert.equal(st({ ...gone, created_at: '2026-09-16 01:00:00' }), null);
  assert.equal(st({ ...gone, created_at: '2026-09-16 01:00:00', done_at: '2026-09-16 01:30:00' }), 'deleted');
  // 归日按北京时间：UTC 9-15 23:00 建、UTC 9-16 02:00 删，在北京是同一天
  assert.equal(st({ ...gone, created_at: '2026-09-15 23:00:00' }), null);
  assert.equal(st({ state: 'todo', task_date: '2026-09-01' }), 'overdue', '半个月前就该做完的，这周仍是逾期');
  assert.equal(st({ state: 'todo', start_date: '2026-09-10', task_date: '2026-09-18' }), 'overdue');
  assert.equal(st({ state: 'todo', start_date: '2026-09-10', task_date: '2026-09-18' }, '2026-09-16'), 'in_progress', '今天才 16 号，18 号截止的还不算逾期');
  assert.equal(st({ state: 'todo', start_date: '2026-09-18', task_date: '2026-09-25' }), 'in_progress');
  assert.equal(st({ state: 'todo', start_date: '2026-09-01' }), 'in_progress', '没有截止日 = 一直在做');
  assert.equal(st({ state: 'todo', start_date: '2026-09-25', task_date: '2026-09-30' }), null, '下周才开始');
  assert.equal(st({ state: 'todo' }), 'in_progress');
});

test('疑点：只陈述事实 —— 缺结果 / 缺证据 / 没关联 / 工时偏差 / 晚交 / 停滞', () => {
  const done = { state: 'done', done_at: '2026-09-18 03:00:00', task_date: '2026-09-16', result: '已上线', est_hours: 2, actual_hours: 5 };
  assert.deepEqual(taskFlags(done, { state: 'completed', important: true, images: 0, links: [] }), ['NO_EVIDENCE', 'NO_LINKS', 'OVERRUN', 'LATE']);
  const clean = { ...done, evidence: 'https://a.com/x', est_hours: 4, actual_hours: 4, task_date: '2026-09-18' };
  assert.deepEqual(taskFlags(clean, { state: 'completed', important: true, images: 0, links: [{ type: 'page', ref: 'https://a.com/x' }] }), []);
  assert.deepEqual(taskFlags({ ...clean, result: '', est_hours: null, actual_hours: null }, { state: 'completed', important: false, links: [{ type: 'kpi', ref: 'a_count' }] }),
    ['NO_RESULT', 'NO_LINKS', 'NO_ESTIMATE', 'NO_ACTUAL'], '只关联了 KPI 不算可量化的关联');
  assert.ok(taskFlags({ ...clean, est_hours: 10, actual_hours: 2 }, { state: 'completed', links: [{ type: 'keyword', ref: 'x' }] }).includes('UNDERRUN'));
  const link = [{ type: 'page', ref: 'https://a.com/x' }];
  assert.ok(taskFlags(clean, { state: 'completed', links: link, effect: { status: 'OK', items: [{ source: 'gsc', status: 'PARTIAL' }] } }).includes('EFFECT_PENDING'));
  assert.ok(taskFlags(clean, { state: 'completed', links: link, effect: { status: 'OK', items: [{ source: 'gsc', status: 'NO_DATA' }] } }).includes('EFFECT_NO_DATA'));
  assert.deepEqual(taskFlags(clean, { state: 'completed', links: link, effect: { status: 'OK', items: [{ source: 'gsc', status: 'OK' }] } }), []);
  const multi = { start_date: '2026-09-10', task_date: '2026-09-18', est_hours: 8 };
  assert.deepEqual(taskFlags(multi, { state: 'overdue', checkins: 0 }), ['OVERDUE', 'STALLED']);
  assert.deepEqual(taskFlags(multi, { state: 'in_progress', checkins: 2 }), []);
  assert.deepEqual(taskFlags({}, { state: 'abandoned' }), ['ABANDONED']);
});

test('汇总：工时合计只覆盖两项都填了的任务，并报出有几条', () => {
  const s = summarizeTasks([
    { audit_state: 'completed', result: '好了好了', est_hours: 2, actual_hours: 3, evidence: 'https://a.com', links: [{ type: 'page', ref: 'x' }], effect: [{ status: 'OK' }], flags: [] },
    { audit_state: 'completed', result: '', est_hours: 2, actual_hours: null, links: [], effect: [], flags: ['NO_RESULT'] },
    { audit_state: 'overdue', flags: ['OVERDUE'] },
    { audit_state: 'in_progress', flags: [] },
    // 被删除的任务单独计数：不算完成（哪怕删之前完成过），但严重疑点照样计入
    { audit_state: 'deleted', result: '删之前写过结果', est_hours: 9, actual_hours: 9, flags: ['DELETED_DONE'] },
    { audit_state: 'deleted', flags: ['DELETED'] },
  ]);
  assert.deepEqual(s, { completed: 2, in_progress: 1, overdue: 1, abandoned: 0, deleted: 2, with_result: 1, with_evidence: 1, with_links: 1, with_effect_data: 1, est_hours: 2, actual_hours: 3, hours_known: 1, flagged: 3 });
  assert.equal(summarizeTasks([]).est_hours, null, '一条都没填时合计是空，不是 0');
});

test('导出：CSV 防公式注入、带 BOM；XLSX 能被读回来，文字不会变成公式', async () => {
  const columns = [{ key: 'a', label: '任务' }, { key: 'n', label: '工时' }];
  const csv = toCsv([{ a: '=HYPERLINK("http://evil","x")', n: -3 }, { a: '含,逗号 和 "引号"\n换行', n: 1.5 }, { a: '@SUM(1)', n: null }], columns);
  assert.ok(csv.startsWith('﻿'), '没有 BOM，Excel 打开中文是乱码');
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[0], '任务,工时');
  assert.ok(lines[1].startsWith('"\'=HYPERLINK('), '以 = 开头的文字前面要加单引号');
  assert.ok(lines[1].endsWith(',-3'), '数字原样导出，负号不能被当成公式前缀处理');
  assert.ok(csv.includes('"含,逗号 和 ""引号""\n换行",1.5'));
  assert.ok(csv.includes("'@SUM(1),"));

  const buf = toXlsx([
    { name: '任务', columns, rows: [{ a: '=1+1', n: 4.5 }, { a: '带 <尖括号> & 符号\u0001', n: 0 }] },
    { name: '询盘/来源:[x]', columns: [{ key: 'x', label: 'X' }], rows: [] },
  ]);
  assert.equal(buf.subarray(0, 2).toString('latin1'), 'PK');
  const sheets = await readExcelFile(buf);
  assert.deepEqual(sheets.map((s) => s.sheet), ['任务', '询盘 来源 x']);
  assert.deepEqual(sheets[0].data, [['任务', '工时'], ['=1+1', 4.5], ['带 <尖括号> & 符号', 0]], '「=1+1」是字符串不是公式；控制字符被滤掉');
  assert.deepEqual(sheets[1].data, [['X']]);
});

test('AI 意见解析：纯 JSON、带代码块、前后有废话都能取出；不是约定结构就返回 null', () => {
  const obj = { overview: '整体平稳', people: [{ person: '李', did: [{ task_id: 1, what: '重写落地页' }] }] };
  const json = JSON.stringify(obj);
  assert.deepEqual(parseAuditAi(json), obj);
  assert.deepEqual(parseAuditAi('```json\n' + json + '\n```'), obj);
  assert.deepEqual(parseAuditAi('好的，以下是审核结果：\n' + json + '\n希望有帮助'), obj);
  assert.equal(parseAuditAi('这周大家都很努力。'), null);
  assert.equal(parseAuditAi('[1,2,3]'), null);
  assert.equal(parseAuditAi('{"foo":1}'), null, '是 JSON 但不是约定的结构');
  assert.equal(auditScopeKey(WEEK, '李'), 'weekly_audit:2026-09-14:2026-09-20:李');
});

/* ---------- 审核包（真实取数） ---------- */

const mk = async (payload) => (await call('POST', '/api/loop-items', { kind: 'task', status: '待办', ...payload })).json().item;
const finish = (id, at, extra = {}) => db.prepare(
  "UPDATE loop_items SET state='done', status='done', done_at=@at, result=@result, evidence=@evidence, actual_hours=@actual WHERE id=@id"
).run({ id, at, result: extra.result ?? '已完成并上线', evidence: extra.evidence ?? null, actual: extra.actual ?? null });

let ids = {};
test('审核包：任务按状态与人归位，带出结果、证据、前后数据、疑点', async () => {
  // GSC：页面在 09-15 前后的数据（后窗口只有 5 天 → 数据未满）
  const day = (d) => `2026-09-${String(d).padStart(2, '0')}`;
  for (let d = 1; d <= 20; d++) {
    db.prepare('INSERT INTO gsc_daily (date, site_url, clicks, impressions, position) VALUES (?,?,?,?,?)').run(day(d), 's', 100, 2000, 15);
    db.prepare('INSERT INTO gsc_query_daily (date, site_url, query, page, clicks, impressions, position) VALUES (?,?,?,?,?,?,?)').run(day(d), 's', 'gate valve', 'https://ferr.com/valves', d > 15 ? 6 : 2, 60, 12);
  }
  const a = await mk({ dept: 'SEO', content: '重写阀门落地页', project: '阀门', start_date: '2026-09-14', task_date: '2026-09-15', est_hours: 3, links: [{ type: 'page', ref: 'https://ferr.com/valves' }] });
  finish(a.id, '2026-09-15 03:00:00', { evidence: 'https://ferr.com/valves', actual: 3.5 });
  const b = await mk({ dept: 'SEM', content: '调整否词', start_date: '2026-09-16', task_date: '2026-09-16' });
  finish(b.id, '2026-09-16 05:00:00', { result: '' });
  const c = await mk({ dept: 'SEO', content: '跨天没人动的活', start_date: '2026-09-10', task_date: '2026-09-17' });
  const d = await mk({ dept: '公司', content: '公司派的任务', start_date: '2026-09-18', task_date: '2026-09-25' });
  const e = await mk({ dept: 'SEM', content: '下周才开始', start_date: '2026-09-25', task_date: '2026-09-30' });
  const f = await mk({ dept: 'SEO', content: '上个月做完的', start_date: '2026-08-01', task_date: '2026-08-01' });
  finish(f.id, '2026-08-01 03:00:00');
  ids = { a: a.id, b: b.id, c: c.id, d: d.id, e: e.id, f: f.id };

  await call('POST', '/api/inquiries', { date: '2026-09-16', country: 'Germany', channel: 'SEO自然', source: 'gate valve', product: '阀门', grade: 'A', customer_code: 'DE-001', salesperson: '王' });
  await call('POST', '/api/inquiries', { date: '2026-09-17', country: 'India', channel: 'SEM付费', source: '待补', product: '阀门', grade: 'C' });
  await call('POST', '/api/expenses', { spend_date: '2026-09-15', category: '工具订阅', amount: 99, currency: 'USD', purpose: 'Ahrefs 月费', task_id: a.id });
  await call('POST', '/api/fixes', { title: '补 H1', dept: 'SEO', owner: '李', due_date: '2026-09-18', status: '进行中' });

  const res = await call('GET', `/api/audit/weekly?${Q}`);
  assert.equal(res.statusCode, 200);
  const pkg = res.json();
  const task = (id) => pkg.tasks.find((t) => t.id === id);
  assert.deepEqual(pkg.tasks.map((t) => t.id).sort((x, y) => x - y), [a.id, b.id, c.id, d.id], '下周才开始的、上个月做完的都不进这一周');

  assert.equal(task(a.id).audit_state, 'completed');
  assert.equal(task(a.id).person, '李');
  assert.equal(task(a.id).done_date, '2026-09-15');
  assert.deepEqual(task(a.id).evidence, ['https://ferr.com/valves']);
  assert.equal(task(a.id).is_important, true, '挂了支出的任务是重要任务');
  assert.equal(task(a.id).effect[0].status, 'PARTIAL');
  assert.equal(task(a.id).effect[0].days, 5);
  assert.deepEqual(task(a.id).effect[0].metrics[0], { key: 'clicks', label: '点击', better: 'higher', before: 10, after: 30, delta: { abs: 20, pct: 2 } });
  assert.deepEqual(task(a.id).flags, ['EFFECT_PENDING']);

  assert.deepEqual(task(b.id).flags, ['NO_RESULT', 'NO_LINKS', 'NO_ESTIMATE', 'NO_ACTUAL']);
  assert.equal(task(c.id).audit_state, 'overdue');
  assert.deepEqual(task(c.id).flags, ['OVERDUE', 'STALLED', 'NO_ESTIMATE']);
  assert.equal(task(d.id).person, null);

  assert.equal(pkg.summary.all.completed, 2);
  assert.equal(pkg.summary.all.overdue, 1);
  const li = pkg.summary.people.find((p) => p.person === '李');
  assert.equal(li.completed, 1);
  assert.equal(li.with_evidence, 1);
  assert.equal(li.est_hours, 3);
  assert.equal(li.actual_hours, 3.5);

  // 部门口径的几块
  assert.equal(pkg.inquiries.total, 2);
  assert.deepEqual(pkg.inquiries.by_grade, { A: 1, B: 0, C: 1 });
  assert.equal(pkg.inquiries.junk_ratio, 0.5);
  assert.equal(pkg.inquiries.items.find((i) => i.source === 'gate valve').source_verdict, 'SUPPORTED');
  assert.deepEqual(pkg.spend.totals, { USD: 99 });
  assert.equal(pkg.fixes.length, 1);
  assert.equal(pkg.seo.status, 'OK');
  assert.equal(pkg.seo.days_with_data, 7);
  assert.equal(pkg.seo.current.clicks, 700);
  assert.equal(pkg.sem.status, 'NOT_SYNCED', '没有 Ads 数据就说没同步，不给一排 0');
  assert.equal(pkg.kpi.range.start_date, '2026-09-01', 'KPI 取本月至今，不是拿一周去比月目标');
  assert.ok(pkg.meta.notes.length >= 4);
});

test('审核包：区间内被删除的任务照样列出来 —— 逾期的任务删掉不能等于没发生过', async () => {
  const mk = async (content, over) => {
    const id = (await call('POST', '/api/loop-items', { kind: 'task', dept: 'SEO', owner: '李', content, ...over })).json().item.id;
    db.prepare("UPDATE loop_items SET created_at = '2026-09-01 02:00:00' WHERE id = ?").run(id);
    return id;
  };
  const overdue = await mk('逾期后被删掉的任务', { task_date: '2026-09-10' });
  const typo = await mk('录错了当天就删的任务', { task_date: '2026-09-18' });
  for (const id of [overdue, typo]) assert.equal((await call('DELETE', `/api/loop-items/${id}`)).statusCode, 200);
  db.prepare("UPDATE loop_items SET deleted_at = '2026-09-16 02:00:00' WHERE id IN (?, ?)").run(overdue, typo);
  db.prepare("UPDATE loop_items SET created_at = '2026-09-16 01:00:00' WHERE id = ?").run(typo);

  const pkg = (await call('GET', `/api/audit/weekly?${Q}`)).json();
  const row = pkg.tasks.find((t) => t.id === overdue);
  assert.ok(row, '被删除的任务必须出现在审核里');
  assert.equal(row.audit_state, 'deleted');
  assert.equal(row.deleted_date, '2026-09-16');
  assert.deepEqual(row.flags, ['DELETED_OVERDUE']);
  assert.equal(pkg.meta.flags.DELETED_OVERDUE.tone, 'bad');
  assert.equal(pkg.tasks.some((t) => t.id === typo), false, '建出来当天就删的是录错了改正，不进审核');
  assert.ok(pkg.summary.all.deleted >= 1);
  assert.ok(pkg.summary.people.find((x) => x.person === '李').deleted >= 1);
  // 别的周看不到它：只在被删的那一周列一次
  const other = (await call('GET', '/api/audit/weekly?start_date=2026-09-21&end_date=2026-09-27')).json();
  assert.equal(other.tasks.some((t) => t.id === overdue), false);
  // 导出里状态和删除日都要有
  const csv = (await call('GET', `/api/audit/weekly/export?${Q}&format=csv&section=tasks`)).body;
  const line = csv.split('\r\n').find((l) => l.includes('逾期后被删掉的任务'));
  assert.ok(line && line.includes('已删除') && line.includes('2026-09-16') && line.includes('逾期未完成时被删除'), line);
  // 收尾：这个文件后面的测试在数任务条数，别把这两条留在库里
  for (const id of [overdue, typo]) assert.equal((await call('DELETE', `/api/loop-items/${id}?hard=1`)).statusCode, 200);
});

test('审核包：按人筛选 —— 任务只留他的，SEM 的数据不给 SEO 的人，询盘仍是部门口径', async () => {
  const li = (await call('GET', `/api/audit/weekly?${Q}&person=${encodeURIComponent('李')}`)).json();
  assert.deepEqual(li.tasks.map((t) => t.id).sort((x, y) => x - y), [ids.a, ids.c]);
  assert.equal(li.sem, null);
  assert.ok(li.seo);
  assert.equal(li.inquiries.total, 2);
  assert.equal(li.kpi.scope, 'seo');
  assert.deepEqual(li.summary.people.map((p) => p.person), ['李']);
  const chen = (await call('GET', `/api/audit/weekly?${Q}&person=${encodeURIComponent('陈')}`)).json();
  assert.deepEqual(chen.tasks.map((t) => t.id), [ids.b]);
  assert.equal(chen.seo, null);
  assert.equal(chen.geo, null);
});

test('审核包：参数校验', async () => {
  assert.equal((await call('GET', '/api/audit/weekly')).statusCode, 400);
  assert.equal((await call('GET', '/api/audit/weekly?start_date=2026-01-01&end_date=2026-12-31')).statusCode, 400, '区间太长');
  assert.equal((await call('GET', `/api/audit/weekly?${Q}&person=someone`)).statusCode, 400);
});

test('导出：JSON 是整个包；XLSX 每张表一个工作表；CSV 一次一张，脱不开 section', async () => {
  const json = await call('GET', `/api/audit/weekly/export?${Q}&format=json`);
  assert.equal(json.statusCode, 200);
  assert.match(json.headers['content-disposition'], /attachment; filename="ferr-audit-2026-09-14_2026-09-20-all\.json"/);
  assert.equal(JSON.parse(json.body).tasks.length, 4);

  const xlsx = await app.inject({ method: 'GET', url: `/api/audit/weekly/export?${Q}&format=xlsx`, headers: auth });
  assert.equal(xlsx.statusCode, 200);
  assert.match(xlsx.headers['content-type'], /spreadsheetml/);
  assert.equal(xlsx.headers['x-content-type-options'], 'nosniff');
  const sheets = await readExcelFile(xlsx.rawPayload);
  const names = sheets.map((s) => s.sheet);
  for (const n of ['概要', '任务', '数据变化', '询盘', '花费汇总', '口径说明']) assert.ok(names.includes(n), `缺工作表 ${n}`);
  const taskSheet = sheets.find((s) => s.sheet === '任务').data;
  assert.equal(taskSheet.length, 5, '表头 + 4 条任务');
  const col = (label) => taskSheet[0].indexOf(label);
  const row = taskSheet.find((r) => r[col('任务')] === '重写阀门落地页');
  assert.equal(row[col('状态')], '已完成');
  assert.equal(row[col('实际工时')], 3.5);
  assert.equal(row[col('疑点')], '前后对比的数据还没满，先别下结论');
  const kpiSheet = sheets.find((s) => s.sheet === 'KPI本月至今').data;
  assert.ok(kpiSheet.slice(1).every((r) => !/^[A-Z_]+$/.test(String(r[kpiSheet[0].indexOf('状态')] || ''))), '状态要是给人看的话，不是内部状态码');
  const effects = sheets.find((s) => s.sheet === '数据变化').data;
  assert.equal(effects.length, 4, '表头 + 点击 / 曝光 / 排名三个指标各一行');

  const csv = await call('GET', `/api/audit/weekly/export?${Q}&format=csv&section=inquiries`);
  assert.equal(csv.statusCode, 200);
  assert.match(csv.headers['content-disposition'], /-all-inquiries\.csv"/);
  assert.ok(csv.body.includes('DE-001'), '给人看的导出里有客户编码');
  assert.equal((await call('GET', `/api/audit/weekly/export?${Q}&format=csv`)).statusCode, 400);
  assert.equal((await call('GET', `/api/audit/weekly/export?${Q}&format=pdf`)).statusCode, 400);
  const liName = (await call('GET', `/api/audit/weekly/export?${Q}&format=json&person=${encodeURIComponent('李')}`)).headers['content-disposition'];
  assert.match(liName, /-li\.json"/, '文件名只用 ASCII');
});

test('交给 AI 的数据不带客户编码和业务员；提示词要求带出处、只输出 JSON', async () => {
  const pkg = (await call('GET', `/api/audit/weekly?${Q}`)).json();
  const payload = JSON.stringify(auditAiPayload(pkg));
  assert.ok(!payload.includes('DE-001'), '客户编码不出库');
  assert.ok(!payload.includes('"salesperson"'));
  assert.ok(payload.includes('重写阀门落地页'));
  const prompt = auditAiPrompt(pkg);
  assert.match(prompt, /task_id/);
  assert.match(prompt, /verified_changes/);
});

test('AI 审核：没跑过是 null；AI 不可用时回得出原因，不是一个含糊的 500', async () => {
  assert.equal((await call('GET', `/api/audit/weekly/ai?${Q}`)).json().item, null);
  const saved = { p: process.env.AI_PROVIDER, a: process.env.ANTHROPIC_API_KEY, o: process.env.OPENROUTER_API_KEY };
  process.env.AI_PROVIDER = 'anthropic'; process.env.ANTHROPIC_API_KEY = ''; process.env.OPENROUTER_API_KEY = '';
  try {
    const res = await call('POST', '/api/audit/weekly/ai', { ...WEEK });
    assert.ok(res.statusCode >= 400 && res.statusCode !== 500, `应是明确的不可用状态，得到 ${res.statusCode}`);
    assert.ok(res.json().error || res.json().detail || res.json().message);
  } finally {
    for (const [k, v] of [['AI_PROVIDER', saved.p], ['ANTHROPIC_API_KEY', saved.a], ['OPENROUTER_API_KEY', saved.o]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
  assert.equal((await call('POST', '/api/audit/weekly/ai', {})).statusCode, 400);
});
