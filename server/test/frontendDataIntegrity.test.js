import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8');
const negAdsSource = readFileSync(new URL('../../public/src/neg-ads.js', import.meta.url), 'utf8');

function tbody(id) {
  const match = html.match(new RegExp(`<tbody[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/tbody>`));
  assert.ok(match, `missing tbody #${id}`);
  return match[1];
}

test('live business tables never ship static records in real mode', () => {
  for (const id of ['tb-inq-cur', 'tb-inq', 'tb-neg', 'tb-ad']) {
    const body = tbody(id);
    assert.match(body, /data-load-state="loading"/);
    assert.doesNotMatch(body, /contenteditable|data-field=|data-id=/);
  }

  const topKeywords = tbody('overview-top-keywords');
  assert.match(topKeywords, /data-load-state="unavailable"/);
  assert.match(topKeywords, /尚未完成关键词排名与询盘归因/);
});

test('known fixture records and unsupported business conclusions are absent', () => {
  const unsupportedClaims = [
    '本月预计 85 分',
    '东南亚来词零有效询盘',
    '欧洲铸件采购Q3回暖',
    '大白话客户(see drawing)成单更快',
    '德国组用"目标ROAS"',
    '球铁页 H1 加入材质牌号(A536)',
    '机加工通用组 ROAS 偏低',
    '球铁页资质版 CTR+38%',
    'ISO/CE 认证铸造厂 · 按图定制',
    'Lowest Price Casting',
    '索要频率：catalog ＞ 材质证书',
  ];
  for (const claim of unsupportedClaims) assert.equal(html.includes(claim), false, `unsupported claim remains: ${claim}`);
});

test('AI entry points require evidence, confidence, and explicit insufficient-data handling', () => {
  assert.match(html, /逐条说明数据依据和置信度/);
  assert.match(html, /没有搜索词级证据时必须明确说明/);
  assert.match(html, /不得编造认证、交期、报价速度/);
  assert.ok((html.match(/data-ai-state="not-generated"/g) || []).length >= 6);
});

test('empty and failed live loads remain observable and retryable', () => {
  assert.match(appSource, /function tableLoadState\(/);
  assert.match(appSource, /\$\{esc\(message\)\}/);
  assert.match(appSource, /data-load-state="\$\{state\}"/);
  assert.match(appSource, /否词加载失败：/);
  assert.match(appSource, /广告创意加载失败：/);
  assert.match(appSource, /window\._inqStats=null;[\s\S]*renderInqDonuts\(\);/);
  assert.match(appSource, /loadInquiries\(\)/);
  assert.match(appSource, /loadNegKeywords\(\)/);
  assert.match(appSource, /loadAdCreatives\(\)/);
  assert.match(negAdsSource, /clearLoadState\('tb-neg'\)/);
  assert.match(negAdsSource, /clearLoadState\('tb-ad'\)/);
});
