const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const captcha = require("../utils/captcha");
const { sendCode } = require("../utils/mailer");

const DATA = path.join(__dirname, "..", "data");

function readJSON(f) {
  return JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
}
function writeJSON(f, d) {
  fs.writeFileSync(path.join(DATA, f), JSON.stringify(d, null, 2), "utf8");
}

// GET /login
router.get("/login", (req, res) => {
  if (req.session?.user) return res.redirect("/chat");
  res.render("login", { title: "登录 — API 中转站", error: null, user: null });
});

// POST /login
router.post("/login", (req, res) => {
  const { email, password } = req.body;
  const wantsJson = req.is("json") || (req.headers.accept || "").includes("application/json");

  if (!email || !password) {
    if (wantsJson) return res.status(400).json({ ok: false, error: "请输入邮箱和密码" });
    return res.render("login", { title: "登录 — API 中转站", error: "请输入邮箱和密码", user: null });
  }
  const users = readJSON("users.json");
  const user = users.find((u) => u.email === email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    if (wantsJson) return res.status(401).json({ ok: false, error: "邮箱或密码错误" });
    return res.render("login", { title: "登录 — API 中转站", error: "邮箱或密码错误", user: null });
  }
  req.session.user = { id: user.id, username: user.username, email: user.email, role: user.role };
  if (wantsJson) return res.json({ ok: true, redirect: "/chat" });
  res.redirect("/chat");
});

// GET /register
router.get("/register", (req, res) => {
  if (req.session?.user) return res.redirect("/chat");
  res.render("register", { title: "注册 — API 中转站", error: null, user: null });
});

// GET /captcha — returns SVG captcha
router.get("/captcha", (req, res) => {
  const { svg, text } = captcha.create();
  req.session.captcha = text;
  req.session.captchaTime = Date.now();
  res.type("image/svg+xml");
  res.set("Cache-Control", "no-cache, no-store");
  res.send(svg);
});

// POST /send-code — validate captcha then send email code
router.post("/send-code", async (req, res) => {
  const { email, password, captchaInput } = req.body;

  // validate inputs
  if (!email || !password || password.length < 6) {
    return res.json({ ok: false, error: "请输入有效邮箱，密码至少 6 位" });
  }
  if (!email.includes("@") || !email.includes(".")) {
    return res.json({ ok: false, error: "请输入正确的邮箱地址" });
  }

  // check duplicate
  const users = readJSON("users.json");
  if (users.find((u) => u.email === email)) {
    return res.json({ ok: false, error: "该邮箱已注册" });
  }

  // verify captcha
  if (!captchaInput || captchaInput.toLowerCase() !== req.session.captcha) {
    // refresh captcha
    const { svg, text } = captcha.create();
    req.session.captcha = text;
    return res.json({ ok: false, error: "验证码错误", newCaptcha: svg });
  }

  // captcha expired (5 min)
  if (Date.now() - req.session.captchaTime > 5 * 60 * 1000) {
    return res.json({ ok: false, error: "验证码已过期，请刷新" });
  }

  // rate limit: 60s between sends
  if (req.session.lastSendTime && Date.now() - req.session.lastSendTime < 60000) {
    const remain = Math.ceil((60000 - (Date.now() - req.session.lastSendTime)) / 1000);
    return res.json({ ok: false, error: `请 ${remain} 秒后再试` });
  }

  // generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  req.session.verifyCode = code;
  req.session.verifyEmail = email;
  req.session.verifyPassword = password;
  req.session.verifyExpires = Date.now() + 5 * 60 * 1000;
  req.session.lastSendTime = Date.now();
  delete req.session.captcha; // captcha consumed

  const result = await sendCode(email, code);
  if (!result.sent) {
    return res.json({ ok: false, error: "邮件发送失败，请稍后再试" });
  }

  res.json({ ok: true, message: "验证码已发送", devCode: result.devCode || null });
});

