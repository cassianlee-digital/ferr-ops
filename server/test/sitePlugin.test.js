// 独立站那一侧的 WordPress 插件（integrations/wordpress/ferr-intake）：浏览器里记来源的脚本 + 服务器上往后台发的 PHP。
//
// 这两段代码不跑在后台里，后台的测试本来碰不到它们；但它们和后台接口之间是一份「口头约定」
// （字段叫什么、密钥放哪、怎么防重复）。这里把整条链路真跑一遍：
//   脚本在假浏览器里记来源、填隐藏字段 → PHP 在假 WordPress 里收到表单、组出请求 → 请求体交给后台真正的入库规则。
// 哪一边改了字段名，这里就红。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { normalizeLead } from '../src/services/inquirySource.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const pluginDir = join(root, 'integrations/wordpress/ferr-intake');
const script = readFileSync(join(pluginDir, 'ferr-source.js'), 'utf8');
const DAY = 86400000;

/* ---------- 假浏览器 ---------- */
// 一个访客 = 一份本地存储；每打开一个页面跑一次脚本。返回这一页上隐藏字段被填进去的内容（已解码）
function visitor({ storage = true } = {}) {
  const store = new Map();
  let now = Date.UTC(2026, 9, 12, 8, 0, 0);
  const open = (href, referrer = '', { form = true } = {}) => {
    const url = new URL(href);
    const input = { value: '' };
    const listeners = {};
    const RealDate = Date;
    class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
    const sandbox = {
      Date: FakeDate, JSON, Object, String, encodeURIComponent, decodeURIComponent, unescape,
      window: {
        location: { href, search: url.search, hostname: url.hostname },
        localStorage: storage
          ? { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); } }
          : { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } },
        btoa: (s) => Buffer.from(s, 'latin1').toString('base64'),
      },
      document: {
        referrer, readyState: 'complete',
        querySelectorAll: (sel) => (form && sel === 'input[name="ferr_source"]' ? [input] : []),
        addEventListener: (name, fn) => { listeners[name] = fn; },
      },
    };
    vm.runInNewContext(script, sandbox);
    return { raw: input.value, data: input.value ? JSON.parse(Buffer.from(input.value, 'base64url').toString('utf8')) : null, input, listeners };
  };
  return { open, wait: (days) => { now += days * DAY; }, store };
}

test('脚本：进站那一刻记下来源，点到联系页提交时还在；隐藏字段里只有字母数字和 - _', () => {
  const v = visitor();
  const landing = 'https://www.ferr-site.com/valves/?campaign_id=123&adgroup_id=456&keyword=gate%20valve+manufacturer&match_type=p&gclid=Cj0abc&utm_source=google&utm_medium=cpc&x=1';
  v.open(landing, 'https://www.google.com/', { form: false });
  const contact = v.open('https://www.ferr-site.com/contact/', 'https://www.ferr-site.com/valves/');
  assert.match(contact.raw, /^[A-Za-z0-9_-]+$/, '表单插件会清洗提交的文字，带 % 的网址直接放进去会被改坏');
  assert.deepEqual(contact.data, {
    page_url: 'https://www.ferr-site.com/contact/',
    landing_page: landing,
    referrer: 'https://www.google.com/',
    campaign_id: '123', adgroup_id: '456', keyword: 'gate valve manufacturer', match_type: 'p',
    gclid: 'Cj0abc', utm_source: 'google', utm_medium: 'cpc',
  }, '不认识的参数（x）不带；站内翻页的来路不算来路');
});

test('脚本：记的是最近一次从站外进来的那次 —— 站内翻页、直接回访不覆盖，新的站外进站才覆盖；30 天后作废', () => {
  const v = visitor();
  v.open('https://ferr-site.com/?utm_source=google&utm_medium=cpc&campaign_id=1', '');
  // www 和不带 www 是同一个站：不算从站外来
  assert.equal(v.open('https://www.ferr-site.com/about/', 'https://ferr-site.com/').data.campaign_id, '1');
  // 几天后直接输网址回来：还是上次那个来源
  v.wait(5);
  assert.equal(v.open('https://ferr-site.com/contact/', '').data.campaign_id, '1');
  // 又过几天从自然搜索进来：这是新的一次进站，旧的广告来源不能再算在它头上
  v.wait(3);
  const organic = v.open('https://ferr-site.com/flanges/', 'https://www.bing.com/search?q=flange');
  assert.deepEqual(organic.data, { page_url: 'https://ferr-site.com/flanges/', landing_page: 'https://ferr-site.com/flanges/', referrer: 'https://www.bing.com/search?q=flange' });
  // 31 天没再从站外来过：记录作废，这次直接访问就是它自己
  v.wait(31);
  const stale = v.open('https://ferr-site.com/contact/', '');
  assert.deepEqual(stale.data, { page_url: 'https://ferr-site.com/contact/', landing_page: 'https://ferr-site.com/contact/' });
});

