const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('tools/novel-reader', { title: '在线小说阅读器 — 免费 TXT 小说阅读工具' });
});

module.exports = router;
