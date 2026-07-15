// 通用「按白名单部分更新」helper：消除各仓库里重复的
//   const keys = Object.keys(fields).filter(k => allowed.includes(k));
//   db.prepare(`UPDATE <t> SET col=@col,... WHERE id=@id`).run({...fields, id})
// 样板。列名只来自调用方传入的 allowed 白名单（杜绝列名注入）；table 为各仓库硬编码常量。
//
// 类型闸门（2026-07-15 加）：白名单只管「能写哪些列」，不管「写进去的值是什么」。
// 实测缺口：PATCH {due_date: 99999999} → SQLite 的 TEXT 亲和性静默存成字符串 "99999999.0"，
// 这个垃圾日期会流进 `date BETWEEN` 区间统计和 aiContext，最后变成一条「有数据依据」的 AI 建议；
// 而 {title:{...}} / {urgent:true} 这类 better-sqlite3 绑不了的值会抛错 → 全局处理器回 500，
// 客户端传错类型却显示成服务端故障。两者都由下面的 checkValue 拦成 400。
//
// 列类型不写死在这里，也不要各仓库再维护一份：直接问数据库（PRAGMA），
// 表定义就是唯一真相，schema 与表结构不可能漂移。updateById 每请求只调一次，PRAGMA 开销可忽略，故不缓存。
import { db } from './connection.js';

// 抛给 Fastify 全局错误处理器（index.js：statusCode<500 原样回传）→ 客户端拿到 400 + 原因。
function badValue(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function describe(v) {
  if (v === undefined) return 'undefined';
  if (Array.isArray(v)) return '数组';
  return typeof v === 'object' ? '对象' : `${typeof v}(${JSON.stringify(v)})`;
}

// SQLite 声明类型 → 是否数字列（含 INTEGER / REAL / NUMERIC 等亲和性写法）
const isNumericType = (t) => /INT|REAL|FLOA|DOUB|NUM|DEC/.test(t);

// 校验并归一单个值；不合法则抛 400。null = 显式清空，任何列都允许。
function checkValue(column, declaredType, value) {
  if (value === null) return null;
  if (isNumericType(declaredType)) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    // 数字字符串放行（表单/查询串常见），归一成数字入库，避免 "1" / 1 两种写法混存
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
    throw badValue(`字段 ${column} 需要数字，收到 ${describe(value)}`);
  }
  if (typeof value === 'string') return value;
  throw badValue(`字段 ${column} 需要字符串，收到 ${describe(value)}`);
}

// 过滤 fields → 执行 `UPDATE <table> SET col=@col,... WHERE id=@id`。
// 无可更新字段时不执行、返回 0（调用方通常随后 return get(id)）。返回受影响行数。
// 白名单外的字段静默忽略（防越权写）；白名单内但类型不对的字段抛 400（防脏数据静默落库）。
export function updateById(table, id, fields, allowed) {
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (!keys.length) return 0;

  const types = new Map(
    db.prepare(`PRAGMA table_info(${table})`).all().map((c) => [c.name, String(c.type || '').toUpperCase()]),
  );
  const values = {};
  for (const k of keys) {
    // 白名单写了表上不存在的列 = 代码 bug，不是客户端的错：让它以 500 炸出来，别伪装成 400
    if (!types.has(k)) throw new Error(`updateById: 表 ${table} 无列 ${k}（allowed 白名单与表结构不符）`);
    values[k] = checkValue(k, types.get(k), fields[k]);
  }

  const set = keys.map((k) => `${k}=@${k}`).join(', ');
  return db.prepare(`UPDATE ${table} SET ${set} WHERE id=@id`).run({ ...values, id }).changes;
}
