# 京城大师成都公开赛 · 狼人杀规则库

规则库以《京城大师成都公开赛第一季执行手册》为唯一赛事依据，保留 9 个正式比赛版型、30 条赛事规则、18 个正式赛事角色和 28 条手册判例问答。外来拓展版型、外来角色、来源对比与重复条目不进入展示或搜索。

提供单输入框相关性搜索、分类查阅、角色与版型关联、详情深链接，以及手册 PDF 页码链接。搜索支持角色名、关键词和整句问题，不要求所有关键词同时命中，并按相关程度排序去重。支持手机浏览。

## 运行

Node.js 22 及以上版本。规则数据由站点运行环境提供，手册与封面保存在项目的私有文件存储中；源码仓库不包含这些文件或完整规则正文。

```sh
npm ci
npm run check
npm start
```

默认端口 `8088`，部署时遵循环境变量 `PORT`。`/healthz` 与 `/api/status` 返回健康状态。浏览器访问首页即可使用规则库。

## 内容维护

- `RULEBOOK_DATA_BROTLI_BASE64`：运行环境提供的压缩规则数据。
- `RULEBOOK_S3_BUCKET`、`RULEBOOK_S3_ENDPOINT`、`RULEBOOK_S3_REGION`：项目私有文件存储的连接配置。
- `RULEBOOK_S3_ACCESS_KEY_ID`、`RULEBOOK_S3_SECRET_ACCESS_KEY`：由部署环境的资源引用提供，不进入源码。
- `RULEBOOK_ASSET_UPLOAD_TOKEN`：资源上传的部署凭证；不进入源码。
- `public/load-rulebook.js`：从本站接口读取规则，再启动查阅界面。
- `public/app.js`：检索、分类、详情与深链接。
- `public/styles.css`：桌面和移动端布局。
- `/season-one-manual.pdf`：用户提供的 37 页第一季手册阅读副本，由本站文件存储读取。
- `/manual-brand.png`：手册封面中的赛事标识，由本站文件存储读取。

## Railway

Dockerfile 直接运行 Node 服务，健康检查使用 `/healthz`。手册与封面通过同项目的私有 S3 文件存储提供。部署域名使用成都公开赛英文品牌命名；赛事规则以用户提供的第一季执行手册为准。
