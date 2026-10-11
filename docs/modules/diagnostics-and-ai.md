# 诊断引擎与 AI 分析

> 状态：active
> 守护它的测试：`server/test/ctrAnomaly.test.js`、`server/test/routes.test.js`
>
> 这里记的是**口径和踩过的坑** —— 代码里看不出来、忘了就会重犯的那些。「现在有哪些文件 / 表 / 接口」看 `docs/FACTS.md`（自动生成）。
> 2026-10-11 从原来 438 行的 `CLAUDE.md` 里按模块拆出，原文搬运，只更正了几处已核实不成立的说法。

- **诊断引擎已上线**:`/api/diagnostics`(`server/src/routes/diagnostics.js` + `googleSync.js` 规则查询)产出 5 类真实 findings——机会词(排名11-20有曝光)、关键词蚕食(同词多页)、流量衰退(当前vs上一等长窗口点击跌幅)、点击率偏低(见下)、高花费零有效(Ads cost>0 conv=0)。前端 SEO「站点机会/流量衰退/关键词蚕食」三子面板 + minitab 角标已读真实结果,随时间范围重算。
  - **点击率偏低(2026-10-11,`services/ctrAnomaly.js` 纯函数 + `gscFirstPageRows`)**:排在首页(排名 < 10.5)、区间曝光 ≥ 50,
    但点击率不到**本站同位次的词的中位数**一半、且按中位数算少拿 ≥ 3 次点击的「查询词 × 页面」。SEO「点击率偏低」子面板,可 AI 诊断 / 采纳入整改。
    **不用行业点击率曲线**(那是别人的站,拿来判自己等于编基准);**用中位数不用加权平均**(品牌词点击率极高且曝光大,加权会把正常词全判成偏低,有测试)。
    所以它说的是「在你自己的站里偏低」—— 整站标题都写得差时一条也报不出来,面板提示里写明了。
    **诚实口径**:一档里可比的词不到 5 个、或中位数是 0 → 那一档没有基准、不判;接口同时返回 `baselines`,
    面板据此区分「比过了没发现」和「可比的词太少、比不了」。**还没接进 AI 上下文**(`aiContext.js` 仍是原来四类)。
- **诊断→整改闭环已通**:三类 SEO finding 每行「采纳」按钮 → POST `/api/fixes`(source=诊断引擎,evidence 记 GSC 依据)直接入整改清单(`public/src/charts.js` `adoptFinding`)。
- `server/src/services/aiContext.js` 会拼接数据库中的 **KPI、询盘、SEO/SEM 周报、关键词**等真实上下文喂给 AI。
- **AI 上下文已含真实同步数据**:`aiContext.js buildContext` 注入 GSC/Ads 近30天汇总 + Top系列 + 机会词/蚕食/衰退/高花费零有效。SEM 看板「问题分析/优化思路/关键词排查」及所有 AI 按钮据此产出基于真实数据的分析。
- **AI 弹窗能力**:分析按 `scope_key` 持久化(`ai_analyses`);弹窗顶部**历史时间线**可点切换对比(`history_json` 快照,重跑旧结论不丢不归档),footer「重新分析」按本页最新数据重跑、「拆成整改动作」(`/api/ai/analyses/:id/actions`)把结论拆成动作逐条「采纳」入整改。`max_tokens` 默认 4000(.env 显式值会覆盖)。
- **AI 提供方可切换**:`AI_PROVIDER=openrouter`(默认)或 `anthropic`,统一经 `server/src/services/aiProvider.js`;没配密钥时相关接口回 503 并说明原因。
  (这一条 2026-10-11 之前写的是「单 provider,仅 Anthropic」—— 早就不成立,又是一条没抽验就沿用的旧记录。)
