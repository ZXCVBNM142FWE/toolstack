const express = require('express');
const path = require('path');
require('dotenv').config();
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('cookie-session');

const app = express();
const PORT = process.env.PORT || 3000;

// ensure data directory exists + seed defaults
const fs = require('fs');
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const SEEDS = {
  'providers.json': [
    { id: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', api_key: '', models: ['deepseek-chat','deepseek-reasoner','deepseek-v3-0324','deepseek-r1-0528'], pricing: { prompt: 1, completion: 2 }, weight: 10, priority: 1, timeout: 60000, enabled: true, features: { web_search: true, thinking: true } },
    { id: 'qwen', name: '通义千问', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', api_key: '', models: ['qwen-max','qwen-plus','qwen-turbo','qwen3-235b-a22b','qwen-coder-plus'], pricing: { prompt: 2, completion: 6 }, weight: 10, priority: 2, timeout: 60000, enabled: true, features: { web_search: false, thinking: true } },
    { id: 'glm', name: '智谱 GLM', endpoint: 'https://open.bigmodel.cn/api/paas/v4', api_key: '', models: ['glm-4-flash','glm-4-plus','glm-4-air','glm-4-long'], pricing: { prompt: 0.5, completion: 1 }, weight: 8, priority: 3, timeout: 60000, enabled: true, features: { web_search: true, thinking: false } },
    { id: 'moonshot', name: '月之暗面 Kimi', endpoint: 'https://api.moonshot.cn/v1', api_key: '', models: ['moonshot-v1-8k','moonshot-v1-32k','moonshot-v1-128k'], pricing: { prompt: 3, completion: 12 }, weight: 8, priority: 4, timeout: 60000, enabled: true, features: { web_search: true, thinking: false } },
    { id: 'qianfan', name: '百度文心', endpoint: 'https://qianfan.baidubce.com/v2', api_key: '', models: ['ernie-4.0-turbo-8k','ernie-3.5-8k'], pricing: { prompt: 3, completion: 9 }, weight: 5, priority: 5, timeout: 60000, enabled: false, features: { web_search: false, thinking: false } },
    { id: 'grok', name: 'xAI Grok', endpoint: 'https://api.x.ai/v1', api_key: '', models: ['grok-3','grok-2'], pricing: { prompt: 15, completion: 50 }, weight: 5, priority: 6, timeout: 90000, enabled: false, features: { web_search: true, thinking: true } },
    { id: 'openrouter', name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1', api_key: '', models: ['openai/gpt-5','anthropic/claude-sonnet-4-6','google/gemini-2.5-pro'], pricing: { prompt: 10, completion: 30 }, weight: 5, priority: 7, timeout: 90000, enabled: false, features: { web_search: false, thinking: false } },
    { id: 'doubao', name: '字节豆包', endpoint: 'https://ark.cn-beijing.volces.com/api/v3', api_key: '', models: ['doubao-1.5-pro-256k','doubao-1.5-thinking-pro','doubao-1.5-lite-32k','doubao-1.5-vision-pro'], pricing: { prompt: 0.8, completion: 2 }, weight: 8, priority: 8, timeout: 60000, enabled: false, features: { web_search: true, thinking: true } },
    { id: 'minimax', name: 'MiniMax', endpoint: 'https://api.minimax.chat/v1', api_key: '', models: ['MiniMax-M2','MiniMax-M1','abab7-chat'], pricing: { prompt: 1, completion: 5 }, weight: 7, priority: 9, timeout: 60000, enabled: false, features: { web_search: false, thinking: false } },
    { id: 'yi', name: '零一万物 Yi', endpoint: 'https://api.lingyiwanwu.com/v1', api_key: '', models: ['yi-lightning','yi-large','yi-medium','yi-vision'], pricing: { prompt: 1, completion: 3 }, weight: 7, priority: 10, timeout: 60000, enabled: false, features: { web_search: false, thinking: false } },
    { id: 'spark', name: '讯飞星火', endpoint: 'https://spark-api-open.xf-yun.com/v1', api_key: '', models: ['spark-4.0-ultra','spark-lite','spark-pro'], pricing: { prompt: 2, completion: 8 }, weight: 6, priority: 11, timeout: 60000, enabled: false, features: { web_search: false, thinking: false } },
    { id: 'anthropic', name: 'Anthropic Claude', endpoint: 'https://api.anthropic.com/v1', api_key: '', models: ['claude-sonnet-4-6','claude-opus-4-7','claude-haiku-4-5'], pricing: { prompt: 15, completion: 75 }, weight: 5, priority: 12, timeout: 120000, enabled: false, features: { web_search: false, thinking: true } },
    { id: 'gemini', name: 'Google Gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai', api_key: '', models: ['gemini-2.5-pro','gemini-2.5-flash','gemini-2.0-flash'], pricing: { prompt: 2.5, completion: 10 }, weight: 7, priority: 13, timeout: 90000, enabled: false, features: { web_search: true, thinking: true } },
  ],
  'tokens.json': [],
  'usage.json': [],
  'users.json': [
    { id: 'admin-001', username: 'admin', password: '$2b$10$PLACEHOLDER', role: 'admin', balance: 0, daily_limit: 0, created_at: '2025-01-01T00:00:00.000Z' },
  ],
};

for (const [file, data] of Object.entries(SEEDS)) {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
    console.log(`  📦 seeded ${file}`);
  }
}

process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
});

