'use strict';
const assert = require('assert');
const http = require('http');
const { createApp } = require('../server');
const { memoryStore } = require('../lib/store');
const AN = require('../public/anims.js');
const ok = (n) => console.log(`ok - ${n}`);
(async () => {
  const app = createApp(memoryStore(), { SESSION_SECRET: 's', ADMIN_USERNAMES: 'boss' });
  const server = http.createServer(app); await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (method, path, body, ck) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', cookie: ck || '' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: await r.json().catch(() => ({})), cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
  };
  async function account(u, role) { const s = await api('POST', '/api/signup', { name: u, username: u, role }); return (await api('POST', '/api/login', { username: u, password: s.json.temporaryPassword })).cookie; }
  const boss = await account('boss', 'CCO'), amy = await account('amy', 'Tester');

  let r = await api('GET', '/api/anims', null, amy); assert.equal(r.json.anims[0].id, 'hotline-bling'); assert.ok(r.json.anims.length >= 5); ok('players get the starter moves');
  const pose = (o) => Object.assign(AN.zero(), o);
  const mv = { name: 'Big wave', key: '9', loop: true, dur: 1, frames: [{ t: 0, p: pose({ aRz: 2 }) }, { t: 0.5, p: pose({ aRz: 99, fRz: 1 }) }] };
  r = await api('PUT', '/api/admin/anims', { anim: mv }, amy); assert.equal(r.status, 403); ok('players cannot save moves');
  r = await api('PUT', '/api/admin/anims', { anim: mv }, boss); assert.equal(r.status, 200);
  assert.equal(r.json.anim.id, 'big-wave'); assert.equal(r.json.anim.frames[1].p.aRz, 3); ok('admin saves a move, values are clamped');
  r = await api('GET', '/api/anims', null, amy); assert.ok(r.json.anims.some((a) => a.id === 'big-wave')); ok('players see the new move');
  r = await api('PUT', '/api/admin/anims', { anim: { ...mv, name: 'Other' } }, boss); assert.equal(r.status, 400); ok('a key can only belong to one move');
  r = await api('PUT', '/api/admin/anims', { anim: { name: 'x', frames: [] } }, boss); assert.equal(r.status, 400); ok('a move needs keyframes');
  r = await api('PUT', '/api/admin/anims', { anim: { ...mv, id: 'big-wave', name: 'Bigger wave', key: '' } }, boss); assert.equal(r.json.anims.filter((a) => a.id === 'big-wave').length, 1); ok('saving again updates the same move');
  const a = r.json.anim; assert.equal(AN.sample(a, 0).aRz, 2); assert.equal(AN.sample(a, 0.5).aRz, 3); assert.ok(AN.sample(a, 0.25).aRz > 2 && AN.sample(a, 0.25).aRz < 3); ok('sampling interpolates between keyframes');
  r = await api('POST', '/api/admin/anims/delete', { id: 'big-wave' }, boss); assert.ok(!r.json.anims.some((x) => x.id === 'big-wave')); ok('admin deletes a move');
  app.locals.world.close(); server.close(); console.log('all passed');
})().catch((e) => { console.error(e); process.exit(1); });
