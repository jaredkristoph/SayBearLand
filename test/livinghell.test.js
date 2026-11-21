'use strict';
const assert = require('assert');
const http = require('http');
const { createApp } = require('../server');
const { memoryStore } = require('../lib/store');
const C = require('../public/livinghell/core.js');
const ok = (n) => console.log(`ok - ${n}`);

// ---- character creation ----
const ch = C.newCharacter();
assert.equal(C.pointsLeft(ch), 12); assert.equal(C.STATS.length, 8); ok('a new character has 12 skill points and 8 stats');
assert.equal(C.setStat(ch, 'vitality', -1), false); ok('stats cannot go below 1');
for (let i = 0; i < 12; i++) assert.ok(C.setStat(ch, i % 2 ? 'vitality' : 'strength', 1));
assert.equal(C.pointsLeft(ch), 0); assert.equal(C.setStat(ch, 'agility', 1), false); ok('points run out after 12');
assert.ok(C.setStat(ch, 'strength', -1) && C.pointsLeft(ch) === 1); ok('points can be taken back');
const big = C.newCharacter(); for (let i = 0; i < 12; i++) C.setStat(big, 'strength', 1); assert.equal(big.stats.strength, C.MAXSTAT); ok('one stat cannot pass the maximum');
const r = C.newCharacter(); C.randomize(r, () => 0.99); assert.equal(r.skin, C.SKINS.length - 1); assert.equal(r.hair, C.HAIRS.length - 1); ok('randomize picks looks only');
assert.equal(C.cleanName('  Rex   The  Damned!!  '), 'Rex The Damned'); assert.equal(C.cleanName('<b>Rex</b>'), 'bRexb'); assert.equal(C.cleanName('A very long name indeed').length, 14); assert.ok(!C.validName('a')); assert.ok(C.validName('Jo')); ok('names are cleaned and need two letters');

// ---- fight maths ----
const me = C.fighter('Me', { strength: 5, agility: 2, attack: 5, defence: 3, vitality: 4, charisma: 1, stamina: 3, magicka: 4 });
const foe = C.fighter('Foe', { strength: 2, agility: 1, attack: 1, defence: 1, vitality: 2, charisma: 1, stamina: 3, magicka: 1 }, { hp: 30 });
assert.equal(me.maxHp, 52); assert.equal(me.maxSp, 12); assert.equal(foe.hp, 30); ok('health and stamina come from vitality and stamina');
assert.ok(C.hitChance(me, foe, 'quick', 'good') > C.hitChance(me, foe, 'heavy', 'good')); assert.ok(C.hitChance(me, foe, 'quick', 'perfect') > C.hitChance(me, foe, 'quick', 'good') && C.hitChance(me, foe, 'quick', 'poor') < C.hitChance(me, foe, 'quick', 'good')); ok('quick strikes are more accurate, timing changes accuracy');
const low = () => 0.0, mid = () => 0.5;
let a = C.resolve(me, foe, 'quick', 'good', null, mid), b = C.resolve(me, foe, 'quick', 'perfect', null, mid); assert.ok(a.hit && b.crit && b.dmg > a.dmg); ok('a perfect timing hits harder');
const h = C.resolve(me, foe, 'heavy', 'good', null, mid); assert.ok(h.dmg > a.dmg); ok('heavy strikes beat quick strikes');
assert.equal(C.resolve(me, foe, 'quick', 'good', null, () => 0.999).hit, false); ok('a bad roll misses');
const armored = C.fighter('Tank', { strength: 1, agility: 1, attack: 1, defence: 10, vitality: 1, charisma: 1, stamina: 1, magicka: 1 });
const sword = C.resolve(me, armored, 'heavy', 'good', null, mid).dmg, flame = C.resolve(me, armored, 'hellfire', 'good', null, mid).dmg; const bare = C.resolve(me, foe, 'heavy', 'good', null, mid).dmg; assert.ok(sword < bare); assert.ok(flame > 0); ok('defence cuts weapon damage');
const fireNoArmor = C.resolve(me, armored, 'hellfire', 'good', null, mid).dmg, fireOpen = C.resolve(me, foe, 'hellfire', 'good', null, mid).dmg; assert.equal(fireNoArmor, fireOpen); ok('Hellfire ignores defence');
const blk = C.resolve(me, foe, 'quick', 'good', 'block', mid); assert.ok(blk.blocked && blk.dmg < a.dmg); assert.ok(C.resolve(me, foe, 'quick', 'good', 'parry', mid).parried); ok('blocking cuts damage, a parry cancels it');
foe.guard = true; const g1 = C.resolve(me, foe, 'quick', 'good', null, mid); foe.guard = false; assert.ok(g1.guarded && g1.dmg < a.dmg); ok('guarding halves the next hit');
const p1 = C.fighter('P', me.stats), e1 = C.fighter('E', foe.stats, { hp: 30 }); const before = p1.sp; C.apply(p1, e1, 'heavy', { dmg: 7 }); assert.equal(p1.sp, before - 4); assert.equal(e1.hp, 23); C.apply(p1, e1, 'guard', { dmg: 0 }); assert.ok(p1.guard && p1.sp === before - 4 + 3); ok('strikes spend stamina, guard restores it');
assert.ok(!C.canUse(C.fighter('x', foe.stats, { hp: 5 }) && Object.assign(C.fighter('x', foe.stats), { sp: 1 }), 'quick')); ok('you cannot swing without stamina');
const t = C.fighter('t', foe.stats); t.sp = 0; assert.equal(C.enemyChoose(t, mid, true), 'guard'); t.sp = 9; assert.equal(C.enemyChoose(t, () => 0.8, true), 'quick'); assert.equal(C.enemyChoose(t, () => 0.8, false), 'heavy'); ok('the tutorial enemy never uses heavy strikes');
assert.ok(C.playerFirst(me, foe)); ok('the more agile fighter acts first');

