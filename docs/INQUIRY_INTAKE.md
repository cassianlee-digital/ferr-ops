# 独立站询盘表单 → 运营后台：接入说明

> 状态：active

给负责独立站的人看。目的：访客在独立站提交询盘表单时，把「他是从哪来的」一起发到运营后台，
这样每条询盘都能查到对应的广告系列、关键词和落地页，而不是靠人事后回忆。

独立站是 **WordPress + Fluent Forms**，所以站点这一侧已经写成了一个现成的小插件，照下面五步做就行，不用写代码。
免费版的 Fluent Forms 就够，不需要 Pro。（用别的方式建站的，看最后一节的接口约定。）

## 照着做：五步

### 1. 后台生成并配置密钥（服务器上做）

生成一个随机密钥（至少 24 位），例如：

```bash
openssl rand -hex 32
```

写进服务器 `.env` 的 `INQUIRY_INTAKE_SECRET=`，然后重启后台。不设置时这个入口对任何请求都返回 401。
这个密钥下一步还要用一次，**不要发到群里、不要写进任何网页**。

### 2. 装插件（WordPress 后台）

插件在仓库的 `integrations/wordpress/ferr-intake/` 文件夹里（两个文件）。把这个文件夹打成 zip，
在 WordPress 后台「插件 → 安装插件 → 上传插件」里上传并启用。

然后编辑站点根目录的 `wp-config.php`，在 `That's all, stop editing` 那一行**之前**加两行：

```php
define('FERR_INTAKE_URL', 'https://<后台域名>/api/inquiry-intake');
define('FERR_INTAKE_TOKEN', '<第 1 步生成的密钥>');
```

没配好的时候，WordPress 后台顶部会有一条黄色提示；配好了提示就消失。

### 3. 给询盘表单加一个隐藏字段（Fluent Forms 里）

打开询盘表单的编辑器，从「高级字段」里拖一个 **Hidden Field** 进表单：

- **Name Attribute** 填 `ferr_source`（一个字都不能差）
- **Default Value** 留空

保存。有几个询盘表单就各加一次。**没有这个字段的表单不会往后台发**，所以订阅之类的表单不受影响。

### 4. 核对表单字段的名字

插件按 Fluent Forms 里各字段的 **Name Attribute** 取值，默认认这几个名字：

| 后台要的 | 表单字段的 Name Attribute |
|---|---|
| 姓名 | `names` |
| 邮箱 | `email` |
| 公司 | `company` |
| 国家 | `country` |
| 产品 | `product` |
| 留言 | `message` |

在表单编辑器里点开每个字段看一眼它的 Name Attribute。对不上的，改 `ferr-intake.php` 开头
`ferr_intake_field_map()` 里**右边**那一列（不要去改表单里已有字段的名字，会影响以前的记录）。
表单里没有的项不用管；邮箱和留言至少要有一个。

### 5. Google Ads 跟踪模板

在 Ads 账户级别（管理 → 账户设置 → 跟踪）把跟踪模板设为：

```
{lpurl}?campaign_id={campaignid}&adgroup_id={adgroupid}&keyword={keyword}&match_type={matchtype}
```

落地页本身已经带 `?` 参数的，把模板里的 `?` 换成 `&`。
这样每次广告点击，落地页网址里就直接带着系列编号和触发的关键词，插件会把它记下来。
这一步不做，表单带回来的只有落地页、来路和 `gclid`，认不出是哪个系列、哪个词。

## 验证

1. 用无痕窗口打开 `https://<独立站>/任意页面/?campaign_id=test1&keyword=test+word&utm_source=google&utm_medium=cpc`
2. 点到询盘表单所在的页面，填一条测试询盘提交（留言里写明「测试」）。
3. 登录运营后台 →「询盘评级 → 表单线索」，应该出现这一条，来源里有系列 `test1`、关键词 `test word`、落地页是第 1 步的网址。
4. 核对完点「忽略」，原因写「接入测试」。

没出现的话，看 WordPress 后台顶部有没有红色提示，它会写明原因（密钥不对 / 连不上后台 / 字段不合格）。

## 先在自己电脑上演练一遍（可选，不碰独立站）

仓库里带了一个演练页 `integrations/wordpress/local-demo/demo.php`：不装 WordPress，在本机把
「带广告参数进站 → 点到联系页 → 提交表单 → 插件发给后台」真走一遍。需要本机有 PHP，后台也在本机跑着
（仓库根目录的 `.env` 里有 `PORT` 和 `INQUIRY_INTAKE_SECRET`）。在仓库根目录运行：

