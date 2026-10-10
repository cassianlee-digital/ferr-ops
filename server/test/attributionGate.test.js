// 询盘确认权与改动留痕。等级决定月度考核里 A / B 询价的数量，渠道决定「这条询盘算谁带来的」，
// 而录入人自己就能填、能改这两个字段。没有表单证据的询盘拿不到独立于录入人的机器证据，能立的只有流程规矩：
//   ① 录入 = 建议值，经理 / 老板确认后才是定稿；② 已确认的值李陈改不动；
//   ③ 一切改动留痕（谁 / 何时 / 从什么改成什么 / 为什么）；④ 未确认占比是明数字。
// 设计移植自旧分支 a298574；当时绑在旧版 KPI 上的「严格模式」没有移植 —— 现在的月度考核口径不动。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-attrgate-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite'); // 必须在动态 import 之前：connection.js 在 import 期就开库

const { buildApp } = await import('../src/index.js');
const { db } = await import('../src/db/connection.js');
const app = await buildApp();
// created_by / changed_by 外键指向 users(id)；测试令牌用 id=1，库里得真有这个人（不依赖 .env 里的种子口令）
db.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, name, role) VALUES (1, 'gate-test', 'x', '测试', 'boss')").run();

test.after(async () => {
  await app.close();
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

const auth = (role) => ({ cookie: `ferr_token=${app.jwt.sign({ id: 1, username: 't', name: 't', role })}` });
const post = (url, payload, role) => app.inject({ method: 'POST', url, headers: auth(role), payload });
const patch = (url, payload, role) => app.inject({ method: 'PATCH', url, headers: auth(role), payload });
const get = (url, role) => app.inject({ method: 'GET', url, headers: auth(role) });

async function newInquiry(role = 'seo', over = {}) {
  const r = await post('/api/inquiries', { date: '2026-08-10', channel: 'SEO自然', grade: 'B', source: 'w', ...over }, role);
  assert.equal(r.statusCode, 201, r.body);
  return r.json().item;
}

test('李/陈录入的是「建议值」（proposed），不是定稿', async () => {
  const item = await newInquiry('seo');
  assert.equal(item.attribution_status, 'proposed');
  assert.equal(item.attribution_confirmed_at, null);
});

test('manager/boss 录入即确认——他们本来就是确认权所在，不用自己再点一遍', async () => {
  const item = await newInquiry('manager');
  assert.equal(item.attribution_status, 'confirmed');
  assert.ok(item.attribution_confirmed_at);
});

test('渠道只认四个合法值：录入和修改都挡住脏值', async () => {
  const bad = await post('/api/inquiries', { date: '2026-08-10', channel: '随便写的渠道', grade: 'B' }, 'seo');
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.json().error, 'invalid_channel');
  const item = await newInquiry('seo');
  const badPatch = await patch(`/api/inquiries/${item.id}`, { channel: 'SEM付費' }, 'seo'); // 繁体，不在白名单
  assert.equal(badPatch.statusCode, 400);
});

test('建议阶段：李可以改自己的渠道，但每次改动都留痕', async () => {
  const item = await newInquiry('seo');
  const r = await patch(`/api/inquiries/${item.id}`, { channel: 'SEM付费' }, 'seo');
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().item.channel, 'SEM付费');
  const log = (await get(`/api/inquiries/${item.id}/changes`, 'seo')).json().items;
  assert.equal(log.length, 1);
  assert.equal(log[0].field, 'channel');
  assert.equal(log[0].old_value, 'SEO自然');
  assert.equal(log[0].new_value, 'SEM付费');
});

test('确认之后：李改不动了（等级决定考核里 A / B 询价的数量）', async () => {
  const item = await newInquiry('seo');
  assert.equal((await post(`/api/inquiries/${item.id}/confirm`, {}, 'manager')).statusCode, 200);
  const locked = await patch(`/api/inquiries/${item.id}`, { channel: 'SEM付费' }, 'seo');
  assert.equal(locked.statusCode, 403);
  assert.equal(locked.json().error, 'attribution_locked');
  // 但非归因字段照样能改——闸门只锁渠道和等级，不是把整条询盘冻住
  assert.equal((await patch(`/api/inquiries/${item.id}`, { note: '客户又来信了' }, 'seo')).statusCode, 200);
});

