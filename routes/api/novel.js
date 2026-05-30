const express = require('express');
const cheerio = require('cheerio');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const DATA_DIR = path.resolve(__dirname, '../../data/novels');
const INDEX_FILE = path.join(DATA_DIR, 'index.json');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    execFile('curl', [
      '-s', '-L', '--connect-timeout', '15', '--max-time', '30',
      '-H', 'User-Agent: ' + UA,
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '-H', 'Accept-Language: zh-CN,zh;q=0.9',
      url
    ], { encoding: 'buffer', maxBuffer: 5 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        const msg = err.message || String(err);
        if (msg.includes('exit status')) {
          return reject(new Error('curl 请求失败 (HTTP ' + msg.match(/exit status (\d+)/)?.[1] + ')'));
        }
        return reject(new Error('curl 请求失败: ' + msg));
      }
      const buf = Buffer.from(stdout);
      let html = new TextDecoder('utf-8').decode(buf);
      // 检测 UTF-8 解码后是否存在大量乱码字符（说明实际是 GBK）
      if (html.includes('�') && html.length > 100) {
        try { html = new TextDecoder('gbk').decode(buf); } catch (e) { /* keep utf-8 */ }
      }
      resolve(html);
    });
  });
}

function resolveURL(base, href) {
  try {
    return new URL(href, base).href;
  } catch {
    // remove anchor, resolve relative
    const clean = href.split('#')[0];
    if (clean.startsWith('/')) {
      const u = new URL(base);
      return u.origin + clean;
    }
    // relative to directory
    const u = new URL(base);
    const parts = u.pathname.split('/');
    parts.pop(); // remove last segment (the file)
    return u.origin + parts.join('/') + '/' + clean.replace(/^\.\//, '');
  }
}

// POST /api/novel/parse-index
router.post('/parse-index', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: '缺少 url 参数' });

    const html = await fetchHTML(url);
    const $ = cheerio.load(html);

    const title = $('title').first().text().trim() || $('h1').first().text().trim() || '未知小说';
    const author = '';

    const chapters = [];
    // 常见章节列表容器
    const selectors = ['#list', '#at', '#chapterlist', '.chapterlist', '.chapter-list', '#chapters', '.catalog', '#catalog', 'dl', 'table#at'];
    let foundContainer = null;
    for (const sel of selectors) {
      const el = $(sel).first();
      if (el.length && el.find('a').length >= 5) {
        foundContainer = el;
        break;
      }
    }

    if (!foundContainer) {
      // fallback: all links on page that look like chapter links
      $('a').each((i, a) => {
        const href = $(a).attr('href');
        const text = $(a).text().trim();
        if (href && text && text.length > 1 && text.length < 80) {
          const fullURL = resolveURL(url, href);
          chapters.push({ title: text, url: fullURL });
        }
      });
    } else {
      foundContainer.find('a').each((i, a) => {
        const href = $(a).attr('href');
        const text = $(a).text().trim();
        if (href && text && text.length > 1) {
          const fullURL = resolveURL(url, href);
          chapters.push({ title: text, url: fullURL });
        }
      });
    }

    // deduplicate by url
    const seen = new Set();
    const unique = chapters.filter(ch => {
      if (seen.has(ch.url)) return false;
      seen.add(ch.url);
      return true;
    });

    res.json({ title: title.replace(/^.*?[_—\-]\s*/, ''), author, chapters: unique });
  } catch (e) {
    console.error('parse-index error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/novel/get-chapter
router.post('/get-chapter', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: '缺少 url 参数' });

    const html = await fetchHTML(url);
    const $ = cheerio.load(html);

    let title = '';
    // 尝试常见标题选择器
    for (const sel of ['h1', '.bookname h1', '#BookTitle', '.chapter-title', '.title']) {
      const t = $(sel).first().text().trim();
      if (t) { title = t; break; }
    }

    let content = '';
    // 尝试常见内容容器
    for (const sel of ['#TextContent', '#content', '#BookText', '#chaptercontent', '#htmlContent', '.content', '.chapter-content', '#contents', '.txt', '#articlecontent']) {
      const c = $(sel).first();
      if (c.length) {
        // 移除 script/style/广告
        c.find('script, style, .ads, [class*="ad"], [id*="ad"], .banner, ins, iframe').remove();
        content = c.html() || c.text();
        break;
      }
    }

    if (!content) {
      // fallback: grab body text
      $('script, style, header, footer, nav, .header, .footer, .nav, .ads').remove();
      content = $('body').html() || '';
    }

    // 清理 HTML → 纯文本
    content = content
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<p[^>]*>/gi, '')
      .replace(/<div[^>]*>/gi, '\n')
      .replace(/<\/div>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&gt;/gi, '>')
      .replace(/&lt;/gi, '<')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!title) {
      title = content.split('\n')[0]?.trim()?.slice(0, 40) || '未知章节';
    }

    res.json({ title, content });
  } catch (e) {
    console.error('get-chapter error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/novel/shelf
router.get('/shelf', (req, res) => {
  try {
    if (!fs.existsSync(INDEX_FILE)) return res.json({ books: [] });
    const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
    res.json({ books: Object.values(index) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/novel/local/:slug/meta
router.get('/local/:slug/meta', (req, res) => {
  try {
    const metaFile = path.join(DATA_DIR, req.params.slug, 'meta.json');
    if (!fs.existsSync(metaFile)) return res.status(404).json({ error: '未找到该小说' });
    res.json(JSON.parse(fs.readFileSync(metaFile, 'utf-8')));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/novel/local/:slug/:chapterFile
router.get('/local/:slug/:chapterFile', (req, res) => {
  try {
    const chapFile = path.join(DATA_DIR, req.params.slug, req.params.chapterFile);
    if (!fs.existsSync(chapFile)) return res.status(404).json({ error: '章节未找到' });
    res.json(JSON.parse(fs.readFileSync(chapFile, 'utf-8')));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