test('脚本：浏览器不让用本地存储时不报错，只是来源退化成当前这一页；晚出现的表单在访客动手时补填', () => {
  const v = visitor({ storage: false });
  v.open('https://ferr-site.com/?gclid=abc', 'https://www.google.com/', { form: false });
  assert.deepEqual(v.open('https://ferr-site.com/contact/', 'https://ferr-site.com/').data, { page_url: 'https://ferr-site.com/contact/', landing_page: 'https://ferr-site.com/contact/' });

  const page = visitor().open('https://ferr-site.com/?gclid=late', '');
  page.input.value = '';
  for (const name of ['focusin', 'pointerdown', 'submit']) assert.equal(typeof page.listeners[name], 'function', name);
  page.listeners.focusin();
  assert.match(page.input.value, /^[A-Za-z0-9_-]+$/);
});

/* ---------- 假 WordPress ---------- */
const php = (() => { try { execFileSync('php', ['-v'], { stdio: 'ignore' }); return true; } catch (e) { return false; } })();
const needPhp = { skip: php ? false : '这台机器没有 PHP，站点插件的服务器那一半没法跑。装上 PHP（任意 7.2 以上版本）后这几条才会生效' };

const TOKEN = 'FAKE_INTAKE_TOKEN_0123456789abcdef';
const DEFINES = { FERR_INTAKE_URL: 'https://ops.example/api/inquiry-intake', FERR_INTAKE_TOKEN: TOKEN };
function wordpress(scenario) {
  const r = spawnSync('php', [join(root, 'server/test-support/wpStub.php'), join(pluginDir, 'ferr-intake.php')], { input: JSON.stringify(scenario), encoding: 'utf8' });
  assert.equal(r.status, 0, 'PHP 报错了：' + r.stderr + r.stdout);
  return JSON.parse(r.stdout);
}
// 一次真实的提交：访客从广告进站，点到联系页，填了表单
function submission() {
  const v = visitor();
  const landing = 'https://www.ferr-site.com/valves/?campaign_id=123&adgroup_id=456&keyword=gate%20valve&match_type=e&gclid=Cj0abc&utm_source=google&utm_medium=cpc';
  v.open(landing, 'https://www.google.com/', { form: false });
  const contact = v.open('https://www.ferr-site.com/contact/', 'https://www.ferr-site.com/valves/');
  return {
    landing,
    formData: {
      names: { first_name: 'Hans', last_name: 'Meyer' },
      email: 'hans@buyer.example',
      company: 'Meyer Armaturen GmbH',
      message: 'We need 500 pcs DN50 gate valves, 中文也行 "quoted"',
      ferr_source: contact.raw,
      __fluent_form_embded_post_id: '12',
    },
  };
}

