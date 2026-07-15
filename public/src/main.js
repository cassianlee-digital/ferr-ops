// 前端 ES 模块入口（渐进迁移）。
// esbuild 打成 IIFE，以经典 <script src="/dist/bundle.js"> 加载 —— 保持与旧全局脚本一致的执行时机，
// 避免原生 module 的 defer 打乱 hydrate()/初始化的加载期调用。
// 各模块的公开函数在此统一挂到 window，供内联 onclick 与仍是经典脚本的文件调用（渐进绞杀期的兼容层）。
//
// 已迁移（批次1·叶子）：neg-ads / ga4-view / market-brain
// 已迁移（批次2·叶子）：kpi-view（renderKPI/loadOverview 被 index.html+kpi.js 调用）
//                       tagselect（OPT 被 keywords.js clsOf() 裸引用，必须挂 window）
import * as negAds from './neg-ads.js';
import * as ga4View from './ga4-view.js';
import * as marketBrain from './market-brain.js';
import * as kpiView from './kpi-view.js';
import * as tagSelect from './tagselect.js';

Object.assign(window, negAds, ga4View, marketBrain, kpiView, tagSelect);
