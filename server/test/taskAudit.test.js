// 可审计任务的规则：重要性判定、完成门槛、证据与关联键的合法性。
// 这些规则决定「谁要交证据」和「什么算证据」—— 写错一条，要么该交的人溜过去，要么脏值入库后对不上数据。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_EVIDENCE, MAX_LINKS, TASK_KPIS, completionMissing, gateDetail, importance, isDone,
  normalizeEvidence, normalizeLinks, parseEvidence,
} from '../src/services/taskAudit.js';

test('重要任务：按客观规则判，并说得出是哪一条', () => {
  assert.deepEqual(importance({ dept: 'SEO' }), { important: false, reasons: [] });
  assert.deepEqual(importance({ important: 1 }).reasons, ['manual']);
  assert.deepEqual(importance({ fix_id: 7 }).reasons, ['fix']);
  assert.deepEqual(importance({ start_date: '2026-10-01', task_date: '2026-10-03' }).reasons, ['multi_day']);
  assert.deepEqual(importance({ dept: '公司' }).reasons, ['company']);
  assert.deepEqual(importance({ dept: 'SEO', urgent: 1 }).reasons, ['company']);
  assert.deepEqual(importance({ dept: 'SEO' }, { spend: true }).reasons, ['spend']);
});

test('重要任务：当天任务不算跨天；子任务不因「公司」连坐', () => {
  assert.equal(importance({ start_date: '2026-10-01', task_date: '2026-10-01' }).important, false);
  assert.equal(importance({ task_date: '2026-10-03' }).important, false, '只有截止日、没有开始日，不能推出跨天');
  // 子任务的 dept 也是「公司」（为了不漏进个人列），但证据由父任务承载
  assert.equal(importance({ dept: '公司', parent_id: 3 }).important, false);
  // 子任务自己跨天 / 被人工标记，照样算
  assert.equal(importance({ dept: '公司', parent_id: 3, important: 1 }).important, true);
});

test('完成门槛：所有任务都要写结果，太短的不算', () => {
  assert.deepEqual(completionMissing({}), ['result']);
  assert.deepEqual(completionMissing({ result: '   ' }), ['result']);
  assert.deepEqual(completionMissing({ result: '好' }), ['result'], '一个字说不清发生了什么');
  assert.deepEqual(completionMissing({ result: '已发布上线' }), []);
});

test('完成门槛：重要任务要证据，链接或截图任一即可；普通任务不要', () => {
  const item = { result: '落地页 H1 已改并上线' };
  assert.deepEqual(completionMissing(item, { important: false }), []);
  assert.deepEqual(completionMissing(item, { important: true }), ['evidence']);
  assert.deepEqual(completionMissing({ ...item, evidence: 'https://a.com/x' }, { important: true }), []);
  assert.deepEqual(completionMissing(item, { important: true, attachments: 1 }), []);
  assert.deepEqual(completionMissing({}, { important: true }), ['result', 'evidence']);
  assert.match(gateDetail(['result', 'evidence']), /完成结果.*证据/);
});

test('isDone 同时认 state 与旧的 status（老行只有 status=done）', () => {
  assert.equal(isDone({ state: 'done' }), true);
  assert.equal(isDone({ status: 'done' }), true);
  assert.equal(isDone({ state: 'todo', status: '待办' }), false);
  assert.equal(isDone(null), false);
});

test('证据只收 http(s) 链接：javascript:/data: 这类会变成可点链接的 scheme 一律拒', () => {
  assert.deepEqual(normalizeEvidence(''), { ok: true, value: null });
  assert.deepEqual(normalizeEvidence(null), { ok: true, value: null });
  assert.equal(normalizeEvidence(' https://a.com/1 \n\nhttp://b.com/2\n').value, 'https://a.com/1\nhttp://b.com/2');
  assert.equal(normalizeEvidence(['https://a.com/1', 'https://a.com/1']).value, 'https://a.com/1', '重复的只留一条');
  for (const evil of ['javascript:alert(1)', 'data:text/html,<script>1</script>', '见截图', 'ftp://a.com/x', '//a.com/x']) {
    assert.equal(normalizeEvidence(evil).ok, false, `${evil} 不该通过`);
  }
  assert.equal(normalizeEvidence({ a: 1 }).ok, false);
  assert.equal(normalizeEvidence(Array(MAX_EVIDENCE + 1).fill(0).map((_, i) => 'https://a.com/' + i)).ok, false);
  assert.deepEqual(parseEvidence('a\r\n\r\n b '), ['a', 'b']);
});

