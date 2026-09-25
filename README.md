# 露白足球 Open / LuBai Football

**开源、自托管的足球新闻聚合器。**  
聚合懂球帝、虎扑、官方与国际足球媒体，支持多源核实、独家首发识别、战报分栏、正文过滤、新闻聚类，以及可选的 AI 语义判断。

**在线演示：** https://football-wire-production.up.railway.app/  
**开源仓库：** https://github.com/cdgks2026-gif/football-wire-open-

Keywords: football news, football news aggregator, Chinese football news, RSSHub, Miniflux, news clustering, AI news, 足球新闻, 懂球帝, 虎扑, 开源足球。

---

## 核心能力

- **纯足球**：过滤篮球、网球、F1、彩票、博彩、比分预测等非目标内容。
- **懂球帝 / 虎扑直入**：两平台官方发布的具体足球新闻可直接进入新闻池。
- **多源核实**：同一事件来自多个独立来源时自动聚合并提高优先级。
- **独家首发**：虎扑和懂球帝都报道同一事件时，比较可靠发布时间，先发的一方进入“独家”。
- **多重分栏**：同一条新闻可以同时属于“官方 / 独家 / 多源核实 / 懂球帝 / 虎扑 / 转会专家”等栏目。
- **战报独立**：比分、全场、半场、赛果等战报只进入“战报”栏。
- **正文级过滤**：使用 Mozilla Readability 抽取原文正文，拦截商城、球衣、门票、会员促销、商品页、栏目壳页。
- **事件聚类**：标题 + RSS 摘要 + 可获取正文联合判断，不只依赖标题。
- **足球别名归一**：如 皇马→皇家马德里、巴萨→巴塞罗那、特狮→特尔施特根。
- **智能排序**：支持智能排序、最新优先、热度优先。
- **可选 AI 语义增强**：规则判断不确定时，可调用 Groq 上的 Qwen 模型做足球新闻/商业内容/事件语义键判断。
- **自托管**：Node.js + Miniflux + RSSHub + PostgreSQL + LibreTranslate。

---

## 架构

```text
RSSHub / Google News RSS / 原生 RSS / 官方 API / 直抓
                         ↓
                      Miniflux
                增量抓取 + 去重 + PostgreSQL
                         ↓
                  Readability 正文抽取
                         ↓
         硬过滤：非足球 / 博彩 / 商业 / 空壳页
                         ↓
        规则层：来源、事件、类别、别名、发布时间
                         ↓
     [可选] Groq + Qwen AI 处理规则不确定的少量条目
                         ↓
       标题 + 摘要 + 正文事件聚类 / 多源核实
                         ↓
 官方 / 独家 / 多源 / 权威 / 专家 / 懂球帝 / 虎扑 / 战报
                         ↓
                       浏览器
```

AI **不会决定新闻真假**。真实性仍然由来源、发布时间和多源交叉确认决定。AI 只处理内容分类和语义归一。

---

## 可选 AI：Groq / OpenRouter

默认不开启 AI。没有任何 AI Key 时，网站完全使用现有规则运行。

AI 层现在支持标准 OpenAI-compatible Chat Completions 接口。可直接使用 Groq，也可以使用 OpenRouter。Groq 默认模型：

```env
GROQ_MODEL=qwen/qwen3.8-27b
```

Groq：

```env
AI_PROVIDER=groq
GROQ_API_KEY=你的密钥
GROQ_MODEL=qwen/qwen3.8-27b
AI_SYNC_LIMIT=10
AI_DAILY_LIMIT=180
AI_TIMEOUT_MS=9000
```

OpenRouter 免费路由：

```env
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=你的密钥
OPENROUTER_MODEL=openrouter/free
```

也可以通过 `AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL` 接入其他 OpenAI-compatible 服务。

设计原则：

1. 同一内容使用哈希缓存，只判断一次。
2. 每轮同步限制 AI 调用数量。
3. 每日设置调用上限。
4. 彩票、明确广告、明确非足球等硬规则内容不浪费 AI 调用。
5. 只有规则不确定的条目才进入 AI。
6. API Key **绝不能提交到 GitHub**。

AI 状态：

```text
GET /api/ai-status
```

---

## 当前主要来源

来源配置位于 `config/sources.json`，包括：

