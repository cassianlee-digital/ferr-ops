// 看板「本周要点」：只陈述汇总事实，不把相关性写成原因。
import test from 'node:test';
import assert from 'node:assert/strict';

import '../test-support/tempDb.js'; // 必须在所有 ../src/ 的 import 之前：给本文件配一个临时库，不碰真实的开发库
import { buildAdsHighlights, buildSeoHighlights } from '../src/routes/google.js';

test('empty Google aggregates do not generate fake SEO or Ads highlights', () => {
  const emptySeo = buildSeoHighlights({
    cur: { clicks: 0, impressions: 0, position: null },
    prevTot: { clicks: 0, impressions: 0, position: null },
    queries: [],
    pages: [],
  });
  const emptyAds = buildAdsHighlights({
    cur: { costMicros: 0, impressions: 0, clicks: 0, conversions: 0, costPerConversionMicros: null },
    prevTot: { costMicros: 0, impressions: 0, clicks: 0, conversions: 0, costPerConversionMicros: null },
    keywords: [],
    campaigns: [],
  });

  assert.deepEqual(emptySeo, []);
  assert.deepEqual(emptyAds, []);
});

test('observed zero results remain reportable when another metric proves data exists', () => {
  const seo = buildSeoHighlights({
    cur: { clicks: 0, impressions: 80, position: 12 },
    prevTot: { clicks: 4, impressions: 100, position: 10 },
    queries: [],
    pages: [],
  });
  const ads = buildAdsHighlights({
    cur: { costMicros: 5_000_000, impressions: 200, clicks: 10, conversions: 0, costPerConversionMicros: null },
    prevTot: { costMicros: 4_000_000, impressions: 180, clicks: 8, conversions: 2, costPerConversionMicros: 2_000_000 },
    keywords: [],
    campaigns: [],
  });

  assert.match(seo[0].text, /自然点击 0（-100%/);
  assert.match(ads[0].text, /转化 0\.0（-100%/);
});

test('上一周期没有同步数据时不写「+100%」：刚登记的站点只有最近几天的数，没有可比的上一周期', () => {
  const seo = buildSeoHighlights({
    cur: { clicks: 224, impressions: 79109, position: 6.3 },
    prevTot: { clicks: 0, impressions: 0, position: null },
    queries: [{ query: 'globe valve', clicks: 9, clicksPrev: 0, position: 1.6 }],
    pages: [{ page: 'https://x.example/a', clicks: 30, clicksPrev: 0 }],
  });
  assert.equal(seo.length, 1, '单个词的「+9」也不该出现：那只是它本期的点击数，不是涨了 9');
  assert.equal(seo[0].tone, 'muted');
  assert.match(seo[0].text, /^自然点击 224（上一周期没有同步数据，无法对比）$/);
  assert.doesNotMatch(seo[0].text, /%/);

  const ads = buildAdsHighlights({
    cur: { costMicros: 5_000_000, impressions: 200, clicks: 10, conversions: 7, costPerConversionMicros: 700_000 },
    prevTot: { costMicros: 0, impressions: 0, clicks: 0, conversions: 0, costPerConversionMicros: null },
    keywords: [], campaigns: [],
  });
  assert.match(ads[0].text, /^转化 7\.0（上一周期没有同步数据，无法对比）$/);
  assert.equal(ads[0].tone, 'muted');

  // 上一周期有数据、只是那一项确实是 0：写 0 次，不编百分比
  const fromZero = buildSeoHighlights({ cur: { clicks: 5, impressions: 90, position: 12 }, prevTot: { clicks: 0, impressions: 100, position: 15 }, queries: [], pages: [] });
  assert.match(fromZero[0].text, /自然点击 5（上一周期 0 次）/);
  const adsFromZero = buildAdsHighlights({
    cur: { costMicros: 5_000_000, impressions: 200, clicks: 10, conversions: 2, costPerConversionMicros: 2_500_000 },
    prevTot: { costMicros: 4_000_000, impressions: 180, clicks: 8, conversions: 0, costPerConversionMicros: null }, keywords: [], campaigns: [],
  });
  assert.match(adsFromZero[0].text, /转化 2\.0（上一周期 0 次）/);
  // 两边都有数的正常情况不变
  const normal = buildSeoHighlights({ cur: { clicks: 20, impressions: 9884, position: 21.5 }, prevTot: { clicks: 30, impressions: 12000, position: 22.3 }, queries: [], pages: [] });
  assert.match(normal[0].text, /自然点击 20（-33% vs 上一周期）/);
});
