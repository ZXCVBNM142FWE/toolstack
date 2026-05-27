const express = require('express');
const router = express.Router();

const tools = [
  'json-formatter', 'base64', 'qrcode', 'pdf-merge',
  'regex-tester', 'url-codec', 'markdown', 'image-compress', 'doc-formatter',
];

router.get('/sitemap.xml', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const baseUrl = process.env.SITE_URL || 'https://ijuhe.top';

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  xml += '  <url>\n';
  xml += `    <loc>${baseUrl}/</loc>\n`;
  xml += `    <lastmod>${today}</lastmod>\n`;
  xml += '    <changefreq>weekly</changefreq>\n';
  xml += '  </url>\n';

  tools.forEach(slug => {
    xml += '  <url>\n';
    xml += `    <loc>${baseUrl}/tools/${slug}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += '    <changefreq>weekly</changefreq>\n';
    xml += '  </url>\n';
  });

  xml += '</urlset>';

  res.setHeader('Content-Type', 'application/xml');
  res.send(xml);
});

module.exports = router;
