/* Night Float: rules shared by the page and the tests (no DOM here). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NF = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SETTLE = 1.4, LAKE_R = 50;
  var CONDITIONS = ['calm', 'wind', 'current', 'rain'];

  // Every creature belongs to one of six bite patterns (how the float behaves) and one habitat (where the float lands).
  var PAT = {
    glimmerling: { sig: 'Quick shallow taps, then a small slow dip.', tip: 'Wait for the taps to stop.' },
    dawdler: { sig: 'Slow sideways drift, no dip.', tip: 'Strike late, once the drift ends.' },
    skimray: { sig: 'The float rises and lies flat.', tip: 'Strike while it lies flat.' },
    ribbonjaw: { sig: 'Taps first, then a slow drift.', tip: 'Let the drift finish.' },
    gulper: { sig: 'Quiet, then one hard plunge.', tip: 'About half a second to strike.' },
    hollowking: { sig: 'Long trembling with no movement, then a huge plunge.', tip: 'The tremble means something big is near.' }
  };
  // id, name, bite pattern, habitat, how common (higher = more common)
  var DEFS = [
    ['glimmerling', 'Glimmerling', 'glimmerling', 'shallow', 10], ['dawdler', 'Dawdler', 'dawdler', 'shallow', 8], ['skimray', 'Skimray', 'skimray', 'mid', 6],
    ['ribbonjaw', 'Ribbonjaw', 'ribbonjaw', 'mid', 6], ['gulper', 'Gulper', 'gulper', 'deep', 6], ['hollowking', 'Hollow King', 'hollowking', 'deep', 1],
    // shallows
    ['bluegill', 'Bluegill', 'glimmerling', 'shallow', 9], ['pumpkinseed', 'Pumpkinseed', 'glimmerling', 'shallow', 7], ['greensunfish', 'Green sunfish', 'glimmerling', 'shallow', 7],
    ['roach', 'Roach', 'glimmerling', 'shallow', 9], ['rudd', 'Rudd', 'glimmerling', 'shallow', 6], ['stickleback', 'Stickleback', 'glimmerling', 'shallow', 8],
    ['gudgeon', 'Gudgeon', 'dawdler', 'shallow', 7], ['fathead', 'Fathead minnow', 'glimmerling', 'shallow', 8], ['goldenshiner', 'Golden shiner', 'glimmerling', 'shallow', 6],
    ['stoneloach', 'Stone loach', 'dawdler', 'shallow', 5], ['bitterling', 'Bitterling', 'glimmerling', 'shallow', 4], ['dace', 'Dace', 'glimmerling', 'shallow', 7],
    ['bleak', 'Bleak', 'glimmerling', 'shallow', 8], ['whiteperch', 'White perch', 'glimmerling', 'shallow', 5], ['killifish', 'Banded killifish', 'glimmerling', 'shallow', 4],
    ['goldfish', 'Goldfish', 'dawdler', 'shallow', 3], ['rockbass', 'Rock bass', 'ribbonjaw', 'shallow', 5], ['bullhead', 'Black bullhead', 'dawdler', 'shallow', 5],
    // open water
    ['perch', 'Yellow perch', 'ribbonjaw', 'mid', 9], ['blackcrappie', 'Black crappie', 'skimray', 'mid', 6], ['whitecrappie', 'White crappie', 'skimray', 'mid', 6],
    ['bream', 'Bream', 'skimray', 'mid', 7], ['tench', 'Tench', 'dawdler', 'mid', 5], ['crucian', 'Crucian carp', 'glimmerling', 'mid', 6],
    ['carp', 'Common carp', 'ribbonjaw', 'mid', 5], ['browntrout', 'Brown trout', 'gulper', 'mid', 4], ['rainbowtrout', 'Rainbow trout', 'gulper', 'mid', 5],
    ['brooktrout', 'Brook trout', 'glimmerling', 'mid', 3], ['grayling', 'Grayling', 'skimray', 'mid', 3], ['chub', 'Chub', 'gulper', 'mid', 6],
    ['ide', 'Ide', 'ribbonjaw', 'mid', 4], ['barbel', 'Barbel', 'dawdler', 'mid', 4], ['whitebass', 'White bass', 'gulper', 'mid', 4],
    ['catfish', 'Channel catfish', 'dawdler', 'mid', 4], ['smallmouth', 'Smallmouth bass', 'gulper', 'mid', 4], ['grasscarp', 'Grass carp', 'dawdler', 'mid', 3],
    // deep water
    ['walleye', 'Walleye', 'ribbonjaw', 'deep', 6], ['sauger', 'Sauger', 'ribbonjaw', 'deep', 5], ['pike', 'Northern pike', 'gulper', 'deep', 5],
    ['muskie', 'Muskellunge', 'hollowking', 'deep', 1.2], ['laketrout', 'Lake trout', 'gulper', 'deep', 4], ['salmon', 'Atlantic salmon', 'gulper', 'deep', 2.5],
    ['sturgeon', 'Sturgeon', 'hollowking', 'deep', 1], ['burbot', 'Burbot', 'dawdler', 'deep', 4], ['zander', 'Zander', 'ribbonjaw', 'deep', 4],
    ['wels', 'Wels catfish', 'hollowking', 'deep', 1], ['alligatorgar', 'Alligator gar', 'hollowking', 'deep', .8], ['longnosegar', 'Longnose gar', 'gulper', 'deep', 3],
    ['bowfin', 'Bowfin', 'gulper', 'deep', 3], ['eel', 'European eel', 'dawdler', 'deep', 3]
  ];
  var CREATURES = {}, ORDER = [];
  DEFS.forEach(function (d) { CREATURES[d[0]] = { id: d[0], name: d[1], pat: d[2], hab: d[3], w: d[4], sig: PAT[d[2]].sig, tip: PAT[d[2]].tip }; ORDER.push(d[0]); });
  var OBJECTS = {
    boot: { id: 'boot', name: 'Old boot', sig: 'Regular, rhythmic bob.' },
    weed: { id: 'weed', name: 'Tangle of weed', sig: 'Regular, quick bob.' },
    snag: { id: 'snag', name: 'Snag', sig: 'Regular, shallow bob, held low.' }
  };
  var HABS = { shallow: 'Shallows', mid: 'Open water', deep: 'Deep water' };
  var CAST_MIN = 4, CAST_MAX = 20;
  // The lake has no marked spots: fish live where the water is deep, wherever your float lands.
  function habitatAt(x, z) { var d = Math.hypot(x, z); return d > 36 ? 'shallow' : d > 20 ? 'mid' : 'deep'; }
  function deeper(h) { return h === 'shallow' ? 'mid' : 'deep'; }

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
    var pat = CREATURES[id] ? CREATURES[id].pat : id, dir = r() < 0.5 ? -1 : 1, e = { id: id, pat: pat, start: start, dir: dir, kind: 'fish' }, i, t;
    if (OBJECTS[id]) {
      e.kind = 'object'; var dur = range(r, 8, 11);
      e.wS = start; e.wE = start + dur; e.end = start + dur;
      e.period = id === 'boot' ? 1.7 : id === 'weed' ? 1.1 : 2.3; e.amp = id === 'boot' ? 0.13 : id === 'weed' ? 0.08 : 0.05; e.held = id === 'snag' ? 0.2 : 0;
      return e;
    }
        if (pat === 'glimmerling') {
      e.taps = []; t = range(r, 0.2, 0.5); var n = 8 + Math.floor(r() * 5);
      for (i = 0; i < n; i++) { e.taps.push(t); t += range(r, 0.22, 0.42); }
      e.wS = e.taps[n - 1] + 0.3; e.wE = e.wS + 1.0; e.end = e.wE + 0.4;
    } else if (pat === 'dawdler') {
      e.dd = range(r, 3.6, 5); e.dist = 0.9; e.wS = e.dd; e.wE = e.wS + 1.2; e.end = e.wE + 0.6;
    } else if (pat === 'skimray') {
      e.wS = 0.7; e.wE = 2.2; e.end = 2.9;
    } else if (pat === 'ribbonjaw') {
      e.taps = []; t = range(r, 0.2, 0.4); var m = 4 + Math.floor(r() * 2);
      for (i = 0; i < m; i++) { e.taps.push(t); t += range(r, 0.3, 0.5); }
      e.ds = t + 0.2; e.dd = range(r, 2.6, 3.4); e.dist = 0.6; e.wS = e.ds + e.dd; e.wE = e.wS + 1.1; e.end = e.wE + 0.5;
    } else if (pat === 'gulper') {
      e.pt = range(r, 1.6, 2.8); e.wS = e.pt + 0.05; e.wE = e.pt + 0.55; e.end = e.pt + 0.95;
    } else if (pat === 'hollowking') {
      e.pt = range(r, 2.8, 4.2); e.wS = e.pt + 0.05; e.wE = e.pt + 0.5; e.end = e.pt + 0.95;
    }
    e.wS += start; e.wE += start; e.end += start;
    return e;
  }

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
    switch (e.pat) {
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

  /* ---------- a lake and its casts ---------- */
  function weightedPick(r, odds) {
    var tot = 0, k; for (k in odds) tot += odds[k];
    var x = r() * tot; for (k in odds) { x -= odds[k]; if (x < 0) return k; }
    return 'glimmerling';
  }
  var LAKE_A = ['Hollow', 'Quiet', 'Slate', 'Lantern', 'Ember', 'Mirror', 'Thistle', 'Cinder', 'Velvet', 'Marrow', 'Pale', 'Tallow'];
  var LAKE_B = ['Mere', 'Tarn', 'Pool', 'Water', 'Reach', 'Basin', 'Broad', 'Lake'];
  var COND_LABEL = { calm: 'Still', wind: 'Breezy', current: 'Drifting', rain: 'Drizzle' };
  var COND_TEXT = { calm: 'Still water. What moves, means something.', wind: 'A breeze: the float sometimes moves on its own.', current: 'A slow current carries the float along. Judge movement against the flow.', rain: 'Drizzle ripples the surface. Look for the stronger motions.' };

  function dailySeed(d) { return String(d || new Date().toISOString().slice(0, 10)); }

  function genLake(seed) {
    var r = makeRng('lake:' + seed);
    return { seed: String(seed), name: pick(r, LAKE_A) + ' ' + pick(r, LAKE_B), condition: pick(r, CONDITIONS), start: { x: 0, z: -40, heading: 0 } };
  }

  // What can bite under a float that lands at (x, z). Pure and seeded, so tests can check it. Hidden "hot patches" make some corners of
  // the lake better for a few kinds, but nothing is marked on the water.
  function oddsHab(hab, x, z) {
    var o = {}, tot = 0, id, c, w;
    var cell = Math.floor(x / 9) + ',' + Math.floor(z / 9), pr = makeRng('patch:' + cell), pool = ORDER.filter(function (k) { return CREATURES[k].hab === hab; }), fav = shuffle(pr, pool).slice(0, 3);
    for (var i = 0; i < ORDER.length; i++) {
      id = ORDER[i]; c = CREATURES[id];
      w = c.hab === hab ? c.w : (c.hab === 'shallow' && hab === 'mid') || (c.hab === 'mid' && (hab === 'shallow' || hab === 'deep')) || (c.hab === 'deep' && hab === 'mid') ? c.w * 0.12 : 0;
      if (fav.indexOf(id) >= 0) w *= 3;
      if (w > 0) { o[id] = w; tot += w; }
    }
    var junk = tot * (hab === 'shallow' ? 0.14 : hab === 'mid' ? 0.2 : 0.28) / 0.8;
    o.boot = junk * (hab === 'shallow' ? 0.25 : 0.4); o.weed = junk * (hab === 'shallow' ? 0.55 : 0.25); o.snag = junk * (hab === 'shallow' ? 0.2 : 0.35);
    return o;
  }
  function oddsFor(x, z) { return oddsHab(habitatAt(x, z), x, z); }

  function rollCast(r, loc, dist, condition) {
    var enc = [], t = SETTLE + range(r, 4, 9), n = 1 + (r() < 0.3 ? 1 : 0) + (r() < 0.1 ? 1 : 0), i, x = loc ? loc.x : 0, z = loc ? loc.z : -10;
    var hab = habitatAt(x, z), odds = oddsHab(hab, x, z);
    for (i = 0; i < n; i++) {
      var id = weightedPick(r, odds), e = build(id, t, r); enc.push(e);
      t = e.end + range(r, 2.5, 5);
      if (OBJECTS[id]) break;
      odds = oddsHab(deeper(hab), x, z); // a second visitor tends to come from deeper water
    }
    var fake = [];
    if (condition === 'wind') {
      var nf = 6 + Math.floor(r() * 3), j;
      for (j = 0; j < nf; j++) {
        var s = range(r, 2, 55), clash = enc.some(function (e) { return s > e.start - 1.2 && s < e.end + 1.2; });
        if (clash) continue;
        var tp = [], tt = 0, m = 3 + Math.floor(r() * 4);
        if (r() < 0.6) { for (var k = 0; k < m; k++) { tp.push(tt); tt += range(r, 0.25, 0.45); } fake.push({ type: 'taps', start: s, taps: tp, end: s + tt + 0.2 }); }
        else fake.push({ type: 'drift', start: s, dir: r() < 0.5 ? -1 : 1, dd: range(r, 2, 3.5), end: s + 4.5 });
      }
    }
    return { dist: dist, hab: hab, condition: condition, enc: enc, fake: fake, ph1: r() * 6.28, ph2: r() * 6.28, ph3: r() * 6.28, x0: condition === 'current' ? -0.4 : 0 };
  }

  function floatAt(cast, t) {
    var s = { x: 0, dip: 0, lift: 0, trem: 0 }, m;
    var settle = t < SETTLE ? (1 - t / SETTLE) : 0; // splash-down: bobs and rings out
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
      s.x += cast.x0 + 0.03 * Math.min(t, 60);
    } else if (c === 'rain') {
      s.dip += 0.03 * (Math.sin(t * 17 + cast.ph1) + Math.sin(t * 11.3 + cast.ph2) + Math.sin(t * 6.1 + cast.ph3)) / 3 + 0.02 * Math.sin(t * 29 + cast.ph2);
      s.x += 0.02 * Math.sin(t * 3.3 + cast.ph3);
    }
    return s;
  }

  // Strike at time t after the float landed. outcome: early | late | landed | junk. Nothing is scored; it only decides what you pull up.
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

  function castEndsAt(cast) { return cast.enc[cast.enc.length - 1].end; }

  return {
    SETTLE: SETTLE, LAKE_R: LAKE_R, CAST_MIN: CAST_MIN, CAST_MAX: CAST_MAX, CREATURES: CREATURES, ORDER: ORDER, PAT: PAT, OBJECTS: OBJECTS, HABS: HABS, CONDITIONS: CONDITIONS, COND_LABEL: COND_LABEL, COND_TEXT: COND_TEXT,
    makeRng: makeRng, dailySeed: dailySeed, genLake: genLake, oddsFor: oddsFor, habitatAt: habitatAt, rollCast: rollCast, floatAt: floatAt, motion: motion, build: build,
    resolveStrike: resolveStrike, castEndsAt: castEndsAt
  };
});
