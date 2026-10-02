# 京城大师成都公开赛 · 狼人杀规则库

第一季执行手册中的 9 个比赛版型、30 条赛事规则、18 个赛事角色，与 werewolves.games 的 26 个参考版型、41 个参考角色、28 条手册问答和 36 条术语。赛事手册口径与参考内容分别标注；未明确的裁定与参考来源冲突不自行补为赛事规则。

提供全库搜索、分类筛选、角色与版型关联、详情深链接，以及手册 PDF 页码链接。支持手机浏览。

## 运行

Node.js 22 及以上版本。规则数据由站点运行环境提供，手册与封面保存在站点的独立数据库表中；源码仓库不包含这些文件或完整规则正文。

```sh
npm ci
npm run check
npm start
```

默认端口 `8088`，部署时遵循环境变量 `PORT`。`/healthz` 与 `/api/status` 返回健康状态。浏览器访问首页即可使用规则库。

## 内容维护

- `RULEBOOK_DATA_BROTLI_BASE64`：运行环境提供的压缩规则数据。
- `RULEBOOK_ASSET_DATABASE_URL`：独立资源表的数据库连接，由部署环境的服务引用提供。
- `RULEBOOK_ASSET_UPLOAD_TOKEN`：资源上传的部署凭证；不进入源码。
- `public/load-rulebook.js`：从本站接口读取规则，再启动查阅界面。
- `public/app.js`：检索、分类、详情与深链接。
- `public/styles.css`：桌面和移动端布局。
- `/season-one-manual.pdf`：用户提供的 37 页第一季手册阅读副本，由本站资源表读取。
- `/manual-brand.png`：手册封面中的赛事标识，由本站资源表读取。

原站的新闻页面、采集逻辑、翻译与新闻接口已经移除。新服务只读写 `cm_rulebook_assets` 资源表，不运行抓取任务；旧文章路径跳转到规则库首页，已停用接口返回 410。`public/sw.js` 负责退役旧浏览器缓存。

## Railway

沿用现有服务和域名 `https://football-wire-production.up.railway.app/`，Dockerfile 直接运行 Node 服务。健康检查使用 `/healthz`。连接原站已有的 PostgreSQL 保存资源，无需新闻提取器。历史源码保留在 Git 提交历史中。

赛事规则以用户提供的执行手册为依据，参考版型链接回 https://werewolves.games/ 。本站不代替赛事主裁判的正式裁定。
