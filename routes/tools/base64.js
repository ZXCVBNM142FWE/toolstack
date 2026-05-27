const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('tools/base64', { title: '在线 Base64 编解码 - 免费 Base64 编码解码工具' });
});

module.exports = router;
