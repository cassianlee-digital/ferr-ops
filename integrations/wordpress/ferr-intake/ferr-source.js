/* FERR 询盘来源记录（独立站前台，每个页面都加载）。
 *
 * 做两件事：
 *   1. 访客从站外进来的那一刻，把「从哪来的」记在他自己的浏览器里（落地页、来路、广告参数），保留 30 天；
 *   2. 页面上有询盘表单时，把记下的来源填进表单里那个名叫 ferr_source 的隐藏字段，随表单一起提交。
 *
 * 为什么不用 Fluent Forms 自带的 {get.xxx} / {cookie.xxx} 默认值：
 *   · 网址里的参数只在进站那一页有，访客点到「联系我们」再提交时早就没了；
 *   · 那些默认值是服务器生成页面时填进去的，站点开了页面缓存的话，后来的访客会拿到别人的来源 —— 那就成了假证据。
 *   所以在访客自己的浏览器里记、在提交前填。
 *
 * 这里没有任何密钥。往后台发送是服务器上的 ferr-intake.php 做的。
 */
(function () {
  'use strict';

  var STORE_KEY = 'ferr_src';
  var KEEP_DAYS = 30;
  var FIELD_NAME = 'ferr_source';
  // 认这些网址参数。campaign_id / adgroup_id / keyword / match_type 来自 Google Ads 的跟踪模板
  var PARAMS = ['gclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'campaign_id', 'adgroup_id', 'keyword', 'match_type'];

  function decode(text) {
    try { return decodeURIComponent(String(text || '').replace(/\+/g, ' ')); } catch (e) { return String(text || ''); }
  }

  function readParams() {
    var out = {};
    var search = String(window.location.search || '').replace(/^\?/, '');
    if (!search) return out;
    var pairs = search.split('&');
    for (var i = 0; i < pairs.length; i++) {
      var cut = pairs[i].indexOf('=');
      if (cut === -1) continue;
      var name = decode(pairs[i].slice(0, cut));
      var value = decode(pairs[i].slice(cut + 1)).slice(0, 200);
      if (value && PARAMS.indexOf(name) !== -1) out[name] = value;
    }
    return out;
  }

  function bareHost(host) { return String(host || '').toLowerCase().replace(/^www\./, ''); }

  // 来路只认站外的。站内翻页的来路是自己的页面，不是「从哪来的」
  function outsideReferrer() {
    var ref = String(document.referrer || '');
    if (!ref) return '';
    var m = /^https?:\/\/([^/?#:]+)/i.exec(ref);
    if (!m || bareHost(m[1]) === bareHost(window.location.hostname)) return '';
    return ref.slice(0, 500);
  }

  function load() {
    try {
      var saved = JSON.parse(window.localStorage.getItem(STORE_KEY) || 'null');
      if (saved && typeof saved === 'object' && saved.t && new Date().getTime() - saved.t < KEEP_DAYS * 86400000) return saved;
    } catch (e) { /* 浏览器不让用本地存储：下面按「每一页都是第一次」处理 */ }
    return null;
  }

  function save(record) {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(record)); } catch (e) { /* 存不了就只在这一页有效 */ }
  }

  /* 记哪一次：最近一次「从站外进来」的那一次。
     带着广告 / 推广参数进来，或者来路是别的网站 → 这是一次新的进站，覆盖旧记录；
     站内翻页、直接输网址回访 → 不覆盖（否则点到联系页时，来源就被冲成空的了）。 */
  function capture() {
    var saved = load();
    var params = readParams();
    var referrer = outsideReferrer();
    var hasParams = false;
    for (var k in params) { if (Object.prototype.hasOwnProperty.call(params, k)) { hasParams = true; break; } }
    if (saved && !hasParams && !referrer) return saved;

    var record = { t: new Date().getTime(), landing_page: String(window.location.href).slice(0, 500), referrer: referrer };
    for (var name in params) { if (Object.prototype.hasOwnProperty.call(params, name)) record[name] = params[name]; }
    save(record);
    return record;
  }

  /* 隐藏字段里放的是一段只含字母、数字、- 和 _ 的编码（JSON 的 base64url）。
     不直接放网址：表单插件会清洗提交的文字，网址里的 %20 这类写法会被清掉，来源就对不上了。 */
  function encode(obj) {
    var json = JSON.stringify(obj);
    var b64 = window.btoa(unescape(encodeURIComponent(json)));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  var source = capture();

  function fill() {
    var inputs = document.querySelectorAll('input[name="' + FIELD_NAME + '"]');
    if (!inputs.length) return;
    var payload = { page_url: String(window.location.href).slice(0, 500) };
    for (var key in source) {
      if (key !== 't' && Object.prototype.hasOwnProperty.call(source, key) && source[key]) payload[key] = source[key];
    }
    var value = encode(payload);
    for (var i = 0; i < inputs.length; i++) inputs[i].value = value;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fill);
  else fill();
  // 弹窗里的表单、晚加载的表单，页面刚打开时还不在：访客开始填、点提交的那一刻再填一次
  var late = ['focusin', 'pointerdown', 'submit'];
  for (var j = 0; j < late.length; j++) document.addEventListener(late[j], fill, true);
})();
