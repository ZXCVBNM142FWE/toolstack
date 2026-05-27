const express = require('express');
const router = express.Router();

const tools = [
  { name: 'JSON 格式化', desc: '在线 JSON 格式化、压缩、验证工具', url: '/tools/json-formatter', icon: '{ }' },
  { name: 'Base64 编解码', desc: '在线 Base64 编码解码工具', url: '/tools/base64', icon: '64' },
  { name: '二维码生成', desc: '在线生成二维码图片', url: '/tools/qrcode', icon: 'QR' },
  { name: 'PDF 合并', desc: '在线免费 PDF 合并工具', url: '/tools/pdf-merge', icon: 'PDF' },
  { name: '正则测试', desc: '在线正则表达式测试调试工具', url: '/tools/regex-tester', icon: '.*' },
  { name: 'URL 编解码', desc: '在线 URL 编码解码工具', url: '/tools/url-codec', icon: '%' },
  { name: 'Markdown 编辑', desc: '在线 Markdown 实时预览编辑器', url: '/tools/markdown', icon: 'MD' },
  { name: '图片压缩', desc: '在线图片压缩，支持 PNG/JPEG', url: '/tools/image-compress', icon: 'IMG' },
];

router.get('/', (req, res) => {
  res.render('index', { title: '在线工具站 — 免费在线工具集合', tools });
});

module.exports = router;
