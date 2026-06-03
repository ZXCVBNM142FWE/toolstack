const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('tools/url-codec', { title: '在线 URL 编解码 - 免费 URL 编码解码工具' });
});

module.exports = router;