test('确认之后 manager 仍可改，但必须给理由，且理由进流水', async () => {
  const item = await newInquiry('seo');
  await post(`/api/inquiries/${item.id}/confirm`, {}, 'manager');
  const noReason = await patch(`/api/inquiries/${item.id}`, { grade: 'A' }, 'manager');
  assert.equal(noReason.statusCode, 400);
  assert.equal(noReason.json().error, 'reason_required');
  const ok = await patch(`/api/inquiries/${item.id}`, { grade: 'A', reason: '客户确认下单意向，等级上调' }, 'manager');
  assert.equal(ok.statusCode, 200);
  const log = (await get(`/api/inquiries/${item.id}/changes`, 'boss')).json().items;
  const gradeChange = log.find((x) => x.field === 'grade');
  assert.equal(gradeChange.new_value, 'A');
  assert.match(gradeChange.reason, /下单意向/);
});

test('确认时可以顺手纠正渠道，纠正本身也留痕', async () => {
  const item = await newInquiry('seo', { channel: 'SEO自然' });
  const r = await post(`/api/inquiries/${item.id}/confirm`, { channel: 'SEM付费', reason: '来源词在 Ads 投放词里' }, 'manager');
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().item.channel, 'SEM付费');
  assert.equal(r.json().item.attribution_status, 'confirmed');
  const log = (await get(`/api/inquiries/${item.id}/changes`, 'boss')).json().items;
  assert.ok(log.some((x) => x.field === 'channel' && x.new_value === 'SEM付费'));
  assert.ok(log.some((x) => x.field === 'attribution_status' && x.new_value === 'confirmed'));
});

test('确认权限只在 manager/boss：李和陈自己确认不了自己的归因', async () => {
  const item = await newInquiry('seo');
  assert.equal((await post(`/api/inquiries/${item.id}/confirm`, {}, 'seo')).statusCode, 403);
  assert.equal((await post(`/api/inquiries/${item.id}/confirm`, {}, 'sem')).statusCode, 403);
});

test('批量确认：manager 不至于一条条点（否则他会变成瓶颈，然后没人确认）', async () => {
  const a = await newInquiry('seo'), b = await newInquiry('sem');
  const r = await post('/api/inquiries/confirm', { ids: [a.id, b.id, 999999] }, 'manager');
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().confirmed, 2);
  assert.equal(r.json().requested, 3); // 不存在的 id 跳过，不让整批失败
});

test('撤销确认必须给理由，并退回建议态（确认错了要能退，不能只能改库）', async () => {
  const item = await newInquiry('seo');
  await post(`/api/inquiries/${item.id}/confirm`, {}, 'manager');
  assert.equal((await post(`/api/inquiries/${item.id}/unconfirm`, {}, 'manager')).statusCode, 400);
  const r = await post(`/api/inquiries/${item.id}/unconfirm`, { reason: '渠道判断有误，退回重看' }, 'boss');
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().item.attribution_status, 'proposed');
  assert.equal(r.json().item.attribution_confirmed_at, null);
});

test('相同值不产生流水（确认时顺手保存不该刷出一堆空记录）', async () => {
  const item = await newInquiry('seo', { channel: 'SEO自然' });
  await patch(`/api/inquiries/${item.id}`, { channel: 'SEO自然' }, 'seo');
  assert.equal((await get(`/api/inquiries/${item.id}/changes`, 'seo')).json().items.length, 0);
});

test('列表带「归因被改过几次」——谁在月底批量改渠道，一眼看得出来', async () => {
  const item = await newInquiry('seo');
  await patch(`/api/inquiries/${item.id}`, { channel: 'SEM付费' }, 'seo');
  await patch(`/api/inquiries/${item.id}`, { grade: 'A' }, 'seo');
  const rows = (await get('/api/inquiries?start_date=2026-08-01&end_date=2026-08-31', 'boss')).json().items;
  const row = rows.find((r) => r.id === item.id);
  assert.equal(row.attr_change_count, 2);
});

test('未确认占比：0 条询盘时返回 null，不显示「100% 已确认」的假象', async () => {
  const r = await get('/api/inquiries/attribution-coverage?start_date=2020-01-01&end_date=2020-01-31', 'boss');
  assert.equal(r.statusCode, 200);
  const c = r.json();
  assert.equal(c.total, 0);
  assert.equal(c.confirmedRate, null);
  assert.equal(c.unconfirmedRate, null);
});

