const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('tools/markdown', { title: '在线 Markdown 编辑器 - 免费 Markdown 编辑预览工具' });
});

module.exports = router;