// POST /verify-code — check code and complete registration
router.post("/verify-code", (req, res) => {
  const { code } = req.body;

  if (!req.session.verifyCode || Date.now() > req.session.verifyExpires) {
    return res.json({ ok: false, error: "验证码已过期，请重新获取" });
  }

  if (code !== req.session.verifyCode) {
    return res.json({ ok: false, error: "验证码错误" });
  }

  const email = req.session.verifyEmail;
  const password = req.session.verifyPassword;

  // create user
  const users = readJSON("users.json");
  const username = email.split("@")[0];
  const hash = bcrypt.hashSync(password, 10);
  const newUser = {
    id: uuidv4(),
    username,
    email,
    password_hash: hash,
    role: "user",
    balance: 0,
    created_at: new Date().toISOString(),
  };
  users.push(newUser);
  writeJSON("users.json", users);

  // auto-create token
  const tokens = readJSON("tokens.json");
  const token = "sk-" + uuidv4().replace(/-/g, "").substring(0, 48);
  tokens.push({
    id: uuidv4(),
    name: username + "-default",
    token,
    user_id: newUser.id,
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

  // cleanup session verify state
  delete req.session.verifyCode;
  delete req.session.verifyEmail;
  delete req.session.verifyPassword;
  delete req.session.verifyExpires;
  delete req.session.lastSendTime;

  req.session.user = { id: newUser.id, username: newUser.username, email: newUser.email, role: "user" };
  res.json({ ok: true, redirect: "/chat" });
});

// ── 忘记密码 ──────────────────────────────────────────────────────

// GET /forgot-password
router.get("/forgot-password", (req, res) => {
  if (req.session?.user) return res.redirect("/chat");
  res.render("forgot-password", { title: "重置密码 — API 中转站", error: null, user: null });
});

// POST /forgot-password/send-code
router.post("/forgot-password/send-code", async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes("@")) {
    return res.json({ ok: false, error: "请输入正确的邮箱地址" });
  }

  const users = readJSON("users.json");
  const user = users.find((u) => u.email === email);
  if (!user) {
    return res.json({ ok: false, error: "该邮箱未注册" });
  }

  // rate limit
  if (req.session.resetLastSend && Date.now() - req.session.resetLastSend < 60000) {
    const remain = Math.ceil((60000 - (Date.now() - req.session.resetLastSend)) / 1000);
    return res.json({ ok: false, error: `请 ${remain} 秒后再试` });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  req.session.resetCode = code;
  req.session.resetEmail = email;
  req.session.resetExpires = Date.now() + 5 * 60 * 1000;
  req.session.resetLastSend = Date.now();

  const result = await sendCode(email, code);
  if (!result.sent) {
    return res.json({ ok: false, error: "邮件发送失败，请稍后再试" });
  }

  res.json({ ok: true, message: "验证码已发送", devCode: result.devCode || null });
});

// POST /forgot-password/reset
router.post("/forgot-password/reset", (req, res) => {
  const { code, password } = req.body;

  if (!req.session.resetCode || Date.now() > req.session.resetExpires) {
    return res.json({ ok: false, error: "验证码已过期，请重新获取" });
  }
  if (code !== req.session.resetCode) {
    return res.json({ ok: false, error: "验证码错误" });
  }
  if (!password || password.length < 6) {
    return res.json({ ok: false, error: "新密码至少 6 位" });
  }

  const email = req.session.resetEmail;
  const users = readJSON("users.json");
  const user = users.find((u) => u.email === email);
  if (!user) {
    return res.json({ ok: false, error: "用户不存在" });
  }

  user.password_hash = bcrypt.hashSync(password, 10);
  writeJSON("users.json", users);

  delete req.session.resetCode;
  delete req.session.resetEmail;
  delete req.session.resetExpires;
  delete req.session.resetLastSend;

  res.json({ ok: true, redirect: "/login" });
});

// GET /logout
router.get("/logout", (req, res) => {
  req.session = null;
  res.redirect("/");
});

module.exports = router;
