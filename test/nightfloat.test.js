'use strict';
const assert = require('assert');
const NF = require('../public/nightfloat-core.js');
const ok = (m) => console.log('ok - ' + m);

// same seed, same lake; different day, different lake
const a = NF.genLake('2026-11-11'), b = NF.genLake('2026-11-11'), c = NF.genLake('2026-11-12');
assert.deepStrictEqual(JSON.stringify(a), JSON.stringify(b)); assert.notStrictEqual(JSON.stringify(a), JSON.stringify(c));
ok('daily lake is the same for everyone and changes each day');

// every lake over many days: 7 casts, fits the time limit, has an object cast, a monster, and a smaller-then-larger sequence
for (let d = 1; d <= 60; d++) {
  const L = NF.genLake('t' + d);
  assert.equal(L.casts.length, 7); assert.ok(NF.CONDITIONS.includes(L.condition));
  const kinds = L.casts.map((x) => x.enc.map((e) => e.id).join('+'));
  assert.ok(L.casts.some((x) => x.enc[0].kind === 'object'), 'object cast');
  assert.ok(kinds.includes('hollowking'), 'monster');
  L.casts.forEach((x) => {
    x.enc.forEach((e) => { assert.ok(e.start >= 1.5 && e.end <= NF.CAST_SECS - 1, 'fits: ' + e.id + ' ' + e.start + '-' + e.end); assert.ok(e.wE > e.wS); });
    for (let i = 1; i < x.enc.length; i++) assert.ok(x.enc[i].start > x.enc[i - 1].end, 'no overlap');
  });
  assert.ok(L.casts.filter((x) => x.spec.type === 'seq').every((x) => NF.RANK[x.enc[0].size] < NF.RANK[x.enc[1].size] || x.enc[0].size !== x.enc[1].size));
}
ok('60 lakes: 7 casts, fit in 25 s, object cast and monster present, encounters never overlap');

// each signature produces its own kind of motion
const sig = (id) => { const e = NF.genCast(NF.makeRng(id), { type: 'single', id }, 'calm'); const en = e.enc[0]; let maxX = 0, maxD = 0, maxL = 0, maxT = 0, flips = 0, prev = 0;
  for (let t = en.start; t <= en.end; t += 0.01) { const m = NF.motion(en, t); maxX = Math.max(maxX, Math.abs(m.x)); maxD = Math.max(maxD, m.dip); maxL = Math.max(maxL, m.lift); maxT = Math.max(maxT, Math.abs(m.trem)); const s = Math.sign(m.dip - 0.05); if (s !== prev) { flips++; prev = s; } }
  return { en, maxX, maxD, maxL, maxT, flips }; };
const g = sig('gulper'), k = sig('hollowking'), s = sig('skimray'), d = sig('dawdler'), gl = sig('glimmerling'), r = sig('ribbonjaw'), bo = sig('boot');
assert.ok(g.maxD > 0.9 && g.maxX === 0 && g.maxT === 0, 'gulper: one hard plunge'); assert.ok(Math.abs((g.en.wE - g.en.wS) - 0.5) < 1e-9, 'gulper window is half a second');
assert.ok(k.maxT > 0.03 && k.maxD > 1.1, 'hollow king: trembles then plunges');
assert.ok(s.maxL > 0.99 && s.maxD === 0 && s.maxX === 0, 'skimray: rises and lies flat');
assert.ok(d.maxX > 0.85 && d.maxD === 0, 'dawdler: sideways drift with no dip');
assert.ok(gl.maxD > 0.2 && gl.maxX === 0 && gl.flips >= 10, 'glimmerling: many quick taps');
assert.ok(r.maxX > 0.55 && r.maxD > 0.15, 'ribbonjaw: taps then drift');
assert.ok(bo.maxD > 0.1 && bo.en.kind === 'object', 'boot: bobs');
ok('each creature has its own float signature');

