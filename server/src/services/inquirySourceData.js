// 询盘来源对账的数据组装：拿一批询盘的来源词，去已同步的 Ads / GSC 点击数据里找证据。
// 规则在 inquirySource.js（纯函数），查询在 repositories/inquirySource.js；这里把两者接起来。
import * as repo from '../db/repositories/inquirySource.js';
import { LOOKBACK_DAYS, VERDICTS, sourceTerm, sourceVerdict } from './inquirySource.js';
import { addDays } from './taskEffect.js';

// 询盘日往前 LOOKBACK_DAYS 天这个窗口里：数据源有没有同步数据、这个词有没有带来点击、最近一次是哪天
function windowEvidence(dates, coveredDates, from, to) {
  let last = null;
  if (dates) for (const d of dates) if (d >= from && d <= to && (!last || d > last)) last = d;
  let covered = false;
  for (const d of coveredDates) if (d >= from && d <= to) { covered = true; break; }
  return { covered, hit: !!last, last_date: last };
}

export function buildSourceChecks(inquiries) {
  const rows = inquiries.filter((r) => r && r.date);
  const base = { lookback_days: LOOKBACK_DAYS, verdicts: VERDICTS };
  if (!rows.length) return { ...base, items: [], summary: {} };
  const dates = rows.map((r) => r.date).sort();
  const start = addDays(dates[0], -LOOKBACK_DAYS);
  const end = dates[dates.length - 1];
  const terms = [...new Set(rows.map((r) => sourceTerm(r.source)).filter(Boolean))];

  const adsHits = repo.adsHitDates(terms, start, end);
  const gscHits = repo.gscHitDates(terms, start, end);
  const adsCovered = repo.adsCoveredDates(start, end);
  const gscCovered = repo.gscCoveredDates(start, end);

  const summary = {};
  const items = rows.map((r) => {
    const term = sourceTerm(r.source);
    const from = addDays(r.date, -LOOKBACK_DAYS);
    const ads = windowEvidence(adsHits.get(term), adsCovered, from, r.date);
    const gsc = windowEvidence(gscHits.get(term), gscCovered, from, r.date);
    const verdict = sourceVerdict(r, { ads, gsc });
    summary[verdict] = (summary[verdict] || 0) + 1;
    return { id: r.id, verdict, ads, gsc };
  });
  return { ...base, items, summary };
}
