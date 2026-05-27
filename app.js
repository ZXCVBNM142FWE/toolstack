const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

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

app.use('/', require('./routes/sitemap'));
app.use('/', require('./routes/robots'));

process.on('uncaughtException', (err) => {
  console.error('未捕获错误:', err.message);
});

app.listen(PORT, () => {
  console.log(`Toolstack running at http://localhost:${PORT}`);
});