- 懂球帝多个足球频道与历史补充
- 虎扑足球与直抓补充
- FIFA / UEFA / 联赛及俱乐部官方信息
- Reuters / BBC / Sky Sports / The Athletic / Guardian
- Marca / AS / L'Équipe / RMC / Kicker / Gazzetta 等
- Fabrizio Romano、David Ornstein、Di Marzio、Plettenberg、Moretto、Ben Jacobs 等转会记者
- 中文足球媒体补充检索

各来源独立分配抓取额度，避免高频源把低频权威源挤出候选池。

---

## 一键启动

要求：

- Docker
- Docker Compose

```bash
cp .env.example .env
```

至少修改：

```env
MINIFLUX_PASSWORD=换成强密码
POSTGRES_PASSWORD=换成强密码
```

然后：

```bash
docker compose up -d --build
```

打开：

- 露白足球：`http://localhost:8088`
- Miniflux：`http://localhost:8080`
- RSSHub：`http://localhost:1200`
- LibreTranslate：`http://localhost:5000`

---

## API

### 新闻

```text
GET /api/news
```

支持：

- `section=main|official|exclusive|verified|authority|expert|dqd|hupu|report`
- `tier=全部|官方|转会专家|国际媒体|中文媒体`
- `category=全部|转会|伤停|比赛|国家队|争议|趣闻|教练|球星|综合`
- `q=关键词`
- `hours=1|3|6|24`
- `sort=smart|latest|hot`
- `important=1`

### 服务状态

```text
GET /api/status
GET /api/source-health
GET /api/ai-status
POST /api/refresh
```

---

## 增加来源

编辑 `config/sources.json`。

RSSHub：

```json
{
  "name": "懂球帝·头条",
  "tier": "中文媒体",
  "group": "cn",
  "type": "rsshub",
  "path": "/dongqiudi/top_news/1",
  "enabled": true
}
```

Google News RSS：

```json
{
  "name": "某位记者",
  "tier": "转会专家",
  "group": "fast",
  "type": "gnews",
  "query": "\"Reporter Name\" football transfer when:1d",
  "enabled": true
}
```

原生 RSS：

```json
{
  "name": "某媒体",
  "tier": "国际媒体",
  "group": "media",
  "type": "rss",
  "url": "https://example.com/feed.xml",
  "enabled": true
}
```

---

## 搜索引擎收录

Web 服务默认提供：

- `/robots.txt`
- `/sitemap.xml`
- canonical URL
- description / keywords / Open Graph metadata

GitHub 仓库本身是公开仓库，因此代码可以被 GitHub 搜索、Clone 和 Fork。

---

## 隐私与密钥

不要把以下内容提交到公开仓库：

- `GROQ_API_KEY`
- 数据库密码
- Miniflux 密码
- 任何第三方 API Token

真实密钥只应该放在 `.env`、Railway Variables 或其他 Secret Manager 中。

---

## 开源与版权

露白足球 Open 使用 **MIT License**。

第三方服务和项目拥有各自许可证；详见 `THIRD_PARTY.md`。本项目不应绕过登录墙、验证码、付费墙或其他访问控制。新闻正文仅用于内部分类、去重和过滤，不在前台镜像展示。部署者应自行遵守来源网站服务条款、robots 规则及当地版权法规。

---

## Roadmap

- [x] 懂球帝 / 虎扑聚合
- [x] 多源交叉核实
- [x] 虎扑 × 懂球帝独家首发判断
- [x] Readability 正文抽取
- [x] 商业/商城/广告过滤
- [x] 战报独立栏目
- [x] 来源健康诊断
- [x] 可选 Groq + Qwen AI 裁判层
- [x] PostgreSQL / pgvector 兼容向量事件检索
- [ ] Qwen / BGE Reranker 精排
- [ ] PostgreSQL + pgvector 长期新闻语义库
- [x] SSE 实时推送
- [x] PWA


## V55 完整功能集

当前版本已经把项目从“新闻流”升级成“足球事件聚合与历史库”：

### 编辑台
设置 `ADMIN_TOKEN` 后访问：

```text
/admin?token=你的ADMIN_TOKEN
```

支持：
- 置顶 / 取消置顶
- 隐藏错误新闻
- 修改分类
- 合并两个故事
- 从错误聚类中拆出单条报道
- 查看每个来源的原始量、收录量和过滤原因

### 永久故事页与时间线

每个聚类事件都会生成稳定的 `storyId`：

```text
/story/:storyId
```

