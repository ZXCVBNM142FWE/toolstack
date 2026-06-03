const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('tools/novel-crawl', { title: '添加小说 — 在线爬取小说' });
});

module.exports = router;
