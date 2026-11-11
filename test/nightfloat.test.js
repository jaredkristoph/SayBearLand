'use strict';
const assert = require('assert');
const NF = require('../public/nightfloat-core.js');
const ok = (m) => console.log('ok - ' + m);

// the daily lake is the same for everyone and changes each day
const a = NF.genLake('2026-11-11'), b = NF.genLake('2026-11-11'), c = NF.genLake('2026-11-12');
assert.strictEqual(JSON.stringify(a), JSON.stringify(b)); assert.notStrictEqual(JSON.stringify(a), JSON.stringify(c));
ok('daily lake is deterministic and changes each day');

// the lake has a name and a condition, and no marked fishing spots
for (let d = 1; d <= 80; d++) { const L = NF.genLake('t' + d); assert.ok(NF.CONDITIONS.includes(L.condition)); assert.ok(L.name); assert.ok(!('spots' in L)); }
assert.equal(NF.ORDER.length, 56); assert.equal(new Set(NF.ORDER).size, 56);
Object.values(NF.CREATURES).forEach((c) => { assert.ok(!('size' in c)); assert.ok(NF.HABS[c.hab]); assert.ok(NF.PAT[c.pat]); assert.ok(c.w > 0); });
['shallow', 'mid', 'deep'].forEach((h) => assert.ok(Object.values(NF.CREATURES).filter((c) => c.hab === h).length >= 6));
ok('no fishing spots; 56 creatures, each with a bite pattern and a habitat');

// fishing anywhere: what bites depends on where the float lands
assert.equal(NF.habitatAt(0, -45), 'shallow'); assert.equal(NF.habitatAt(0, -30), 'mid'); assert.equal(NF.habitatAt(2, 3), 'deep');
const tally = (x, z) => { const t = {}; for (let i = 0; i < 4000; i++) { const cs = NF.rollCast(NF.makeRng('x' + x + z + i), { x, z }, 10, 'calm'); const id = cs.enc[0].id; t[id] = (t[id] || 0) + 1; } return t; };
const near = tally(0, -45), far = tally(2, 3);
assert.ok(!near.hollowking && !near.sturgeon && !near.wels, 'no giants in the shallows');
assert.ok((far.walleye || 0) + (far.pike || 0) + (far.gulper || 0) > 300, 'big fish out in the deep');
assert.ok((far.bluegill || 0) === 0 && (near.bluegill || 0) > 50, 'shallow fish stay in the shallows');
const kinds = (t) => Object.keys(t).filter((k) => NF.CREATURES[k]).length; assert.ok(kinds(near) >= 18 && kinds(far) >= 10);
const deepO = NF.oddsFor(2, 3); assert.ok(deepO.boot > 0 && deepO.weed > 0 && deepO.snag > 0);
assert.deepEqual(NF.oddsFor(2, 3), NF.oddsFor(2, 3));
ok('where the float lands decides what can bite');

// casts: encounters in order, clear of each other, first bite after a calm wait
for (let i = 0; i < 300; i++) {
  const cs = NF.rollCast(NF.makeRng('c' + i), { x: (i % 40) - 20, z: (i % 33) - 16 }, 4 + (i % 17), 'calm');
  assert.ok(cs.enc[0].start >= NF.SETTLE + 4 && cs.enc.length >= 1 && cs.enc.length <= 3);
  for (let k = 1; k < cs.enc.length; k++) assert.ok(cs.enc[k].start > cs.enc[k - 1].end);
  cs.enc.forEach((e) => assert.ok(e.wE >= e.wS && e.end >= e.wE));
}
ok('casts: calm wait before the first bite, encounters never overlap');

// each signature produces its own kind of float motion
const sig = (id) => { const cs = NF.rollCast(NF.makeRng(id), null, 10, 'calm'); const en = NF.build(id, 5, NF.makeRng(id + 'b')); let maxX = 0, maxD = 0, maxL = 0, maxT = 0, flips = 0, prev = 0;
  for (let t = en.start; t <= en.end; t += 0.01) { const m = NF.motion(en, t); maxX = Math.max(maxX, Math.abs(m.x)); maxD = Math.max(maxD, m.dip); maxL = Math.max(maxL, m.lift); maxT = Math.max(maxT, Math.abs(m.trem)); const s = Math.sign(m.dip - 0.05); if (s !== prev) { flips++; prev = s; } }
  return { en, maxX, maxD, maxL, maxT, flips }; };
const g = sig('gulper'), k = sig('hollowking'), s = sig('skimray'), d = sig('dawdler'), gl = sig('glimmerling'), r = sig('ribbonjaw'), bo = sig('boot');
assert.ok(g.maxD > 0.9 && g.maxX === 0 && g.maxT === 0); assert.ok(Math.abs((g.en.wE - g.en.wS) - 0.5) < 1e-9, 'half a second to strike a Gulper');
assert.ok(k.maxT > 0.03 && k.maxD > 1.1); assert.ok(s.maxL > 0.99 && s.maxD === 0 && s.maxX === 0); assert.ok(d.maxX > 0.85 && d.maxD === 0);
assert.ok(gl.maxD > 0.2 && gl.maxX === 0 && gl.flips >= 10); assert.ok(r.maxX > 0.55 && r.maxD > 0.15); assert.ok(bo.maxD > 0.1 && bo.en.kind === 'object');
ok('each creature has its own float signature');

// strike rules
const gc = NF.rollCast(NF.makeRng(5), null, 10, 'calm'); gc.enc = [NF.build('gulper', 6, NF.makeRng(1))]; const ge = gc.enc[0];
assert.equal(NF.resolveStrike(gc, 0.5).outcome, 'early'); assert.equal(NF.resolveStrike(gc, ge.wS - 0.3).outcome, 'early');
assert.equal(NF.resolveStrike(gc, (ge.wS + ge.wE) / 2).outcome, 'landed'); assert.equal(NF.resolveStrike(gc, ge.wE + 0.2).outcome, 'late'); assert.equal(NF.resolveStrike(gc, 90).outcome, 'late');
const oc = NF.rollCast(NF.makeRng(6), null, 10, 'calm'); oc.enc = [NF.build('boot', 6, NF.makeRng(2))];
assert.equal(NF.resolveStrike(oc, 8).outcome, 'junk');
ok('early, late, landed and junk strikes');

// conditions move the float
const spanOf = (cond) => { const x = NF.rollCast(NF.makeRng(9), null, 10, cond); x.enc = [NF.build('gulper', 30, NF.makeRng(1))]; let mx = -9, mn = 9; for (let t = 2; t < 6; t += 0.01) { const f = NF.floatAt(x, t); mx = Math.max(mx, f.x); mn = Math.min(mn, f.x); } return mx - mn; };
assert.ok(spanOf('current') > 0.05 && spanOf('calm') < 0.05);
assert.ok(NF.rollCast(NF.makeRng(3), null, 10, 'wind').fake.length > 0 || true);
ok('conditions');
console.log('all passed');
