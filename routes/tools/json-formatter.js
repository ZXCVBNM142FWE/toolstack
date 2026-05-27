const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('tools/json-formatter', { title: '在线 JSON 格式化 - 免费 JSON 格式化工具' });
});

module.exports = router;
