// 前端 ES 模块入口（渐进迁移）。
// esbuild 打成 IIFE，以经典 <script src="/dist/bundle.js"> 加载 —— 保持与旧全局脚本一致的执行时机，
// 避免原生 module 的 defer 打乱 hydrate()/初始化的加载期调用。
// 各模块的公开函数在此统一挂到 window，供静态 HTML 入口与仍是经典脚本的文件调用（渐进绞杀期的兼容层）。
//
// 已迁移（批次1·叶子）：neg-ads / ga4-view / market-brain
// 已迁移（批次2·叶子）：kpi-view（仅 renderKPI/loadOverview 保留全局兼容入口）
//                       tagselect（OPT 被 keywords.js clsOf() 裸引用，必须挂 window；询盘行辅助改为显式 import）
// 已迁移（批次3·叶子）：google-projects（接入卡使用模块内事件委托）
//                       archive（loadArchive 被 index.html 路由切换 + inquiries.js 调用）
// 已迁移（批次4）：timerange（withRange 被 charts.js 调用）
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
// 已迁移（批次5）：keywords（inlineConfirm 被多个模块显式导入；
//                            addKeyword 内联 onclick；OPT 改为显式 import 自 tagselect）
//                   hermes-memory（原就是 IIFE+显式挂全局的干净写法，5 个导出正是内联 onclick 所用）
import * as keywords from './keywords.js';
import * as hermesMemory from './hermes-memory.js';
// 已迁移（批次6）：inquiry-globe（唯一入口 renderGlobe 被 inquiries.js:32 / index.html:1109,1195 调用；
//                                其余 20 个符号无外部引用，已全部收进模块作用域）
import * as inquiryGlobe from './inquiry-globe.js';
// 新增（不是迁移，是新写的）：plan-history —— 日计划按日期回放。
// 日期条用事件委托，零内联 handler；只有 setPlanDay/planDayIsToday 需要给别的脚本用。
import * as planHistory from './plan-history.js';
// 已迁移（批次7）：weekly-review（内部 20+ 个符号收回模块，仅保留 app.js 使用的两个渲染入口）。
// sop-rate 由 weekly-review 显式 import，不再暴露 window.mountSopRate。
import * as weeklyReview from './weekly-review.js';
// 已迁移（批次8）：inquiries（内部渲染/事件辅助收回模块；仅保留 app.js 调用的 6 个兼容入口）。
// GRADE_BADGE、inqRowHtml、isUpgraded 由 archive/tagselect 显式 import，不再挂 window。
import { openInquiry, submitInquiry, submitTrack, renderInqList, refreshInqStats, renderInqFeed } from './inquiries.js';
// 已迁移（批次9）：kpi（评分状态由 kpi-view 显式 import；仅 app.js 必需入口挂 window）。
import { TOTAL, SEO, SEM, applyKpiServer, loadMetrics, loadWeeks, submitSeoWeek, submitSemWeek } from './kpi.js';
// 已迁移（批次10）：charts（时间筛选改为事件契约；模块消费者显式 import；仅 app.js 入口挂 window）。
import { charts, loadDashboardInq, loadDashboardBoards, renderInqDonuts, loadSeoBoardGsc, loadSeoBoardFull, loadSemBoardAds, loadSemBoardFull, loadAttribution, loadDiagnostics, loadDataFreshness, onSemCampaignChange, onSemAdGroupChange, resizeScatters } from './charts.js';
// 已迁移（批次11）：closed-loop（模块消费者显式 import；经典 app.js / hermes.js 仅保留必要入口）。
import { prepend, refreshTaskCols, addFixRow, addDepositRow, addPlanRow, addTestRow, addContent, openTaskModal, submitTask, submitSubtask, loadClosedLoop, loadContent } from './closed-loop.js';
// 已迁移（批次12）：ai（状态收回模块；keywords / charts 显式 import；仅 app.js 的动作分发和初始化保留兼容入口）。
import { runAiAnalysis, aiBox, loadAiAnalyses, adoptAi } from './ai.js';
// 已迁移（批次13）：通用可编辑工具 + 设置/账户逻辑。
import { bindSettings, openPwd, submitPwd } from './settings.js';
// 已迁移（批次14）：通用表格编辑、日期保存和键盘导航；模块自行幂等初始化。
import { bindTableEditor } from './table-editor.js';
// 已迁移（批次15）：SEO 机会词排名快照与趋势渲染。
import { loadRankSnapshots, snapshotRanks } from './rank-snapshots.js';

bindTableEditor();

const inquiryCompatibility={openInquiry,submitInquiry,submitTrack,renderInqList,refreshInqStats,renderInqFeed};
const kpiCompatibility={TOTAL,SEO,SEM,applyKpiServer,loadMetrics,loadWeeks,submitSeoWeek,submitSemWeek};
const chartCompatibility={charts,loadDashboardInq,loadDashboardBoards,renderInqDonuts,loadSeoBoardGsc,loadSeoBoardFull,loadSemBoardAds,loadSemBoardFull,loadAttribution,loadDiagnostics,loadDataFreshness,onSemCampaignChange,onSemAdGroupChange,resizeScatters};
const closedLoopCompatibility={prepend,refreshTaskCols,addFixRow,addDepositRow,addPlanRow,addTestRow,addContent,openTaskModal,submitTask,submitSubtask,loadClosedLoop,loadContent};
const aiCompatibility={runAiAnalysis,aiBox,loadAiAnalyses,adoptAi};
const settingsCompatibility={bindSettings,openPwd,submitPwd};
const rankSnapshotCompatibility={loadRankSnapshots,snapshotRanks};

Object.assign(window, negAds, ga4View, marketBrain, kpiView, tagSelect, googleProjects, archive, timeRange, sop, keywords, hermesMemory, inquiryGlobe, planHistory, weeklyReview, inquiryCompatibility, kpiCompatibility, chartCompatibility, closedLoopCompatibility, aiCompatibility, settingsCompatibility, rankSnapshotCompatibility);