test('未确认占比：确认几条后比例跟着动，且 legacy 老行单列不混进已确认', async () => {
  db.prepare("INSERT INTO inquiries (date,channel,grade) VALUES ('2026-09-01','SEO自然','B')").run(); // 直接插 = 模拟这套规矩上线前的老行
  await newInquiry('seo', { date: '2026-09-02' });
  const confirmed = await newInquiry('manager', { date: '2026-09-03' });
  const c = (await get('/api/inquiries/attribution-coverage?start_date=2026-09-01&end_date=2026-09-30', 'boss')).json();
  assert.equal(c.total, 3);
  assert.equal(c.legacy, 1);
  assert.equal(c.proposed, 1);
  assert.equal(c.confirmed, 1);
  assert.equal(c.confirmedRate, 33.3);
  assert.ok(confirmed.id);
});

test('脏等级也挡住；撤销一条本来就没确认的回 409；批量确认要给 ids', async () => {
  const item = await newInquiry('seo');
  assert.equal((await patch(`/api/inquiries/${item.id}`, { grade: 'S' }, 'seo')).statusCode, 400);
  assert.equal((await post(`/api/inquiries/${item.id}/unconfirm`, { reason: '没确认过' }, 'boss')).statusCode, 409);
  assert.equal((await post('/api/inquiries/confirm', {}, 'manager')).statusCode, 400);
  assert.equal((await post('/api/inquiries/confirm', { ids: [item.id] }, 'seo')).statusCode, 403, '批量确认同样只有经理 / 老板能做');
  assert.equal((await get('/api/inquiries/999999/changes', 'boss')).statusCode, 404);
});

test('失败时回得出给人看的原因（前端直接显示这句话）', async () => {
  const item = await newInquiry('seo');
  await post(`/api/inquiries/${item.id}/confirm`, {}, 'manager');
  assert.match((await patch(`/api/inquiries/${item.id}`, { grade: 'A' }, 'seo')).json().detail, /经理或老板/);
  assert.match((await patch(`/api/inquiries/${item.id}`, { grade: 'A' }, 'boss')).json().detail, /原因/);
});

test('从表单线索转来的询盘：来源是机器证据，但等级是人评的 —— 李转的仍是待确认', async () => {
  const lead = db.prepare(
    "INSERT INTO inquiry_leads (contact_email, message, keyword, suggested_channel, dedupe_key) VALUES ('a@b.example','need valves','gate valve','SEM付费','k-gate-1')"
  ).run();
  const r = await post('/api/inquiries', { date: '2026-08-11', channel: 'SEM付费', grade: 'A', lead_id: lead.lastInsertRowid }, 'seo');
  assert.equal(r.statusCode, 201);
  assert.equal(r.json().item.src_evidence, 'form');
  assert.equal(r.json().item.attribution_status, 'proposed');
});

test('周度审核包带出确认覆盖情况，每条询盘有确认状态', async () => {
  const pkg = (await get('/api/audit/weekly?start_date=2026-09-01&end_date=2026-09-30', 'boss')).json();
  assert.equal(pkg.inquiries.confirmation.total, 3);
  assert.equal(pkg.inquiries.confirmation.confirmed, 1);
  assert.equal(pkg.inquiries.confirmation.legacy, 1);
  const labels = pkg.inquiries.items.map((i) => i.confirmation_label).sort();
  assert.deepEqual(labels, ['历史未审', '已确认', '待确认'].sort());
});

test('彻底删除一条有改动流水的询盘：不被外键拦住，流水一并清掉', async () => {
  const item = await newInquiry('seo');
  await patch(`/api/inquiries/${item.id}`, { grade: 'A' }, 'seo');
  await post(`/api/inquiries/${item.id}/confirm`, {}, 'manager');
  const del = await app.inject({ method: 'DELETE', url: `/api/inquiries/${item.id}?hard=1`, headers: auth('boss') });
  assert.equal(del.statusCode, 200, del.body);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM inquiry_field_changes WHERE inquiry_id = ?').get(item.id).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM inquiries WHERE id = ?').get(item.id).n, 0);
});
