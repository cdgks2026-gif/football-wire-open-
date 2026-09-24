# Football Wire Open

公开开源、可自托管的全球足球中文标题快讯站。

> 全球足球资讯 → 只翻译标题 → 同事件有新进展时覆盖旧进展 → 不复制正文、不展示外链。

## 架构

```text
RSSHub / Google News RSS / 原生 RSS
              ↓
           Miniflux
 增量抓取 + HTTP 缓存 + 去重 + PostgreSQL
              ↓
      Football Wire 服务
  中文标题 + 事件合并 + 最新进展覆盖
              ↓
          浏览器页面
```

## 开源思路来源

- RSSHub：统一不同网站为标准 RSS。
- Miniflux：轻量、增量、缓存、API 驱动。
- Folo：统一低噪声信息流的产品思路。
- Huginn：事件触发和监控思路。
- LibreTranslate：自托管、零 OpenAI Token 的标题翻译。

本仓库没有直接复制这些项目源码，详见 `THIRD_PARTY.md`。

## 当前来源

默认配置 28 组来源，包括：
- 懂球帝：通过 RSSHub 当前 `/dongqiudi/top_news/:id?` 路由
- 虎扑：通过新闻搜索 RSS 补充
- 罗马诺、奥恩斯坦、迪马济奥、普莱滕贝格、莫雷托、Ben Jacobs
- FIFA、UEFA、五大联赛和多家豪门官方消息
- 路透社、天空体育、BBC、The Athletic/卫报
- Marca/AS、L'Équipe/RMC、Kicker、Gazzetta 等
- 球星和争议/趣闻补充查询

## 功能

- 只显示简体中文标题
- 外文标题只在第一次出现时翻译一次并缓存
- 同一事件自动合并
- 新进展覆盖旧进展
- 多源交叉确认计数
- 最近 1 小时筛选
- 来源/分类筛选
- 不使用 OpenAI API，不消耗 AI Token
- 新闻正文不进入前台

## 一键启动

要求：Docker + Docker Compose。

```bash
cp .env.example .env
```

先修改 `.env` 里的密码：

```env
MINIFLUX_PASSWORD=换成强密码
POSTGRES_PASSWORD=换成强密码
```

然后：

```bash
docker compose up -d --build
```

打开：
- Football Wire：`http://localhost:8088`
- Miniflux：`http://localhost:8080`
- RSSHub：`http://localhost:1200`
- LibreTranslate：`http://localhost:5000`

首次启动 LibreTranslate 可能需要下载语言模型，因此翻译服务会比其他服务晚就绪。

## 刷新策略

| 来源组 | 默认刷新 |
|---|---:|
| 转会专家/快讯 | 60 秒 |
| 官方 | 120 秒 |
| 国际媒体 | 180 秒 |
| 中文媒体 | 300 秒 |

后台每 15 秒只判断哪些来源组到期，不会重复刷新全部来源。

## 增加来源

编辑 `config/sources.json`。

RSSHub：
```json
{"name":"懂球帝·头条","tier":"中文媒体","group":"cn","type":"rsshub","path":"/dongqiudi/top_news/1","enabled":true}
```

Google News RSS：
```json
{"name":"某位记者","tier":"转会专家","group":"fast","type":"gnews","query":"\"Reporter Name\" football transfer when:1d","enabled":true}
```

原生 RSS：
```json
{"name":"某媒体","tier":"国际媒体","group":"media","type":"rss","url":"https://example.com/feed.xml","enabled":true}
```

修改后：
```bash
docker compose restart app
```

## 事件更新覆盖

例如：
```text
姆巴佩出现流感样症状，缺席法国队训练
```
之后：
```text
姆巴佩恢复法国队合练，此前流感症状已经缓解
```

会归入同一“姆巴佩 + 健康训练”事件，首页保留时间更晚的新进展。

## API

- `GET /api/news`
- `GET /api/status`
- `POST /api/refresh`

`/api/news` 支持：
- `tier=全部|官方|转会专家|国际媒体|中文媒体`
- `category=全部|转会|伤停|比赛|国家队|争议|趣闻|教练|球星|综合`
- `q=关键词`
- `hours=1`

## 开源与版权

Football Wire Open 自身使用 MIT 许可证。RSSHub/LibreTranslate 是独立 AGPL 服务，Miniflux 为 Apache-2.0。

本项目不绕过登录墙、验证码、付费墙或其他访问控制；只聚合标题、来源和时间，不镜像文章正文。部署者应自行遵守数据来源的服务条款、robots 规则及当地版权法规。

## 路线图

- [ ] 罗马诺公开 Telegram 可选直接源
- [ ] 更完整的中文译名词典
- [ ] 事件链：传闻 → 报价 → 协议 → 体检 → 官宣
- [ ] 来源可信度配置
- [ ] SSE / WebSocket 推送
- [ ] PWA
- [ ] Telegram / ntfy 推送
