const express = require('express');
const router = express.Router();

const tools = [
  { name: 'JSON 格式化', desc: '在线 JSON 格式化、压缩、验证工具', url: '/tools/json-formatter', icon: '🔧' },
  { name: 'Base64 编解码', desc: '在线 Base64 编码解码工具', url: '/tools/base64', icon: '🔐' },
  { name: '二维码生成', desc: '在线生成二维码图片', url: '/tools/qrcode', icon: '📱' },
  { name: 'PDF 合并', desc: '在线免费 PDF 合并工具', url: '/tools/pdf-merge', icon: '📄' },
  { name: '正则测试', desc: '在线正则表达式测试调试工具', url: '/tools/regex-tester', icon: '🔍' },
  { name: 'URL 编解码', desc: '在线 URL 编码解码工具', url: '/tools/url-codec', icon: '🔗' },
  { name: 'Markdown 编辑', desc: '在线 Markdown 实时预览编辑器', url: '/tools/markdown', icon: '✍️' },
  { name: '图片压缩', desc: '在线图片压缩，支持 PNG/JPEG', url: '/tools/image-compress', icon: '🖼️' },
  { name: '文档格式整理', desc: '自动排版为标准学术格式，支持课程论文/毕业论文/实验报告', url: '/tools/doc-formatter', icon: '📝' },
  { name: 'PPT 生成器', desc: '28套模板可选，大纲一键生成 PPTX 文件', url: '/tools/ppt-generator', icon: '📊' },
  { name: 'API 中转站', desc: '绕过跨域限制，在线调试 API 接口', url: '/tools/api-proxy', icon: '🔌' },
];

router.get('/', (req, res) => {
  res.render('index', { title: '在线工具站 — 免费在线工具集合', tools });
});

module.exports = router;
