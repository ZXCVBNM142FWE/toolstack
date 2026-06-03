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

router.get("/", requireUser, (req, res) => {
  const user = req.session.user;
  let tokens = readJSON("tokens.json").filter((t) => t.user_id === user.id);

  // auto-create token if none
  if (tokens.length === 0) {
    const token = "sk-" + uuidv4().replace(/-/g, "").substring(0, 48);
    const newToken = {
      id: uuidv4(),
      name: user.username + "-default",
      token,
      user_id: user.id,
      quota_total: 5000,
      quota_used: 0,
      daily_limit: 500,
      models: ["*"],
      expires_at: null,
      paused: false,
      last_used: null,
      created_at: new Date().toISOString(),
    };
    const allTokens = readJSON("tokens.json");
    allTokens.push(newToken);
    writeJSON("tokens.json", allTokens);
    tokens = [newToken];
  }

  // load models
  const providers = readJSON("providers.json");
  const models = [];
  providers
    .filter((p) => p.enabled)
    .forEach((p) => {
      p.models.forEach((m) => {
        if (!models.find((x) => x.id === m)) {
          models.push({ id: m, name: p.name, features: p.features || { web_search: false, thinking: false } });
        }
      });
    });

  res.render("chat", {
    title: "AI 对话 — API 中转站",
    user,
    apiToken: tokens[0].token,
    models,
  });
});

module.exports = router;
