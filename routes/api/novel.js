const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { fetchHTML, resolveURL, parseIndex, getChapter, crawl, writeStatus, DATA_DIR, INDEX_FILE, findTOCContainer } = require('../../scripts/novel-lib');
const cheerio = require('cheerio');

// POST /api/novel/parse-index
router.post('/parse-index', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: '缺少 url 参数' });

    const { title, chapters } = await parseIndex(url);
    res.json({ title, author: '', chapters });
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

    const { title, content } = await getChapter(url);
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

// Background crawl jobs
let crawlJobs = new Map();
const STUCK_TIMEOUT = 5 * 60 * 1000;
const DATA_DIR_PATH = DATA_DIR;

function isCrawlStuck(slug) {
  const statusFile = path.join(DATA_DIR_PATH, slug, 'crawl-status.json');
  if (!fs.existsSync(statusFile)) return false;
  try {
    const st = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
    if (st.phase === 'done' || st.phase === 'error') return false;
    return (Date.now() - st.updatedAt) > STUCK_TIMEOUT;
  } catch (_) { return false; }
}

// POST /api/novel/crawl/start
router.post('/crawl/start', async (req, res) => {
  try {
    const { url, slug } = req.body;
    if (!url || !slug) return res.status(400).json({ error: '缺少 url 或 slug' });
    if (!/^[a-zA-Z0-9一-鿿_\-]+$/.test(slug)) return res.status(400).json({ error: 'slug 只能包含中英文、数字、下划线和横线' });

    if (crawlJobs.has(slug) && crawlJobs.get(slug).phase !== 'done' && crawlJobs.get(slug).phase !== 'error') {
      if (!isCrawlStuck(slug)) {
        return res.status(409).json({ error: '该小说正在爬取中', stuck: false });
      }
      console.log('Detected stuck crawl for ' + slug + ', allowing restart');
      crawlJobs.delete(slug);
    }

    crawlJobs.set(slug, { phase: 'queued', title: '', total: 0, done: 0, startedAt: Date.now() });

    crawl(url, slug, { concurrency: 3 }).then(() => {
      crawlJobs.set(slug, { ...crawlJobs.get(slug), phase: 'done' });
      // After crawl: git commit and push
      const { execFile } = require('child_process');
      const repoRoot = path.resolve(__dirname, '../..');
      const novelDirPath = 'data/novels/' + slug;
      execFile('git', ['-C', repoRoot, 'add', novelDirPath, 'data/novels/index.json'], (err) => {
        if (err) { console.error('git add failed:', err.message); return; }
        execFile('git', ['-C', repoRoot, 'commit', '-m', 'add novel: ' + slug], (err2) => {
          if (err2 && !err2.message.includes('nothing to commit')) { console.error('git commit failed:', err2.message); return; }
          execFile('git', ['-C', repoRoot, 'push'], (err3) => {
            if (err3) console.error('git push failed:', err3.message);
            else console.log('Git push ok for ' + slug);
          });
        });
      });
    }).catch(e => {
      console.error('Crawl error for ' + slug + ':', e.message);
      crawlJobs.set(slug, { ...crawlJobs.get(slug), phase: 'error' });
      writeStatus(slug, { phase: 'error', title: '', total: 0, done: 0, success: 0, failed: 0, error: e.message });
    });

    res.json({ ok: true, slug });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/novel/crawl/status/:slug
router.get('/crawl/status/:slug', (req, res) => {
  try {
    const statusFile = path.join(DATA_DIR_PATH, req.params.slug, 'crawl-status.json');
    if (!fs.existsSync(statusFile)) return res.json({ phase: 'unknown', title: '', total: 0, done: 0, error: null, stuck: false });
    const st = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
    st.stuck = (st.phase === 'crawling' || st.phase === 'parsing') && (Date.now() - st.updatedAt) > STUCK_TIMEOUT;
    res.json(st);
  } catch (e) {
    res.json({ phase: 'unknown', title: '', total: 0, done: 0, error: null, stuck: false });
  }
});

module.exports = router;
