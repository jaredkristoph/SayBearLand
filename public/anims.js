/* Character moves (poses and animations). Shared by the server (validation, starter moves) and the browser
   (playback in the office, the admin Animation studio).
   A pose is a set of numbers, one per channel below. An animation is keyframes of poses over time.
   Sign conventions: for both sides a positive value means the same thing (arm out, arm forward, knee bent, ...). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CLAnims = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var CH = [
    // group, key, label, min, max
    ['Body', 'rootY', 'Height (jump or crouch)', -1.2, 1.6], ['Body', 'bodyX', 'Lean forward or back', -1.6, 1.6],
    ['Body', 'bodyY', 'Twist', -3.14, 3.14], ['Body', 'bodyZ', 'Tilt sideways', -1, 1],
    ['Head', 'headX', 'Nod', -0.8, 0.8], ['Head', 'headY', 'Turn', -1.2, 1.2], ['Head', 'headZ', 'Tilt', -0.6, 0.6],
    ['Right arm', 'aRx', 'Swing forward or back', -2.6, 2.6], ['Right arm', 'aRz', 'Raise out to the side', -0.6, 3.0],
    ['Right arm', 'fRx', 'Elbow bend', 0, 2.4], ['Right arm', 'fRz', 'Forearm across the body', -1.0, 1.8],
    ['Left arm', 'aLx', 'Swing forward or back', -2.6, 2.6], ['Left arm', 'aLz', 'Raise out to the side', -0.6, 3.0],
    ['Left arm', 'fLx', 'Elbow bend', 0, 2.4], ['Left arm', 'fLz', 'Forearm across the body', -1.0, 1.8],
    ['Right leg', 'lRx', 'Lift forward', -1.0, 1.8], ['Right leg', 'lRz', 'Out to the side', -0.3, 1.0], ['Right leg', 'kR', 'Knee bend', 0, 2.2],
    ['Left leg', 'lLx', 'Lift forward', -1.0, 1.8], ['Left leg', 'lLz', 'Out to the side', -0.3, 1.0], ['Left leg', 'kL', 'Knee bend', 0, 2.2]
  ].map(function (c) { return { group: c[0], k: c[1], label: c[2], min: c[3], max: c[4], step: 0.01 }; });
  var BYK = {}; CH.forEach(function (c) { BYK[c.k] = c; });
  var KEYS = ['2', '3', '4', '5', '6', '7', '8', '9']; // 1 is smoking

  function zero() { var p = {}; CH.forEach(function (c) { p[c.k] = 0; }); return p; }
  function clamp(v, a, b) { v = +v; if (!isFinite(v)) v = 0; return Math.max(a, Math.min(b, v)); }
  function cleanPose(p) {
    var o = {}; p = p && typeof p === 'object' ? p : {};
    CH.forEach(function (c) { o[c.k] = Math.round(clamp(p[c.k], c.min, c.max) * 1000) / 1000; });
    return o;
  }
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20); }

  // Returns { anim } or { error }. `list` is the current list (to keep ids and keys unique).
  function sanitize(a, list) {
    list = list || [];
    if (!a || typeof a !== 'object') return { error: 'No move to save.' };
    var name = String(a.name || '').trim().slice(0, 24);
    if (!name) return { error: 'Give the move a name.' };
    var id = typeof a.id === 'string' && /^[a-z0-9_-]{1,24}$/.test(a.id) ? a.id : '';
    if (!id) { var base = slug(name) || 'move', n = 0; id = base; while (list.some(function (x) { return x.id === id; })) id = base + '-' + (++n); }
    var key = KEYS.indexOf(String(a.key)) >= 0 ? String(a.key) : '';
    if (key && list.some(function (x) { return x.id !== id && x.key === key; })) return { error: 'Key ' + key + ' is already used by another move.' };
    var dur = Math.round(clamp(a.dur, 0.2, 30) * 100) / 100, speed = Math.round(clamp(a.speed == null ? 1 : a.speed, 0.25, 3) * 100) / 100;
    var fr = Array.isArray(a.frames) ? a.frames.slice(0, 90) : [];
    if (!fr.length) return { error: 'Add at least one keyframe.' };
    var frames = fr.map(function (f) { return { t: Math.round(clamp(f && f.t, 0, dur) * 1000) / 1000, p: cleanPose(f && f.p) }; }).sort(function (x, y) { return x.t - y.t; });
    return { anim: { id: id, name: name, key: key, loop: !!a.loop, speed: speed, dur: dur, frames: frames } };
  }

  function ease(x) { return x * x * (3 - 2 * x); }
  function mix(a, b, k) { var o = {}; CH.forEach(function (c) { o[c.k] = a[c.k] + (b[c.k] - a[c.k]) * k; }); return o; }
  // Pose at time t (seconds of animation time). Loops wrap from the last key back to the first.
  function sample(an, t) {
    var f = an.frames; if (!f.length) return zero(); if (f.length === 1) return f[0].p;
    var dur = Math.max(.01, an.dur); if (an.loop) t = ((t % dur) + dur) % dur; else t = Math.max(0, Math.min(dur, t));
    var last = f[f.length - 1], first = f[0];
    if (t <= first.t) return an.loop && last.t < dur ? mix(last.p, first.p, ease((t + (dur - last.t)) / ((dur - last.t) + first.t || 1))) : first.p;
    if (t >= last.t) return an.loop && last.t < dur ? mix(last.p, first.p, ease((t - last.t) / ((dur - last.t) + first.t || 1))) : last.p;
    for (var i = 0; i < f.length - 1; i++) if (t >= f[i].t && t <= f[i + 1].t) return mix(f[i].p, f[i + 1].p, ease((t - f[i].t) / ((f[i + 1].t - f[i].t) || 1)));
    return last.p;
  }

  function P(o) { var p = zero(); for (var k in o) p[k] = o[k]; return p; }
  var STARTERS = [
    /* Hotline Bling style groove: loose side-to-side sway, bent knees, arms swinging across the body */
    { id: 'hotline-bling', name: 'Hotline Bling', key: '2', loop: true, speed: 1, dur: 2.4, frames: [
      { t: 0, p: P({ rootY: -0.12, bodyZ: 0.2, bodyY: 0.35, headZ: -0.15, headY: -0.3, aRx: 0.9, aRz: 0.25, fRx: 1.0, fRz: 1.0, aLx: -0.5, aLz: 0.5, fLx: 0.5, fLz: 0.2, kR: 0.5, kL: 0.2, lRz: 0.1, lLx: 0.15 }) },
      { t: 0.3, p: P({ rootY: 0.05, bodyZ: 0.05, bodyY: 0.1, headZ: -0.05, aRx: 0.3, aRz: 0.9, fRx: 0.6, fRz: 0.3, aLx: 0.3, aLz: 0.4, fLx: 0.9, fLz: 0.6, kR: 0.25, kL: 0.25 }) },
      { t: 0.6, p: P({ rootY: -0.12, bodyZ: -0.2, bodyY: -0.35, headZ: 0.15, headY: 0.3, aRx: -0.5, aRz: 0.5, fRx: 0.5, fRz: 0.2, aLx: 0.9, aLz: 0.25, fLx: 1.0, fLz: 1.0, kR: 0.2, kL: 0.5, lLz: 0.1, lRx: 0.15 }) },
      { t: 0.9, p: P({ rootY: 0.05, bodyZ: -0.05, bodyY: -0.1, headZ: 0.05, aRx: 0.3, aRz: 0.4, fRx: 0.9, fRz: 0.6, aLx: 0.3, aLz: 0.9, fLx: 0.6, fLz: 0.3, kR: 0.25, kL: 0.25 }) },
      { t: 1.2, p: P({ rootY: -0.15, bodyX: 0.15, bodyZ: 0.2, bodyY: 0.3, headX: 0.15, headZ: -0.15, aRx: 1.3, aRz: 0.15, fRx: 1.4, fRz: 1.2, aLx: 1.3, aLz: 0.15, fLx: 1.4, fLz: 1.2, kR: 0.6, kL: 0.6, lRx: 0.2 }) },
      { t: 1.5, p: P({ rootY: 0.08, bodyX: -0.05, bodyZ: 0.05, aRx: 0.2, aRz: 1.5, fRx: 0.4, fRz: 0, aLx: 0.2, aLz: 1.5, fLx: 0.4, fLz: 0, kR: 0.3, kL: 0.3 }) },
      { t: 1.8, p: P({ rootY: -0.15, bodyX: 0.1, bodyZ: -0.2, bodyY: -0.3, headX: 0.1, headZ: 0.15, aRx: 0.3, aRz: 0.9, fRx: 0.8, fRz: 0.5, aLx: 0.3, aLz: 0.9, fLx: 0.8, fLz: 0.5, kR: 0.5, kL: 0.5, lLx: 0.2 }) },
      { t: 2.1, p: P({ rootY: 0, bodyZ: 0.1, bodyY: 0.15, aRx: 0.7, aRz: 0.4, fRx: 0.8, fRz: 0.8, aLx: 0, aLz: 0.5, fLx: 0.5, fLz: 0.3, kR: 0.3, kL: 0.3 }) } ] },
    { id: 'wave', name: 'Wave', key: '3', loop: true, speed: 1, dur: 1.6, frames: [
      { t: 0, p: P({ aRz: 2.2, fRx: 0.4, fRz: -0.4, headZ: 0.1 }) }, { t: 0.4, p: P({ aRz: 2.2, fRx: 0.4, fRz: 0.7, headZ: 0.1 }) },
      { t: 0.8, p: P({ aRz: 2.2, fRx: 0.4, fRz: -0.4, headZ: 0.1 }) }, { t: 1.2, p: P({ aRz: 2.2, fRx: 0.4, fRz: 0.7, headZ: 0.1 }) } ] },
    { id: 'cheer', name: 'Cheer', key: '4', loop: true, speed: 1, dur: 1, frames: [
      { t: 0, p: P({ aRz: 2.9, aLz: 2.9, rootY: 0, kR: 0.5, kL: 0.5 }) }, { t: 0.5, p: P({ aRz: 2.6, aLz: 2.6, rootY: 0.55, headX: -0.2 }) } ] },
    { id: 'bow', name: 'Bow', key: '5', loop: false, speed: 1, dur: 2.2, frames: [
      { t: 0, p: P({}) }, { t: 0.7, p: P({ bodyX: 1.0, headX: 0.3, fRz: 0.5, fLz: 0.5, fRx: 0.5, fLx: 0.5 }) },
      { t: 1.5, p: P({ bodyX: 1.0, headX: 0.3, fRz: 0.5, fLz: 0.5, fRx: 0.5, fLx: 0.5 }) }, { t: 2.2, p: P({}) } ] },
    { id: 'dance', name: 'Dance', key: '6', loop: true, speed: 1, dur: 1.2, frames: [
      { t: 0, p: P({ bodyZ: 0.25, rootY: -0.1, aRz: 1.8, aLz: 0.2, kR: 0.6, kL: 0.2, headZ: 0.2, lRz: 0.2 }) },
      { t: 0.6, p: P({ bodyZ: -0.25, rootY: -0.1, aLz: 1.8, aRz: 0.2, kL: 0.6, kR: 0.2, headZ: -0.2, lLz: 0.2 }) } ] }
  ];
  STARTERS.forEach(function (a) { a.frames.forEach(function (f) { f.p = cleanPose(f.p); }); });

  return { CHANNELS: CH, KEYS: KEYS, zero: zero, cleanPose: cleanPose, sanitize: sanitize, sample: sample, STARTERS: STARTERS, BYK: BYK };
});
