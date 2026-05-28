const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.use('/', require('./routes/index'));
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
app.use('/tools/api-proxy', require('./routes/tools/api-proxy'));

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
