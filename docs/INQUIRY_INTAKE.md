# 独立站询盘表单 → 运营后台：接入说明

> 状态：active

给负责独立站的人看。目的：访客在独立站提交询盘表单时，把「他是从哪来的」一起发到运营后台，
这样每条询盘都能查到对应的广告系列、关键词和落地页，而不是靠人事后回忆。

后台这一侧已经做好，默认关闭。站点侧需要做三件事。

## 一、站点要记住访客的来源

访客**第一次进站**时，把下面这些存起来（cookie 或 sessionStorage，建议保留 30 天），
提交表单时一起带上。必须在进站那一刻记，等到提交表单时再读，网址里的参数早就没了。

| 字段 | 从哪来 |
|---|---|
| `landing_page` | 进站第一个页面的完整网址 |
| `referrer` | 进站时的 `document.referrer` |
| `gclid` | 网址参数 `gclid`（Google Ads 自动加） |
| `utm_source` `utm_medium` `utm_campaign` `utm_term` `utm_content` | 网址里的同名参数 |
| `campaign_id` `adgroup_id` `keyword` `match_type` | 网址里的同名参数（见第二步） |

## 二、Google Ads 跟踪模板

在 Ads 账户级别（设置 → 账户设置 → 跟踪）把跟踪模板设为：

```
{lpurl}?campaign_id={campaignid}&adgroup_id={adgroupid}&keyword={keyword}&match_type={matchtype}
```

落地页本身已经带 `?` 参数的，把模板里的 `?` 换成 `&`。
这样每次广告点击，落地页网址里就直接带着系列编号和触发的关键词，第一步就能记下来。

## 三、表单提交时调用后台接口

**必须由站点的服务端调用**（表单插件的 webhook、后端钩子都可以）。
不能写在网页的 JavaScript 里：密钥一旦出现在网页源码里就等于公开，任何人都能往后台灌假线索。

```
POST https://<后台域名>/api/inquiry-intake
Content-Type: application/json
X-Intake-Token: <密钥>
```

请求体（JSON，除了 `email` 和 `message` 至少有一个之外，其余都可以不传）：

```json
{
  "submission_id": "表单系统里这次提交的编号，用于防重复",
  "submitted_at": "2026-10-10T08:30:00Z",
  "name": "Hans Meyer",
  "email": "hans@buyer.example",
  "company": "Meyer Armaturen GmbH",
  "country": "Germany",
  "product": "阀门",
  "message": "We need 500 pcs DN50 gate valves...",
  "page_url": "https://example.com/contact",
  "landing_page": "https://example.com/valves?campaign_id=123&keyword=gate%20valve",
  "referrer": "https://www.google.com/",
  "gclid": "Cj0...",
  "utm_source": "google",
  "utm_medium": "cpc",
  "utm_campaign": "valves-eu",
  "utm_term": "",
  "utm_content": "",
  "campaign_id": "123",
  "adgroup_id": "456",
  "keyword": "gate valve manufacturer",
  "match_type": "p"
}
```

响应：

| 状态码 | 含义 |
|---|---|
| `201` | 已收下，`{"ok":true,"id":12,"duplicate":false}` |
| `200` | 同一次提交重复发来（按 `submission_id` 判），没有重复建，`duplicate` 为 `true` |
| `400` | 请求体不是 JSON 对象，或 `email` 和 `message` 都没有 |
| `401` | 密钥不对，或后台还没启用这个入口 |
| `429` | 发得太快（每个 IP 每分钟 60 次） |

webhook 失败可以放心重试，带着同一个 `submission_id` 就不会产生重复线索。
请求体上限 64KB；`message` 超过 4000 字会被截断。

## 后台侧的启用

在服务器环境变量里设置 `INQUIRY_INTAKE_SECRET`（至少 24 位的随机字符串，例如 `openssl rand -hex 32`），
重启后台。不设置时这个入口对任何请求都返回 401。同一个值配到站点服务端的 `X-Intake-Token` 里。

## 进来之后发生什么

- 进来的是「线索」，出现在后台「询盘评级 → 表单线索」里，**不计入任何统计和考核**。
- 运营核对后点「转为询盘」并评级，来源（系列 / 关键词 / 落地页 / 来路）自动带入，且之后任何人都不能手改。
- 垃圾信息点「忽略」并写原因。忽略的线索连同它的来源一起保留，用来分析垃圾询盘是从哪个系列、哪个词来的。

## 数据说明

接口会保存访客填写的姓名、邮箱、公司和留言，用于让运营认出这是哪一条询盘。
这些内容只在登录后的后台内可见。站点的隐私政策里应说明询盘信息会用于业务跟进。

## 还覆盖不到的

从邮件、WhatsApp、电话直接来的询盘不经过表单，带不了任何来源参数，仍然只能人工填写来源。
后台会拿人工填的来源词去和 Ads、GSC 的点击数据对账，把对不上的标出来，但那只是提示，不是证据。
