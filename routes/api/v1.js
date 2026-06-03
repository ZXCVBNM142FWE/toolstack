const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const DATA = path.join(__dirname, "..", "..", "data");

function readJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(DATA, file), "utf8"));
}
function writeJSON(file, data) {
  fs.writeFileSync(path.join(DATA, file), JSON.stringify(data, null, 2), "utf8");
}

// ── token auth ──

function authToken(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  // Claude-style header: x-api-key
  const claudeKey = req.headers["x-api-key"] || "";
  const finalToken = token || claudeKey;

  if (!finalToken)
    return res.status(401).json({ error: "Missing API token" });

  const tokens = readJSON("tokens.json");
  const t = tokens.find((t) => t.token === finalToken);
  if (!t) return res.status(401).json({ error: "Invalid token" });
  if (t.expires_at && Date.now() >= new Date(t.expires_at).getTime())
    return res.status(403).json({ error: "Token expired" });
  if (t.paused)
    return res.status(403).json({ error: "Token paused" });

  // daily limit check
  const dailyLimit = t.daily_limit || 500;
  const today = new Date().toISOString().slice(0, 10);
  const usage = readJSON("usage.json");
  const todayCount = usage.filter(
    (u) => u.token === t.token && u.timestamp.startsWith(today)
  ).length;
  if (todayCount >= dailyLimit) {
    return res.status(429).json({
      error: "Daily limit exceeded",
      daily_limit: dailyLimit,
      daily_used: todayCount,
    });
  }

  req.apiToken = t;
  next();
}

// ── weighted random pick ──

function weightedPick(candidates) {
  const total = candidates.reduce((s, c) => s + (c.weight || 1), 0);
  let r = Math.random() * total;
  for (const c of candidates) {
    r -= c.weight || 1;
    if (r <= 0) return c;
  }
  return candidates[candidates.length - 1];
}

function findProviders(model) {
  const providers = readJSON("providers.json");
  const matches = providers.filter(
    (p) => p.enabled && p.models.includes(model) && p.api_key,
  );
  // sort by priority (lower = higher priority), then pick
  matches.sort((a, b) => (a.priority ?? 10) - (b.priority ?? 10));
  return matches;
}

// ── token estimator ──

function estimateTokens(messages) {
  let chars = 0;
  for (const m of messages) {
    if (typeof m.content === "string") chars += m.content.length;
    else if (Array.isArray(m.content)) {
      for (const block of m.content) {
        if (block.text) chars += block.text.length;
        else if (block.type === "text" && block.text) chars += block.text.length;
      }
    }
  }
  return Math.ceil(chars / 3); // rough: ~3 chars per token for Chinese, 4 for English
}

// ── record usage ──

function recordUsage(token, model, provider, tokensUsed) {
  const tokens = readJSON("tokens.json");
  const ti = tokens.findIndex((t) => t.token === token);
  if (ti >= 0) {
    tokens[ti].quota_used = (tokens[ti].quota_used || 0) + Math.max(tokensUsed, 1);
    tokens[ti].last_used = new Date().toISOString();
    writeJSON("tokens.json", tokens);
  }
  const usage = readJSON("usage.json");
  usage.push({
    token,
    model,
    provider,
    tokens: tokensUsed,
    timestamp: new Date().toISOString(),
  });
  if (usage.length > 10000) usage.splice(0, usage.length - 10000);
  writeJSON("usage.json", usage);
}

// ── Claude Messages → OpenAI Chat Completions ──

