const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('tools/regex-tester', { title: '在线正则表达式测试 - 免费正则调试工具' });
});

module.exports = router;
