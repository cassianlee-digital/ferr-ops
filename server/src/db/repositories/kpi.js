// KPI 目标/实际 数据访问层。kpi_targets 是评分的权威数据源。
import { db } from '../connection.js';

export function list() {
  return db.prepare('SELECT * FROM kpi_targets ORDER BY grp, sort_order').all();
}

export function get(id) {
  return db.prepare('SELECT * FROM kpi_targets WHERE id = ?').get(id);
}

// 仅更新目标值（老板用）
export function updateTarget(id, target) {
  db.prepare('UPDATE kpi_targets SET target = ? WHERE id = ?').run(target, id);
  return get(id);
}

// 按 (grp,name) 写实际值（由周报/询盘等运营数据自动回写）
export function setActual(grp, name, value) {
  if (value == null) return;
  db.prepare('UPDATE kpi_targets SET actual = ? WHERE grp = ? AND name = ?').run(value, grp, name);
}
