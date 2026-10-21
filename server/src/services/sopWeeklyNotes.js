// 识别四个赛道中需要填写「本周目标 / 一句话复盘」的 8 条固定周 SOP。

const NOTE_TRACKS = new Set(['SEM', '社媒', 'SEO', 'GEO']);
const NOTE_SOURCES = new Set(['sem-social-sop', 'seo-geo-sop']);

export function weeklyNoteKind(def) {
  if (!def || def.freq !== 'weekly' || def.code !== '固定') return null;
  if (!NOTE_TRACKS.has(def.track) || !NOTE_SOURCES.has(def.source)) return null;
  if (def.time_hint === '周一') return 'goal';
  if (def.time_hint === '周五') return 'review';
  return null;
}

export function decorateWeeklyNote(def) {
  const noteKind = weeklyNoteKind(def);
  return {
    ...def,
    note_kind: noteKind,
    note_prompt: noteKind === 'goal' ? '本周目标' : noteKind === 'review' ? '一句话复盘' : null,
  };
}