test('PHP 语法没问题', needPhp, () => {
  const r = spawnSync('php', ['-l', join(pluginDir, 'ferr-intake.php')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('整条链路：访客从广告进站 → 提交表单 → 插件发出的请求，后台原样收得下', needPhp, () => {
  const s = submission();
  const out = wordpress({ defines: DEFINES, formData: s.formData, formId: 3, entryId: 15 });
  assert.equal(out.requests.length, 1);
  const req = out.requests[0];
  assert.equal(req.url, DEFINES.FERR_INTAKE_URL);
  assert.deepEqual(req.headers, { 'Content-Type': 'application/json', 'X-Intake-Token': TOKEN }, '后台只认这个请求头');
  assert.ok(req.timeout <= 5, '发送是在访客提交表单的那一下做的，不能让他等太久');

  const body = JSON.parse(req.body);
  assert.equal(body.submission_id, 'ff-3-15');
  const lead = normalizeLead(body); // 后台真正的入库规则
  assert.equal(lead.ok, true);
  const { submitted_at: sentAt, ...rest } = lead.value;
  assert.match(sentAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/);
  assert.deepEqual(rest, {
    submission_id: 'ff-3-15',
    contact_name: 'Hans Meyer',
    contact_email: 'hans@buyer.example',
    contact_company: 'Meyer Armaturen GmbH',
    country: null, product: null,
    message: 'We need 500 pcs DN50 gate valves, 中文也行 "quoted"',
    page_url: 'https://www.ferr-site.com/contact/',
    landing_page: s.landing,
    referrer: 'https://www.google.com/',
    gclid: 'Cj0abc',
    utm_source: 'google', utm_medium: 'cpc', utm_campaign: null, utm_term: null, utm_content: null,
    campaign_id: '123', adgroup_id: '456', keyword: 'gate valve', match_type: 'e',
    suggested_channel: 'SEM付费',
  });
  // 插件发出去的每一个字段，后台都认识（发了不认的字段 = 两边的约定已经对不上了）
  const known = new Set(['submission_id', 'submitted_at', 'name', 'email', 'company', 'country', 'product', 'message',
    'page_url', 'landing_page', 'referrer', 'gclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'campaign_id', 'adgroup_id', 'keyword', 'match_type']);
  assert.deepEqual(Object.keys(body).filter((k) => !known.has(k)), []);
  assert.deepEqual(out.scheduled, []);
  assert.equal(out.scripts.length, 1, '前台加载了记来源的脚本');
  assert.match(out.scripts[0].src, /ferr-source\.js$/);
});

test('不该发的时候不发：没配好、地址不是 https、密钥太短、表单没有那个隐藏字段、不在指定的表单里', needPhp, () => {
  const { formData } = submission();
  const sent = (scenario) => wordpress({ formData, ...scenario }).requests.length;
  assert.equal(sent({ defines: {} }), 0);
  assert.equal(sent({ defines: { ...DEFINES, FERR_INTAKE_URL: 'http://ops.example/api/inquiry-intake' } }), 0, '密钥走请求头，不加密的地址不发');
  assert.equal(sent({ defines: { ...DEFINES, FERR_INTAKE_TOKEN: 'short' } }), 0);
  const { ferr_source: _drop, ...newsletter } = formData;
  assert.equal(wordpress({ defines: DEFINES, formData: newsletter }).requests.length, 0, '订阅之类别的表单不回传');
  assert.equal(sent({ defines: { ...DEFINES, FERR_INTAKE_FORM_IDS: '7, 9' }, formId: 3 }), 0);
  assert.equal(sent({ defines: { ...DEFINES, FERR_INTAKE_FORM_IDS: '7, 3' }, formId: 3 }), 1);
  // 没配好要在 WordPress 后台说出来，不能悄悄不工作
  assert.match(wordpress({ defines: {}, adminNotice: true }).notice, /还没配好/);
  assert.equal(wordpress({ defines: DEFINES, adminNotice: true }).notice, '');
});

test('隐藏字段被改坏 / 被人乱填：询盘照发，只是没有来源；里面夹带的别的字段不会被带进请求', needPhp, () => {
  const { formData } = submission();
  const forged = Buffer.from(JSON.stringify({ gclid: 'ok', email: 'evil@x.example', submission_id: 'hijack', name: { a: 1 }, keyword: ['x'] })).toString('base64url');
  for (const [value, expectGclid] of [['%%%not-base64', undefined], ['', undefined], [Buffer.from('not json').toString('base64url'), undefined], [forged, 'ok']]) {
    const body = JSON.parse(wordpress({ defines: DEFINES, formData: { ...formData, ferr_source: value } }).requests[0].body);
    assert.equal(body.email, 'hans@buyer.example', '表单里填的邮箱不能被隐藏字段盖掉');
    assert.equal(body.submission_id, 'ff-3-15');
    assert.equal(body.gclid, expectGclid);
    assert.equal(body.keyword, undefined);
    assert.equal(normalizeLead(body).ok, true);
  }
});

test('发送失败：过一会儿重试，最多三次，带的是同一个编号；400 / 401 不重试；失败原因留在 WordPress 后台，成功后消失', needPhp, () => {
  const { formData } = submission();
  // 后台一直连不上
  const down = wordpress({ defines: DEFINES, formData, responses: ['Connection timed out', 500, 502, 503], runRetries: true, adminNotice: true });
  assert.equal(down.requests.length, 4, '第一次 + 三次重试，然后停下');
  assert.deepEqual(down.scheduled.map((j) => [j.hook, j.attempt]), [['ferr_intake_retry', 1], ['ferr_intake_retry', 2], ['ferr_intake_retry', 3]]);
  assert.deepEqual(down.scheduled.map((j) => Math.round(j.in_seconds / 60)), [5, 30, 120]);
  assert.deepEqual([...new Set(down.requests.map((r) => JSON.parse(r.body).submission_id))], ['ff-3-15'], '重试带同一个编号，后台才不会建出重复的线索');
  assert.match(down.notice, /最近一次发送失败.*HTTP 503.*Entries/);
  // 重试成功：提示消失
  const recovered = wordpress({ defines: DEFINES, formData, responses: ['Connection timed out', 201], runRetries: true, adminNotice: true });
  assert.equal(recovered.requests.length, 2);
  assert.equal(Object.keys(recovered.options).length, 0, '成功后把上一次的失败记录清掉');
  assert.equal(recovered.notice, '');
  // 密钥不对 / 内容不合格：重试多少次都一样，不重试，但要说清楚原因
  for (const [code, words] of [[401, /密钥不对/], [400, /邮箱和留言至少要有一个/]]) {
    const refused = wordpress({ defines: DEFINES, formData, responses: [code], runRetries: true, adminNotice: true });
    assert.equal(refused.requests.length, 1);
    assert.deepEqual(refused.scheduled, []);
    assert.match(refused.notice, words);
  }
});
