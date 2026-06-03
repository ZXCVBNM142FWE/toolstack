const { execFile } = require('child_process');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const DATA_DIR = path.resolve(__dirname, '..', 'data', 'novels');
const INDEX_FILE = path.join(DATA_DIR, 'index.json');

// ── encoding ──────────────────────────────────────────────────
const ENCODINGS = ['utf-8', 'gbk', 'gb2312', 'big5'];

function decodeBuffer(buf) {
  let best = { text: '', score: Infinity };
  for (const enc of ENCODINGS) {
    try {
      const td = new TextDecoder(enc, { fatal: false });
      const text = td.decode(buf);
      // count replacement chars and unmapped chars
      const bad = (text.match(/[�￾￿]/g) || []).length;
      // also count unlikely byte sequences for CJKV
      const weird = (text.match(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g) || []).length;
      const score = bad * 10 + weird;
      if (score < best.score) best = { text, score, enc };
      if (score === 0) break; // perfect, stop
    } catch (_) {}
  }
  return best.text;
}

// ── fetch ──────────────────────────────────────────────────────
function fetchHTML(url, timeoutSec = 45) {
  return new Promise((resolve, reject) => {
    const child = execFile('curl', [
      '-s', '-L', '--connect-timeout', '15', '--max-time', String(timeoutSec),
      '-H', 'User-Agent: ' + UA,
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '-H', 'Accept-Language: zh-CN,zh;q=0.9,en;q=0.5',
      url
    ], { encoding: 'buffer', maxBuffer: 5 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(new Error('curl 请求失败: ' + (err.message || err)));
      const buf = Buffer.from(stdout);
      const html = decodeBuffer(buf);
      resolve(html);
    });
    const killTimer = setTimeout(() => { child.kill('SIGTERM'); }, (timeoutSec + 10) * 1000);
    child.on('close', () => clearTimeout(killTimer));
  });
}

