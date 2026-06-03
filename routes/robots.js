const express = require('express');
const router = express.Router();

router.get('/robots.txt', (req, res) => {
  const baseUrl = process.env.SITE_URL || 'https://ijuhe.top';
  const txt = `User-agent: *
Allow: /
Sitemap: ${baseUrl}/sitemap.xml
`;

  res.setHeader('Content-Type', 'text/plain');
  res.send(txt);
});

module.exports = router;
