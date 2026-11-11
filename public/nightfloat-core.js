/* Night Float: game rules shared by the page and the tests (no DOM here). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NF = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CAST_SECS = 25, CASTS = 7, SETTLE = 1.4;
  var SIZES = ['small', 'medium', 'large', 'monster'];
  var RANK = { small: 0, medium: 1, large: 2, monster: 3 };
  var BASE = { small: 10, medium: 25, large: 50, monster: 120 };
  // Open question in the brief: same multiplier for every size, or higher for Monster. One number per size so it is a one-line change.
  var CALL_MULT = { small: 1.5, medium: 1.5, large: 1.5, monster: 1.5 };
  var PATIENCE = 15, NOT_FISH_BONUS = 15;
  var CONDITIONS = ['calm', 'wind', 'current', 'rain'];

  // Six invented creatures and three non-fish objects.
  var CREATURES = {
    glimmerling: { id: 'glimmerling', name: 'Glimmerling', size: 'small', sig: 'Quick shallow taps, then a small slow dip.', tip: 'Wait for the taps to stop.' },
    dawdler: { id: 'dawdler', name: 'Dawdler', size: 'small', sig: 'Slow sideways drift, no dip.', tip: 'Strike late, once the drift ends.' },
    skimray: { id: 'skimray', name: 'Skimray', size: 'medium', sig: 'The float rises and lies flat.', tip: 'Strike while it lies flat.' },
    ribbonjaw: { id: 'ribbonjaw', name: 'Ribbonjaw', size: 'medium', sig: 'Taps first, then a slow drift.', tip: 'Let the drift finish.' },
    gulper: { id: 'gulper', name: 'Gulper', size: 'large', sig: 'Quiet, then one hard plunge.', tip: 'About half a second to strike.' },
    hollowking: { id: 'hollowking', name: 'Hollow King', size: 'monster', sig: 'Long trembling with no movement, then a huge plunge.', tip: 'The tremble means something big is near.' }
  };
  var OBJECTS = {
    boot: { id: 'boot', name: 'Old boot', sig: 'Regular, rhythmic bob.' },
    weed: { id: 'weed', name: 'Tangle of weed', sig: 'Regular, quick bob.' },
    snag: { id: 'snag', name: 'Snag', sig: 'Regular, shallow bob, held low.' }
  };

  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function makeRng(seed) {
    var a = typeof seed === 'number' ? seed >>> 0 : hashStr(String(seed));
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function range(r, a, b) { return a + (b - a) * r(); }
  function shuffle(r, arr) { var a = arr.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function smooth(a) { return a <= 0 ? 0 : a >= 1 ? 1 : a * a * (3 - 2 * a); }

  /* ---------- encounters ---------- */
  // Times inside an encounter are relative while it is built, then shifted to absolute cast time.
  function build(id, start, r) {
    var dir = r() < 0.5 ? -1 : 1, e = { id: id, start: start, dir: dir, kind: 'fish' }, c = CREATURES[id], i, t;
    if (OBJECTS[id]) {
      e.kind = 'object'; var dur = range(r, 8, 11);
      e.wS = start; e.wE = start + dur; e.end = start + dur;
      e.period = id === 'boot' ? 1.7 : id === 'weed' ? 1.1 : 2.3; e.amp = id === 'boot' ? 0.13 : id === 'weed' ? 0.08 : 0.05; e.held = id === 'snag' ? 0.2 : 0;
      return e;
    }
    e.size = c.size;
    if (id === 'glimmerling') {
      e.taps = []; t = range(r, 0.2, 0.5); var n = 8 + Math.floor(r() * 5);
      for (i = 0; i < n; i++) { e.taps.push(t); t += range(r, 0.22, 0.42); }
      e.wS = e.taps[n - 1] + 0.3; e.wE = e.wS + 1.0; e.end = e.wE + 0.4;
    } else if (id === 'dawdler') {
      e.dd = range(r, 3.6, 5); e.dist = 0.9; e.wS = e.dd; e.wE = e.wS + 1.2; e.end = e.wE + 0.6;
    } else if (id === 'skimray') {
      e.wS = 0.7; e.wE = 2.2; e.end = 2.9;
    } else if (id === 'ribbonjaw') {
      e.taps = []; t = range(r, 0.2, 0.4); var m = 4 + Math.floor(r() * 2);
      for (i = 0; i < m; i++) { e.taps.push(t); t += range(r, 0.3, 0.5); }
      e.ds = t + 0.2; e.dd = range(r, 2.6, 3.4); e.dist = 0.6; e.wS = e.ds + e.dd; e.wE = e.wS + 1.1; e.end = e.wE + 0.5;
    } else if (id === 'gulper') {
      e.pt = range(r, 1.6, 2.8); e.wS = e.pt + 0.05; e.wE = e.pt + 0.55; e.end = e.pt + 0.95;
    } else if (id === 'hollowking') {
      e.pt = range(r, 2.8, 4.2); e.wS = e.pt + 0.05; e.wE = e.pt + 0.5; e.end = e.pt + 0.95;
    }
    e.wS += start; e.wE += start; e.end += start;
    return e;
  }
  var DUR = { glimmerling: 5.5, dawdler: 6.5, skimray: 3, ribbonjaw: 7.5, gulper: 4, hollowking: 5.5 };

  function tapPulse(tau, times, amp) {
    var d = 0;
    for (var i = 0; i < times.length; i++) { var u = (tau - times[i]) / 0.12; if (u > 0 && u < 1) d += amp * Math.sin(Math.PI * u); }
    return d;
  }
  function fall(tau, a, len) { return 1 - smooth((tau - a) / len); }

  // Float displacement caused by one encounter at absolute time t. x sideways, dip downwards, lift (lying flat), trem (jitter).
  function motion(e, t) {
    var o = { x: 0, dip: 0, lift: 0, trem: 0 }, tau = t - e.start, rel = t;
    if (tau < 0 || t > e.end + 0.001) return o;
    if (e.kind === 'object') {
      var f = smooth(tau / 0.6) * (1 - smooth((t - (e.end - 0.6)) / 0.6));
      o.dip = e.amp * Math.sin(2 * Math.PI * tau / e.period) * f + e.held * f;
      if (e.id === 'weed') o.x = 0.08 * Math.sin(tau * 0.7) * f;
      return o;
    }
    var wS = e.wS - e.start, wE = e.wE - e.start;
    switch (e.id) {
      case 'glimmerling':
        o.dip = tapPulse(tau, e.taps, 0.22);
        if (tau >= wS - 0.05) o.dip += 0.3 * smooth((tau - wS) / 0.3) * (tau > wE - 0.3 ? 1 - smooth((tau - (wE - 0.3)) / 0.3) : 1);
        break;
      case 'dawdler':
        o.x = e.dir * e.dist * smooth(tau / e.dd) * (tau > wE ? fall(tau, wE, 0.6) : 1);
        break;
      case 'skimray':
        o.lift = smooth(tau / 0.5) * (tau > wE ? fall(tau, wE, 0.6) : 1);
        break;
      case 'ribbonjaw':
        o.dip = tapPulse(tau, e.taps, 0.18);
        o.x = e.dir * e.dist * smooth((tau - e.ds) / e.dd) * (tau > wE ? fall(tau, wE, 0.5) : 1);
        break;
      case 'gulper':
        o.dip = 0.95 * smooth((tau - e.pt) / 0.1) * (tau > e.pt + 0.6 ? fall(tau, e.pt + 0.6, 0.3) : 1);
        break;
      case 'hollowking':
        if (tau < e.pt) o.trem = 0.045 * (0.5 + 0.5 * tau / e.pt) * Math.sin(tau * 57) * Math.sin(tau * 23 + 1);
        o.dip = 1.2 * smooth((tau - e.pt) / 0.1) * (tau > e.pt + 0.55 ? fall(tau, e.pt + 0.55, 0.3) : 1);
        break;
    }
    return o;
  }

  /* ---------- a lake ---------- */
  function genCast(r, spec, condition) {
    var encs = [], t, i;
    var ids = spec.type === 'seq' ? spec.ids : [spec.id];
    t = range(r, 2.6, 5.5);
    ids.forEach(function (id, k) {
      var e = build(id, t, r); encs.push(e);
      t = e.end + range(r, 1.6, 2.6);
    });
    var last = encs[encs.length - 1];
    if (last.end > CAST_SECS - 1.5) { var shift = last.end - (CAST_SECS - 1.5); encs.forEach(function (e) { e.start -= shift; e.wS -= shift; e.wE -= shift; e.end -= shift; if (e.taps) { /* relative already */ } }); }
    var fake = [];
    if (condition === 'wind') {
      var nf = 3 + Math.floor(r() * 3);
      for (i = 0; i < nf; i++) {
        var s = range(r, 2, 21), clash = encs.some(function (e) { return s > e.start - 1.2 && s < e.end + 1.2; });
        if (clash) continue;
        var tp = [], tt = 0, n = 3 + Math.floor(r() * 4);
        if (r() < 0.6) { for (var k = 0; k < n; k++) { tp.push(tt); tt += range(r, 0.25, 0.45); } fake.push({ type: 'taps', start: s, taps: tp, end: s + tt + 0.2 }); }
        else fake.push({ type: 'drift', start: s, dir: r() < 0.5 ? -1 : 1, dd: range(r, 2, 3.5), end: s + 4.5 });
      }
    }
    return { spec: spec, condition: condition, enc: encs, fake: fake, ph1: r() * 6.28, ph2: r() * 6.28, ph3: r() * 6.28, x0: condition === 'current' ? -0.55 : 0 };
  }

  function floatAt(cast, t) {
    var s = { x: 0, dip: 0, lift: 0, trem: 0 }, i, m;
    var settle = t < SETTLE ? (1 - t / SETTLE) : 0; // plop: dips and rings out
    s.dip += settle * settle * 0.5 * Math.sin(t * 9) * 0.6;
    cast.enc.forEach(function (e) { m = motion(e, t); s.x += m.x; s.dip += m.dip; s.lift += m.lift; s.trem += m.trem; });
    var c = cast.condition;
    s.x += 0.012 * Math.sin(t * 0.5 + cast.ph1);
    if (c === 'wind') {
      s.x += 0.035 * Math.sin(t * 0.9 + cast.ph1) + 0.02 * Math.sin(t * 2.1 + cast.ph2);
      cast.fake.forEach(function (f) {
        var tau = t - f.start; if (tau < 0 || tau > f.end - f.start) return;
        if (f.type === 'taps') s.dip += tapPulse(tau, f.taps, 0.16);
        else s.x += f.dir * 0.5 * smooth(tau / f.dd) * (tau > f.dd ? 1 - smooth((tau - f.dd) / 1.2) : 1);
      });
    } else if (c === 'current') {
      s.x += cast.x0 + 0.045 * t;
    } else if (c === 'rain') {
      s.dip += 0.03 * (Math.sin(t * 17 + cast.ph1) + Math.sin(t * 11.3 + cast.ph2) + Math.sin(t * 6.1 + cast.ph3)) / 3 + 0.02 * Math.sin(t * 29 + cast.ph2);
      s.x += 0.02 * Math.sin(t * 3.3 + cast.ph3);
    }
    return s;
  }

  function dailySeed(d) { return String(d || new Date().toISOString().slice(0, 10)); }
  var LAKE_A = ['Hollow', 'Quiet', 'Slate', 'Lantern', 'Ember', 'Mirror', 'Thistle', 'Cinder', 'Velvet', 'Marrow', 'Pale', 'Tallow'];
  var LAKE_B = ['Mere', 'Tarn', 'Pool', 'Water', 'Reach', 'Basin', 'Broad', 'Lake'];

  function genLake(seed) {
    var r = makeRng('lake:' + seed);
    var condition = pick(r, CONDITIONS);
    var name = pick(r, LAKE_A) + ' ' + pick(r, LAKE_B);
    var small = ['glimmerling', 'dawdler'], bigger = ['skimray', 'ribbonjaw', 'gulper', 'hollowking'], single = ['glimmerling', 'dawdler', 'skimray', 'ribbonjaw', 'gulper'];
    var specs = [
      { type: 'object', id: pick(r, ['boot', 'weed', 'snag']) },
      { type: 'single', id: 'hollowking' },
      { type: 'seq', ids: [pick(r, small), pick(r, ['skimray', 'ribbonjaw', 'gulper'])] },
      { type: 'seq', ids: [pick(r, small), pick(r, bigger)] }
    ];
    while (specs.length < CASTS) specs.push({ type: 'single', id: pick(r, single) });
    if (r() < 0.3) specs[specs.length - 1] = { type: 'object', id: pick(r, ['boot', 'weed', 'snag']) };
    specs = shuffle(r, specs);
    if (specs[0].id === 'hollowking') { var j = 1 + Math.floor(r() * (CASTS - 1)); var tmp = specs[0]; specs[0] = specs[j]; specs[j] = tmp; }
    var casts = specs.map(function (sp, i) { return genCast(makeRng('cast:' + seed + ':' + i), sp, condition); });
    return { seed: String(seed), name: name, condition: condition, casts: casts };
  }

  /* ---------- striking and scoring ---------- */
  // outcome: early | late | landed | junk
  function resolveStrike(cast, t) {
    var enc = cast.enc, i, e;
    for (i = 0; i < enc.length; i++) {
      e = enc[i];
      if (t >= e.start && t <= e.end) {
        if (t < e.wS) return { outcome: 'early', enc: e, idx: i };
        if (t <= e.wE) return { outcome: e.kind === 'object' ? 'junk' : 'landed', enc: e, idx: i };
        return { outcome: 'late', enc: e, idx: i };
      }
    }
    return { outcome: t < enc[0].start ? 'early' : 'late', enc: null, idx: -1 };
  }

  function scoreCast(cast, strike, call) {
    // strike: result of resolveStrike, or null when the player let the cast run out
    var r = { points: 0, base: 0, mult: 1, patience: 0, bonus: 0, correct: false, notFishOk: false, outcome: strike ? strike.outcome : 'none', creature: null };
    var hasFish = cast.enc.some(function (e) { return e.kind === 'fish'; });
    if (!strike) {
      if (!hasFish && call === 'notfish') { r.notFishOk = true; r.bonus = NOT_FISH_BONUS; r.points = NOT_FISH_BONUS; }
      return r;
    }
    if (strike.outcome !== 'landed') return r;
    var c = strike.enc; r.creature = c.id; r.base = BASE[c.size];
    r.correct = call === c.size;
    r.mult = r.correct ? CALL_MULT[c.size] : 1;
    var passed = 0; for (var i = 0; i < strike.idx; i++) if (cast.enc[i].kind === 'fish' && RANK[cast.enc[i].size] < RANK[c.size]) passed++;
    r.patience = passed * PATIENCE;
    r.points = Math.round(r.base * r.mult) + r.patience;
    return r;
  }

  // One character per cast for the share text; never names a creature.
  function glyph(res) {
    if (res.notFishOk) return 'N';
    if (res.outcome === 'landed') return res.correct ? 'G' : 'Y';
    if (res.outcome === 'junk') return 'J';
    return 'X';
  }
  var EMOJI = { G: '🟩', Y: '🟨', J: '🟫', N: '🌙', X: '⬛' };
  function shareText(seed, lake, results, total, daily) {
    var row = results.map(function (r) { return EMOJI[glyph(r)]; }).join('');
    return 'Night Float ' + (daily ? seed : 'practice') + ' · ' + lake.condition + '\n' + row + '\nScore ' + total;
  }

  return {
    CAST_SECS: CAST_SECS, CASTS: CASTS, SETTLE: SETTLE, SIZES: SIZES, RANK: RANK, BASE: BASE, CALL_MULT: CALL_MULT, PATIENCE: PATIENCE, NOT_FISH_BONUS: NOT_FISH_BONUS,
    CREATURES: CREATURES, OBJECTS: OBJECTS, CONDITIONS: CONDITIONS, DUR: DUR,
    makeRng: makeRng, dailySeed: dailySeed, genLake: genLake, genCast: genCast, floatAt: floatAt, motion: motion,
    resolveStrike: resolveStrike, scoreCast: scoreCast, glyph: glyph, shareText: shareText
  };
});
