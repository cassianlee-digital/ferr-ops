/* 把老板那两份 SOP 文档导入 sop_definitions（幂等）。
 *
 *   node src/db/importSopCatalog.js            # 导入 / 更新
 *   node src/db/importSopCatalog.js --dry-run  # 只看会改什么，不写库
 *
 * 为什么不挂在 migrate 里自动跑：这 60 条是**业务内容**不是表结构。
 * 自动跑意味着一次重启就往线上库塞 60 条清单，执行人第二天打开日计划会以为系统疯了。
 * 文档更新后重新生成 sopCatalog.json，再跑一次这个脚本即可。
 *
 * 幂等键 = (source, track, title)：
 *   - 已存在 → 更新文档侧字段（周目标、工时、为什么做、怎么做、完成标准…）
 *   - 不存在 → 新增
 *   - **active 永不回写**：有人在设置页停用过某条，重导不该把它悄悄打开；
 *     同理，库里有、catalog 里没有的条目一律不动（可能是自己加的 SOP）。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { db } from './connection.js';

const here = dirname(fileURLToPath(import.meta.url));

// 文档侧字段：重导时以 catalog 为准。title/track/source 是键，不在这里。
const SYNC_COLS = ['dept', 'freq', 'code', 'target_qty', 'unit', 'effort_h', 'metric',
  'why', 'how', 'done_when', 'subject_label', 'sort_order', 'time_hint', 'tag', 'priority'];

export function importSopCatalog({ dryRun = false, catalogPath } = {}) {
  const raw = JSON.parse(readFileSync(catalogPath || join(here, 'sopCatalog.json'), 'utf8'));
  const items = raw.items || [];
  const find = db.prepare('SELECT * FROM sop_definitions WHERE source = ? AND track = ? AND title = ?');
  const ins = db.prepare(
    `INSERT INTO sop_definitions (source, track, title, dept, freq, code, target_qty, unit, effort_h,
                                  metric, why, how, done_when, subject_label, sort_order, time_hint, tag, priority, active)
     VALUES (@source, @track, @title, @dept, @freq, @code, @target_qty, @unit, @effort_h,
             @metric, @why, @how, @done_when, @subject_label, @sort_order, @time_hint, @tag, @priority, 1)`
  );
  const upd = db.prepare(
    `UPDATE sop_definitions SET ${SYNC_COLS.map((c) => `${c} = @${c}`).join(', ')}
      WHERE id = @id`
  );

  const report = { inserted: [], updated: [], unchanged: [], orphaned: [], total: items.length };

  /* 清单里被删掉、库里还留着的条目（例如 SEO 的 S9 并进社媒之后）。
     **只报不删**：库里那条可能已经有执行流水，自动停用等于替人做决定；
     但一声不吭更糟 —— 执行人会继续看到一条已经作废的 SOP，还当它该做。 */
  const sources = [...new Set(items.map((i) => i.source).filter(Boolean))];
  if (sources.length) {
    const known = new Set(items.map((i) => `${i.source}|${i.track}|${i.title}`));
    const ph = sources.map(() => '?').join(',');
    for (const row of db.prepare(
      `SELECT id, source, track, code, title, active FROM sop_definitions WHERE source IN (${ph})`
    ).all(...sources)) {
      if (known.has(`${row.source}|${row.track}|${row.title}`)) continue;
      report.orphaned.push(`${row.track} ${row.code || ''} ${row.title}（id=${row.id}${row.active ? '，仍启用' : '，已停用'}）`);
    }
  }
  const run = db.transaction(() => {
    for (const it of items) {
      const row = { time_hint: null, tag: null, priority: null, ...it };
      const cur = find.get(row.source, row.track, row.title);
      if (!cur) {
        if (!dryRun) ins.run(row);
        report.inserted.push(`${row.track} ${row.code} ${row.title}`);
        continue;
      }
      const diff = SYNC_COLS.filter((c) => {
        const a = cur[c] ?? null, b = row[c] ?? null;
        // 数字列两边类型可能不同（库里 REAL，JSON 里 number/string）→ 按值比，不按类型比
        if (a === null || b === null) return a !== b;
        return typeof a === 'number' || typeof b === 'number' ? Number(a) !== Number(b) : String(a) !== String(b);
      });
      if (!diff.length) { report.unchanged.push(row.title); continue; }
      if (!dryRun) upd.run({ ...row, id: cur.id });
      report.updated.push(`${row.track} ${row.code} ${row.title} → ${diff.join(',')}`);
    }
  });
  run();
  return report;
}

// 直接执行时打报告。import 进来时什么都不做。
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dryRun = process.argv.includes('--dry-run');
  const r = importSopCatalog({ dryRun });
  console.log(`[sop-catalog]${dryRun ? ' (dry-run)' : ''} 共 ${r.total} 条：新增 ${r.inserted.length} / 更新 ${r.updated.length} / 无变化 ${r.unchanged.length}`);
  r.inserted.forEach((x) => console.log('  + ' + x));
  r.updated.forEach((x) => console.log('  ~ ' + x));
  if (r.orphaned.length) {
    console.log(`\n⚠ 库里有 ${r.orphaned.length} 条已经不在清单里了（本脚本不会动它们，要停用请在 设置 → SOP 里手动停用）：`);
    r.orphaned.forEach((x) => console.log('  ? ' + x));
  }
}
