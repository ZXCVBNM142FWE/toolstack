const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('tools/api-proxy', { title: 'AI 智能体对话 - 在线 AI 聊天', error: null });
});

// Pollinations.AI — fully free, no key, works in China
async function pollinationsChat(model, messages) {
  const resp = await fetch('https://text.pollinations.ai/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({ model, messages, seed: Math.floor(Math.random() * 1000000) }),
    signal: AbortSignal.timeout(90000),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error?.message || 'Pollinations 请求失败');
  return data.choices?.[0]?.message?.content || '';
}

router.post('/chat', async (req, res) => {
  const { provider, model, apiKey, messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.json({ ok: false, error: '消息不能为空' });
  }

  const start = Date.now();

  try {
    let resp, data;

    // === Pollinations (free, no key) ===
    if (provider === 'pollinations') {
      const content = await pollinationsChat(model || 'openai', messages);
      return res.json({ ok: true, content, model: model || 'openai', elapsed: (Date.now() - start) + 'ms' });
    }

    // === Anthropic ===
    if (provider === 'anthropic') {
      if (!apiKey) return res.json({ ok: false, error: '请输入 API Key' });
      resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey.trim(), 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: model || 'claude-sonnet-4-6', max_tokens: 4096, messages }),
        signal: AbortSignal.timeout(60000),
      });
      data = await resp.json();
      if (!resp.ok) return res.json({ ok: false, error: data.error?.message || 'Claude 失败' });
      return res.json({ ok: true, content: data.content?.[0]?.text || '', model: data.model, elapsed: (Date.now() - start) + 'ms' });
    }

    // === OpenAI ===
    if (provider === 'openai') {
      if (!apiKey) return res.json({ ok: false, error: '请输入 API Key' });
      resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey.trim() },
        body: JSON.stringify({ model: model || 'gpt-4o', messages }),
        signal: AbortSignal.timeout(60000),
      });
      data = await resp.json();
      if (!resp.ok) return res.json({ ok: false, error: data.error?.message || 'OpenAI 失败' });
      return res.json({ ok: true, content: data.choices?.[0]?.message?.content || '', model: data.model, elapsed: (Date.now() - start) + 'ms' });
    }

    // === Groq ===
    if (provider === 'groq') {
      if (!apiKey) return res.json({ ok: false, error: '请输入 API Key' });
      resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey.trim() },
        body: JSON.stringify({ model: model || 'llama-4-scout-17b-16e-instruct', messages }),
        signal: AbortSignal.timeout(60000),
      });
      data = await resp.json();
      if (!resp.ok) return res.json({ ok: false, error: data.error?.message || 'Groq 失败' });
      return res.json({ ok: true, content: data.choices?.[0]?.message?.content || '', model: data.model, elapsed: (Date.now() - start) + 'ms' });
    }

    // === DeepSeek ===
    if (provider === 'deepseek') {
      if (!apiKey) return res.json({ ok: false, error: '请输入 API Key' });
      resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey.trim() },
        body: JSON.stringify({ model: model || 'deepseek-chat', messages }),
        signal: AbortSignal.timeout(60000),
      });
      data = await resp.json();
      if (!resp.ok) return res.json({ ok: false, error: data.error?.message || 'DeepSeek 失败' });
      return res.json({ ok: true, content: data.choices?.[0]?.message?.content || '', model: data.model, elapsed: (Date.now() - start) + 'ms' });
    }

    // === Gemini ===
    if (provider === 'gemini') {
      if (!apiKey) return res.json({ ok: false, error: '请输入 API Key' });
      resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + (model || 'gemini-2.5-flash') + ':generateContent?key=' + apiKey.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        }),
        signal: AbortSignal.timeout(60000),
      });
      data = await resp.json();
      if (!resp.ok) return res.json({ ok: false, error: data.error?.message || 'Gemini 失败' });
      return res.json({ ok: true, content: data.candidates?.[0]?.content?.parts?.[0]?.text || '', model: model || 'gemini-2.5-flash', elapsed: (Date.now() - start) + 'ms' });
    }

    return res.json({ ok: false, error: '不支持的提供商: ' + provider });
  } catch (err) {
    return res.json({ ok: false, error: err.name === 'TimeoutError' ? '请求超时' : err.message, elapsed: (Date.now() - start) + 'ms' });
  }
});

module.exports = router;
