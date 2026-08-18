import { callAnthropic } from './anthropic.js';
import { publicAiError } from './aiProvider.js';
import {
  auditHermesAnswer,
  buildConfidenceAssessment,
  guardHermesAnswer,
  needsEvidenceGuard,
  stripEvidenceRefs,
} from './hermesEvidence.js';

const DEFAULT_REPAIR_ELIGIBLE_MS = 60_000;
const DEFAULT_REPAIR_TIMEOUT_MS = 45_000;

export function splitVerifiedText(text) {
  const raw = String(text || '').trim();
  const match = raw.match(/<hermes_basis>([\s\S]*?)<\/hermes_basis>\s*<hermes_answer>([\s\S]*?)<\/hermes_answer>/i);
  const clean = (value) => String(value || '').replace(/<\/?hermes_(basis|answer)>/gi, '').trim();
  if (!match) return { basis: '', answer: clean(raw) };
  return { basis: clean(match[1]), answer: clean(match[2]) || clean(raw) };
}

export function composeVerifiedText(parsed) {
  const clean = (value) => String(value || '').replace(/<\/?hermes_(basis|answer)>/gi, '').trim();
  return [
    '<hermes_basis>',
    stripEvidenceRefs(clean(parsed?.basis)),
    '</hermes_basis>',
    '<hermes_answer>',
    stripEvidenceRefs(clean(parsed?.answer)),
    '</hermes_answer>',
  ].join('\n');
}

export function finalizeVerifiedAnswer(text, context, options = {}) {
  let parsed = splitVerifiedText(text);
  const requiresEvidence = needsEvidenceGuard(parsed, options.forceEvidence);
  const audit = auditHermesAnswer(parsed, context);
  parsed = guardHermesAnswer(parsed, audit, { forceEvidence: options.forceEvidence });
  const confidenceAssessment = buildConfidenceAssessment(audit, parsed, { forceEvidence: options.forceEvidence });
  return { parsed, audit, confidenceAssessment, requiresEvidence };
}

export function repairedAnswerIsBetter(current, candidate) {
  if (!candidate?.audit?.evidence?.length) return false;
  if (candidate.audit.evidence.length <= (current?.audit?.evidence?.length || 0)) return false;
  return Number(candidate.confidenceAssessment?.score || 0) > Number(current?.confidenceAssessment?.score || 0);
}

export async function generateVerifiedAiAnswer({
  system,
  prompt,
  context,
  attachments,
  forceEvidence = false,
  generate = callAnthropic,
  repairEligibleMs = DEFAULT_REPAIR_ELIGIBLE_MS,
  repairTimeoutMs = DEFAULT_REPAIR_TIMEOUT_MS,
}) {
  const startedAt = Date.now();
  const firstText = await generate(system, prompt, { attachments });
  let result = finalizeVerifiedAnswer(firstText, context, { forceEvidence });
  const answerQualityRepair = { attempted: false, used: false, error: '' };
  const shouldRepair = result.requiresEvidence
    && result.audit.evidencePoolSize > 0
    && result.audit.evidence.length === 0
    && Date.now() - startedAt < repairEligibleMs;

  if (shouldRepair) {
    answerQualityRepair.attempted = true;
    try {
      const repairPrompt = [
        prompt,
        '',
        '[必须纠正]',
        '上一次草稿没有绑定任何有效证据，不能交付。请重新生成，并严格遵守：',
        '1. 每条数据事实、判断和动作都在同一句引用“本轮可引用证据”中的匹配 [EV-...]。',
        '2. 只保留证据在主题、指标和粒度上能直接支持的内容；其余放入“待验证”。',
        '3. 少而准确，不要为了完整而扩写更多判断。',
      ].join('\n');
      const repairText = await generate(system, repairPrompt, {
        attachments,
        timeoutMs: repairTimeoutMs,
        maxAttempts: 1,
      });
      const candidate = finalizeVerifiedAnswer(repairText, context, { forceEvidence });
      if (repairedAnswerIsBetter(result, candidate)) {
        result = candidate;
        answerQualityRepair.used = true;
      }
    } catch (error) {
      answerQualityRepair.error = publicAiError(error).error;
    }
  }

  delete result.audit._evidenceById;
  result.parsed = {
    basis: stripEvidenceRefs(result.parsed.basis),
    answer: stripEvidenceRefs(result.parsed.answer),
  };
  return {
    parsed: result.parsed,
    text: result.parsed.answer,
    responseText: composeVerifiedText(result.parsed),
    audit: result.audit,
    confidenceAssessment: result.confidenceAssessment,
    answerQualityRepair,
  };
}
