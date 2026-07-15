// 前端 ES 模块入口（渐进迁移）。
// esbuild 打成 IIFE，以经典 <script src="/dist/bundle.js"> 加载 —— 保持与旧全局脚本一致的执行时机，
// 避免原生 module 的 defer 打乱 hydrate()/初始化的加载期调用。
// 各模块的公开函数在此统一挂到 window，供内联 onclick 与仍是经典脚本的文件调用（渐进绞杀期的兼容层）。
//
// 已迁移（批次1·叶子）：neg-ads / ga4-view / market-brain
// 已迁移（批次2·叶子）：kpi-view（renderKPI/loadOverview 被 index.html+kpi.js 调用）
//                       tagselect（OPT 被 keywords.js clsOf() 裸引用，必须挂 window）
// 已迁移（批次3·叶子）：google-projects（startGoogleAuth/backfillGoogle/syncGoogle 被动态生成的内联 onclick 调用）
//                       archive（loadArchive 被 index.html 路由切换 + inquiries.js 调用）
// 已迁移（批次4）：timerange（formatLocalDate/ymd 被 closed-loop.js 真实调用；withRange 被 charts.js 调用）
//                   sop（openSopModal/submitSop 内联 onclick；loadSops/loadUrgent 等被 index.html 调用）
//                   —— sop.js 已改为显式 import { formatLocalDate } from './timerange.js'，依赖不再靠全局。
import * as negAds from './neg-ads.js';
import * as ga4View from './ga4-view.js';
import * as marketBrain from './market-brain.js';
import * as kpiView from './kpi-view.js';
import * as tagSelect from './tagselect.js';
import * as googleProjects from './google-projects.js';
import * as archive from './archive.js';
import * as timeRange from './timerange.js';
import * as sop from './sop.js';
// 已迁移（批次5）：keywords（inlineConfirm 被 inquiries.js/closed-loop.js 这些仍是经典脚本的文件真实调用；
//                            addKeyword 内联 onclick；OPT 改为显式 import 自 tagselect）
//                   hermes-memory（原就是 IIFE+显式挂全局的干净写法，5 个导出正是内联 onclick 所用）
import * as keywords from './keywords.js';
import * as hermesMemory from './hermes-memory.js';

Object.assign(window, negAds, ga4View, marketBrain, kpiView, tagSelect, googleProjects, archive, timeRange, sop, keywords, hermesMemory);