// ── URL resolve ────────────────────────────────────────────────
function resolveURL(base, href) {
  try { return new URL(href, base).href; } catch {
    const clean = href.split('#')[0];
    if (clean.startsWith('/')) {
      const u = new URL(base);
      return u.origin + clean;
    }
    const u = new URL(base);
    // if base path ends with /, treat as directory; otherwise pop last segment
    let dir = u.origin + u.pathname;
    if (!dir.endsWith('/')) {
      const parts = dir.split('/');
      parts.pop();
      dir = parts.join('/') + '/';
    }
    return dir + clean.replace(/^\.\//, '');
  }
}

// ── link info extraction ───────────────────────────────────────
function linkInfo($, a, baseURL) {
  const href = $(a).attr('href');
  const text = $(a).text().trim();
  if (!href || !text || text.length < 2 || text.length > 100) return null;
  const url = resolveURL(baseURL, href);
  // skip anchors, javascript, mailto
  if (/^(javascript:|mailto:|#)/.test(href)) return null;
  return { text, url };
}

// ── URL pattern similarity ─────────────────────────────────────
function urlSimilarity(urls) {
  if (urls.length < 3) return 0;
  // extract numeric sequences from URLs
  const nums = urls.map(u => {
    const m = u.match(/(\d+)/g);
    return m ? m.map(Number) : [];
  });
  // count how many URLs have the same number-of-numbers pattern
  const lenCounts = {};
  nums.forEach(n => {
    const k = n.length;
    lenCounts[k] = (lenCounts[k] || 0) + 1;
  });
  const maxSameLen = Math.max(...Object.values(lenCounts), 0);
  return maxSameLen / urls.length;
}

// ── chapter pattern score ──────────────────────────────────────
function chapterPatternScore(texts) {
  if (texts.length < 3) return 0;
  let chapterLike = 0;
  for (const t of texts) {
    if (/^第[零一二三四五六七八九十百千0-9]+[章节回卷]/.test(t)) chapterLike++;
    else if (/^[Cc]hapter\s*\d+/.test(t)) chapterLike++;
    else if (/^\d+[\.、\s]/.test(t)) chapterLike++;
  }
  return chapterLike / texts.length;
}

// ── link density in a container ─────────────────────────────────
function linkDensity($, el) {
  const textLen = (el.text() || '').trim().length;
  const linkTextLen = (() => {
    let total = 0;
    el.find('a').each((i, a) => { total += ($(a).text() || '').trim().length; });
    return total;
  })();
  return textLen > 0 ? linkTextLen / textLen : 1;
}

// ── heuristic TOC container finder ─────────────────────────────
function findTOCContainer($, baseURL) {
  // gather all plausible links with their DOM path
  const allLinks = [];
  $('a').each((i, a) => {
    const info = linkInfo($, a, baseURL);
    if (info) allLinks.push({ el: a, ...info });
  });
  if (allLinks.length === 0) return [];

  // iterate candidate containers, count chapter-like links inside each
  const candidates = [];
  const containers = $('div, ul, ol, dl, table, tbody, section, article, main, td');
  const seenEls = new Set();

  containers.each((i, container) => {
    const $c = $(container);
    // skip tiny containers and those nested inside already-seen ones
    const links = [];
    $c.find('a').each((j, a) => {
      const info = linkInfo($, a, baseURL);
      if (info) links.push({ el: a, ...info });
    });
    if (links.length < 3) return;

    // skip if too many links relative to non-link text (probably navigation)
    const density = linkDensity($, $c);
    if (density > 0.85) return;

    const urls = links.map(l => l.url);
    const texts = links.map(l => l.text);

    const countScore = Math.min(links.length / 50, 1);
    const urlSim = urlSimilarity(urls);
    const chPattern = chapterPatternScore(texts);
    const lengths = texts.map(t => t.length);
    const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const varLen = lengths.reduce((s, l) => s + (l - avgLen) ** 2, 0) / lengths.length;
    const lenConsistency = Math.max(0, 1 - Math.sqrt(varLen) / 15);

    const score = countScore * 0.3 + urlSim * 0.3 + chPattern * 0.2 + lenConsistency * 0.2;

    candidates.push({ links, score });
  });

  // sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  // pick the best candidate
  let bestLinks;
  if (candidates.length > 0 && candidates[0].score >= 0.15) {
    bestLinks = candidates[0].links;
  } else {
    // fallback: all links, filtered by chapter-like patterns
    bestLinks = allLinks.filter(l => {
      const t = l.text;
      return /^第[零一二三四五六七八九十百千0-9]+[章节回卷]/.test(t) ||
        /^[Cc]hapter\s*\d+/.test(t) ||
        /^\d+[\.、\s]/.test(t) ||
        t.length >= 3;
    });
    if (bestLinks.length === 0) bestLinks = allLinks;
  }

  // deduplicate by URL
  const seen = new Set();
  const unique = [];
  for (const l of bestLinks) {
    if (seen.has(l.url)) continue;
    seen.add(l.url);
    unique.push({ title: l.text, url: l.url });
  }
  return unique;
}

// ── parse TOC ──────────────────────────────────────────────────
async function parseIndex(url) {
  console.log('  正在获取目录页...');
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);

  // title from <title>, strip site prefix after separator
  let title = ($('title').first().text().trim() || $('h1').first().text().trim() || '未知小说');
  title = title.replace(/^.*?[_—\-]\s*/, '').replace(/\s*[-_—].*$/, '').trim() || title;
  console.log('  书名: ' + title);

  const chapters = findTOCContainer($, url);
  console.log('  找到 ' + chapters.length + ' 个章节');
  return { title, chapters };
}

// ── text density extraction ────────────────────────────────────
function extractContent($) {
  // remove noise elements first
  $('script, style, noscript, iframe, ins, [style*="display:none"], [style*="display: none"]').remove();

  // find the best content node by text-density heuristic
  let best = { node: null, score: 0, text: '' };

  function scoreNode(el) {
    const rawHtml = el.html() || '';
    const rawText = el.text() || '';
    const textLen = rawText.trim().length;

    // too short = not content
    if (textLen < 100) return;

    // count links inside — high link density = navigation
    const linkTextLen = (() => {
      let total = 0;
      el.find('a').each((i, a) => { total += ($(a).text() || '').trim().length; });
      return total;
    })();

    const linkRatio = textLen > 0 ? linkTextLen / textLen : 0;

    // text-to-html ratio (high means mostly text, low means lots of markup)
    const htmlLen = rawHtml.length;
    const textRatio = htmlLen > 0 ? textLen / htmlLen : 0;

    // penalize link-heavy nodes (navigation)
    if (linkRatio > 0.5) return;

    // score: favor large text blocks with high text ratio
    const score = Math.log(textLen + 1) * textRatio * (1 - linkRatio);

    if (score > best.score) {
      best = { node: el, score, text: rawHtml };
    }
  }

  // evaluate all potential content containers
  $('div, article, section, main, td, .content, .txt, #content, #contents, #TextContent, #chaptercontent, #htmlContent, #BookText, #articlecontent').each((i, el) => {
    scoreNode($(el));
  });

  // fallback: evaluate body
  if (!best.node) {
    scoreNode($('body'));
  }

  if (!best.node) {
    return { title: '', content: '' };
  }

  // extract title
  let title = '';
  for (const sel of ['h1', 'h2', '.bookname h1', '.title', '.chapter-title']) {
    const t = $(sel).first().text().trim();
    if (t && t.length < 80) { title = t; break; }
  }

  // clean content
  let content = best.text
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
    .replace(/&#(\d+);/gi, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { title, content };
}

// ── get single chapter ─────────────────────────────────────────
async function getChapter(url) {
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);

  const result = extractContent($);

  if (!result.title) {
    result.title = result.content.split('\n')[0]?.trim()?.slice(0, 40) || '未命名';
  }

  return result;
}

// ── utilities ──────────────────────────────────────────────────
function pad(n, len) { return String(n).padStart(len, '0'); }

function formatDuration(sec) {
  if (sec < 60) return Math.round(sec) + '秒';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m + '分' + s + '秒';
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' 超时')), ms))
  ]);
}

