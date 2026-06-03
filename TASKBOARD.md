# 任务板

> VSCode Claude：打开后第一时间读这个文件。有 pending 就直接做，做完写结果。

---

## P0 — API 中转站

> 用 `npm start` 启动、`curl` 验证。每完成一个子任务标 [x]。

### [x] P0-1 装依赖

```bash
cd C:\Users\71517\Documents\side-hustle\toolstack
npm install uuid bcrypt cookie-session
```

---

### [x] P0-2 创建数据层

四个 JSON 文件，内容严格按下面来。

**`data/providers.json`** — 上游 AI 厂商配置：
```json
[
  {
    "id": "deepseek",
    "name": "DeepSeek",
    "endpoint": "https://api.deepseek.com/v1",
    "api_key": "",
    "models": ["deepseek-chat", "deepseek-reasoner"],
    "pricing": { "prompt": 1, "completion": 2 },
    "enabled": true
  },
  {
    "id": "qwen",
    "name": "通义千问",
    "endpoint": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "api_key": "",
    "models": ["qwen-max", "qwen-plus", "qwen-turbo"],
    "pricing": { "prompt": 2, "completion": 6 },
    "enabled": true
  },
  {
    "id": "glm",
    "name": "智谱 GLM",
    "endpoint": "https://open.bigmodel.cn/api/paas/v4",
    "api_key": "",
    "models": ["glm-4-flash", "glm-4-plus"],
    "pricing": { "prompt": 0.5, "completion": 1 },
    "enabled": true
  },
  {
    "id": "moonshot",
    "name": "月之暗面 Kimi",
    "endpoint": "https://api.moonshot.cn/v1",
    "api_key": "",
    "models": ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
    "pricing": { "prompt": 3, "completion": 12 },
    "enabled": true
  },
  {
    "id": "qianfan",
    "name": "百度文心",
    "endpoint": "https://qianfan.baidubce.com/v2",
    "api_key": "",
    "models": ["ernie-4.0-turbo-8k", "ernie-3.5-8k"],
    "pricing": { "prompt": 3, "completion": 9 },
    "enabled": false
  }
]
```

**`data/tokens.json`** — 初始空数组：
```json
[]
```

**`data/users.json`** — 管理员账户：
```json
[
  {
    "id": "admin",
    "username": "admin",
    "password_hash": "",
    "role": "admin",
    "balance": 0,
    "created_at": "2026-06-02T00:00:00.000Z"
  }
]
```

**`data/usage.json`** — 初始空数组：
```json
[]
```

---

### [x] P0-3 核心 API 端点

创建 `routes/api/v1.js`，实现 OpenAI 兼容端点。

**令牌鉴权中间件**：

```js
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', '..', 'data');

function readJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8'));
}

function writeJSON(file, data) {
  fs.writeFileSync(path.join(DATA, file), JSON.stringify(data, null, 2), 'utf8');
}

// 中间件：验证 API 令牌
function authToken(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Missing API token. Use Authorization: Bearer sk-xxx' });

  const tokens = readJSON('tokens.json');
  const t = tokens.find(t => t.token === token);
  if (!t) return res.status(401).json({ error: 'Invalid token' });

  if (t.expires_at && Date.now() >= t.expires_at) {
    return res.status(403).json({ error: 'Token expired' });
  }
  if (t.quota_used >= t.quota_total) {
    return res.status(429).json({ error: 'Quota exceeded', quota_total: t.quota_total, quota_used: t.quota_used });
  }

  req.apiToken = t;
  next();
}

module.exports = authToken;
// Also need the router below — see full file
```

**`/v1/models`**：
```js
router.get('/v1/models', (req, res) => {
  const providers = readJSON('providers.json');
  const models = [];
  providers.filter(p => p.enabled).forEach(p => {
    p.models.forEach(m => {
      models.push({ id: m, object: 'model', owned_by: p.name });
    });
  });
  res.json({ object: 'list', data: models });
});
```

**`/v1/chat/completions`**（含流式支持）：
```js
router.post('/v1/chat/completions', authToken, async (req, res) => {
  const { model, messages, stream, max_tokens, temperature } = req.body;

  if (!model || !messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'model and messages are required' });
  }

  const providers = readJSON('providers.json');
  let provider = null;
  for (const p of providers) {
    if (p.enabled && p.models.includes(model)) { provider = p; break; }
  }
  if (!provider) {
    return res.status(400).json({ error: `Unknown model: ${model}` });
  }
  if (!provider.api_key) {
    return res.status(503).json({ error: `Provider ${provider.name} not configured` });
  }

  const body = JSON.stringify({
    model, messages,
    max_tokens: max_tokens || 4096,
    temperature: temperature ?? 0.7,
    stream: stream || false
  });

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
  }

  try {
    const upstream = await fetch(`${provider.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.api_key}`
      },
      body
    });

    if (!upstream.ok) {
      const err = await upstream.text();
      res.status(upstream.status).send(err);
      return;
    }

    if (stream) {
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        res.write(value);
      }
      res.end();
    } else {
      const data = await upstream.json();
      res.json(data);
    }

    // 记录用量
    const tokens = readJSON('tokens.json');
    const ti = tokens.findIndex(t => t.token === req.apiToken.token);
    if (ti >= 0) {
      tokens[ti].quota_used += 1;
      tokens[ti].last_used = new Date().toISOString();
      writeJSON('tokens.json', tokens);
    }

    const usage = readJSON('usage.json');
    usage.push({
      token: req.apiToken.token,
      model, provider: provider.id,
      timestamp: new Date().toISOString()
    });
    writeJSON('usage.json', usage);

  } catch (e) {
    res.status(502).json({ error: 'Upstream request failed: ' + e.message });
  }
});
```