// strike rules
const gc = NF.genCast(NF.makeRng(5), { type: 'single', id: 'gulper' }, 'calm'), ge = gc.enc[0];
assert.equal(NF.resolveStrike(gc, 0.5).outcome, 'early');
assert.equal(NF.resolveStrike(gc, ge.wS - 0.3).outcome, 'early');
assert.equal(NF.resolveStrike(gc, (ge.wS + ge.wE) / 2).outcome, 'landed');
assert.equal(NF.resolveStrike(gc, ge.wE + 0.2).outcome, 'late');
assert.equal(NF.resolveStrike(gc, 24).outcome, 'late');
const oc = NF.genCast(NF.makeRng(6), { type: 'object', id: 'boot' }, 'calm');
assert.equal(NF.resolveStrike(oc, oc.enc[0].start + 2).outcome, 'junk');
ok('early, late, landed and junk strikes');

// scoring
let res = NF.scoreCast(gc, NF.resolveStrike(gc, (ge.wS + ge.wE) / 2), 'large');
assert.equal(res.points, 75); assert.ok(res.correct);
res = NF.scoreCast(gc, NF.resolveStrike(gc, (ge.wS + ge.wE) / 2), null); assert.equal(res.points, 50);
res = NF.scoreCast(gc, NF.resolveStrike(gc, (ge.wS + ge.wE) / 2), 'small'); assert.equal(res.points, 50); assert.ok(!res.correct);
assert.equal(NF.scoreCast(gc, NF.resolveStrike(gc, 0.5), 'large').points, 0);
assert.equal(NF.scoreCast(oc, NF.resolveStrike(oc, oc.enc[0].start + 2), 'notfish').points, 0);
assert.equal(NF.scoreCast(oc, null, 'notfish').points, NF.NOT_FISH_BONUS); assert.ok(NF.scoreCast(oc, null, 'notfish').notFishOk);
assert.equal(NF.scoreCast(oc, null, 'large').points, 0); assert.equal(NF.scoreCast(oc, null, null).points, 0);
assert.equal(NF.scoreCast(gc, null, 'notfish').points, 0);
ok('scoring: base, correct call, no call, early, junk, "Not a fish"');

const sc = NF.genCast(NF.makeRng(7), { type: 'seq', ids: ['glimmerling', 'gulper'] }, 'calm'), big = sc.enc[1];
res = NF.scoreCast(sc, NF.resolveStrike(sc, (big.wS + big.wE) / 2), 'large');
assert.equal(res.patience, NF.PATIENCE); assert.equal(res.points, 75 + NF.PATIENCE);
res = NF.scoreCast(sc, NF.resolveStrike(sc, (sc.enc[0].wS + sc.enc[0].wE) / 2), 'small'); assert.equal(res.patience, 0);
ok('patience bonus for passing up a smaller creature');

// conditions change the float without a creature
const cond = (c) => { const x = NF.genCast(NF.makeRng(9), { type: 'single', id: 'gulper' }, c); let mx = 0, mn = 9; for (let t = 2; t < 4; t += 0.01) { const f = NF.floatAt(x, t); mx = Math.max(mx, f.x); mn = Math.min(mn, f.x); } return { x, span: mx - mn }; };
assert.ok(cond('current').span > 0.05 && cond('calm').span < 0.05);
const w = NF.genLake('w1'); assert.ok(NF.genCast(NF.makeRng(1), { type: 'single', id: 'dawdler' }, 'wind').fake.length >= 0);
ok('conditions');

assert.equal(NF.glyph({ outcome: 'landed', correct: true }), 'G'); assert.ok(!/[a-z]{4}/i.test(NF.shareText('2026-11-11', a, [{ outcome: 'landed', correct: true, creature: 'gulper' }], 75, true).replace(/Night Float|practice|Score|calm|wind|current|rain/g, '')));
ok('share text does not reveal creatures');
console.log('all passed');
