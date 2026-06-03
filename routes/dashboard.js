const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const DATA = path.join(__dirname, "..", "data");

function readJSON(f) {
  return JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
}
function writeJSON(f, d) {
  fs.writeFileSync(path.join(DATA, f), JSON.stringify(d, null, 2), "utf8");
}

function requireUser(req, res, next) {
  if (req.session?.user) return next();
  return res.redirect("/login");
}

// GET /dashboard
router.get("/", requireUser, (req, res) => {
  const user = req.session.user;
  const allTokens = readJSON("tokens.json");
  const tokens = allTokens.filter((t) => t.user_id === user.id);
  const providers = readJSON("providers.json");
  const usage = readJSON("usage.json");

  const today = new Date().toISOString().slice(0, 10);

  // enrich each token with daily stats
  const enrichedTokens = tokens.map((t) => {
    const todayUsage = usage.filter(
      (u) => u.token === t.token && u.timestamp.startsWith(today)
    );
    const dailyUsed = todayUsage.length;
    const dailyLimit = t.daily_limit || 500;
    const todayTokens = todayUsage.reduce((s, u) => s + (u.tokens || 0), 0);
    return { ...t, dailyUsed, dailyLimit, todayTokens };
  });

  // overall stats
  const todayCount = usage.filter(
    (u) => tokens.some((t) => t.token === u.token) && u.timestamp.startsWith(today)
  ).length;
  const todayTokensTotal = usage
    .filter((u) => tokens.some((t) => t.token === u.token) && u.timestamp.startsWith(today))
    .reduce((s, u) => s + (u.tokens || 0), 0);

  // recent usage history (last 50)
  const recentUsage = usage
    .filter((u) => tokens.some((t) => t.token === u.token))
    .slice(-50)
    .reverse()
    .map((u) => {
      const t = tokens.find((tk) => tk.token === u.token);
      return { ...u, tokenName: t?.name || "unknown" };
    });

  const totalModels = providers
    .filter((p) => p.enabled)
    .reduce((s, p) => s + p.models.length, 0);

  res.render("dashboard", {
    title: "控制台 — API 中转站",
    user,
    tokens: enrichedTokens,
    todayCount,
    todayTokensTotal,
    totalModels,
    recentUsage,
  });
});

// POST /dashboard/create-token
router.post("/create-token", requireUser, (req, res) => {
  const user = req.session.user;
  const tokens = readJSON("tokens.json");
  const token = "sk-" + uuidv4().replace(/-/g, "").substring(0, 48);
  tokens.push({
    id: uuidv4(),
    name: user.username + "-" + (tokens.filter((t) => t.user_id === user.id).length + 1),
    token,
    user_id: user.id,
    quota_total: 1000,
    quota_used: 0,
    daily_limit: 500,
    models: ["*"],
    expires_at: null,
    paused: false,
    last_used: null,
    created_at: new Date().toISOString(),
  });
  writeJSON("tokens.json", tokens);
  res.redirect("/dashboard");
});

// POST /dashboard/toggle-token/:id
router.post("/toggle-token/:id", requireUser, (req, res) => {
  const tokens = readJSON("tokens.json");
  const t = tokens.find((t) => t.id === req.params.id && t.user_id === req.session.user.id);
  if (t) {
    t.paused = !t.paused;
    writeJSON("tokens.json", tokens);
  }
  res.redirect("/dashboard");
});

// POST /dashboard/delete-token/:id
router.post("/delete-token/:id", requireUser, (req, res) => {
  let tokens = readJSON("tokens.json");
  tokens = tokens.filter(
    (t) => !(t.id === req.params.id && t.user_id === req.session.user.id)
  );
  writeJSON("tokens.json", tokens);
  res.redirect("/dashboard");
});

// POST /dashboard/daily-limit/:id
router.post("/daily-limit/:id", requireUser, (req, res) => {
  const limit = parseInt(req.body.daily_limit) || 500;
  const tokens = readJSON("tokens.json");
  const t = tokens.find((t) => t.id === req.params.id && t.user_id === req.session.user.id);
  if (t) {
    t.daily_limit = Math.max(1, Math.min(limit, 100000));
    writeJSON("tokens.json", tokens);
  }
  res.redirect("/dashboard");
});

module.exports = router;
