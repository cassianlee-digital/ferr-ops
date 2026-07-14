// 前端 ES 模块入口（渐进迁移 · 第一批叶子文件）。
// esbuild 打成 IIFE，以经典 <script src="/dist/bundle.js"> 加载 —— 保持与旧全局脚本一致的执行时机，
// 避免原生 module 的 defer 打乱 hydrate()/初始化的加载期调用。
// 各模块的公开函数在此统一挂到 window，供内联 onclick 与 index.html 现有代码调用（渐进绞杀期的兼容层）。
import * as negAds from './neg-ads.js';
import * as ga4View from './ga4-view.js';
import * as marketBrain from './market-brain.js';

Object.assign(window, negAds, ga4View, marketBrain);