// ── crawl one chapter ──────────────────────────────────────────
async function crawlOne(ch, metaEntry, novelDir, metaFile, meta) {
  const chapPath = path.join(novelDir, metaEntry.filename);
  if (fs.existsSync(chapPath)) return { status: 'skip' };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const data = await withTimeout(getChapter(ch.url), 90000, '章节爬取');
      if (!data.content || data.content.length < 50) {
        throw new Error('内容过短 (' + (data.content || '').length + ' 字符)');
      }
      metaEntry.title = data.title || ch.title;
      fs.writeFileSync(chapPath, JSON.stringify(data, null, 0), 'utf-8');
      fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf-8');
      return { status: 'ok' };
    } catch (e) {
      if (attempt === 2) return { status: 'fail', error: e.message };
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

// ── concurrent pool ────────────────────────────────────────────
async function runPool(tasks, concurrency, handler) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await handler(tasks[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ── status file ────────────────────────────────────────────────
function writeStatus(slug, status) {
  const statusFile = path.join(DATA_DIR, slug, 'crawl-status.json');
  try { fs.writeFileSync(statusFile, JSON.stringify({ ...status, updatedAt: Date.now() }), 'utf-8'); } catch (_) {}
}

// ── main crawl ─────────────────────────────────────────────────
async function crawl(indexUrl, slug, options = {}) {
  const concurrency = options.concurrency || 3;
  const novelDir = path.join(DATA_DIR, slug);
  const metaFile = path.join(novelDir, 'meta.json');

  writeStatus(slug, { phase: 'parsing', title: '', total: 0, done: 0, success: 0, failed: 0, error: null });

  // retry index page up to 5 times with backoff
  let title, chapters;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      console.log('\n📖 解析目录' + (attempt > 0 ? ' (重试 ' + attempt + '/5)' : '') + ': ' + indexUrl);
      ({ title, chapters } = await parseIndex(indexUrl));
      break;
    } catch (e) {
      if (attempt === 4) throw e;
      const wait = (attempt + 1) * 5000;
      console.log('  ⚠ 目录页请求失败: ' + e.message.slice(0, 60));
      console.log('  ⏳ ' + (wait / 1000) + '秒后重试...');
      await new Promise(r => setTimeout(r, wait));
    }
  }

  if (!fs.existsSync(novelDir)) fs.mkdirSync(novelDir, { recursive: true });

  let meta = [];
  if (fs.existsSync(metaFile)) {
    meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
    console.log('  📋 已有 ' + meta.length + ' 章记录，断点续爬');
  }

  while (meta.length < chapters.length) {
    meta.push({ index: meta.length, title: chapters[meta.length].title, filename: pad(meta.length + 1, 4) + '.json' });
  }

  const total = chapters.length;
  let success = 0, skipped = 0, failed = 0;
  const startTime = Date.now();

  // count already cached
  const pending = [];
  for (let i = 0; i < total; i++) {
    const chapPath = path.join(novelDir, meta[i].filename);
    if (fs.existsSync(chapPath)) {
      skipped++;
    } else {
      pending.push(i);
    }
  }

  writeStatus(slug, { phase: 'crawling', title, total, done: skipped, success: 0, failed: 0, error: null });

  console.log('  总章节: ' + total + '  已缓存: ' + skipped + '  待爬取: ' + pending.length + '  并发: ' + concurrency);
  if (pending.length === 0) {
    console.log('  ✅ 全部已缓存，无需爬取');
  } else {
    console.log('');
  }

  let done = skipped;
  const numWidth = String(total).length;

  await runPool(pending, concurrency, async (i) => {
    const ch = chapters[i];
    const num = pad(i + 1, numWidth);
    process.stdout.write('\r  [' + num + '/' + total + '] ' + ch.title.slice(0, 45).padEnd(45) + ' ... ');

    const r = await crawlOne(ch, meta[i], novelDir, metaFile, meta);
    if (r.status === 'ok') { success++; process.stdout.write('✓'); }
    else { failed++; process.stdout.write('✗'); }

    done = skipped + success + failed;
    const elapsed = (Date.now() - startTime) / 1000;
    const worked = success + failed;
    const rate = worked / Math.max(elapsed, 0.1);
    const remaining = total - done;
    const eta = rate > 0 ? remaining / rate : 0;
    process.stdout.write('  ' + done + '/' + total + ' ' + (done / total * 100).toFixed(1) + '%  ' + rate.toFixed(1) + '章/秒  剩余' + formatDuration(eta) + '  \n');

    // update status every 10 chapters
    if (done % 10 === 0 || done === total) {
      writeStatus(slug, { phase: 'crawling', title, total, done, success, failed, error: null });
    }

    // delay between requests (1-2s, shorter because concurrency provides natural spacing)
    await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
  });

  const elapsed = (Date.now() - startTime) / 1000;
  console.log('\n✅ 完成！成功: ' + success + '  跳过: ' + skipped + '  失败: ' + failed + '  耗时: ' + formatDuration(elapsed));
  console.log('📂 存储: ' + novelDir);

  // bookshelf index
  let index = {};
  if (fs.existsSync(INDEX_FILE)) index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
  index[slug] = { slug, title: title || slug, chapterCount: total, updatedAt: new Date().toISOString() };
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');
  console.log('📚 书架已更新');

  writeStatus(slug, { phase: 'done', title, total, done: total, success, failed, error: null });
}

module.exports = { fetchHTML, resolveURL, decodeBuffer, parseIndex, getChapter, extractContent, findTOCContainer, crawl, writeStatus, DATA_DIR, INDEX_FILE };