```bash
php -S localhost:8787 -t integrations/wordpress integrations/wordpress/local-demo/demo.php
```

然后打开 `http://localhost:8787/valves/?campaign_id=test1&keyword=test+word&utm_source=google&utm_medium=cpc`，
页面会一步步显示：浏览器里记下了什么 → 隐藏字段里填了什么 → 插件发给后台的内容和后台的回复。
最后到本机后台的「询盘评级 → 表单线索」看这一条。

真的部分：浏览器、记来源的脚本、插件本身（原样加载）、发给后台的请求、后台。
**假的部分：WordPress 和 Fluent Forms**，所以它验不了「你的表单里各字段到底叫什么」—— 那一条只能在真站上看（第 4 步）。

## 它是怎么工作的

- **记来源**（`ferr-source.js`，每个页面加载）：访客从站外进来的那一刻，把落地页、来路、广告参数记在他自己浏览器里，保留 30 天。
  记的是**最近一次从站外进来**的那次：站内翻页、直接输网址回访不覆盖；带着新的广告参数、或者从别的网站再进来才覆盖。
- **带进表单**：页面上有 `ferr_source` 隐藏字段时，把记下的来源填进去（一段只含字母数字的编码），随表单一起提交。
- **发到后台**（`ferr-intake.php`，在服务器上）：Fluent Forms 存下一次提交后，由 WordPress 服务器带着密钥发给后台。
  密钥只在 `wp-config.php` 里，不会出现在网页源码中。
- **失败会重试**：后台连不上时，5 分钟、30 分钟、2 小时后各再试一次；带的是同一个提交编号，后台不会建出重复的线索。
  就算全部失败，询盘本身还在 Fluent Forms 的 Entries 里，不会丢；WordPress 后台顶部会显示失败原因。

为什么不用 Fluent Forms 自带的 `{get.xxx}`、`{cookie.xxx}` 默认值：网址参数只在进站那一页有，访客点到联系页再提交时早就没了；
而且那些默认值是服务器生成页面时填进去的，站点开了页面缓存的话，后来的访客可能拿到别人的来源 —— 那就成了假证据。

## 进来之后发生什么

- 进来的是「线索」，出现在后台「询盘评级 → 表单线索」里，**不计入任何统计和考核**。
- 运营核对后点「转为询盘」并评级，来源（系列 / 关键词 / 落地页 / 来路）自动带入，且之后任何人都不能手改。
- 垃圾信息点「忽略」并写原因。忽略的线索连同它的来源一起保留，用来分析垃圾询盘是从哪个系列、哪个词来的。

## 数据说明

- 后台会保存访客填写的姓名、邮箱、公司和留言，用于让运营认出这是哪一条询盘，只在登录后的后台内可见。
  站点的隐私政策里应说明询盘信息会用于业务跟进。
- 来源记录存在访客自己浏览器的本地存储里（名字 `ferr_src`），只含他进站的网址和来路，不含个人信息。
  站点有 Cookie 同意弹窗的话，把它归到「功能 / 统计」一类。

## 还覆盖不到的

- 从邮件、WhatsApp、电话直接来的询盘不经过表单，带不了任何来源参数，仍然只能人工填写来源。
  后台会拿人工填的来源词去和 Ads、GSC 的点击数据对账，把对不上的标出来，但那只是提示，不是证据。
- 访客换了设备或浏览器、清了浏览器数据、或者 30 天后才回来提交：来源只剩提交那一次的。
- 隐藏字段是访客浏览器提交上来的，懂行的人可以改它。它是「机器带回来的」，不是「不可伪造的」。

## 接口约定（用别的方式建站时参考）

**必须由站点的服务端调用**。不能写在网页的 JavaScript 里：密钥一旦出现在网页源码里就等于公开，任何人都能往后台灌假线索。

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

| 状态码 | 含义 |
|---|---|
| `201` | 已收下，`{"ok":true,"id":12,"duplicate":false}` |
| `200` | 同一次提交重复发来（按 `submission_id` 判），没有重复建，`duplicate` 为 `true` |
| `400` | 请求体不是 JSON 对象，或 `email` 和 `message` 都没有 |
| `401` | 密钥不对，或后台还没启用这个入口 |
| `429` | 发得太快（每个 IP 每分钟 60 次） |

请求体上限 64KB；`message` 超过 4000 字会被截断。
