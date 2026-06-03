const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const DATA = path.join(__dirname, '..', 'data');

function readJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8'));
}

function writeJSON(file, data) {
  fs.writeFileSync(path.join(DATA, file), JSON.stringify(data, null, 2), 'utf8');
}

// ensure admin password is hashed on first run
function ensurePasswordHash() {
  const users = readJSON('users.json');
  const admin = users.find(u => u.role === 'admin');
  if (admin && (!admin.password_hash || admin.password_hash.length < 20)) {
    const pass = process.env.ADMIN_PASS || 'admin123';
    admin.password_hash = bcrypt.hashSync(pass, 10);
    writeJSON('users.json', users);
  }
}

// auth middleware for admin pages
function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.redirect('/admin');
}

// GET /admin — login page
router.get('/', (req, res) => {
  if (req.session && req.session.admin) return res.redirect('/admin/dashboard');
  res.render('admin/login', { title: '管理后台 — API 中转站', error: null });
});

// POST /admin/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  ensurePasswordHash();
  const users = readJSON('users.json');
  const user = users.find(u => u.username === username && u.role === 'admin');
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.render('admin/login', { title: '管理后台 — API 中转站', error: '用户名或密码错误' });
  }
  req.session.admin = { id: user.id, username: user.username };
  res.redirect('/admin/dashboard');
});

// GET /admin/logout
router.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/admin');
});

// GET /admin/dashboard
router.get('/dashboard', requireAdmin, (req, res) => {
  const usage = readJSON('usage.json');
  const tokens = readJSON('tokens.json');
  const providers = readJSON('providers.json');
  const users = readJSON('users.json');

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = usage.filter(u => u.timestamp.startsWith(today)).length;
  const activeTokens = tokens.filter(t => {
    if (t.paused) return false;
    if (t.expires_at && new Date(t.expires_at).getTime() < Date.now()) return false;
    return true;
  }).length;
  const totalModels = providers.filter(p => p.enabled).reduce((sum, p) => sum + p.models.length, 0);

  res.render('admin/dashboard', {
    title: '管理后台 — API 中转站',
    todayCount, activeTokens, totalModels,
    tokenCount: tokens.length,
    userCount: users.length,
    providerCount: providers.length,
  });
});

// GET /admin/providers
router.get('/providers', requireAdmin, (req, res) => {
  const providers = readJSON('providers.json');
  res.render('admin/providers', { title: '渠道管理 — API 中转站', providers });
});

// POST /admin/providers
router.post('/providers', requireAdmin, (req, res) => {
  const { id, name, endpoint, api_key, weight, priority, timeout } = req.body;
  const providers = readJSON('providers.json');
  providers.push({
    id: id || uuidv4(),
    name, endpoint, api_key: api_key || '',
    models: [],
    pricing: { prompt: 0, completion: 0 },
    weight: parseInt(weight) || 10,
    priority: parseInt(priority) || 10,
    timeout: parseInt(timeout) || 60000,
    enabled: true
  });
  writeJSON('providers.json', providers);
  res.redirect('/admin/providers');
});

// PUT /admin/providers/:id
router.post('/providers/:id/update', requireAdmin, (req, res) => {
  const { name, endpoint, api_key, models, prompt_price, completion_price, weight, priority, timeout, enabled } = req.body;
  const providers = readJSON('providers.json');
  const p = providers.find(p => p.id === req.params.id);
  if (!p) return res.status(404).send('Not found');
  if (name) p.name = name;
  if (endpoint) p.endpoint = endpoint;
  if (api_key !== undefined) p.api_key = api_key;
  if (models) p.models = models.split(',').map(s => s.trim()).filter(Boolean);
  if (prompt_price !== undefined) p.pricing.prompt = parseFloat(prompt_price) || 0;
  if (completion_price !== undefined) p.pricing.completion = parseFloat(completion_price) || 0;
  if (weight !== undefined) p.weight = parseInt(weight) || 10;
  if (priority !== undefined) p.priority = parseInt(priority) || 10;
  if (timeout !== undefined) p.timeout = parseInt(timeout) || 60000;
  p.enabled = enabled === 'on' || enabled === 'true';
  writeJSON('providers.json', providers);
  res.redirect('/admin/providers');
});