test('关联键：类型白名单、页面须完整网址、关键词归一成小写', () => {
  const ok = normalizeLinks([
    { type: 'page', ref: ' https://ferr.com/valves ' },
    { type: 'keyword', ref: '  Gate   Valve ' },
    { type: 'keyword', ref: 'gate valve' }, // 归一后重复，只留一条
  ]);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.links, [
    { type: 'page', ref: 'https://ferr.com/valves', label: null },
    { type: 'keyword', ref: 'gate valve', label: null },
  ]);
  assert.equal(normalizeLinks([{ type: 'page', ref: '/valves' }]).ok, false, '只有路径对不上 GSC 的页面数据');
  assert.equal(normalizeLinks([{ type: 'page', ref: 'javascript:alert(1)' }]).ok, false);
  assert.equal(normalizeLinks([{ type: 'bogus', ref: 'x' }]).ok, false);
  assert.equal(normalizeLinks([{ type: 'keyword', ref: '   ' }]).ok, false);
  assert.equal(normalizeLinks([{ type: 'keyword', ref: { a: 1 } }]).ok, false);
  assert.equal(normalizeLinks('nope').ok, false);
  assert.deepEqual(normalizeLinks(null), { ok: true, links: [] });
  assert.equal(normalizeLinks(Array(MAX_LINKS + 1).fill({ type: 'keyword', ref: 'x' })).ok, false);
});

test('关联键：广告系列只收已同步过的（手敲的名字对不上任何花费数据），KPI 只收目录里的', () => {
  const campaigns = new Map([['123', 'Valves-EU']]);
  const r = normalizeLinks([{ type: 'campaign', ref: 123 }, { type: 'kpi', ref: 'a_count' }], { campaigns });
  assert.deepEqual(r.links, [
    { type: 'campaign', ref: '123', label: 'Valves-EU' },
    { type: 'kpi', ref: 'a_count', label: 'A 级询价数量' },
  ]);
  assert.equal(normalizeLinks([{ type: 'campaign', ref: '999' }], { campaigns }).ok, false);
  assert.equal(normalizeLinks([{ type: 'kpi', ref: 'made_up' }]).ok, false);
  // 目录自身：key 不重复、考核与过程两组都在
  assert.equal(new Set(TASK_KPIS.map((k) => k.key)).size, TASK_KPIS.length);
  assert.deepEqual([...new Set(TASK_KPIS.map((k) => k.group))].sort(), ['process', 'review']);
});

// 前端接线：勾完成只有「完成弹框」这一条路。
// 以前 chk() 点一下就直接 PATCH state=done；哪天有人顺手加回一条直通路径，后端虽然会拦，
// 但界面会先把卡标成完成再回滚，执行人看到的是「点了没反应」。这里把入口钉死。
test('前端：只有完成弹框能把任务置为完成，app.js / closed-loop.js 不留直通路径', async () => {
  const { readFileSync } = await import('node:fs');
  const src = (f) => readFileSync(new URL(`../../public/src/${f}`, import.meta.url), 'utf8');
  const setsDone = /state\s*[:=]\s*['"]done['"]/;
  assert.doesNotMatch(src('app.js'), setsDone);
  assert.doesNotMatch(src('closed-loop.js').replace(/item\.state===?'done'|it\.state===?'done'/g, ''), setsDone);
  const audit = src('task-audit.js');
  assert.match(audit, /body\.state = 'done'/);
  assert.match(src('app.js'), /openTaskDone\(c\._item/);
  // 证据链接渲染前必须再判一次 scheme（库里万一混进别的，也只当文本显示）
  assert.match(audit, /isHttp\(u\)\s*\n?\s*\? `<a class="taudit-ev"/);
});
