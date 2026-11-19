'use strict';
const assert = require('assert');
const http = require('http');
const { createApp } = require('../server');
const { memoryStore } = require('../lib/store');
const G = require('../public/amialive/core.js');
const ok = (n) => console.log(`ok - ${n}`);

// ---- the whole escape, played through the rules ----
const s = G.newState(); assert.equal(G.progress(s), 4); ok('waking up counts for a little progress');
let r = G.use(s, 'door', null); assert.ok(/padlock/.test(r.msg) && !s.flags.door); ok('the door starts locked');
r = G.use(s, 'pillow', null); assert.ok(G.has(s, 'hairpin')); r = G.use(s, 'pillow', null); assert.equal(s.inv.length, 1); ok('the hairpin is only given once');
r = G.use(s, 'drawer', null); assert.ok(/Locked/.test(r.msg)); r = G.use(s, 'drawer', 'hairpin');
assert.ok(G.has(s, 'windkey') && G.has(s, 'ribbon') && G.has(s, 'clip') && s.flags.drawer && !G.has(s, 'hairpin')); ok('the hairpin opens the desk drawer and is used up');
r = G.use(s, 'musicbox', null); assert.ok(/missing/.test(r.msg)); r = G.use(s, 'musicbox', 'windkey'); assert.ok(G.has(s, 'coin') && r.sound === 'lullaby'); ok('the music box gives up a coin');
r = G.use(s, 'vent', 'ribbon'); assert.ok(/does not work/.test(r.msg)); r = G.use(s, 'vent', 'coin'); assert.ok(s.flags.vent && !G.has(s, 'coin')); ok('the coin is the screwdriver');
r = G.use(s, 'vent', 'ribbon'); assert.ok(!s.flags.key); ok('a plain ribbon does not reach the key');
assert.equal(G.enterCode(s, '1234').ok, false); assert.ok(!s.flags.nightstand);
G.use(s, 'clock', null); assert.ok(s.flags.clock); const c = G.enterCode(s, '0307'); assert.ok(c.ok && G.has(s, 'tape') && G.has(s, 'band')); ok('the stopped clock is the code');
assert.equal(G.combine(s, 'coin', 'tape').ok, false); const cb = G.combine(s, 'tape', 'ribbon'); assert.ok(cb.ok && G.has(s, 'sticky') && !G.has(s, 'tape') && !G.has(s, 'ribbon')); ok('ribbon and tape combine into a sticky ribbon');
r = G.use(s, 'vent', 'sticky'); assert.ok(G.has(s, 'key') && !G.has(s, 'sticky')); ok('the sticky ribbon fetches the key');
r = G.use(s, 'door', 'coin'); assert.ok(!s.flags.door); r = G.use(s, 'door', 'key'); assert.ok(s.flags.door && r.done); ok('the brass key opens the door');
assert.equal(G.progress(s), 100); ok('progress reaches exactly 100%');
assert.equal(G.STEPS.reduce((a, x) => a + x[1], 0), 100); ok('step weights add up to 100');

// ---- saves ----
assert.ok(G.sanitize(s) && G.sanitize(s).flags.door); assert.equal(G.sanitize({ v: 1, view: 9, flags: {}, inv: [] }), null); assert.equal(G.sanitize({ v: 1, view: 0, flags: {}, inv: ['nope'] }), null); ok('bad saves are rejected');

(async () => {
  const app = createApp(memoryStore(), { SESSION_SECRET: 's' });
  const server = http.createServer(app); await new Promise((r2) => server.listen(0, r2));
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (method, path, body, ck) => { const x = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', cookie: ck || '' }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, json: await x.json().catch(() => ({})), cookie: (x.headers.get('set-cookie') || '').split(';')[0] }; };
  const su = await api('POST', '/api/signup', { name: 'Mia', username: 'mia', role: 'Tester' });
  const ck = (await api('POST', '/api/login', { username: 'mia', password: su.json.temporaryPassword })).cookie;
  let x = await api('GET', '/api/amialive/save'); assert.equal(x.status, 401); ok('cloud save needs a login');
  x = await api('GET', '/api/amialive/save', null, ck); assert.equal(x.json.state, null); ok('no save at first');
  x = await api('PUT', '/api/amialive/save', { state: { v: 1, view: 2, flags: { woke: 1, pillow: 1 }, inv: ['hairpin'] } }, ck); assert.equal(x.status, 200);
  x = await api('GET', '/api/amialive/save', null, ck); assert.equal(x.json.state.view, 2); assert.deepEqual(x.json.state.inv, ['hairpin']); ok('a save comes back as it was stored');
  x = await api('PUT', '/api/amialive/save', { state: { v: 1, view: 0, flags: {}, inv: ['ufo'] } }, ck); assert.equal(x.status, 400); ok('an invalid save is refused');
  x = await api('DELETE', '/api/amialive/save', {}, ck); x = await api('GET', '/api/amialive/save', null, ck); assert.equal(x.json.state, null); ok('a save can be erased');
  const page = await fetch(base + '/amialive/'); assert.equal(page.status, 200); assert.ok((await page.text()).includes('Am I Alive?')); ok('the game page is served at /amialive');
  app.locals.world.close(); server.close(); console.log('all passed');
})().catch((e) => { console.error(e); process.exit(1); });
