// 询盘和表单线索认得出是哪个站点来的。要守住的是：表单来的站点是机器按网址认的、人改不了；
// 手工录入的可以选、但不能和落地页自相矛盾；没标的就是没标，不按公司去猜。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { siteOfUrl } from '../src/services/sites.js';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-inq-site-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite'); // 必须在动态 import 之前：connection.js 在 import 期就开库
process.env.INQUIRY_INTAKE_SECRET = 'FAKE_INTAKE_SECRET_0123456789abcdef';
process.env.SYNC_AUTO = 'false';

const { buildApp } = await import('../src/index.js');
const { db } = await import('../src/db/connection.js');
const googleRepo = await import('../src/db/repositories/googleSync.js');
const app = await buildApp();
db.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, name, role) VALUES (1, 'site-test', 'x', '测试', 'boss')").run();
const fitting = googleRepo.createProject({ name: '贝孚特-管件', gsc_site_url: 'sc-domain:bestflowfitting.com', domain: 'bestflowfitting.com', company: '贝孚特', is_default: true });
const casting = googleRepo.createProject({ name: 'FERR-OEM五金件', gsc_site_url: 'sc-domain:ferrcasting.com', domain: 'ferrcasting.com', company: '费尔瑞' });

test.after(async () => { await app.close(); db.close(); rmSync(tmpDir, { recursive: true, force: true }); });

const auth = { cookie: `ferr_token=${app.jwt.sign({ id: 1, username: 't', name: 't', role: 'seo' })}` };
const call = (method, url, payload) => app.inject({ method, url, headers: auth, payload });
const intake = (payload) => app.inject({ method: 'POST', url: '/api/inquiry-intake', headers: { 'x-intake-token': process.env.INQUIRY_INTAKE_SECRET }, payload });
const base = { date: '2026-10-10', channel: 'SEO自然', product: '阀门', grade: 'B' };

test('一个网址是哪个站点的：看域名，子域名也算；没登记的域名认不出来', () => {
  const sites = [{ id: 1, domain: 'example.com' }, { id: 2, domain: 'shop.example.com' }, { id: 3, domain: 'other.cn' }];
  assert.equal(siteOfUrl('https://www.example.com/a?b=1', sites).id, 1);
  assert.equal(siteOfUrl('https://example.com/', sites).id, 1);
  assert.equal(siteOfUrl('https://shop.example.com/cart', sites).id, 2, '两个都登记了时，更具体的那个赢');
  assert.equal(siteOfUrl('https://notexample.com/', sites), null, '只是结尾像，不是它的子域名');
  assert.equal(siteOfUrl('https://example.com.evil.net/', sites), null);
  assert.equal(siteOfUrl('不是网址', sites), null);
  assert.equal(siteOfUrl('', sites), null);
});

test('表单线索：按带回的网址认出站点；转成询盘后站点和公司自动带入，而且谁都改不了', async () => {
  const sent = await intake({ submission_id: 'ff-1-1', email: 'hans@buyer.example', message: 'need valves', landing_page: 'https://www.ferrcasting.com/oem/?campaign_id=77', page_url: 'https://www.ferrcasting.com/contact/' });
  assert.equal(sent.statusCode, 201);
  await intake({ submission_id: 'ff-1-2', email: 'x@y.example', message: 'hi', page_url: 'https://unknown-site.example/contact/' });
  const leads = (await call('GET', '/api/inquiry-leads?state=new')).json().items;
  const lead = leads.find((l) => l.submission_id === 'ff-1-1');
  assert.equal(lead.site_name, 'FERR-OEM五金件');
  assert.equal(leads.find((l) => l.submission_id === 'ff-1-2').site_name, null, '域名没登记成站点：认不出来就是认不出来');

  // 转为询盘：前端就算夹带了别的站点和公司，也以线索为准
  const made = await call('POST', '/api/inquiries', { ...base, lead_id: lead.id, site_id: fitting.id });
  assert.equal(made.statusCode, 201);
  const item = made.json().item;
  assert.equal(item.site_id, casting.id);
  assert.equal(item.site_name, 'FERR-OEM五金件');
  assert.equal(item.company, '费尔瑞', '站点属于哪家公司是登记好的，公司没填时直接带出');
  assert.equal(item.src_evidence, 'form');
  const change = await call('PATCH', `/api/inquiries/${item.id}`, { site_id: fitting.id });
  assert.equal(change.statusCode, 409);
  assert.equal(change.json().error, 'source_locked');
  assert.equal((await call('PATCH', `/api/inquiries/${item.id}`, { site_id: null })).statusCode, 409, '清空也是改');
});

