const express = require('express');
const path = require('path');
require('dotenv').config();
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('cookie-session');

const app = express();
const PORT = process.env.PORT || 3000;

// ensure data directory exists
const fs = require('fs');
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

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
