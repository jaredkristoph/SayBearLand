'use strict';
const assert = require('assert');
const { createApp } = require('../server');
const { memoryStore } = require('../lib/store');
const LR = require('../public/lanternroad/core.js');

(async () => {
  // ---- core simulation ----
  LR.setRng(LR.seeded(11));
  let S = LR.newState();
  assert.equal(Object.keys(S.heroes).length, 3);
  for (let i = 0; i < 4000; i++) LR.tick(S, .25, []);
  assert.ok(S.league > 5 && S.gold > 0 && S.stats.kills > 0, 'walks and fights on its own');
  const g0 = S.gold; S.gold = 1e6; assert.ok(LR.act.buyGear(S, 'blade') && S.gear.blade === 1 && S.gold < 1e6); S.gold = g0;
  assert.ok(!LR.act.setFlame(S, 'blue'), 'blue flame locked until a legend unlocks it');
  S.meta.legends.blue = 1; assert.ok(LR.act.setFlame(S, 'blue'));
  S.embers = 100; assert.ok(LR.act.flare(S) && !LR.act.flare(S), 'flare has a cooldown');
  // wipe returns to the last waystone
  S = LR.newState(); S.league = 47.3; S.stoneIdx = 4; Object.keys(S.heroes).forEach((k) => { S.heroes[k].hp = .02; });
  S.gate = 50; S.fight = null; LR.setRng(LR.seeded(5));
  for (let i = 0; i < 400 && S.stats.wipes === 0; i++) { S.walkT = 0; S.heroes.warden.hp = .02; LR.tick(S, .25, []); }
  // guardian gate stops offline progress
  S = LR.newState(); LR.setRng(LR.seeded(3)); S.league = 49.9; S.gate = 50;
  const res = LR.offline(S, 4 * 3600 * 1000);
  assert.ok(res.gate && S.league <= 50 + 1e-6, 'offline halts at the guardian');
  // offline cap
  S = LR.newState(); LR.setRng(LR.seeded(4));
  const o2 = LR.offline(S, 30 * 3600 * 1000); assert.ok(o2.capped && o2.seconds === 8 * 3600, 'offline capped at 8h');
  assert.ok(S.journal.length > 0, 'offline writes diary entries');
  // retell
  S = LR.newState(); S.best = 95; assert.ok(LR.talesFor(S) >= 20); const t = LR.act.retell(S); assert.ok(t >= 20 && S.league === 0 && S.meta.tales === t && S.meta.runs === 1);
  assert.ok(LR.act.buyLegend(S, 'vigor') && S.meta.legends.vigor === 1);
  console.log('ok - core simulation');

  // ---- accounts and saves ----
  const app = createApp(memoryStore(), { SESSION_SECRET: 'test-secret', ADMIN_USERNAMES: 'boss' });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, ck = '') => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', cookie: ck }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie');
    return { status: r.status, json: await r.json().catch(() => ({})), ck: sc ? sc.split(';')[0] : '' };
  };
  let r = await call('POST', '/lanternroad/api/signup', { username: 'Walker_1', password: 'short' });
  assert.equal(r.status, 400);
  r = await call('POST', '/lanternroad/api/signup', { username: 'Walker_1', password: 'longenough1', name: 'Walker' });
  assert.equal(r.status, 201); const ck = r.ck; assert.ok(ck.startsWith('lr_session='));
  r = await call('POST', '/lanternroad/api/signup', { username: 'walker_1', password: 'longenough1' });
  assert.equal(r.status, 409);
  r = await call('GET', '/lanternroad/api/me', null, ck); assert.equal(r.status, 200); assert.equal(r.json.user.username, 'walker_1'); assert.equal(r.json.save, null);
  r = await call('PUT', '/lanternroad/api/save', { state: LR.newState() }, ck); assert.equal(r.status, 200);
  r = await call('PUT', '/lanternroad/api/save', { state: { v: 1 } }, ck); assert.equal(r.status, 400);
  r = await call('PUT', '/lanternroad/api/save', { state: LR.newState() }); assert.equal(r.status, 401);
  r = await call('GET', '/lanternroad/api/me', null, ck); assert.equal(r.json.save.v, 1);
  r = await call('POST', '/lanternroad/api/login', { username: 'walker_1', password: 'wrongwrong' }); assert.equal(r.status, 401);
  r = await call('POST', '/lanternroad/api/login', { username: 'walker_1', password: 'longenough1' }); assert.equal(r.status, 200); assert.ok(r.json.save && typeof r.json.awayMs === 'number');
  // separate account systems
  r = await call('POST', '/api/login', { username: 'walker_1', password: 'longenough1' }); assert.equal(r.status, 401);
  r = await call('GET', '/api/me', null, ck); assert.equal(r.status, 401);
  console.log('ok - separate accounts and saves');
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