// ---- saves ----
const good = { v: 1, ch: Object.assign(C.newCharacter(), { name: 'Rex', skin: 3 }), tutorial: 1, wins: 2 }; good.ch.stats.strength = 6; good.ch.stats.vitality = 5;
const s = C.sanitize(good); assert.ok(s && s.ch.name === 'Rex' && s.ch.skin === 3 && s.tutorial === 1); ok('a good save survives');
assert.equal(C.sanitize({ v: 1, ch: { name: '' } }), null); assert.equal(C.sanitize(null), null); ok('bad saves are rejected');
const cheat = C.sanitize({ v: 1, ch: { name: 'Cheat', skin: 99, hair: -4, stats: { strength: 50, agility: 50, attack: 50, defence: 9, vitality: 9, charisma: 9, stamina: 9, magicka: 9 } } });
assert.equal(cheat.ch.skin, 0); assert.ok(C.pointsLeft(cheat.ch) >= 0 && cheat.ch.stats.strength <= C.MAXSTAT); ok('cheated stats are cut back to the 12-point budget');

(async () => {
  const app = createApp(memoryStore(), { SESSION_SECRET: 's' });
  const server = http.createServer(app); await new Promise((r2) => server.listen(0, r2));
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (method, path, body, ck) => { const x = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', cookie: ck || '' }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, json: await x.json().catch(() => ({})), cookie: (x.headers.get('set-cookie') || '').split(';')[0] }; };
  const su = await api('POST', '/api/signup', { name: 'Mia', username: 'mia', role: 'Tester' });
  const ck = (await api('POST', '/api/login', { username: 'mia', password: su.json.temporaryPassword })).cookie;
  assert.equal((await api('GET', '/api/livinghell/save')).status, 401); ok('cloud save needs a login');
  assert.equal((await api('GET', '/api/livinghell/save', null, ck)).json.state, null); ok('no save at first');
  assert.equal((await api('PUT', '/api/livinghell/save', { state: good }, ck)).status, 200);
  const back = await api('GET', '/api/livinghell/save', null, ck); assert.equal(back.json.state.ch.name, 'Rex'); assert.equal(back.json.state.tutorial, 1); ok('a save comes back as it was stored');
  assert.equal((await api('PUT', '/api/livinghell/save', { state: { v: 1, ch: { name: '' } } }, ck)).status, 400); ok('an invalid save is refused');
  await api('DELETE', '/api/livinghell/save', {}, ck); assert.equal((await api('GET', '/api/livinghell/save', null, ck)).json.state, null); ok('a save can be erased');
  const page = await fetch(base + '/livinghell/'); assert.equal(page.status, 200); assert.ok((await page.text()).includes('Living Hell')); ok('the game page is served at /livinghell');
  for (const f of ['hell.jpg', 'sun.png', 'prisoner.png']) assert.equal((await fetch(`${base}/livinghell/img/${f}`)).status, 200); ok('the art files are served');
  app.locals.world.close(); server.close(); console.log('all passed');
})().catch((e) => { console.error(e); process.exit(1); });
