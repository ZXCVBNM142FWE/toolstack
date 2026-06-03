const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('tools/qrcode', { title: '在线二维码生成 - 免费二维码生成器' });
});

module.exports = router;
