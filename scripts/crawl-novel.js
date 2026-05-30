const { execFile } = require('child_process');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const DATA_DIR = path.resolve(__dirname, '..', 'data', 'novels');
const INDEX_FILE = path.join(DATA_DIR, 'index.json');

function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    execFile('curl', [
      '-s', '-L', '--connect-timeout', '15', '--max-time', '30',
      '-H', 'User-Agent: ' + UA,
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '-H', 'Accept-Language: zh-CN,zh;q=0.9',
      url
    ], { encoding: 'buffer', maxBuffer: 5 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(new Error('curl 请求失败: ' + (err.message || err)));
      const buf = Buffer.from(stdout);
      let html = new TextDecoder('utf-8').decode(buf);
      if (html.includes('�') && html.length > 100) {
        try { html = new TextDecoder('gbk').decode(buf); } catch (e) { /* keep utf-8 */ }
      }
      resolve(html);
    });
  });
}

function resolveURL(base, href) {
  try { return new URL(href, base).href; } catch {
    const clean = href.split('#')[0];
    if (clean.startsWith('/')) {
      const u = new URL(base);
      return u.origin + clean;
    }
    const u = new URL(base);
    const parts = u.pathname.split('/');
    parts.pop();
    return u.origin + parts.join('/') + '/' + clean.replace(/^\.\//, '');
  }
}

async function parseIndex(url) {
  console.log('  正在获取目录页...');
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);
  const title = ($('title').first().text().trim() || $('h1').first().text().trim() || '未知小说').replace(/^.*?[_—\-]\s*/, '');
  console.log('  书名: ' + title);

  const chapters = [];
  const selectors = ['#list', '#at', '#chapterlist', '.chapterlist', '.chapter-list', '#chapters', '.catalog', '#catalog', 'dl', 'table#at'];
  let foundContainer = null;
  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length && el.find('a').length >= 5) { foundContainer = el; break; }
  }

  const links = foundContainer ? foundContainer.find('a') : $('a');
  links.each((i, a) => {
    const href = $(a).attr('href');
    const text = $(a).text().trim();
    if (href && text && text.length > 1 && text.length < 80) {
      chapters.push({ title: text, url: resolveURL(url, href) });
    }
  });

  // deduplicate
  const seen = new Set();
  const unique = [];
  for (const ch of chapters) {
    if (seen.has(ch.url)) continue;
    seen.add(ch.url);
    unique.push(ch);
  }

  console.log('  找到 ' + unique.length + ' 个章节');
  return { title, chapters: unique };
}

async function getChapter(url) {
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);

  let title = '';
  for (const sel of ['h1', '.bookname h1', '#BookTitle', '.chapter-title', '.title']) {
    const t = $(sel).first().text().trim();
    if (t) { title = t; break; }
  }

  let content = '';
  for (const sel of ['#TextContent', '#content', '#BookText', '#chaptercontent', '#htmlContent', '.content', '.chapter-content', '#contents', '.txt', '#articlecontent']) {
    const c = $(sel).first();
    if (c.length) {
      c.find('script, style, .ads, [class*="ad"], [id*="ad"], .banner, ins, iframe').remove();
      content = c.html() || c.text();
      break;
    }
  }
  if (!content) {
    $('script, style, header, footer, nav, .header, .footer, .nav, .ads').remove();
    content = $('body').html() || '';
  }

  content = content
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<p[^>]*>/gi, '')
    .replace(/<div[^>]*>/gi, '\n').replace(/<\/div>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&gt;/gi, '>').replace(/&lt;/gi, '<')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  if (!title) title = content.split('\n')[0]?.trim()?.slice(0, 40) || '未命名';

  return { title, content };
}

function pad(n, len) { return String(n).padStart(len, '0'); }

function formatDuration(sec) {
  if (sec < 60) return Math.round(sec) + '秒';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m + '分' + s + '秒';
}

async function crawlOne(ch, metaEntry, novelDir, metaFile, meta) {
  const chapPath = path.join(novelDir, metaEntry.filename);
  if (fs.existsSync(chapPath)) return { status: 'skip' };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const data = await getChapter(ch.url);
      metaEntry.title = data.title || ch.title;
      fs.writeFileSync(chapPath, JSON.stringify(data, null, 0), 'utf-8');
      fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf-8');
      return { status: 'ok' };
    } catch (e) {
      if (attempt === 2) return { status: 'fail', error: e.message };
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

async function crawl(indexUrl, slug) {
  const novelDir = path.join(DATA_DIR, slug);
  const metaFile = path.join(novelDir, 'meta.json');

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
  for (let i = 0; i < total; i++) {
    const chapPath = path.join(novelDir, meta[i].filename);
    if (fs.existsSync(chapPath)) skipped++;
  }

  console.log('  总章节: ' + total + '  已缓存: ' + skipped + '  待爬取: ' + (total - skipped));
  if (total - skipped === 0) {
    console.log('  ✅ 全部已缓存，无需爬取');
  } else {
    console.log('');
  }

  for (let i = 0; i < total; i++) {
    const ch = chapters[i];
    const chapPath = path.join(novelDir, meta[i].filename);

    if (fs.existsSync(chapPath)) continue;

    const num = pad(i + 1, String(total).length);
    process.stdout.write('\r  [' + num + '/' + total + '] ' + ch.title.slice(0, 45).padEnd(45) + ' ... ');

    const r = await crawlOne(ch, meta[i], novelDir, metaFile, meta);
    if (r.status === 'ok') { success++; process.stdout.write('✓'); }
    else { failed++; process.stdout.write('✗'); }

    // progress line every chapter
    const done = skipped + success + failed;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = (success + failed) / Math.max(elapsed, 0.1);
    const remaining = total - done;
    const eta = rate > 0 ? remaining / rate : 0;
    process.stdout.write('  ' + (done + '/' + total) + ' ' + (done / total * 100).toFixed(1) + '%  ' + rate.toFixed(1) + '章/秒  剩余' + formatDuration(eta) + '  ');

    // delay between requests
    await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log('\n\n✅ 完成！成功: ' + success + '  跳过: ' + skipped + '  失败: ' + failed + '  耗时: ' + formatDuration(elapsed));
  console.log('📂 存储: ' + novelDir);

  // bookshelf index
  let index = {};
  if (fs.existsSync(INDEX_FILE)) index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
  index[slug] = { slug, title: title || slug, chapterCount: total, updatedAt: new Date().toISOString() };
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');
  console.log('📚 书架已更新');
}

// CLI
const [,, indexUrl, slug] = process.argv;
if (!indexUrl || !slug) {
  console.log('用法: node scripts/crawl-novel.js <index-url> <slug>');
  console.log('示例: node scripts/crawl-novel.js http://www.leshugu.info/html/0/626/ 蛊真人');
  process.exit(1);
}

crawl(indexUrl, slug).catch(e => { console.error('\n❌ 错误:', e.message); process.exit(1); });