**`/models` + 完整文件结构**：
- `/v1/models` 是 GET，放 `routes/api/v1.js` 里
- 导出 router

---

### [~] P0-4 管理后台

创建 `routes/admin.js` + 6 个 EJS 模板。

**管理后台路由结构：**

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/admin` | 登录页 |
| POST | `/admin/login` | 登录验证 |
| GET | `/admin/logout` | 登出 |
| GET | `/admin/dashboard` | 总览面板 |
| GET | `/admin/providers` | 渠道列表 |
| POST | `/admin/providers` | 添加渠道 |
| PUT | `/admin/providers/:id` | 编辑渠道 |
| DELETE | `/admin/providers/:id` | 删除渠道 |
| GET | `/admin/tokens` | 令牌列表 |
| POST | `/admin/tokens` | 创建令牌 |
| PUT | `/admin/tokens/:id` | 编辑令牌 |
| DELETE | `/admin/tokens/:id` | 删除令牌 |
| GET | `/admin/users` | 用户列表 |
| POST | `/admin/users` | 添加用户 |

**管理后台认证：**
- 用 cookie-session，密钥取 `SESSION_SECRET` env（默认 `dev-secret-change-me`）
- 密码用 bcrypt 验证（`ADMIN_USER` / `ADMIN_PASS` env）
- 首次运行时自动哈希密码写入 `users.json`

**模板（全放 `views/admin/`）：**
1. `login.ejs` — 暗色登录表单
2. `dashboard.ejs` — 总览：今日调用数、活跃令牌数、模型用量图表
3. `providers.ejs` — 表格列出渠道，可启用/停用、编辑 API Key、增删
4. `tokens.ejs` — 令牌列表，可新增（输入额度、模型范围、过期时间）、暂停、删除
5. `users.ejs` — 用户列表

所有模板用 Tailwind (CDN)，暗色主题，跟主站统一。

---

### [x] P0-5 首页改造

改 `routes/index.js` → 渲染新首页。

**首页数据准备：**
```js
router.get('/', (req, res) => {
  const providers = readJSON('providers.json');
  const models = [];
  providers.filter(p => p.enabled).forEach(p => {
    p.models.forEach(m => {
      models.push({ id: m, name: p.name, pricing: p.pricing });
    });
  });

  res.render('index', { title: 'API 中转站 — 一个 Key 调用国产大模型', tools, categories, models });
});
```

改 `views/index.ejs`：
- Hero 区：标题"🚀 API 中转站"，副标题"一个 Key 调用 DeepSeek · 通义千问 · 智谱 · 月之暗面等国产大模型"，两按钮「查看定价」「快速接入」
- 接入示例卡片：curl 命令示例 + 代码高亮
- 模型定价表：模型名 | 输入/百万token | 输出/百万token | 来源
- 分割线
- 下面保留现有的工具卡片（稍小一点）
- 导航加「API 中转」「工具」「管理」三个链接

---

### [x] P0-6 app.js 集成

1. 在 `app.js` 顶部加：
```js
const session = require('cookie-session');
```

2. 在 `helmet` 和 `express.static` 之间加：
```js
app.use(session({
  name: 'admin_sess',
  keys: [process.env.SESSION_SECRET || 'dev-secret-change-me'],
  maxAge: 24 * 60 * 60 * 1000
}));
```

3. 在路由区加：
```js
app.use('/v1', require('./routes/api/v1'));
app.use('/admin', require('./routes/admin'));
```

4. CSP 放开 SSE：在 helmet CSP 的 `connectSrc` 加 `"'self'"`，`mediaSrc` 和 `styleSrc` 不变。

5. 把 `routes/index.js` 里的 `readJSON` 调用移到文件顶部，确保它能读到 providers.json。

---

## P1 — 优化

| # | 状态 | 任务 | 详情 |
|---|------|------|------|
| 8 | [ ] | P1 | API 文档页 | `/docs` 页面：完整 API 参考，模型对比，接入示例 |
| 9 | [ ] | P1 | 用量统计仪表盘 | 按天/周/月汇总，模型分布饼图 |

---

## 已完成

| # | 完成时间 | 任务 | 结果 |
|---|---------|------|------|
| 7 | 2026-06-01 | 🔥 UI 全面优化 — 设计系统统一 | 全站统一 cyan 系，SVG 图标替换 emoji |
| 6 | 2026-05-30 | 修复 Render 503 | `app.set('trust proxy', 1)` |
| 5 | 2026-05-30 | 小说预爬取存储 + 本地书架 | crawl-novel.js 断点续爬，2360 章 |
| 4 | 2026-05-30 | 修复 Cloudflare 403 | fetchHTML 改用 curl 子进程 |
| 3 | 2026-05-30 | 小说阅读器 v2 | URL 爬取 API + 前端 |
| 2 | 2026-05-30 | 新增小说阅读器 | 基础版本 |
| 1 | 2026-05-29 | 修复 hot-topics | 验证通过 |
