const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('tools/api-proxy', { title: 'AI 智能体对话 - 在线 AI 聊天', error: null });
});

router.post('/chat', async (req, res) => {
  const { provider, model, apiKey, messages } = req.body;

  if (!apiKey || !apiKey.trim()) {
    return res.json({ ok: false, error: '请输入 API Key' });
  }
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.json({ ok: false, error: '消息不能为空' });
  }

  const start = Date.now();
  const key = apiKey.trim();

  try {
    if (provider === 'openai') {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + key,
        },
        body: JSON.stringify({
          model: model || 'gpt-4o',
          messages,
        }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await resp.json();
      if (!resp.ok) {
        return res.json({ ok: false, error: data.error?.message || 'OpenAI 请求失败 (' + resp.status + ')' });
      }
      return res.json({
        ok: true,
        content: data.choices?.[0]?.message?.content || '',
        model: data.model,
        elapsed: (Date.now() - start) + 'ms',
      });
    }

    // Anthropic (Claude)
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages,
      }),
      signal: AbortSignal.timeout(60000),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return res.json({ ok: false, error: data.error?.message || 'Claude 请求失败 (' + resp.status + ')' });
    }
    return res.json({
      ok: true,
      content: data.content?.[0]?.text || '',
      model: data.model,
      elapsed: (Date.now() - start) + 'ms',
    });
  } catch (err) {
    return res.json({
      ok: false,
      error: err.name === 'TimeoutError' ? '请求超时（60s）' : err.message,
      elapsed: (Date.now() - start) + 'ms',
    });
  }
});

module.exports = router;
