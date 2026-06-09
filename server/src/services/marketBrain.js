// 市场 AI 记忆体：MD5 状态检测 + 缓存摘要 + 注入。节约 token——数据未变绝不重新分析。
import crypto from 'node:crypto';
import * as brainRepo from '../db/repositories/marketBrain.js';
import * as mr from '../db/repositories/marketResearch.js';
import { callAnthropic } from './anthropic.js';

const md5 = (s) => crypto.createHash('md5').update(s || '').digest('hex');
const currentMonth = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};

// 供全局 AI 调用注入用的常驻记忆
export function getSummary() {
  const b = brainRepo.get();
  return (b && b.cached_summary) || '';
}

// 状态检测（不消耗 token）：比对 MD5 + 是否跨月 + 是否已有摘要
export function checkState() {
  const b = brainRepo.get();
  const hash = md5(mr.sourceText());
  const month = currentMonth();
  const hasSummary = !!(b && b.cached_summary);
  const changed = !b || b.last_analyzed_hash !== hash;
  const crossMonth = !b || b.analyzed_month !== month;
  const needsUpdate = changed || crossMonth || !hasSummary;
  let reason = 'up_to_date';
  if (!hasSummary) reason = 'no_summary';
  else if (changed) reason = 'data_changed';
  else if (crossMonth) reason = 'new_month';
  return {
    needsUpdate, reason, currentHash: hash, month,
    lastHash: (b && b.last_analyzed_hash) || null,
    analyzedMonth: (b && b.analyzed_month) || null,
    hasSummary, updatedAt: (b && b.updated_at) || null,
  };
}

const SYS =
  '你是资深外贸市场分析师。把下面这家「来图定制铸造/机加工」外贸企业的市场调研原始资料，' +
  '提炼成高度浓缩、结构化的 Markdown「市场记忆」，供后续所有 AI 分析常驻调用。' +
  '需覆盖：目标客户画像/ICP、决策链与采购旅程、核心痛点、差异化与短板、各区域市场特征与毛利、' +
  '客户语言库与高价值长尾关键词、成交与流失规律。控制在 600 字以内，要点化、可直接当背景知识用。';

// 重新学习（消耗 token）：仅在手动触发或状态判定需要时调用
export async function refresh() {
  const source = mr.sourceText();
  const hash = md5(source);
  const month = currentMonth();
  if (!source.trim()) {
    brainRepo.update(hash, '', month); // 无资料：记录哈希但不调用 API
    return { updated: false, reason: 'no_source', summary: '' };
  }
  const summary = await callAnthropic(SYS, source);
  brainRepo.update(hash, summary, month);
  return { updated: true, reason: 'refreshed', summary };
}
