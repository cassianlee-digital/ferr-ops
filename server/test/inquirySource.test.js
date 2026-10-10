// 询盘来源：表单线索接收、线索转询盘、手填来源的对账。
// 要守住的是「证据」和「主张」不混：表单带回的来源人改不了；手填的来源永远升不成表单证据；
// 对账只在有同步数据的前提下才说「找不到」。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aiEngineOf, hostOf, isSearchEngine } from '../src/services/aiEngines.js';
import {
  classifyLeadChannel, leadSource, manualSource, normalizeLead, sourceTerm, sourceVerdict,
} from '../src/services/inquirySource.js';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-inqsrc-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite'); // 必须在动态 import 之前：connection.js 在 import 期就开库
const SECRET = 'test-intake-secret-0123456789abcdef';
process.env.INQUIRY_INTAKE_SECRET = SECRET;

const { buildApp } = await import('../src/index.js');
const { db } = await import('../src/db/connection.js');
const { config } = await import('../src/config.js');
const app = await buildApp();
db.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, name, role) VALUES (1, 'src-test', 'x', '测试', 'boss')").run();

test.after(async () => {
  await app.close();
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

const auth = (role) => ({ cookie: `ferr_token=${app.jwt.sign({ id: 1, username: 't', name: 't', role })}` });
const call = (method, url, payload, role = 'seo') => app.inject({ method, url, headers: auth(role), payload });
const intake = (payload, token = SECRET) => app.inject({
  method: 'POST', url: '/api/inquiry-intake', payload, headers: token == null ? {} : { 'x-intake-token': token },
});

/* ---------- 规则（纯函数） ---------- */

test('AI 引擎识别：认域名，卡在域名边界上；GA4 的「source / medium」写法也认', () => {
  assert.equal(aiEngineOf('https://chatgpt.com/').key, 'chatgpt');
  assert.equal(aiEngineOf('chat.openai.com').key, 'chatgpt');
  assert.equal(aiEngineOf('chatgpt.com / referral').key, 'chatgpt');
  assert.equal(aiEngineOf('WWW.Perplexity.ai / (not set)').key, 'perplexity');
  assert.equal(aiEngineOf('https://gemini.google.com/app').key, 'gemini');
  assert.equal(aiEngineOf('evilchatgpt.com'), null, '后缀匹配不能跨过域名边界');
  assert.equal(aiEngineOf('google / organic'), null);
  assert.equal(aiEngineOf(''), null);
  assert.equal(hostOf('https://www.Example.com:8080/a?b#c'), 'example.com');
  assert.equal(isSearchEngine('https://www.google.co.uk/'), true);
  assert.equal(isSearchEngine('bing.com'), true);
  assert.equal(isSearchEngine('https://gemini.google.com/'), false, 'Gemini 在 google.com 下面，但它是 AI 引擎不是搜索');
  assert.equal(isSearchEngine('linkedin.com'), false);
});

test('线索渠道建议：广告点击标识 > 搜索来路 > 无来路；AI 引擎暂归「其他」', () => {
  assert.equal(classifyLeadChannel({ gclid: 'abc', referrer: 'https://www.google.com/' }), 'SEM付费', '有 gclid 就是广告，哪怕来路是谷歌');
  assert.equal(classifyLeadChannel({ campaign_id: '777' }), 'SEM付费');
  assert.equal(classifyLeadChannel({ utm_medium: 'CPC' }), 'SEM付费');
  assert.equal(classifyLeadChannel({ referrer: 'https://www.google.de/' }), 'SEO自然');
  assert.equal(classifyLeadChannel({ referrer: 'https://chatgpt.com/' }), '其他');
  assert.equal(classifyLeadChannel({ utm_source: 'chatgpt.com' }), '其他');
  assert.equal(classifyLeadChannel({}), '直接');
  assert.equal(classifyLeadChannel({ referrer: 'https://www.linkedin.com/feed' }), '其他');
});

test('线索归一：邮箱或留言至少一个；坏网址只丢那个字段，不丢整条线索', () => {
  assert.equal(normalizeLead(null).ok, false);
  assert.equal(normalizeLead([]).ok, false);
  assert.equal(normalizeLead({ name: '只有名字' }).ok, false);
  // 字段只收字符串 / 数字：对象、数组、布尔不能变成 "[object Object]" 之类的字样入库，更不能顶替必填项
  assert.equal(normalizeLead({ email: {} }).ok, false);
  assert.equal(normalizeLead({ message: ['a', 'b'] }).ok, false);
  const odd = normalizeLead({ email: 'a@b.com', name: { x: 1 }, company: true, campaign_id: 12345, country: ['US'] }).value;
  assert.deepEqual([odd.contact_name, odd.contact_company, odd.campaign_id, odd.country], [null, null, '12345', null]);
  const v = normalizeLead({
    email: ' buyer@example.com ', message: 'Need 500 gate valves', referrer: 'javascript:alert(1)',
    landing_page: 'https://ferr.com/valves?gclid=abc', gclid: 'abc', keyword: 'gate valve', evil: '<script>',
  });
  assert.equal(v.ok, true);
  assert.equal(v.value.contact_email, 'buyer@example.com');
  assert.equal(v.value.referrer, null, '危险 scheme 的来路被丢掉');
  assert.equal(v.value.landing_page, 'https://ferr.com/valves?gclid=abc');
  assert.equal(v.value.suggested_channel, 'SEM付费');
  assert.equal('evil' in v.value, false, '目录外的字段不入库');
  assert.equal(normalizeLead({ message: 'x'.repeat(9000) }).value.message.length, 4000);
});

test('来源词：占位写法一律算没填', () => {
  assert.equal(sourceTerm('  Gate   Valve '), 'gate valve');
  for (const p of ['', '待补', '未知', '—', '  ']) assert.equal(sourceTerm(p), '');
});

test('对账结论：有据 / 两边都有 / 对不上 / 存疑 / 可能填错', () => {
  const ev = (adsHit, gscHit, covered = true) => ({ ads: { covered, hit: adsHit }, gsc: { covered, hit: gscHit } });
  const sem = { channel: 'SEM付费', source: 'gate valve' };
  const seo = { channel: 'SEO自然', source: 'gate valve' };
  assert.equal(sourceVerdict(sem, ev(true, false)), 'SUPPORTED');
  assert.equal(sourceVerdict(sem, ev(true, true)), 'AMBIGUOUS');
  assert.equal(sourceVerdict(sem, ev(false, true)), 'CONFLICT', '说是广告来的，广告里没这个词的点击，自然搜索里却有');
  assert.equal(sourceVerdict(sem, ev(false, false)), 'UNSUPPORTED');
  assert.equal(sourceVerdict(seo, ev(false, true)), 'SUPPORTED');
  assert.equal(sourceVerdict(seo, ev(true, false)), 'CONFLICT');
  assert.equal(sourceVerdict({ channel: '直接', source: 'gate valve' }, ev(true, false)), 'HINT');
  assert.equal(sourceVerdict({ channel: '其他', source: 'gate valve' }, ev(false, false)), 'NOT_APPLICABLE');
});

test('对账结论：没同步数据时不说「找不到」；没填来源词单独标；表单来源不对账', () => {
  const none = { ads: { covered: false, hit: false }, gsc: { covered: false, hit: false } };
  assert.equal(sourceVerdict({ channel: 'SEM付费', source: 'gate valve' }, none), 'NO_DATA');
  // 自己那边没数据、另一边有数据且没命中：仍然是无法对账，不能拿自然搜索的数据否定一条广告询盘
  assert.equal(sourceVerdict({ channel: 'SEM付费', source: 'x' }, { ads: { covered: false, hit: false }, gsc: { covered: true, hit: false } }), 'NO_DATA');
  assert.equal(sourceVerdict({ channel: 'SEM付费', source: '待补' }, none), 'NO_SOURCE');
  assert.equal(sourceVerdict({ channel: '直接', source: '' }, none), 'NOT_APPLICABLE');
  assert.equal(sourceVerdict({ channel: 'SEM付费', source: '乱填', src_evidence: 'form' }, none), 'FORM');
});

test('手填来源：系列只收已同步的；落地页须完整网址；没传的字段不动', () => {
  const names = new Map([['777', 'Valves-EU']]);
  assert.deepEqual(manualSource({ src_campaign_id: '777' }, names).value, { src_campaign_id: '777', src_campaign: 'Valves-EU' });
  assert.equal(manualSource({ src_campaign_id: '999' }, names).ok, false);
  assert.deepEqual(manualSource({ src_campaign_id: '' }, names).value, { src_campaign_id: null, src_campaign: null });
  assert.equal(manualSource({ src_landing_page: '/valves' }, names).ok, false);
  assert.equal(manualSource({ src_landing_page: 'javascript:alert(1)' }, names).ok, false);
  assert.deepEqual(manualSource({ note: 'x' }, names).value, {});
});

test('线索 → 询盘来源：系列名取同步到的；关键词有才覆盖人填的', () => {
  const names = new Map([['777', 'Valves-EU']]);
  const src = leadSource({ id: 5, campaign_id: '777', utm_campaign: 'utm-name', keyword: 'gate valve', landing_page: 'https://ferr.com/valves', gclid: 'g1', utm_source: 'google', utm_medium: 'cpc' }, names);
  assert.equal(src.src_campaign, 'Valves-EU');
  assert.equal(src.source, 'gate valve');
  assert.equal(src.src_evidence, 'form');
  assert.equal(src.lead_id, 5);
  assert.deepEqual(JSON.parse(src.src_utm), { source: 'google', medium: 'cpc', campaign: 'utm-name' });
  const bare = leadSource({ id: 6, page_url: 'https://ferr.com/contact' });
  assert.equal('source' in bare, false, '线索里没有关键词，就不动人填的来源词');
  assert.equal(bare.src_landing_page, 'https://ferr.com/contact');
  assert.equal(bare.src_utm, null);
});

/* ---------- 表单接收入口 ---------- */

test('接收入口：没令牌 / 错令牌 / 没配密钥 / 密钥太短，一律 401', async () => {
  assert.equal((await intake({ email: 'a@b.com' }, null)).statusCode, 401);
  assert.equal((await intake({ email: 'a@b.com' }, 'wrong')).statusCode, 401);
  assert.equal((await intake({ email: 'a@b.com' }, SECRET + 'x')).statusCode, 401);
  const saved = config.inquiryIntake.secret;
  try {
    config.inquiryIntake.secret = '';
    assert.equal((await intake({ email: 'a@b.com' }, '')).statusCode, 401, '没配密钥时空令牌不能蒙混过去');
    config.inquiryIntake.secret = 'short';
    assert.equal((await intake({ email: 'a@b.com' }, 'short')).statusCode, 401, '弱密钥视同没配');
    assert.equal((await call('GET', '/api/inquiry-leads')).json().configured, false);
  } finally {
    config.inquiryIntake.secret = saved;
  }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM inquiry_leads').get().n, 0, '上面没有一条该入库');
});

test('接收入口：入库为线索、重复提交不重复建、响应不回库内数据、线索不进询盘统计', async () => {
  const payload = {
    submission_id: 'form-1001', name: 'John', email: 'john@buyer.example', company: 'Buyer GmbH', country: 'Germany',
    message: 'Please quote 500 pcs DN50 gate valves', page_url: 'https://ferr.com/contact',
    landing_page: 'https://ferr.com/valves?campaignid=777', referrer: 'https://www.google.com/',
    gclid: 'Cj0abc', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'valves-eu',
    campaign_id: '777', adgroup_id: '42', keyword: 'Gate Valve Manufacturer', match_type: 'p',
  };
  const res = await intake(payload);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(Object.keys(res.json()).sort(), ['duplicate', 'id', 'ok']);
  const again = await intake(payload);
  assert.equal(again.statusCode, 200);
  assert.equal(again.json().duplicate, true);
  assert.equal(again.json().id, res.json().id);
  assert.equal((await intake({ name: '没有邮箱也没有留言' })).statusCode, 400);

  const box = (await call('GET', '/api/inquiry-leads')).json();
  assert.equal(box.configured, true);
  assert.equal(box.counts.new, 1);
  assert.equal(box.items[0].suggested_channel, 'SEM付费');
  assert.equal((await call('GET', '/api/inquiries')).json().stats.total, 0, '线索不是询盘，不进统计');
  assert.equal((await call('GET', '/api/inquiry-leads?state=bogus')).statusCode, 400);
});

test('线索转询盘：来源取线索里的（不信前端回传），标为表单证据；之后谁都改不了来源', async () => {
  db.prepare("INSERT INTO google_ads_campaign_daily (date, customer_id, campaign_id, campaign_name) VALUES ('2026-10-01','c1','777','Valves-EU')").run();
  const lead = (await call('GET', '/api/inquiry-leads')).json().items[0];
  const created = await call('POST', '/api/inquiries', {
    date: '2026-10-08', country: 'Germany', channel: 'SEM付费', source: '人随手填的词', product: '阀门', grade: 'A',
    lead_id: lead.id,
    src_campaign_id: 'forged', src_evidence: 'form', src_gclid: 'forged', // 前端夹带的来源一律无视
  });
  assert.equal(created.statusCode, 201);
  const inq = created.json().item;
  assert.equal(inq.src_evidence, 'form');
  assert.equal(inq.src_campaign_id, '777');
  assert.equal(inq.src_campaign, 'Valves-EU', '系列名取同步到的那个');
  assert.equal(inq.source, 'Gate Valve Manufacturer', '关键词以线索为准');
  assert.equal(inq.src_gclid, 'Cj0abc');
  assert.equal(inq.src_landing_page, 'https://ferr.com/valves?campaignid=777');
  assert.equal(inq.lead_id, lead.id);

  const box = (await call('GET', '/api/inquiry-leads?state=converted')).json();
  assert.equal(box.items[0].inquiry_id, inq.id);
  assert.equal((await call('POST', '/api/inquiries', { date: '2026-10-08', grade: 'B', lead_id: lead.id })).statusCode, 409, '同一条线索不能转两次');

  for (const body of [{ source: '改掉' }, { src_campaign_id: '' }, { src_landing_page: 'https://x.com/' }]) {
    const res = await call('PATCH', `/api/inquiries/${inq.id}`, body, 'boss');
    assert.equal(res.statusCode, 409, '机器证据连老板也不能手改');
    assert.equal(res.json().error, 'source_locked');
  }
  assert.equal((await call('PATCH', `/api/inquiries/${inq.id}`, { grade: 'B' })).statusCode, 200, '来源锁住不影响改等级');
});

test('手填来源：能填能改，标为「人填」；永远升不成表单证据', async () => {
  const created = await call('POST', '/api/inquiries', { date: '2026-10-09', channel: 'SEM付费', source: 'ball valve', grade: 'B', src_campaign_id: '777', src_evidence: 'form' });
  const inq = created.json().item;
  assert.equal(inq.src_evidence, 'manual', '请求体里写 src_evidence=form 没用');
  assert.equal(inq.src_campaign, 'Valves-EU');
  assert.equal((await call('POST', '/api/inquiries', { date: '2026-10-09', grade: 'B', src_campaign_id: 'no-such' })).statusCode, 400);

  const patched = await call('PATCH', `/api/inquiries/${inq.id}`, { src_landing_page: 'https://ferr.com/ball-valves', src_evidence: 'form', src_gclid: 'x' });
  assert.equal(patched.json().item.src_landing_page, 'https://ferr.com/ball-valves');
  assert.equal(patched.json().item.src_evidence, 'manual');
  assert.equal(patched.json().item.src_gclid, null, 'gclid 只能来自表单');
  assert.equal((await call('PATCH', `/api/inquiries/${inq.id}`, { src_landing_page: '/ball-valves' })).statusCode, 400);
  assert.equal((await call('PATCH', '/api/inquiries/999999', { source: 'x' })).statusCode, 404);

  const plain = (await call('POST', '/api/inquiries', { date: '2026-10-09', grade: 'C', source: '待补' })).json().item;
  assert.equal(plain.src_evidence, null, '什么来源都没填，就不标「人填」');
});

test('忽略线索要写原因；忽略错了能恢复；已转的不能再动', async () => {
  const id = (await intake({ email: 'spam@x.example', message: 'Buy SEO backlinks cheap', keyword: 'free valve catalog pdf', campaign_id: '777' })).json().id;
  assert.equal((await call('POST', `/api/inquiry-leads/${id}/ignore`, {})).statusCode, 400);
  const ignored = await call('POST', `/api/inquiry-leads/${id}/ignore`, { reason: '推销外链的垃圾信息' });
  assert.equal(ignored.json().item.state, 'ignored');
  assert.equal(ignored.json().item.keyword, 'free valve catalog pdf', '垃圾线索的来源照样留着，这正是要分析的东西');
  assert.equal((await call('POST', `/api/inquiry-leads/${id}/ignore`, { reason: '再来一次' })).statusCode, 409);
  assert.equal((await call('POST', `/api/inquiry-leads/${id}/reopen`)).json().item.state, 'new');
  const converted = (await call('GET', '/api/inquiry-leads?state=converted')).json().items[0];
  assert.equal((await call('POST', `/api/inquiry-leads/${converted.id}/reopen`)).statusCode, 409);
  assert.equal((await call('POST', '/api/inquiry-leads/999999/ignore', { reason: 'x' })).statusCode, 404);
});

/* ---------- 来源对账（真实取数） ---------- */

test('对账接口：按询盘日前 30 天的点击数据逐条给结论', async () => {
  const day = (d) => `2026-08-${String(d).padStart(2, '0')}`;
  for (let d = 1; d <= 20; d++) {
    db.prepare('INSERT INTO gsc_daily (date, site_url, clicks, impressions) VALUES (?,?,?,?)').run(day(d), 's', 10, 100);
    db.prepare("INSERT INTO google_ads_campaign_daily (date, customer_id, campaign_id, campaign_name, clicks) VALUES (?,'c1','888','X',5)").run(day(d));
  }
  db.prepare("INSERT INTO google_ads_search_term_daily (date, customer_id, campaign_id, ad_group_id, search_term, clicks) VALUES (?, 'c1','888','1','Ductile Iron Casting', 3)").run(day(10));
  db.prepare("INSERT INTO gsc_query_daily (date, site_url, query, page, clicks, impressions) VALUES (?, 's', 'forged flange', 'https://ferr.com/f', 2, 40)").run(day(12));
  db.prepare("INSERT INTO gsc_query_daily (date, site_url, query, page, clicks, impressions) VALUES (?, 's', 'no click term', 'https://ferr.com/n', 0, 90)").run(day(12));

  const mk = async (payload) => (await call('POST', '/api/inquiries', { date: day(15), grade: 'B', ...payload })).json().item.id;
  const ids = {
    supported: await mk({ channel: 'SEM付费', source: 'ductile iron casting' }),
    conflict: await mk({ channel: 'SEM付费', source: 'forged flange' }),
    unsupported: await mk({ channel: 'SEO自然', source: 'no click term' }),
    hint: await mk({ channel: '直接', source: 'Forged Flange' }),
    noSource: await mk({ channel: 'SEO自然', source: '待补' }),
    tooOld: await mk({ channel: 'SEM付费', source: 'ductile iron casting', date: '2026-09-25' }),
  };
  const res = await call('GET', '/api/inquiries/source-check?start_date=2026-08-01&end_date=2026-09-30');
  assert.equal(res.statusCode, 200);
  const body = res.json();
  const verdict = (id) => body.items.find((i) => i.id === id).verdict;
  assert.equal(body.lookback_days, 30);
  assert.equal(verdict(ids.supported), 'SUPPORTED', '搜索词大小写不同也能对上');
  assert.equal(body.items.find((i) => i.id === ids.supported).ads.last_date, day(10));
  assert.equal(verdict(ids.conflict), 'CONFLICT');
  assert.equal(verdict(ids.unsupported), 'UNSUPPORTED', '只有曝光没有点击，带不来询盘');
  assert.equal(verdict(ids.hint), 'HINT');
  assert.equal(verdict(ids.noSource), 'NO_SOURCE');
  assert.equal(verdict(ids.tooOld), 'NO_DATA', '点击在 46 天前，且询盘日前 30 天里 Ads 已经没有同步数据：不能说它填错');
  assert.equal(body.summary.SUPPORTED, 1);
  assert.ok(body.verdicts.CONFLICT.label);
  assert.equal((await call('GET', '/api/inquiries/source-check?start_date=2026-08-01')).statusCode, 400);
});
