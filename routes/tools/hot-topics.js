const express = require('express');
const router = express.Router();

const CACHE = new Map();
const TTL = 5 * 60 * 1000;
const FETCH_TIMEOUT = 8000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function formatHeat(n) {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return String(n);
}

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function getCached(key) {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL) return null;
  return entry.data;
}

function setCache(key, data) {
  CACHE.set(key, { data, ts: Date.now() });
}

function getStale(key) {
  const entry = CACHE.get(key);
  return entry ? entry.data : null;
}

async function fetchWeibo() {
  const res = await fetchWithTimeout('https://weibo.com/ajax/side/hotSearch');
  const json = await res.json();
  return {
    source: 'weibo',
    sourceName: '微博热搜',
    icon: '🔥',
    updatedAt: Date.now(),
    items: (json && json.data && json.data.realtime || []).slice(0, 30).map((item, i) => ({
      rank: i + 1,
      title: item.word || '',
      url: item.url || `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word || '')}`,
      heat: item.raw_hot || 0,
      heatDisplay: formatHeat(item.raw_hot || 0)
    }))
  };
}

async function fetchZhihu() {
  const res = await fetchWithTimeout('https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total');
  const json = await res.json();
  return {
    source: 'zhihu',
    sourceName: '知乎热榜',
    icon: '💡',
    updatedAt: Date.now(),
    items: (json && json.data || []).slice(0, 30).map((item, i) => ({
      rank: i + 1,
      title: (item.target && item.target.title) || '',
      url: (item.target && item.target.url) || '',
      heat: parseInt(item.detail_text || '0', 10) || 0,
      heatDisplay: item.detail_text || '0'
    }))
  };
}

async function fetchBilibili() {
  const res = await fetchWithTimeout('https://api.bilibili.com/x/web-interface/popular');
  const json = await res.json();
  return {
    source: 'bilibili',
    sourceName: 'B站热门',
    icon: '📺',
    updatedAt: Date.now(),
    items: (json && json.data && json.data.list || []).slice(0, 30).map((item, i) => ({
      rank: i + 1,
      title: item.title || '',
      url: item.short_link || `https://www.bilibili.com/video/${item.bvid || ''}`,
      heat: (item.stat && item.stat.view) || 0,
      heatDisplay: formatHeat((item.stat && item.stat.view) || 0)
    }))
  };
}

async function fetchBaidu() {
  const res = await fetchWithTimeout('https://top.baidu.com/board?tab=realtime');
  const html = await res.text();
  const match = /<!--\s*s-data:\s*(\{[\s\S]*?\})\s*-->/m.exec(html);
  if (!match) throw new Error('百度热搜数据解析失败');
  const sdata = JSON.parse(match[1]);
  const cards = (sdata.data && sdata.data.cards && sdata.data.cards[0] && sdata.data.cards[0].content) || [];
  return {
    source: 'baidu',
    sourceName: '百度热搜',
    icon: '🔍',
    updatedAt: Date.now(),
    items: cards.slice(0, 30).map((item, i) => ({
      rank: i + 1,
      title: item.word || item.query || '',
      url: item.url || `https://www.baidu.com/s?wd=${encodeURIComponent(item.word || item.query || '')}`,
      heat: parseInt(item.hotScore || item.hot || '0', 10) || 0,
      heatDisplay: formatHeat(parseInt(item.hotScore || item.hot || '0', 10) || 0)
    }))
  };
}

const SOURCES = {
  weibo: { fn: fetchWeibo, name: '微博热搜' },
  zhihu: { fn: fetchZhihu, name: '知乎热榜' },
  bilibili: { fn: fetchBilibili, name: 'B站热门' },
  baidu: { fn: fetchBaidu, name: '百度热搜' }
};

async function loadSource(sourceName) {
  const entry = SOURCES[sourceName];
  if (!entry) return null;
  try {
    const data = await entry.fn();
    setCache(sourceName, data);
    return data;
  } catch (err) {
    console.error(`fetch ${sourceName} 失败:`, err.message);
    return getStale(sourceName) || null;
  }
}

router.get('/', async (req, res) => {
  let weiboData = getCached('weibo');
  if (!weiboData) {
    try {
      weiboData = await fetchWeibo();
      setCache('weibo', weiboData);
    } catch (err) {
      weiboData = getStale('weibo');
      console.error('prefetch weibo 失败:', err.message);
    }
  }
  res.render('tools/hot-topics', {
    title: '全网热点聚合 — 微博/知乎/B站/百度热搜实时更新',
    prefetchData: weiboData ? JSON.stringify(weiboData) : 'null'
  });
});

const apiRouter = express.Router();

apiRouter.get('/', async (req, res) => {
  const { source } = req.query;
  try {
    if (source === 'all') {
      const results = await Promise.allSettled(
        Object.keys(SOURCES).map(key => loadSource(key))
      );
      const data = results
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value);
      return res.json({ success: true, data });
    }
    if (SOURCES[source]) {
      const data = await loadSource(source);
      if (!data) return res.json({ success: false, error: '获取数据失败，请稍后重试' });
      return res.json({ success: true, data });
    }
    return res.json({ success: false, error: '未知数据源' });
  } catch (err) {
    console.error('API error:', err.message);
    return res.json({ success: false, error: '服务器错误' });
  }
});

module.exports = { pageRouter: router, apiRouter };