故事页展示：
- 当前最新进展
- 首次 / 最后出现时间
- 来源数量
- 新闻版本变化
- 聚类成员报道
- 可识别球队的最近比赛和下一场比赛

### PostgreSQL 历史库与 pgvector

设置 `APP_DATABASE_URL` 后自动创建 `lubai_*` 表保存故事、版本和每日快照。

如果 PostgreSQL 支持 `vector` 扩展，会自动开启 64 维向量检索；不支持时自动降级到文本历史搜索，不影响主新闻流。

Docker Compose 已改用 `pgvector/pgvector:pg17`。

### 每日足球档案

```text
/archive
/archive/YYYY-MM-DD
```

每天持续保存主要新闻快照，可回看历史日期。

### 五大联赛赛程与积分榜

```text
/matches
```

使用 OpenFootball 公共数据集，支持：
- 英超
- 西甲
- 意甲
- 德甲
- 法甲
- 赛程 / 结果
- 自动计算积分榜
- 故事页球队比赛上下文

该数据用于背景信息，不作为官方实时比分源。

### 个性化训练

浏览器本地保存：
- 关注球队 / 球员 / 关键词
- 屏蔽关键词
- 保存筛选条件
- 稍后读 / 收藏故事

不需要账号，不把个人偏好上传服务器。

### PWA 与实时流

- `manifest.webmanifest`
- Service Worker 离线壳
- 可安装到手机桌面
- `GET /api/stream` SSE 实时新闻流
- 浏览器 Notification 通知
- SSE 断线时自动保留轮询兜底

### 可选外部通知

支持环境变量：
- `NTFY_URL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

只推送高重要度、独家或多源确认事件，并带永久故事页链接。

### 每日摘要

支持：
- SMTP 邮件
- 通用 JSON Webhook

主要变量：

```env
DIGEST_HOUR=8
DIGEST_WEBHOOK_URL=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
DIGEST_TO=
```

### 双引擎正文抽取

第一层：Mozilla Readability  
第二层：Trafilatura fallback

Docker Compose 会启动独立的 `extractor` 服务。Readability 失败、正文过短或网页结构异常时才调用 Trafilatura。

### JSON / XPath 来源插件

除 RSS、RSSHub、Google News RSS 外，还支持将 JSON API 或 HTML XPath 页面自动转换为内部 RSS。

JSON 来源示意：

```json
{
  "name": "Example JSON",
  "tier": "国际媒体",
  "group": "media",
  "type": "json",
  "url": "https://example.com/api/news",
  "itemsPath": "data.items",
  "titlePath": "title",
  "urlPath": "url",
  "datePath": "publishedAt",
  "contentPath": "summary",
  "enabled": true
}
```

XPath 来源示意：

```json
{
  "name": "Example XPath",
  "tier": "国际媒体",
  "group": "media",
  "type": "xpath",
  "url": "https://example.com/football",
  "itemXpath": "//article",
  "titleXpath": "string(.//h2)",
  "urlXpath": "string(.//a[1]/@href)",
  "dateXpath": "string(.//time/@datetime)",
  "contentXpath": "string(.)",
  "enabled": true
}
```

### WebSub

来源配置提供 `websubHub` 和 `websubTopic` 时，会自动尝试订阅；回调：

```text
GET /websub/callback
POST /websub/callback
```

收到推送后立即触发刷新，而不是等待下一轮定时轮询。

### AI 标签与语义事件键

可选 Groq + Qwen 会输出：
- 是否足球新闻
- 是否具体事件
- 是否商业广告
- 分类
- 稳定 eventKey
- 球队 / 球员 / 赛事 / 动作标签

AI 不决定新闻真假；真实性仍由来源、发布时间和多源确认决定。



## V56 产品化增强

- [x] Groq / OpenRouter 双 AI Provider，支持通用 OpenAI-compatible 配置
- [x] OpenRouter `openrouter/free` 免费模型路由
- [x] 24 小时足球摘要：`/digest`
- [x] 来源健康看板：`/sources`
- [x] RSS Feed：`/feed.xml`
- [x] JSON Feed：`/feed.json`
- [x] 热门话题 API：`/api/trending`
- [x] 新闻卡片原生分享 / 复制链接
- [x] 浏览器通知点击直达故事页
- [x] 离线状态提示与 `/` 快捷搜索
- [x] 安全响应头与手动刷新频率保护
- [x] 官方源商品关键词进一步收紧
- [x] 新增中国足协、欧战官方、英超官方、ESPN FC 等来源