test('手工录入：站点可选可不选；选了自动带公司；填了落地页按域名认；自相矛盾的拒绝', async () => {
  // 不选：就是没标，不按公司去猜
  const plain = (await call('POST', '/api/inquiries', { ...base, company: '贝孚特' })).json().item;
  assert.equal(plain.site_id, null);
  assert.equal(plain.site_name, null);
  // 选了站点、没填公司
  const picked = (await call('POST', '/api/inquiries', { ...base, site_id: fitting.id })).json().item;
  assert.deepEqual([picked.site_id, picked.site_name, picked.company, picked.src_evidence], [fitting.id, '贝孚特-管件', '贝孚特', 'manual']);
  // 公司已经填了的不动（站点和公司对不上不拦：公司是「询价通过哪家」，由业务说了算）
  assert.equal((await call('POST', '/api/inquiries', { ...base, site_id: fitting.id, company: '费尔瑞' })).json().item.company, '费尔瑞');
  // 不存在的站点
  const bad = await call('POST', '/api/inquiries', { ...base, site_id: 99999 });
  assert.equal(bad.statusCode, 400);
  assert.match(bad.json().detail, /站点不存在/);

  // 事后补：只填落地页，站点按域名自动认
  const byPage = (await call('PATCH', `/api/inquiries/${plain.id}`, { src_landing_page: 'https://www.ferrcasting.com/oem/' })).json().item;
  assert.equal(byPage.site_name, 'FERR-OEM五金件');
  // 落地页是一个站的，站点却选了另一个
  const clash = await call('PATCH', `/api/inquiries/${plain.id}`, { src_landing_page: 'https://www.ferrcasting.com/oem/', site_id: fitting.id });
  assert.equal(clash.statusCode, 400);
  assert.match(clash.json().detail, /这个站的/);
  // 落地页不是任何登记站点的：站点听人选的
  const free = (await call('PATCH', `/api/inquiries/${picked.id}`, { src_landing_page: 'https://some-b2b-platform.example/p/1', site_id: casting.id })).json().item;
  assert.equal(free.site_id, casting.id);
  // 清空站点
  assert.equal((await call('PATCH', `/api/inquiries/${picked.id}`, { site_id: null })).json().item.site_id, null);
  // 通用字段里夹带 site_id 进不去别的口子：只改备注时站点不变
  const untouched = (await call('PATCH', `/api/inquiries/${byPage.id}`, { note: '补一句' })).json().item;
  assert.equal(untouched.site_id, casting.id);
});

test('列表带着站点名字；站点停用后，以前的询盘仍然显示它的名字', async () => {
  const names = () => call('GET', '/api/inquiries?start_date=2026-10-01&end_date=2026-10-31').then((r) => r.json().items.map((i) => i.site_name));
  assert.ok((await names()).includes('FERR-OEM五金件'));
  googleRepo.deleteProject(casting.id);
  assert.ok((await names()).includes('FERR-OEM五金件'), '那条询盘确实是从这个站来的，停用站点不能把它变成「未标注」');
  // 但停用的站点不能再被选给新的询盘
  assert.equal((await call('POST', '/api/inquiries', { ...base, site_id: casting.id })).statusCode, 400);
});
