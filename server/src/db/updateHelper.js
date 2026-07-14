// 通用「按白名单部分更新」helper：消除各仓库里重复的
//   const keys = Object.keys(fields).filter(k => allowed.includes(k));
//   db.prepare(`UPDATE <t> SET col=@col,... WHERE id=@id`).run({...fields, id})
// 样板。列名只来自调用方传入的 allowed 白名单（杜绝列名注入）；table 为各仓库硬编码常量。
import { db } from './connection.js';

// 过滤 fields → 执行 `UPDATE <table> SET col=@col,... WHERE id=@id`。
// 无可更新字段时不执行、返回 0（调用方通常随后 return get(id)）。返回受影响行数。
export function updateById(table, id, fields, allowed) {
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (!keys.length) return 0;
  const set = keys.map((k) => `${k}=@${k}`).join(', ');
  return db.prepare(`UPDATE ${table} SET ${set} WHERE id=@id`).run({ ...fields, id }).changes;
}
