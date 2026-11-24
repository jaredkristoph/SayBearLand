(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RitmicCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var BPM = 100, BEAT = 60 / BPM, CYCLE = 8, CYCLE_T = BEAT * CYCLE;
  var KEYS = ['q', 'w', 'e'];
  var COMBOS = { attack: 'wwew', shield: 'qqww' };
  var WINDOW = { perfect: 0.075, good: 0.15 };
  var BOSS = { name: 'Grumbold the Stone Warden', hp: 1100, squadHp: 100 };
  var ATTACKS = {
    smash: { beats: [6], dmg: 24 },
    double: { beats: [5, 7], dmg: 14 },
    quake: { beats: [6], dmg: 34 }
  };
  var HIT = { base: 9, perfect: 1.25, fever: 1.3, stagger: 1.5 };

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function judge(err) {
    var a = Math.abs(err);
    return a <= WINDOW.perfect ? 'perfect' : a <= WINDOW.good ? 'good' : null;
  }
  function matchCombo(keys) {
    for (var n in COMBOS) if (COMBOS[n] === keys) return n;
    return null;
  }
  function prefixOk(keys) {
    for (var n in COMBOS) if (COMBOS[n].indexOf(keys) === 0) return true;
    return false;
  }
  // taps: [{key, err}] in order -> {ok, combo, quality}
  function evaluate(taps) {
    if (!taps || taps.length !== 4) return { ok: false, combo: null, quality: 'fail' };
    var keys = '', perfect = true;
    for (var i = 0; i < 4; i++) {
      var j = taps[i] && judge(taps[i].err);
      if (!j) return { ok: false, combo: null, quality: 'fail' };
      if (j !== 'perfect') perfect = false;
      keys += taps[i].key;
    }
    var c = matchCombo(keys);
    if (!c) return { ok: false, combo: null, quality: 'fail' };
    return { ok: true, combo: c, quality: perfect ? 'perfect' : 'good' };
  }

  function newState() {
    return { bossHp: BOSS.hp, hp: BOSS.squadHp, combo: 0, nextStagger: false, sinceAttack: 1, cycle: 0, hitsTaken: 0, time: 0, over: null };
  }
  function phaseOf(st) {
    var f = st.bossHp / BOSS.hp;
    return f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
  }
  function chooseBossAction(st, rng) {
    var a;
    if (st.nextStagger) { st.nextStagger = false; st.sinceAttack = 0; return { type: 'stagger' }; }
    var p = phaseOf(st), s = st.sinceAttack, r = rng();
    if (p === 1) a = (s >= 3 || (s >= 1 && r < 0.6)) ? 'smash' : 'idle';
    else if (p === 2) {
      if (s >= 2 || (s >= 1 && r < 0.7)) a = rng() < 0.5 ? 'smash' : 'double'; else a = 'idle';
    } else {
      if (s >= 1 || r < 0.85) { var q = rng(); a = q < 0.34 ? 'smash' : q < 0.67 ? 'double' : 'quake'; } else a = 'idle';
    }
    st.sinceAttack = a === 'idle' ? s + 1 : 0;
    return { type: a };
  }
  function isAttack(a) { return !!(a && ATTACKS[a.type]); }
  function noteCommand(st, cmd) {
    if (cmd && cmd.ok) st.combo++; else st.combo = 0;
  }
  function hitDamage(st, cmd, action) {
    var d = HIT.base;
    if (cmd.quality === 'perfect') d *= HIT.perfect;
    if (st.combo >= 3) d *= HIT.fever;
    if (action && action.type === 'stagger') d *= HIT.stagger;
    return Math.round(d * 10) / 10;
  }
  // Pure: returns ordered events for the squad-turn half of a cycle (beats 4..7).
  function resolveCycle(st, cmd, action, opts) {
    opts = opts || {};
    var ev = [], scale = opts.dmgScale == null ? 1 : opts.dmgScale;
    noteCommand(st, cmd);
    var shielded = !!(cmd.ok && cmd.combo === 'shield');
    if (cmd.ok && cmd.combo === 'attack') {
      var d = hitDamage(st, cmd, action);
      for (var b = 4; b < 8; b++) ev.push({ beat: b, type: 'bossHit', dmg: d });
    }
    if (isAttack(action)) {
      var at = ATTACKS[action.type];
      for (var i = 0; i < at.beats.length; i++)
        ev.push({ beat: at.beats[i], type: 'strike', dmg: Math.round(at.dmg * scale), blocked: shielded, kind: action.type });
      if (shielded) st.nextStagger = true;
    }
    ev.sort(function (a, b) { return a.beat - b.beat; });
    return ev;
  }
  function applyEvent(st, e) {
    if (st.over) return;
    if (e.type === 'bossHit') {
      st.bossHp = Math.max(0, st.bossHp - e.dmg);
      if (st.bossHp <= 0) st.over = 'won';
    } else if (e.type === 'strike' && !e.blocked && e.dmg > 0) {
      st.hp = Math.max(0, st.hp - e.dmg); st.hitsTaken++;
      if (st.hp <= 0) st.over = 'lost';
    }
  }
  function status(st) { return st.over || 'fighting'; }
  function rank(st) {
    var h = st.hitsTaken;
    return h === 0 ? 'S' : h <= 2 ? 'A' : h <= 4 ? 'B' : 'C';
  }

  // ---- full game engine driven by song time `s` (seconds) ----
  function createGame(o) {
    o = o || {};
    var rng = mulberry32(o.seed == null ? 1 : o.seed);
    var g = {
      st: newState(), mode: o.skipTraining ? 'fight' : 'lesson-attack',
      action: null, taps: [], failed: false, slotsUsed: {}, cycle: -1,
      queue: [], out: [], evaluated: true, lessonPass: 0, expected: null
    };
    function emit(e) { g.out.push(e); }
    g.drain = function () { var x = g.out; g.out = []; return x; };
    function begin(k) {
      g.cycle = k; g.taps = []; g.failed = false; g.slotsUsed = {}; g.evaluated = false;
      var a;
      if (g.mode === 'lesson-attack') a = { type: 'idle' };
      else if (g.mode === 'lesson-shield') a = { type: 'smash' };
      else a = chooseBossAction(g.st, rng);
      g.action = a;
      g.expected = isAttack(a) ? 'shield' : 'attack';
      if (g.mode === 'lesson-attack') g.expected = 'attack';
      g.st.cycle = k;
      var ph = phaseOf(g.st);
      if (g.mode === 'fight' && g.phase !== ph) { g.phase = ph; emit({ type: 'phase', n: ph, at: k * CYCLE_T }); }
      emit({ type: 'cycle', k: k, action: a, mode: g.mode, expected: g.expected, at: k * CYCLE_T });
    }
    function finish(k) {
      g.evaluated = true;
      var cmd = evaluate(g.failed ? null : g.taps);
      var base = k * CYCLE_T;
      var lesson = g.mode.indexOf('lesson') === 0;
      emit({ type: 'command', combo: cmd.combo, quality: cmd.quality, ok: cmd.ok, at: base + BEAT * 3.6 });
      var evs;
      if (lesson) {
        var pass = (g.mode === 'lesson-attack' && cmd.combo === 'attack') || (g.mode === 'lesson-shield' && cmd.combo === 'shield');
        var tmp = newState();
        evs = resolveCycle(tmp, cmd, g.action, { dmgScale: 0 });
        evs.forEach(function (e) { e.cosmetic = true; });
        g.lessonResult = pass;
      } else {
        evs = resolveCycle(g.st, cmd, g.action);
      }
      if (cmd.ok) for (var i = 0; i < 4; i++) emit({ type: 'army', key: COMBOS[cmd.combo][i], slot: i, at: base + (4 + i) * BEAT });
      else emit({ type: 'stumble', at: base + 4 * BEAT });
      evs.forEach(function (e) { e.at = base + e.beat * BEAT; g.queue.push(e); });
      g.queue.sort(function (a, b) { return a.at - b.at; });
      g.cmd = cmd;
      g.settleAt = base + CYCLE_T - 0.01;
    }
    g.press = function (key, s) {
      if (g.st.over || KEYS.indexOf(key) < 0 || s < 0) return null;
      var n = Math.round(s / BEAT), k = Math.floor(n / CYCLE), j = n - k * CYCLE, err = s - n * BEAT;
      if (k !== g.cycle || j > 3) return { ignored: true };
      if (g.evaluated) return { ignored: true };
      var jd = judge(err);
      if (g.slotsUsed[j]) return { ignored: true };
      g.slotsUsed[j] = true;
      var keys = g.taps.map(function (t) { return t.key; }).join('') + key;
      var bad = !jd || j !== g.taps.length || !prefixOk(keys);
      g.taps.push({ key: key, err: err, slot: j });
      if (bad) g.failed = true;
      emit({ type: 'tap', key: key, slot: j, judge: bad ? 'miss' : jd, err: err, at: s });
      return { judge: bad ? 'miss' : jd, slot: j };
    };
    g.step = function (s) {
      var guard = 0;
      while (guard++ < 50) {
        var k = Math.floor(s / CYCLE_T);
        if (g.cycle < 0 || (k > g.cycle && g.evaluated)) {
          if (g.cycle >= 0 && s < g.cycle * CYCLE_T + CYCLE_T) break;
          if (g.cycle >= 0 && g.mode.indexOf('lesson') === 0) {
            if (g.lessonResult) {
              if (g.mode === 'lesson-attack') g.mode = 'lesson-shield';
              else { g.mode = 'fight'; g.st = newState(); g.phase = 0; emit({ type: 'fightStart', at: s }); }
              emit({ type: 'lessonPass', mode: g.mode, at: s });
            } else emit({ type: 'lessonRetry', at: s });
          }
          begin(g.cycle < 0 ? k : g.cycle + 1);
          continue;
        }
        break;
      }
      if (!g.evaluated && s >= g.cycle * CYCLE_T + (BEAT * 3 + 0.16)) finish(g.cycle);
      while (g.queue.length && g.queue[0].at <= s) {
        var e = g.queue.shift();
        if (!e.cosmetic) applyEvent(g.st, e);
        emit(e);
        if (g.st.over) { g.queue.length = 0; emit({ type: g.st.over === 'won' ? 'win' : 'lose', at: e.at, rank: rank(g.st) }); }
      }
    };
    return g;
  }

  return { BPM: BPM, BEAT: BEAT, CYCLE: CYCLE, CYCLE_T: CYCLE_T, KEYS: KEYS, COMBOS: COMBOS, WINDOW: WINDOW, BOSS: BOSS, ATTACKS: ATTACKS, HIT: HIT,
    mulberry32: mulberry32, judge: judge, matchCombo: matchCombo, prefixOk: prefixOk, evaluate: evaluate, newState: newState, phaseOf: phaseOf,
    chooseBossAction: chooseBossAction, hitDamage: hitDamage, resolveCycle: resolveCycle, applyEvent: applyEvent, noteCommand: noteCommand,
    status: status, rank: rank, createGame: createGame, isAttack: isAttack };
});
