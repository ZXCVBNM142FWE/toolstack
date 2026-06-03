const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('tools/paper-reader', {
    title: 'AI 论文助手 — 在线工具站',
  });
});

module.exports = router;
