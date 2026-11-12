'use strict';
// Lanternroad: its own accounts and saves, fully separate from SayBearLand logins.
// Keys live under "lr:" in the same store. The session cookie is "lr_session", signed with a
// different secret, so a SayBearLand login never works here and vice versa.
const express = require('express');
const A = require('./auth');

const NAME_RE = /^[a-z0-9_]{3,20}$/;
const MAX_SAVE = 64 * 1024;

function mount(app, store, { secret, secure }) {
  const SECRET = secret + ':lanternroad';
  const SESSION_MS = 30 * 24 * 3600 * 1000;
  const r = express.Router();
  r.use(express.json({ limit: '70kb' }));
  r.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'GET' && !req.is('application/json')) return res.status(415).json({ error: 'JSON only' });
    next();
  });
  const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
  const uKey = (u) => `lr:user:${u}`;
  const sKey = (u) => `lr:save:${u}`;
  const cookie = (req) => { const m = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith('lr_session=')); return m ? decodeURIComponent(m.slice(11)) : null; };
  const setSession = (res, u) => res.cookie('lr_session', A.sign({ u, exp: Date.now() + SESSION_MS }, SECRET), { httpOnly: true, sameSite: 'lax', secure, maxAge: SESSION_MS, path: '/' });
  async function limit(key, max, win) { const n = await store.incr(key); if (n === 1) await store.expire(key, win); return n <= max; }
  const pub = (u) => ({ username: u.username, name: u.name });

  async function requireUser(req, res, next) {
    const p = A.verify(cookie(req), SECRET);
    const user = p && (await store.get(uKey(p.u)));
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    req.user = user; next();
  }

  r.post('/signup', wrap(async (req, res) => {
    if (!(await limit(`lr:rl:signup:${req.ip}`, 10, 3600))) return res.status(429).json({ error: 'Too many sign-ups. Try again later.' });
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const name = String(req.body.name || username).trim().slice(0, 24) || username;
    if (!NAME_RE.test(username)) return res.status(400).json({ error: 'Username must be 3 to 20 letters, numbers or underscores.' });
    if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'Password must be 8 to 72 characters.' });
    const user = { username, name, passwordHash: A.hashPassword(password), createdAt: Date.now() };
    if (!(await store.set(uKey(username), user, { nx: true }))) return res.status(409).json({ error: 'That username is taken.' });
    setSession(res, username);
    res.status(201).json({ user: pub(user), save: null, now: Date.now(), awayMs: 0 });
  }));

  r.post('/login', wrap(async (req, res) => {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!(await limit(`lr:rl:login:${req.ip}:${username}`, 8, 600))) return res.status(429).json({ error: 'Too many attempts. Wait a few minutes.' });
    const user = await store.get(uKey(username));
    const good = A.verifyPassword(password, user ? user.passwordHash : A.hashPassword('x'));
    if (!user || !good) return res.status(401).json({ error: 'Wrong username or password.' });
    setSession(res, username);
    const rec = await store.get(sKey(username));
    res.json({ user: pub(user), save: rec ? rec.state : null, now: Date.now(), awayMs: rec ? Date.now() - rec.savedAt : 0 });
  }));

  r.post('/logout', (req, res) => { res.clearCookie('lr_session', { path: '/' }); res.json({ ok: true }); });

  r.get('/me', wrap(requireUser), wrap(async (req, res) => {
    const rec = await store.get(sKey(req.user.username));
    res.json({ user: pub(req.user), save: rec ? rec.state : null, now: Date.now(), awayMs: rec ? Date.now() - rec.savedAt : 0 });
  }));

  r.put('/save', wrap(requireUser), wrap(async (req, res) => {
    if (!(await limit(`lr:rl:save:${req.user.username}`, 90, 60))) return res.status(429).json({ error: 'Saving too fast.' });
    const s = req.body && req.body.state;
    if (!s || typeof s !== 'object' || s.v !== 1 || typeof s.league !== 'number' || !s.meta || typeof s.meta !== 'object') return res.status(400).json({ error: 'Bad save.' });
    if (!Number.isFinite(s.league) || s.league < 0 || s.league > 100000) return res.status(400).json({ error: 'Bad save.' });
    if (JSON.stringify(s).length > MAX_SAVE) return res.status(413).json({ error: 'Save too large.' });
    await store.set(sKey(req.user.username), { state: s, savedAt: Date.now() });
    res.json({ ok: true, savedAt: Date.now() });
  }));

  r.post('/change-password', wrap(requireUser), wrap(async (req, res) => {
    const { oldPassword, newPassword } = req.body || {};
    if (!A.verifyPassword(String(oldPassword || ''), req.user.passwordHash)) return res.status(401).json({ error: 'Wrong current password.' });
    if (String(newPassword || '').length < 8 || String(newPassword).length > 72) return res.status(400).json({ error: 'Password must be 8 to 72 characters.' });
    await store.set(uKey(req.user.username), { ...req.user, passwordHash: A.hashPassword(String(newPassword)) });
    res.json({ ok: true });
  }));

  app.use('/lanternroad/api', r);
}

module.exports = { mount };
