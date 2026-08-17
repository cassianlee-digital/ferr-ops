import test from 'node:test';
import assert from 'node:assert/strict';

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