function claudeToOpenAI(messages, system) {
  const openaiMsgs = [];
  if (system) {
    if (typeof system === "string") openaiMsgs.push({ role: "system", content: system });
    else if (Array.isArray(system)) {
      const text = system.filter((b) => b.type === "text").map((b) => b.text).join("\n");
      if (text) openaiMsgs.push({ role: "system", content: text });
    }
  }
  for (const m of messages) {
    if (m.role === "user") {
      if (typeof m.content === "string") openaiMsgs.push({ role: "user", content: m.content });
      else if (Array.isArray(m.content)) {
        const parts = [];
        for (const block of m.content) {
          if (block.type === "text") parts.push(block.text);
          else if (block.type === "image" && block.source) {
            parts.push({
              type: "image_url",
              image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` },
            });
          }
        }
        openaiMsgs.push({ role: "user", content: parts });
      }
    } else if (m.role === "assistant") {
      if (typeof m.content === "string") openaiMsgs.push({ role: "assistant", content: m.content });
      else if (Array.isArray(m.content)) {
        const text = m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
        if (text) openaiMsgs.push({ role: "assistant", content: text });
      }
    }
  }
  return openaiMsgs;
}

function openAIToClaude(openaiResp, model) {
  const choice = openaiResp.choices?.[0];
  const msg = choice?.message;
  const content = msg?.content || "";
  return {
    id: openaiResp.id || "msg_" + Date.now(),
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: content }],
    model: model || openaiResp.model,
    stop_reason: choice?.finish_reason === "stop" ? "end_turn" : choice?.finish_reason || "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: openaiResp.usage?.prompt_tokens || 0,
      output_tokens: openaiResp.usage?.completion_tokens || 0,
    },
  };
}

// ── upstream request with retry + failover ──

async function relayToProvider(provider, model, body, stream, req) {
  const timeout = provider.timeout || 60000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.api_key}`,
    };
    const upstream = await fetch(`${provider.endpoint}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      throw new Error(`Upstream ${upstream.status}: ${errText.substring(0, 200)}`);
    }

    return { upstream, error: null };
  } catch (e) {
    return { upstream: null, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

// ── GET /v1/models ──

router.get("/models", (req, res) => {
  const providers = readJSON("providers.json");
  const models = [];
  providers
    .filter((p) => p.enabled)
    .forEach((p) => {
      p.models.forEach((m) => {
        if (!models.find((x) => x.id === m)) {
          models.push({
            id: m,
            object: "model",
            owned_by: p.name,
            features: p.features || { web_search: false, thinking: false },
          });
        }
      });
    });
  res.json({ object: "list", data: models });
});

// ── POST /v1/chat/completions (OpenAI format) ──

router.post("/chat/completions", authToken, async (req, res) => {
  const { model, messages, stream, max_tokens, temperature, top_p } = req.body;

  if (!model || !messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "model and messages are required" });
  }

  const candidates = findProviders(model);
  if (candidates.length === 0) {
    return res.status(400).json({ error: `No available provider for model: ${model}` });
  }

  // weighted pick with failover (try up to 3)
  const tried = new Set();
  let lastError = null;

  for (let attempt = 0; attempt < Math.min(candidates.length, 3); attempt++) {
    const available = candidates.filter((c) => !tried.has(c.id));
    if (available.length === 0) break;

    const provider = weightedPick(available);
    tried.add(provider.id);

    console.log(
      `  🔄 [${req.apiToken.name}] ${model} → ${provider.name} (attempt ${attempt + 1})`,
    );

    const body = {
      model,
      messages,
      max_tokens: max_tokens || 4096,
      temperature: temperature ?? 0.7,
      top_p: top_p ?? 1,
      stream: stream || false,
    };
    // pass through advanced params from client
    if (req.body.web_search_options) body.web_search_options = req.body.web_search_options;
    if (req.body.thinking) body.thinking = req.body.thinking;

    const { upstream, error } = await relayToProvider(provider, model, body, stream, req);

    if (error) {
      console.log(`  ❌ ${provider.name}: ${error}`);
      lastError = error;
      continue;
    }

    // success
    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } catch {}
      res.end();
    } else {
      const data = await upstream.json();
      res.json(data);
    }

    const tokensUsed = estimateTokens(messages);
    recordUsage(req.apiToken.token, model, provider.id, tokensUsed);
    console.log(`  ✅ [${provider.name}] ~${tokensUsed} tokens`);
    return;
  }

  res.status(502).json({
    error: "All providers failed",
    detail: lastError,
    tried: [...tried],
  });
});

// ── POST /v1/messages (Anthropic Claude Messages format) ──

router.post("/messages", authToken, async (req, res) => {
  const { model, messages, system, max_tokens, temperature, top_p, stream } = req.body;

  if (!model || !messages || !Array.isArray(messages)) {
    return res.status(400).json({
      type: "error",
      error: { type: "invalid_request_error", message: "model and messages are required" },
    });
  }

  // convert Claude → OpenAI format
  const openaiMsgs = claudeToOpenAI(messages, system);
  const openaiBody = {
    model,
    messages: openaiMsgs,
    max_tokens: max_tokens || 4096,
    temperature: temperature ?? 0.7,
    top_p: top_p ?? 1,
    stream: stream || false,
  };
  if (req.body.web_search_options) openaiBody.web_search_options = req.body.web_search_options;
  if (req.body.thinking) openaiBody.thinking = req.body.thinking;

  const candidates = findProviders(model);
  if (candidates.length === 0) {
    return res.status(400).json({
      type: "error",
      error: { type: "invalid_request_error", message: `No available provider for model: ${model}` },
    });
  }

  const tried = new Set();
  let lastError = null;

  for (let attempt = 0; attempt < Math.min(candidates.length, 3); attempt++) {
    const available = candidates.filter((c) => !tried.has(c.id));
    if (available.length === 0) break;

    const provider = weightedPick(available);
    tried.add(provider.id);

    console.log(
      `  🔄 [Claude→OpenAI][${req.apiToken.name}] ${model} → ${provider.name} (attempt ${attempt + 1})`,
    );

    const { upstream, error } = await relayToProvider(provider, model, openaiBody, stream, req);

    if (error) {
      console.log(`  ❌ ${provider.name}: ${error}`);
      lastError = error;
      continue;
    }

    if (stream) {
      // SSE passthrough for now — Claude SDK expects SSE events
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } catch {}
      res.end();
    } else {
      const data = await upstream.json();
      // convert OpenAI response → Claude format
      const claudeResp = openAIToClaude(data, model);
      res.json(claudeResp);
    }

    const tokensUsed = estimateTokens(messages);
    recordUsage(req.apiToken.token, model, provider.id, tokensUsed);
    console.log(`  ✅ [${provider.name}] ~${tokensUsed} tokens`);
    return;
  }

  res.status(502).json({
    type: "error",
    error: {
      type: "api_error",
      message: `All providers failed: ${lastError}`,
    },
  });
});

module.exports = router;
