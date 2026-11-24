const assert = require('assert');
const C = require('../public/ritmic/core.js');
const { BEAT, CYCLE_T } = C;

function tapsOf(str, err) { return str.split('').map(k => ({ key: k, err: err || 0 })); }
// evaluate / judge
assert.strictEqual(C.evaluate(tapsOf('wwew')).combo, 'attack');
assert.strictEqual(C.evaluate(tapsOf('wwew')).quality, 'perfect');
assert.strictEqual(C.evaluate(tapsOf('qqww', 0.1)).quality, 'good');
assert.strictEqual(C.evaluate(tapsOf('qqww')).combo, 'shield');
assert.strictEqual(C.evaluate(tapsOf('wwwe')).ok, false);
assert.strictEqual(C.evaluate(tapsOf('wwew', 0.2)).ok, false);
assert.strictEqual(C.evaluate(tapsOf('www')).ok, false);
assert.ok(C.prefixOk('ww') && C.prefixOk('qq') && !C.prefixOk('we'));
assert.strictEqual(C.judge(0.07), 'perfect'); assert.strictEqual(C.judge(-0.12), 'good'); assert.strictEqual(C.judge(0.2), null);

// resolveCycle rules
{
  const st = C.newState();
  const ev = C.resolveCycle(st, { ok: true, combo: 'shield', quality: 'good' }, { type: 'smash' });
  assert.strictEqual(ev.length, 1); assert.ok(ev[0].blocked); assert.ok(st.nextStagger);
  const st2 = C.newState();
  const ev2 = C.resolveCycle(st2, { ok: false, combo: null, quality: 'fail' }, { type: 'double' });
  assert.strictEqual(ev2.length, 2); assert.ok(!ev2[0].blocked);
  ev2.forEach(e => C.applyEvent(st2, e)); assert.strictEqual(st2.hp, 100 - 28);
  const st3 = C.newState();
  const ev3 = C.resolveCycle(st3, { ok: true, combo: 'attack', quality: 'good' }, { type: 'idle' });
  assert.strictEqual(ev3.length, 4);
  const stg = C.newState(); stg.combo = 0;
  const d1 = C.hitDamage(stg, { quality: 'good' }, { type: 'idle' }), d2 = C.hitDamage(stg, { quality: 'good' }, { type: 'stagger' });
  assert.ok(d2 > d1 * 1.4);
}
// stagger forced after block
{
  const st = C.newState(), rng = C.mulberry32(3);
  st.nextStagger = true;
  assert.strictEqual(C.chooseBossAction(st, rng).type, 'stagger');
  assert.ok(!st.nextStagger);
}

// bots through full engine
function play(seed, policy, maxCycles) {
  const g = C.createGame({ seed, skipTraining: true });
  const dt = 1 / 60; let s = 0, cyc = -1, plan = null, planned = {};
  const end = (maxCycles || 120) * CYCLE_T;
  while (s < end && !g.st.over) {
    g.step(s);
    if (g.cycle !== cyc) { cyc = g.cycle; plan = policy(g, g.action); planned = {}; }
    if (plan) for (let i = 0; i < 4; i++) {
      const t = cyc * CYCLE_T + i * BEAT + (plan.err || 0);
      if (!planned[i] && s >= t) { planned[i] = 1; g.press(plan.combo[i], t); }
    }
    s += dt;
  }
  g.step(s);
  return { g, s };
}
const perfect = (g, a) => ({ combo: C.isAttack(a) ? C.COMBOS.shield : C.COMBOS.attack });
const greedy = () => ({ combo: C.COMBOS.attack });
const idle = () => null;
const turtle = () => ({ combo: C.COMBOS.shield });
let cycles = [];
for (let seed = 1; seed <= 20; seed++) {
  const r = play(seed, perfect);
  assert.strictEqual(r.g.st.over, 'won', 'perfect bot should win seed ' + seed);
  assert.strictEqual(r.g.st.hitsTaken, 0, 'perfect bot untouched');
  cycles.push(r.g.cycle);
  const q = play(seed, greedy); assert.strictEqual(q.g.st.over, 'lost', 'greedy loses seed ' + seed);
  const i = play(seed, idle); assert.strictEqual(i.g.st.over, 'lost', 'idle loses seed ' + seed);
  const t = play(seed, turtle, 80); assert.ok(t.g.st.bossHp === C.BOSS.hp, 'turtle never damages boss');
  const sloppy = play(seed, (g, a) => ({ combo: C.isAttack(a) ? C.COMBOS.shield : C.COMBOS.attack, err: 0.1 }));
  assert.strictEqual(sloppy.g.st.over, 'won'); // good timing still wins
  const late = play(seed, (g, a) => ({ combo: C.COMBOS.shield, err: 0.2 }), 40);
  assert.ok(late.g.st.over !== 'won');
}
const maxC = Math.max.apply(null, cycles), minC = Math.min.apply(null, cycles);
console.log('perfect bot wins in', minC + 1, '-', maxC + 1, 'cycles (' + Math.round((maxC + 1) * CYCLE_T) + 's max)');
assert.ok(maxC < 60 && minC > 8);

// training flow
{
  const g = C.createGame({ seed: 5 }); let s = 0, seen = [];
  const dt = 1 / 60, doPress = (combo, k) => combo.split('').forEach((c, i) => g.press(c, k * CYCLE_T + i * BEAT));
  g.step(0);
  assert.strictEqual(g.mode, 'lesson-attack');
  // fail first (idle), then do attack
  s = CYCLE_T + 0.01; g.step(s); assert.strictEqual(g.mode, 'lesson-attack');
  g.step(s); doPress('wwew', g.cycle); s = (g.cycle + 1) * CYCLE_T + 0.01; for (let t = (g.cycle) * CYCLE_T; t < s; t += dt) g.step(t); g.step(s);
  assert.strictEqual(g.mode, 'lesson-shield');
  doPress('qqww', g.cycle); const c0 = g.cycle; for (let t = c0 * CYCLE_T; t < (c0 + 1) * CYCLE_T + 0.02; t += dt) g.step(t);
  assert.strictEqual(g.mode, 'fight'); assert.strictEqual(g.st.hp, 100); assert.strictEqual(g.st.bossHp, C.BOSS.hp);
}
console.log('ritmic core ok');