app.set('view engine', 'ejs');
app.set('trust proxy', 1);
app.set('views', path.join(__dirname, 'views'));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdn.tailwindcss.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'"],
    },
  },
}));
app.use(session({
  name: 'admin_sess',
  keys: [process.env.SESSION_SECRET || 'dev-secret-change-me'],
  maxAge: 7 * 24 * 60 * 60 * 1000
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const orig = res.send;
  res.send = function (body) {
    const ct = res.get('Content-Type') || '';
    if ((ct.startsWith('text/html') || !ct) && !ct.includes('charset')) {
      res.set('Content-Type', 'text/html; charset=utf-8');
    }
    return orig.call(this, body);
  };
  next();
});

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: '请求太频繁，请稍后再试',
});
app.use(limiter);

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.use('/', require('./routes/index'));
app.use('/models', require('./routes/models'));
app.use('/docs', require('./routes/docs'));
app.use('/chat', require('./routes/chat'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/', require('./routes/auth'));
app.use('/tools/json-formatter', require('./routes/tools/json-formatter'));
app.use('/tools/base64', require('./routes/tools/base64'));
app.use('/tools/qrcode', require('./routes/tools/qrcode'));

try {
  app.use('/tools/pdf-merge', require('./routes/tools/pdf-merge'));
} catch (e) {
  console.error('pdf-merge 加载失败:', e.message);
}

app.use('/tools/regex-tester', require('./routes/tools/regex-tester'));
app.use('/tools/url-codec', require('./routes/tools/url-codec'));
app.use('/tools/markdown', require('./routes/tools/markdown'));

try {
  app.use('/tools/image-compress', require('./routes/tools/image-compress'));
} catch (e) {
  console.error('image-compress 加载失败:', e.message);
}

app.use('/tools/doc-formatter', require('./routes/tools/doc-formatter'));
app.use('/tools/ppt-generator', require('./routes/tools/ppt-generator'));
const hotTopics = require('./routes/tools/hot-topics');
app.use('/tools/novel-reader', require('./routes/tools/novel-reader'));
app.use('/tools/novel-crawl', require('./routes/tools/novel-crawl'));
app.use('/tools/paper-reader', require('./routes/tools/paper-reader'));
app.use('/tools/ai-chat', require('./routes/tools/ai-chat'));
app.use('/api/novel', require('./routes/api/novel'));
app.use('/api/paper', require('./routes/api/paper'));
app.use('/v1', require('./routes/api/v1'));
app.use('/admin', require('./routes/admin'));
app.use('/tools/hot-topics', hotTopics.pageRouter);
app.use('/api/hot-topics', hotTopics.apiRouter);
app.use('/', require('./routes/sitemap'));
app.use('/', require('./routes/robots'));

app.use((req, res) => {
  res.status(404).send('404 Not Found');
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Toolstack running on 0.0.0.0:${PORT}`);
  console.log(`Env: PORT=${process.env.PORT}, NODE_ENV=${process.env.NODE_ENV}`);
});

server.on('error', (err) => {
  console.error('Server error:', err.message);
  process.exit(1);
});
