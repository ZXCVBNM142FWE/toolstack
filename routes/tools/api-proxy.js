const express = require('express');
const router = express.Router();

const BLOCKED_HOSTS = [
  'localhost', '127.0.0.1', '0.0.0.0', '::1',
  '10.', '172.16.', '172.17.', '172.18.', '172.19.',
  '172.20.', '172.21.', '172.22.', '172.23.', '172.24.',
  '172.25.', '172.26.', '172.27.', '172.28.', '172.29.',
  '172.30.', '172.31.', '192.168.', '169.254.',
];

function isBlocked(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return BLOCKED_HOSTS.some(h => host === h || host.startsWith(h));
  } catch {
    return true;
  }
}

function safeSize(body) {
  if (typeof body === 'string') return Buffer.byteLength(body, 'utf8');
  if (typeof body === 'object') return Buffer.byteLength(JSON.stringify(body), 'utf8');
  return 0;
}

router.get('/', (req, res) => {
  res.render('tools/api-proxy', { title: 'API 中转站 - 在线 API 代理工具', error: null });
});

router.post('/', async (req, res) => {
  const { url, method, headers, body } = req.body;

  if (!url || !url.trim()) {
    return res.json({ ok: false, error: '请输入 API 地址' });
  }

  const targetUrl = url.trim();

  if (isBlocked(targetUrl)) {
    return res.json({ ok: false, error: '禁止请求内网地址' });
  }

  const reqMethod = (method || 'GET').toUpperCase();
  const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  if (!allowedMethods.includes(reqMethod)) {
    return res.json({ ok: false, error: '不支持的请求方法: ' + reqMethod });
  }

  let reqHeaders = {};
  if (headers && headers.trim()) {
    try {
      const lines = headers.trim().split('\n').filter(l => l.includes(':'));
      lines.forEach(line => {
        const idx = line.indexOf(':');
        const key = line.substring(0, idx).trim();
        const value = line.substring(idx + 1).trim();
        if (key && value) reqHeaders[key] = value;
      });
    } catch {
      return res.json({ ok: false, error: '请求头格式错误，每行一个 key: value' });
    }
  }

  if (body && body.trim() && !reqHeaders['Content-Type'] && !reqHeaders['content-type']) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  const fetchOptions = {
    method: reqMethod,
    headers: reqHeaders,
    redirect: 'follow',
  };

  if (body && body.trim() && reqMethod !== 'GET' && reqMethod !== 'HEAD') {
    fetchOptions.body = body.trim();
  }

  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    fetchOptions.signal = controller.signal;

    const response = await fetch(targetUrl, fetchOptions);
    clearTimeout(timeout);

    const elapsed = Date.now() - start;
    const resHeaders = {};
    response.headers.forEach((v, k) => { resHeaders[k] = v; });

    const contentType = response.headers.get('content-type') || '';
    let resBody;
    if (contentType.includes('application/json')) {
      resBody = await response.text();
      try { resBody = JSON.parse(resBody); } catch {}
    } else if (contentType.includes('text/') || contentType.includes('xml') || contentType.includes('javascript')) {
      resBody = await response.text();
    } else {
      const buf = await response.arrayBuffer();
      const kb = (buf.byteLength / 1024).toFixed(1);
      resBody = '[二进制响应: ' + kb + ' KB, ' + contentType + ']';
    }

    res.json({
      ok: true,
      status: response.status,
      statusText: response.statusText,
      headers: resHeaders,
      body: resBody,
      elapsed: elapsed + 'ms',
      size: safeSize(resBody),
    });
  } catch (err) {
    const elapsed = Date.now() - start;
    res.json({
      ok: false,
      error: err.name === 'AbortError' ? '请求超时（30s）' : err.message,
      elapsed: elapsed + 'ms',
    });
  }
});

module.exports = router;