// POST /admin/providers/:id/delete
router.post('/providers/:id/delete', requireAdmin, (req, res) => {
  let providers = readJSON('providers.json');
  providers = providers.filter(p => p.id !== req.params.id);
  writeJSON('providers.json', providers);
  res.redirect('/admin/providers');
});

// GET /admin/tokens
router.get('/tokens', requireAdmin, (req, res) => {
  const tokens = readJSON('tokens.json');
  const providers = readJSON('providers.json');
  const allModels = [];
  providers.filter(p => p.enabled).forEach(p => {
    p.models.forEach(m => allModels.push(m));
  });
  res.render('admin/tokens', { title: '令牌管理 — API 中转站', tokens, allModels });
});

// POST /admin/tokens
router.post('/tokens', requireAdmin, (req, res) => {
  const { name, quota_total, models, expires_at } = req.body;
  const tokens = readJSON('tokens.json');
  const token = 'sk-' + uuidv4().replace(/-/g, '').substring(0, 48);
  tokens.push({
    id: uuidv4(),
    name: name || token.substring(0, 12),
    token,
    quota_total: parseInt(quota_total) || 1000,
    quota_used: 0,
    models: models ? models.split(',').map(s => s.trim()).filter(Boolean) : ['*'],
    expires_at: expires_at || null,
    paused: false,
    last_used: null,
    created_at: new Date().toISOString()
  });
  writeJSON('tokens.json', tokens);
  res.redirect('/admin/tokens');
});

// POST /admin/tokens/:id/update
router.post('/tokens/:id/update', requireAdmin, (req, res) => {
  const { name, quota_total, models, expires_at, paused } = req.body;
  const tokens = readJSON('tokens.json');
  const t = tokens.find(t => t.id === req.params.id);
  if (!t) return res.status(404).send('Not found');
  if (name) t.name = name;
  if (quota_total !== undefined) t.quota_total = parseInt(quota_total);
  if (models) t.models = models.split(',').map(s => s.trim()).filter(Boolean);
  t.expires_at = expires_at || null;
  t.paused = paused === 'on' || paused === 'true';
  writeJSON('tokens.json', tokens);
  res.redirect('/admin/tokens');
});

// POST /admin/tokens/:id/delete
router.post('/tokens/:id/delete', requireAdmin, (req, res) => {
  let tokens = readJSON('tokens.json');
  tokens = tokens.filter(t => t.id !== req.params.id);
  writeJSON('tokens.json', tokens);
  res.redirect('/admin/tokens');
});

// GET /admin/users
router.get('/users', requireAdmin, (req, res) => {
  const users = readJSON('users.json');
  const tokens = readJSON('tokens.json');
  res.render('admin/users', { title: '用户管理 — API 中转站', users, tokens });
});

// POST /admin/users
router.post('/users', requireAdmin, (req, res) => {
  const { username, password, role, balance, daily_limit } = req.body;
  const users = readJSON('users.json');
  const hash = bcrypt.hashSync(password, 10);
  users.push({
    id: uuidv4(),
    username,
    password_hash: hash,
    role: role || 'user',
    balance: parseFloat(balance) || 0,
    daily_limit: parseInt(daily_limit) || 0,
    created_at: new Date().toISOString()
  });
  writeJSON('users.json', users);
  res.redirect('/admin/users');
});

// POST /admin/users/:id/update
router.post('/users/:id/update', requireAdmin, (req, res) => {
  const { balance, daily_limit, role } = req.body;
  const users = readJSON('users.json');
  const u = users.find(u => u.id === req.params.id);
  if (!u) return res.status(404).send('Not found');
  if (balance !== undefined && balance !== '') u.balance = parseFloat(balance) || 0;
  if (daily_limit !== undefined && daily_limit !== '') u.daily_limit = parseInt(daily_limit) || 0;
  if (role) u.role = role;
  writeJSON('users.json', users);
  res.redirect('/admin/users');
});

module.exports = router;
