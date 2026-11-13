'use strict';
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { createStore } = require('./lib/store');
const http = require('http');
const A = require('./lib/auth');
const L = require('./public/layout.js');
const AN = require('./public/anims.js');
const { createWorld } = require('./lib/world');
const { createNightfloat } = require('./lib/nightfloat');
const { createWordly } = require('./lib/wordly');

function createApp(store = createStore(), env = process.env) {
  const SECRET = env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
  if (!env.SESSION_SECRET) console.warn('SESSION_SECRET not set: logins reset on every restart.');
  const ADMINS = (env.ADMIN_USERNAMES || 'admin').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const SECURE = env.NODE_ENV === 'production';
  const SESSION_MS = 7 * 24 * 3600 * 1000;

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  require('./lib/lanternroad').mount(app, store, { secret: SECRET, secure: SECURE });
  app.use('/api/admin/logo', express.json({ limit: '700kb' }));
  app.use(express.json({ limit: '20kb' }));
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' });
    next();
  });
  // State-changing calls must be JSON. A cross-site form post cannot send that.
  app.use('/api', (req, res, next) => {
    if (req.method !== 'GET' && !req.is('application/json')) return res.status(415).json({ error: 'JSON only' });
    next();
  });

  // Wardrobe: every costume and colour is unlocked for everyone.
  const CATALOG = {
    costumes: ['none', 'bear', 'cat', 'duck', 'robot', 'crown', 'cap', 'tophat', 'wizard', 'cowboy', 'chef', 'party', 'beanie', 'propeller', 'headphones', 'viking', 'halo', 'santa'], colors: [0xff5d5d, 0xffb347, 0xffd166, 0x3ee6c4, 0x7aa2ff, 0xc9b6ff, 0xff7eb6],
    starterCostumes: [], starterColors: [],
  };
  CATALOG.starterCostumes = CATALOG.costumes.slice(); CATALOG.starterColors = CATALOG.colors.slice();
  const ITEM_LABELS = { 'costume:robot': 'Robot suit', 'costume:crown': 'Gold crown', 'color:ffd166': 'Gold body', 'color:c9b6ff': 'Lavender body', 'color:ff5d5d': 'Ruby body' };
  const owns = (u, costume, color) => {
    const c = CATALOG.starterCostumes.includes(costume) || (u.items || []).includes('costume:' + costume);
    return c; // any colour is allowed (colour picker)
  };
  const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
  const userKey = (u) => `user:${u}`;
  const publicUser = (u) => ({
    username: u.username, name: u.name, role: u.role, admin: !!u.admin,
    mustChangePassword: !!u.mustChange, costume: u.costume, color: u.color, coins: u.coins || 0,
    items: u.items || [], catalog: CATALOG,
  });

  async function limit(key, max, windowSec) {
    const n = await store.incr(key);
    if (n === 1) await store.expire(key, windowSec);
    return n <= max;
  }

  function readCookie(req, name) {
    const m = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
    return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
  }
  function setSession(res, username) {
    const token = A.sign({ u: username, exp: Date.now() + SESSION_MS }, SECRET);
    res.cookie('cl_session', token, { httpOnly: true, sameSite: 'lax', secure: SECURE, maxAge: SESSION_MS, path: '/' });
  }

  async function requireUser(req, res, next) {
    const p = A.verify(readCookie(req, 'cl_session'), SECRET);
    const user = p && (await store.get(userKey(p.u)));
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    req.user = user;
    next();
  }
  const requireAdmin = (req, res, next) => (req.user.admin ? next() : res.status(403).json({ error: 'Admins only' }));


  app.post('/api/signup', wrap(async (req, res) => {
    if (!(await limit(`rl:signup:${req.ip}`, 10, 3600))) return res.status(429).json({ error: 'Too many sign-ups. Try again later.' });
    const username = String(req.body.username || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim().slice(0, 24);
    const role = req.body.role;
    if (!A.USERNAME_RE.test(username)) return res.status(400).json({ error: 'Username must be 3 to 20 letters, numbers or underscores.' });
    if (name.length < 1) return res.status(400).json({ error: 'Enter a display name.' });
    if (!A.ROLES.includes(role)) return res.status(400).json({ error: 'Choose a role.' });
    const password = A.generatePassword();
    const user = {
      username, name, role, admin: ADMINS.includes(username), mustChange: true,
      costume: 'none', color: 0x7aa2ff, coins: 0, items: [], passwordHash: A.hashPassword(password), createdAt: Date.now(),
    };
    const ok = await store.set(userKey(username), user, { nx: true });
    if (!ok) return res.status(409).json({ error: 'That username is taken.' });
    await store.sadd('users', username);
    await deliver(username, { from: 'Admin', subject: 'Welcome to SayBearLand', body: 'Here is a little something to start with. Coins only arrive by mail, so keep an eye on your inbox.', attachment: { type: 'coins', amount: 100 } });
    res.status(201).json({ username, temporaryPassword: password, note: 'Shown once. You must change it at first login.' });
  }));

  app.post('/api/login', wrap(async (req, res) => {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!(await limit(`rl:login:${req.ip}:${username}`, 8, 600))) return res.status(429).json({ error: 'Too many attempts. Wait a few minutes.' });
    const user = await store.get(userKey(username));
    // Hash even for unknown users so response time does not reveal which usernames exist.
    const good = A.verifyPassword(password, user ? user.passwordHash : A.hashPassword('x'));
    if (!user || !good) return res.status(401).json({ error: 'Wrong username or password.' });
    setSession(res, username);
    res.json({ user: publicUser(user) });
  }));

  app.post('/api/logout', (req, res) => { res.clearCookie('cl_session', { path: '/' }); res.json({ ok: true }); });

  app.get('/api/me', wrap(requireUser), (req, res) => res.json({ user: publicUser(req.user) }));

  app.post('/api/change-password', wrap(requireUser), wrap(async (req, res) => {
    const { oldPassword, newPassword } = req.body || {};
    if (!A.verifyPassword(String(oldPassword || ''), req.user.passwordHash)) return res.status(401).json({ error: 'Current password is wrong.' });
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 100) return res.status(400).json({ error: 'New password must be 8 to 100 characters.' });
    if (newPassword === oldPassword) return res.status(400).json({ error: 'Choose a different password.' });
    req.user.passwordHash = A.hashPassword(newPassword);
    req.user.mustChange = false;
    await store.set(userKey(req.user.username), req.user);
    res.json({ user: publicUser(req.user) });
  }));

  app.post('/api/avatar', wrap(requireUser), wrap(async (req, res) => {
    const { costume, color } = req.body || {};
    if (!A.COSTUMES.includes(costume) || !Number.isInteger(color) || color < 0 || color > 0xffffff) return res.status(400).json({ error: 'Invalid outfit.' });
    if (!owns(req.user, costume, color)) return res.status(403).json({ error: 'You do not own that item yet. Items arrive by mail.' });
    req.user.costume = costume; req.user.color = color;
    await store.set(userKey(req.user.username), req.user);
    res.json({ user: publicUser(req.user) });
  }));

  app.get('/api/admin/users', wrap(requireUser), requireAdmin, wrap(async (req, res) => {
    const names = await store.smembers('users');
    const users = (await Promise.all(names.map((n) => store.get(userKey(n))))).filter(Boolean).map(publicUser);
    res.json({ users });
  }));

  let boardCache = { at: 0, top: [] };
  app.get('/api/leaderboard', wrap(requireUser), wrap(async (req, res) => {
    if (Date.now() - boardCache.at > 8000) {
      const names = await store.smembers('users');
      const us = (await Promise.all(names.map((n) => store.get(userKey(n))))).filter(Boolean);
      us.sort((a, b) => (b.coins || 0) - (a.coins || 0));
      boardCache = { at: Date.now(), top: us.slice(0, 6).map((u) => ({ name: u.name, coins: u.coins || 0 })) };
    }
    res.json({ top: boardCache.top });
  }));

  app.post('/api/admin/reset-password', wrap(requireUser), requireAdmin, wrap(async (req, res) => {
    const target = await store.get(userKey(String(req.body.username || '').toLowerCase()));
    if (!target) return res.status(404).json({ error: 'No such user.' });
    const password = A.generatePassword();
    target.passwordHash = A.hashPassword(password); target.mustChange = true;
    await store.set(userKey(target.username), target);
    res.json({ username: target.username, temporaryPassword: password });
  }));


  // ---- shared content: layout, announcements, logo, bots ----
  const BOT_ROLES = ['CEO', 'Tester', 'CCO', 'Web Developer', 'Application Developer', 'Designer', 'HR', 'Support'];
  const BOT_COSTUMES = ['bear', 'cat', 'duck', 'robot', 'crown', 'none', 'cap', 'tophat', 'wizard', 'cowboy', 'chef', 'party', 'beanie', 'propeller', 'headphones', 'viking', 'halo', 'santa'];
  const DEFAULT_BOTS = [
    { id: 'ceo', name: 'Boss Bot', role: 'CEO', costume: 'crown', color: 0xffd166, speed: 1.4 },
    { id: 'tess', name: 'Tess-Bot', role: 'Tester', costume: 'robot', color: 0xc9b6ff, speed: 1.6 },
  ];
  const DEFAULT_NEWS = [
    { id: 'n1', title: 'Sprint demo', body: 'Friday 3 PM in the glass meeting room.', color: 'gold' },
    { id: 'n2', title: 'New hire', body: 'Welcome Kai, joining as Web Developer on Monday.', color: 'mint' },
  ];
  const getLayout = async () => (await store.get('layout')) || L.defaultLayout();
  const getBots = async () => (await store.get('bots')) || DEFAULT_BOTS;
  const authenticate = async (req) => {
    const p = A.verify(readCookie(req, 'cl_session'), SECRET);
    return p ? store.get(userKey(p.u)) : null;
  };
  const canWear = async (username, costume, color) => { const u = await store.get(userKey(username)); return !!u && owns(u, costume, color); };
  // Coin changes are queued per user so quick bets, payouts and whacks cannot overwrite each other.
  const coinLocks = new Map();
  const withLock = (k, fn) => { const prev = coinLocks.get(k) || Promise.resolve(); const next = prev.then(fn, fn); coinLocks.set(k, next.catch(() => {})); return next; };
  const r1 = (n) => Math.round(n * 10) / 10;
  const addCoins = (username, n) => withLock(username, async () => { const u = await store.get(userKey(username)); if (!u) return null; u.coins = r1((u.coins || 0) + n); await store.set(userKey(username), u); return u.coins; });
  const spendCoins = (username, n) => withLock(username, async () => { const u = await store.get(userKey(username)); if (!u || (u.coins || 0) < n - 1e-9) return null; u.coins = r1((u.coins || 0) - n); await store.set(userKey(username), u); return u.coins; });
  const nightfloat = createNightfloat({ authenticate });
  const world = createWorld({ authenticate, getLayout, getBots, store, canWear, addCoins, spendCoins, deskPaySecs: Number(env.DESK_PAY_SECS) || 10 });
  app.locals.world = world;
  app.locals.nightfloat = nightfloat;
  app.locals.wordly = createWordly();


  // ---- mail: the only way coins and new outfits arrive ----
  const MAX_MAIL = 100;
  const mailKey = (u) => `mail:${u}`;
  async function deliver(to, m) {
    const box = (await store.get(mailKey(to))) || [];
    box.unshift({ id: crypto.randomBytes(6).toString('hex'), from: m.from, subject: m.subject, body: m.body, at: Date.now(), read: false, attachment: m.attachment || null, claimed: false });
    while (box.length > MAX_MAIL) box.pop();
    await store.set(mailKey(to), box);
    world.notify(to, { t: 'mail' });
  }
  function cleanAttachment(a) {
    if (!a) return null;
    if (a.type === 'coins') { const n = a.amount; return Number.isInteger(n) && n >= 1 && n <= 100000 ? { type: 'coins', amount: n } : false; }
    if (a.type === 'outfit') return ITEM_LABELS[a.item] ? { type: 'outfit', item: a.item, label: ITEM_LABELS[a.item] } : false;
    return false;
  }
  app.get('/api/mail', wrap(requireUser), wrap(async (req, res) => {
    const mail = (await store.get(mailKey(req.user.username))) || [];
    res.json({ mail, unread: mail.filter((m) => !m.read).length, coins: req.user.coins || 0, items: req.user.items || [] });
  }));
  app.post('/api/mail/read', wrap(requireUser), wrap(async (req, res) => {
    const box = (await store.get(mailKey(req.user.username))) || [];
    const m = box.find((x) => x.id === req.body.id);
    if (!m) return res.status(404).json({ error: 'No such message.' });
    m.read = true; await store.set(mailKey(req.user.username), box);
    res.json({ ok: true });
  }));
  app.post('/api/mail/claim', wrap(requireUser), wrap(async (req, res) => {
    const u = req.user.username, box = (await store.get(mailKey(u))) || [];
    const m = box.find((x) => x.id === req.body.id);
    if (!m || !m.attachment) return res.status(404).json({ error: 'Nothing to claim.' });
    // One claim per message, even with double-clicks or two tabs.
    const first = await store.set(`claim:${u}:${m.id}`, 1, { nx: true });
    if (!first || m.claimed) return res.status(409).json({ error: 'Already claimed.' });
    const user = await store.get(userKey(u));
    if (m.attachment.type === 'coins') user.coins = (user.coins || 0) + m.attachment.amount;
    else { user.items = user.items || []; if (!user.items.includes(m.attachment.item)) user.items.push(m.attachment.item); }
    m.claimed = true; m.read = true;
    await store.set(userKey(u), user); await store.set(mailKey(u), box);
    res.json({ user: publicUser(user), mail: m });
  }));
  app.post('/api/mail/delete', wrap(requireUser), wrap(async (req, res) => {
    const box = (await store.get(mailKey(req.user.username))) || [];
    const m = box.find((x) => x.id === req.body.id);
    if (m && m.attachment && !m.claimed) return res.status(400).json({ error: 'Claim the attachment first.' });
    await store.set(mailKey(req.user.username), box.filter((x) => x.id !== req.body.id));
    res.json({ ok: true });
  }));
  // Players can send plain messages. Only admins can attach coins or outfits, or send as a bot.
  app.post('/api/mail/send', wrap(requireUser), wrap(async (req, res) => {
    const { to, subject, body, attachment, fromName } = req.body || {};
    const isAdmin = !!req.user.admin;
    if (!isAdmin && !(await limit(`rl:mail:${req.user.username}`, 10, 600))) return res.status(429).json({ error: 'Slow down. Try again in a few minutes.' });
    const subj = String(subject || '').trim().slice(0, 80), text = String(body || '').trim().slice(0, 1000);
    if (!subj) return res.status(400).json({ error: 'Add a subject.' });
    const att = cleanAttachment(attachment);
    if (att === false) return res.status(400).json({ error: 'Invalid attachment.' });
    if (att && !isAdmin) return res.status(403).json({ error: 'Only admins can attach coins or outfits.' });
    let targets;
    if (to === '*') { if (!isAdmin) return res.status(403).json({ error: 'Only admins can mail everyone.' }); targets = await store.smembers('users'); }
    else { const t = String(to || '').toLowerCase(); if (!(await store.get(userKey(t)))) return res.status(404).json({ error: 'No such user.' }); targets = [t]; }
    const from = isAdmin && fromName ? String(fromName).trim().slice(0, 24) : `${req.user.name} · ${req.user.role}`;
    for (const t of targets) await deliver(t, { from, subject: subj, body: text, attachment: att });
    res.json({ sent: targets.length });
  }));
  app.get('/api/users', wrap(requireUser), wrap(async (req, res) => {
    const names = await store.smembers('users');
    const users = (await Promise.all(names.map((n) => store.get(userKey(n))))).filter(Boolean).map((u) => ({ username: u.username, name: u.name, role: u.role }));
    res.json({ users });
  }));

  app.get('/api/whiteboards', wrap(requireUser), wrap(async (req, res) => { await world.ready(); res.json({ boards: await world.whiteboards() }); }));
  app.get('/api/layout', wrap(requireUser), wrap(async (req, res) => res.json({ layout: await getLayout() })));
  app.put('/api/admin/layout', wrap(requireUser), requireAdmin, wrap(async (req, res) => {
    const v = L.validate(req.body && req.body.layout);
    if (v.error) return res.status(400).json({ error: v.error });
    // keep the version being replaced, so a bad save can always be undone
    const presets = (await store.get('layouts')) || [], old = (await store.get('layout')) || L.defaultLayout();
    const keep = presets.filter((x) => x.id !== 'prev'); keep.unshift({ id: 'prev', name: 'Before your last save (automatic)', savedAt: Date.now(), layout: old });
    await store.set('layouts', keep.slice(0, 31));
    await store.set('layout', v.layout);
    await world.reload(); world.refreshClients();
    res.json({ layout: v.layout });
  }));
  // Character moves: poses and animations made in the admin Animation studio, playable by everyone.
  const getAnims = async () => { const a = await store.get('anims'); return Array.isArray(a) ? a : JSON.parse(JSON.stringify(AN.STARTERS)); };
  app.get('/api/anims', wrap(requireUser), wrap(async (req, res) => res.json({ anims: await getAnims() })));
  app.put('/api/admin/anims', wrap(requireUser), requireAdmin, wrap(async (req, res) => {
    const list = await getAnims(), v = AN.sanitize(req.body && req.body.anim, list);
    if (v.error) return res.status(400).json({ error: v.error });
    const i = list.findIndex((x) => x.id === v.anim.id);
    if (i >= 0) list[i] = v.anim; else { if (list.length >= 40) return res.status(400).json({ error: 'Too many moves (40 max). Delete one first.' }); list.push(v.anim); }
    await store.set('anims', list);
    res.json({ anims: list, anim: v.anim });
  }));
  app.post('/api/admin/anims/delete', wrap(requireUser), requireAdmin, wrap(async (req, res) => {
    const id = String((req.body && req.body.id) || '');
    const list = (await getAnims()).filter((x) => x.id !== id);
    await store.set('anims', list);
    res.json({ anims: list });
  }));
  // Saved layouts: named copies the admin can load back into the editor later.
  const presetInfo = (x) => ({ id: x.id, name: x.name, savedAt: x.savedAt, w: x.layout.w, h: x.layout.h });
  app.get('/api/admin/layouts', wrap(requireUser), requireAdmin, wrap(async (req, res) => res.json({ layouts: ((await store.get('layouts')) || []).map(presetInfo) })));
  app.get('/api/admin/layouts/:id', wrap(requireUser), requireAdmin, wrap(async (req, res) => {
    const x = ((await store.get('layouts')) || []).find((y) => y.id === req.params.id);
    if (!x) return res.status(404).json({ error: 'Saved layout not found.' });
    res.json({ layout: x.layout, name: x.name });
  }));
  app.post('/api/admin/layouts', wrap(requireUser), requireAdmin, wrap(async (req, res) => {
    const name = String((req.body && req.body.name) || '').trim().slice(0, 40);
    if (!name) return res.status(400).json({ error: 'Give the saved layout a name.' });
    const v = L.validate(req.body && req.body.layout);
    if (v.error) return res.status(400).json({ error: v.error });
    let list = (await store.get('layouts')) || [];
    const same = list.find((x) => x.name.toLowerCase() === name.toLowerCase() && x.id !== 'prev');
    const entry = { id: same ? same.id : 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, savedAt: Date.now(), layout: v.layout };
    list = same ? list.map((x) => (x === same ? entry : x)) : [...list, entry];
    if (list.length > 31) return res.status(400).json({ error: 'You can keep up to 30 saved layouts. Delete one first.' });
    await store.set('layouts', list);
    res.json({ layouts: list.map(presetInfo) });
  }));
  app.post('/api/admin/layouts/delete', wrap(requireUser), requireAdmin, wrap(async (req, res) => {
    const list = ((await store.get('layouts')) || []).filter((x) => x.id !== String((req.body && req.body.id) || ''));
    await store.set('layouts', list);
    res.json({ layouts: list.map(presetInfo) });
  }));
  app.post('/api/admin/layout/reset', wrap(requireUser), requireAdmin, wrap(async (req, res) => {
    await store.del('layout'); await world.reload(); world.refreshClients();
    res.json({ layout: L.defaultLayout() });
  }));

  app.get('/api/announcements', wrap(requireUser), wrap(async (req, res) => res.json({ items: (await store.get('news')) || DEFAULT_NEWS })));
  app.put('/api/admin/announcements', wrap(requireUser), requireAdmin, wrap(async (req, res) => {
    const items = req.body && req.body.items;
    if (!Array.isArray(items) || items.length > 20) return res.status(400).json({ error: 'Send up to 20 announcements.' });
    const clean = items.map((n, i) => ({
      id: String(n.id || 'n' + i).slice(0, 16), title: String(n.title || '').trim().slice(0, 60), body: String(n.body || '').trim().slice(0, 300),
      color: ['gold', 'mint', 'pink'].includes(n.color) ? n.color : 'gold',
    })).filter((n) => n.title);
    await store.set('news', clean); world.refreshClients();
    res.json({ items: clean });
  }));

  app.get('/api/logo', wrap(requireUser), wrap(async (req, res) => res.json({ dataUrl: (await store.get('logo')) || null })));
  app.put('/api/admin/logo', wrap(requireUser), requireAdmin, wrap(async (req, res) => {
    const d = req.body && req.body.dataUrl;
    if (d === null) await store.del('logo');
    else if (typeof d === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(d) && d.length < 500000) await store.set('logo', d);
    else return res.status(400).json({ error: 'Upload a PNG, JPEG or WebP under 350 KB.' });
    world.refreshClients();
    res.json({ ok: true });
  }));

  app.get('/api/bots', wrap(requireUser), wrap(async (req, res) => res.json({ bots: await getBots(), roles: BOT_ROLES, costumes: BOT_COSTUMES })));
  const cleanPost = (p) => {
    if (!p || typeof p !== 'object' || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
    return { x: Math.min(60, Math.max(0, Math.round(p.x * 100) / 100)), z: Math.min(40, Math.max(0, Math.round(p.z * 100) / 100)), r: Number.isFinite(p.r) ? Math.round(p.r * 100) / 100 : 0, seat: !!p.seat };
  };
  app.put('/api/admin/bots', wrap(requireUser), requireAdmin, wrap(async (req, res) => {
    const bots = req.body && req.body.bots;
    if (!Array.isArray(bots) || bots.length > 12) return res.status(400).json({ error: 'Up to 12 bots.' });
    const clean = [];
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i] || {};
      const name = String(b.name || '').trim().slice(0, 16);
      if (!name) return res.status(400).json({ error: 'Every bot needs a name.' });
      if (!BOT_ROLES.includes(b.role) || !BOT_COSTUMES.includes(b.costume) || !Number.isInteger(b.color) || b.color < 0 || b.color > 0xffffff) return res.status(400).json({ error: 'Invalid bot settings.' });
      clean.push({ id: String(b.id || 'b' + i + Date.now().toString(36)).replace(/[^a-z0-9_]/gi, '').slice(0, 16) || 'b' + i, name, role: b.role, costume: b.costume, color: b.color, speed: Math.min(3, Math.max(0.5, Number(b.speed) || 1.5)), post: cleanPost(b.post) });
    }
    await store.set('bots', clean); await world.reload(); world.refreshClients();
    res.json({ bots: clean });
  }));

  app.get('/healthz', (req, res) => res.json({ ok: true, store: store.kind, online: world.online() }));

  app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error(err);
    res.status(err.status || 500).json({ error: 'Something went wrong.' });
  });
  return app;
}

if (require.main === module) {
  const store = createStore();
  const port = process.env.PORT || 3000;
  const app = createApp(store);
  const server = http.createServer(app);
  app.locals.world.handleUpgrade(server);
  app.locals.nightfloat.handleUpgrade(server);
  app.locals.wordly.handleUpgrade(server);
  server.listen(port, () => console.log(`SayBearLand on :${port} (storage: ${store.kind})`));
}
module.exports = { createApp };
