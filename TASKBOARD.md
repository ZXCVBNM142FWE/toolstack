# 任务板

> VSCode Claude：打开后第一时间读这个文件。有 pending 就直接做，做完写结果。

---

## 任务

| # | 状态 | 优先级 | 任务 | 详情 |
|---|------|--------|------|------|
| 6 | [ ] | P0 | 修复 Render 503 — express-rate-limit trust proxy | 见下方 |
| 4 | [x] | P0 | 小说预爬取存储 + 本地书架 | 见下方 |

### 需求：修复 Render 503 — express-rate-limit trust proxy

**问题**：Render 代理设置了 `X-Forwarded-For` header，但 express-rate-limit 默认不信任代理，所有请求抛 `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` 返回 503。

**修法**：在 `app.js` 中加一行：

```js
app.set('trust proxy', 1);
```

加在 `app.set('view engine', 'ejs')` 下面（约第 17 行）。

一行搞定，改完推上去等 Render 重新部署就行。

---

### 需求：把整本小说爬到工具本地存储

**爬取速度：10 路并发 ~8章/秒，2360 章约 5 分钟**

#### 存储结构
`data/novels/<slug>/`
```
data/novels/
  index.json              ← 书架索引
  蛊真人/
    meta.json             ← [{index, title, file}]
    0001.json ~ 2600.json  ← 每章 {title, content}
```

#### 1. 新建 `scripts/crawl-novel.js`

```bash
node scripts/crawl-novel.js <index-url> <slug> [concurrency]
```

- **并发控制**：默认 10 路并发，Promise.all 批量处理
- **断点续爬**：跳过已存在的章节文件
- **进度条**：每 50 章打印一次 `[150/2360] 6.3% 速度: 8.2章/秒 剩余: 4.5分钟`
- **重试**：失败章节自动重试 2 次
- **用 curl 子进程**（同 `routes/api/novel.js` 的 fetchHTML 方式）

#### 2. 后端 API（`routes/api/novel.js` 新增）

- `GET /api/novel/shelf` → 读 `data/novels/index.json`
- `GET /api/novel/local/:slug/meta` → 读 `章节索引`
- `GET /api/novel/local/:slug/:file` → 读 `章节内容`

#### 3. 前端：加「书架」tab

- 书架 tab 列出现有小说
- 点击进入阅读，侧栏章节列表，复用现有阅读区

#### 4. 执行爬取

```bash
node scripts/crawl-novel.js http://www.leshugu.info/html/0/626/ 蛊真人
```

#### 5. 修改 `app.js` 注册新路由

---

## 已完成

| # | 完成时间 | 任务 | 结果 |
|---|---------|------|------|
| 6 | 2026-05-30 | 修复 Render 503 | 加 `app.set('trust proxy', 1)` 在 rate-limit 之前，信任 Render 代理的 X-Forwarded-For |
| 5 | 2026-05-30 | 小说预爬取存储 + 本地书架 | crawl-novel.js 断点续爬完成，2360 章全部缓存，API+前端就绪 |
| 4 | 2026-05-30 | 修复 Cloudflare 403 | fetchHTML 改用 curl 子进程 |
| 3 | 2026-05-30 | 小说阅读器 v2 | URL 爬取 API + 前端 |
| 2 | 2026-05-30 | 新增小说阅读器 | 基础版本 |
| 1 | 2026-05-29 | 修复 hot-topics | 验证通过 |
