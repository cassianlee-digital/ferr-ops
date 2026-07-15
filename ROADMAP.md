# ROADMAP.md — ferr-ops 开发路线

> 一次只做一个 Phase。每个 Phase 完成后验收 → commit → push → 用户部署 → 再进下一个。
> 真实状态见 `CLAUDE.md`,数据模型见 `DATA_MODEL.md`。

---

## Phase 0:项目规则与低 token 工作流  ✅(进行中)

**目标**
- 创建 `CLAUDE.md`、`DATA_MODEL.md`、`ROADMAP.md`
- 固定项目真实状态
- 降低后续 token 浪费

**验收标准**
- 三份文档存在
- 未实现接口被明确标记
- 后续任务能按阶段推进
- 不再每次全项目扫描

---

## Phase 1:数据可信度修复

**目标**
- 修复 demo 数据与真实数据混用
- 关闭 demoMode 后不显示任何假数据
- API 无数据时显示空状态
- 增加数据源状态卡
- 修复时间筛选只在前端生效的问题(统一 `start_date` / `end_date` 传后端)
- 修复高风险 `innerHTML`
- contenteditable 增加保存失败提示和回滚

**验收标准**
- 真实模式下无假数据
- API 失败不会显示假趋势
- 时间筛选真正影响后端查询
- XSS 风险明显降低
- 可编辑字段保存失败会回滚

---

## Phase 2:GSC 真实接入

**目标**
- 新增 `oauth_tokens`、`sync_runs`、`gsc_daily`
- 完成 Google OAuth 授权
- 完成 GSC Search Analytics 拉取 + 入库
- 设置页显示连接状态、最后同步时间、错误原因、重试按钮
- SEO 看板使用真实 `gsc_daily` 数据

**验收标准**
- Google OAuth 能完成授权
- 能选择或填写 `site_url`
- 能同步指定日期范围
- `gsc_daily` 有真实数据
- API 失败有具体错误
- 不使用 mock 数据冒充真实数据

---

## Phase 3:GA4 真实接入

**目标**
- 完成 GA4 Data API 授权和 property 配置
- 拉取 source/medium/campaign/country/device/landing_page
- 拉取 form_submit、download、click_email、click_whatsapp 等事件
- GA4 看板从真实数据渲染

**验收标准**
- 能配置 GA4 property ID
- 能同步真实数据
- 能看到最后同步时间
- API 失败明确提示

---

## Phase 4:Google Ads 真实接入

**目标**
- 完成 Google Ads API 配置,支持 `customer_id`
- 拉取 campaign、ad group、keyword、search term、cost、clicks、conversions
- 建立否词候选逻辑

**验收标准**
- 能同步真实搜索词数据
- 能识别高花费零有效询盘
- 能输出候选否词
- API 失败明确提示

---

## Phase 5:询盘归因与评分

**目标**
- 扩展询盘字段(见 DATA_MODEL.md)
- 询盘关联渠道、页面、关键词、广告组、搜索词、GA4 session
- 增加 `system_score` + `manual_grade`
- A/B/C 评级有原因
- C 级询盘能反推无效原因

**验收标准**
- 每条询盘能追溯来源
- 能按国家、渠道、页面、关键词、搜索词看 A/B/C
- 人工覆盖等级必须填原因

---

## Phase 6:自动诊断规则引擎

**目标**
- SEO 识别机会词、衰退页、CTR 异常、关键词蚕食
- SEM 识别高花费零有效、C 级来源、否词建议、预算转移建议
- 结果写入 `findings`
- findings 可转成 task

**验收标准**
- 每条诊断都有 `evidence_json`
- 每条建议能追溯到数据
- 可一键生成任务

---

## Phase 7:AI 结构化建议

**目标**
- AI 只基于真实数据包、findings、KPI、询盘、任务上下文生成建议
- AI 输出结构化 `recommendations`
- 不允许泛泛建议
- 可采纳、驳回、转任务、沉淀 SOP

**验收标准**
- AI 建议有证据
- 能创建 task
- 能进入复盘

> 注:AI 多 provider(Claude / OpenRouter 等自由切换)是与数据线独立的需求,可在本 Phase 或并行排期落地。

---

## Phase 8:任务、整改、复盘、SOP 闭环

**目标**
- 任务有假设、动作、负责人、检查日期、成功指标
- 复盘记录动作前后数据
- 有效经验沉淀为 SOP

**验收标准**
- 每个任务能验证结果
- 每个复盘能关联数据
- SOP 不只是文字,而是可复用规则

---

## Phase 9:前端模块化与 UI 优化

**目标**
- 拆分 `public/index.html`
- 把 CSS、JS、模块逻辑拆出去
- 降低前端维护成本
- 最后再优化视觉和交互

**验收标准**
- 不再所有逻辑塞进一个 HTML
- 后续修改只需读相关模块
- token 消耗下降

### 进度与真实状态(2026-07-15 实测)

- **CSS 拆分:已完成**。index.html 内联 `<style>` **已清零**,拆为 `base.css`/`styles.css`/`components.css`/`page-*.css`(重写工程见记忆 `css-rewrite-plan`)。
- **JS 模块化:进行中**,绞杀式,已迁 12 个模块进 `public/src/*.js`(esbuild → `dist/bundle.js`)。**确有实效**:inquiry-globe 21 个顶层符号 → 1 个导出,净减 20 个全局。
- **但这条路有地板,必须知道**:157 个内联 `onclick`/`onchange` 裸调用 **77 个全局函数名**,`onclick="foo()"` 点击时才从 `window` 查 `foo`。**迁完所有模块,这 77 个仍必须挂在 `window` 上**(`src/main.js` 的 `Object.assign(window, …)` 即此兼容层)。详见 `CLAUDE.md`「前端全局面与模块化地板」。

**下一步的选择(别默认「再迁两个模块」)**

1. **继续迁剩余模块** —— 收益真实但递减,把全局面从 ~285 压向 77 的地板。
2. **事件委托(拆地板)** —— `document` 上一个监听器 + `data-action` 属性,替掉 157 个内联 handler。**这是唯一能让全局降到 77 以下的路**,也是唯一能让「改函数名有编译期报错」的路。改动面大(157 处 + index.html),但一次性。
3. 两者可并行:迁模块时顺手把该模块相关的内联 handler 换成 `data-action`,避免二次翻工。

**建议**:新迁模块时优先做 3(边迁边换),不要迁完再回头补 —— 否则 77 个名字会随迁移不断被 `Object.assign` 重新钉死在 window 上。
