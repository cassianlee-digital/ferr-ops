// GEO 概览的数据组装：AI 引擎流量（GA4）+ AI 引擎带来的询盘 / 线索 + 最近一轮人工引用抽查。
// 总览页的 GEO 卡和周度审核包共用这一份，所以放在 service 而不是路由里。
import * as repo from '../db/repositories/geo.js';
import * as checksRepo from '../db/repositories/geoChecks.js';
import { previousRange } from '../lib/parseDateRange.js';
import { resolveProject } from '../sync/googleClient.js';
import { summarizeGeo } from './geo.js';
import { roundExpected, summarizeRound } from './geoChecks.js';

// 一轮抽查的汇总（没有这一轮就是 null）
export function roundSummary(roundDate) {
  if (!roundDate) return null;
  return { round_date: roundDate, ...summarizeChecks(roundDate, checksRepo.listRound(roundDate)) };
}

// 已经取到这一轮的记录时用这个（抽查页自己要带截图，不必再查一遍）。「应查几题」的规矩见 geoChecks.roundExpected
export function summarizeChecks(roundDate, checks) {
  const activeNow = checksRepo.activeQuestionCount();
  // 一条记录都没有的日期不是「一轮」，没有定不定格可言：题库现在有几道就是几道
  const exp = checks.length
    ? roundExpected({ snapshot: checksRepo.roundSnapshot(roundDate), hasLaterRound: checksRepo.hasLaterRound(roundDate), activeNow })
    : { count: activeNow, note: null };
  return summarizeRound(exp.count, checks, exp.note);
}

export function buildGeoSummary(range, query = {}) {
  let propertyId = null;
  try { propertyId = resolveProject(query).ga4_property_id || null; } catch (e) { propertyId = null; }
  const prev = previousRange(range);
  // 引用抽查：取区间结束日（含）之前最近的一轮，及它的上一轮。没查过就是 null，不是 0。
  const round = checksRepo.latestRoundOnOrBefore(range.end_date);
  return {
    range,
    previous_range: prev,
    citations: roundSummary(round),
    citations_previous: roundSummary(round && checksRepo.previousRound(round)),
    ...summarizeGeo({
      current: repo.ga4Sources(range, propertyId),
      previous: repo.ga4Sources(prev, propertyId),
      inquiries: repo.formInquiries(range),
      leads: repo.leads(range),
    }),
  };
}
