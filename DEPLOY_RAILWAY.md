# Railway 部署

Football Wire 在 Railway 中拆成 4 个服务：

1. **football-wire** — 本仓库的 Node.js 服务
2. **miniflux** — `miniflux/miniflux:latest`
3. **rsshub** — `ghcr.io/diygod/rsshub:chromium-bundled`
4. **libretranslate** — `libretranslate/libretranslate:latest`
5. **PostgreSQL** — Railway 托管 PostgreSQL

## 服务间地址

Railway 项目内部通过私有网络互通：

- Miniflux: `http://miniflux.railway.internal:8080`
- RSSHub: `http://rsshub.railway.internal:1200`
- LibreTranslate: `http://libretranslate.railway.internal:5000`

## football-wire 环境变量

```env
MINIFLUX_URL=http://miniflux.railway.internal:8080
RSSHUB_URL=http://rsshub.railway.internal:1200
LIBRETRANSLATE_URL=http://libretranslate.railway.internal:5000
MINIFLUX_USERNAME=admin
MINIFLUX_PASSWORD=<强密码>
REFRESH_FAST_SECONDS=60
REFRESH_OFFICIAL_SECONDS=120
REFRESH_MEDIA_SECONDS=180
REFRESH_CN_SECONDS=300
MAX_VISIBLE=250
ENTRY_DAYS=5
```

不要手工固定 `PORT`，Railway 会自动注入。

## Miniflux

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
RUN_MIGRATIONS=1
CREATE_ADMIN=1
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<与上面相同的强密码>
POLLING_FREQUENCY=5
SCHEDULER_ROUND_ROBIN_MIN_INTERVAL=5
BATCH_SIZE=200
WORKER_POOL_SIZE=16
FETCHER_ALLOW_PRIVATE_NETWORKS=1
FORCE_REFRESH_INTERVAL=1
```

## RSSHub

```env
CACHE_TYPE=memory
CACHE_EXPIRE=300
CACHE_CONTENT_EXPIRE=600
```

## LibreTranslate

```env
LT_UPDATE_MODELS=true
LT_LOAD_ONLY=en,zh,es,fr,de,it,pt
```

## 公网

只有 `football-wire` 需要生成 Public Domain。
Miniflux、RSSHub、LibreTranslate 和 PostgreSQL 默认只需要私有网络访问。
