(function () {
  'use strict';
  var C = window.RitmicCore, A = window.RitmicArt;
  var BEAT = C.BEAT, CT = C.CYCLE_T;
  var TEST = /[?&]test=1/.test(location.search);
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('cv'), cx = cv.getContext('2d'); cx.imageSmoothingEnabled = false;

  // ---------- fit ----------
  function fit() { var s = Math.min(innerWidth / 960, innerHeight / 540); $('stage').style.transform = 'scale(' + s + ')'; }
  addEventListener('resize', fit); fit();

  // ---------- settings ----------
  var cfg = { offset: 0, mute: false, skip: false };
  try { var sv = JSON.parse(localStorage.getItem('ritmic') || '{}'); if (typeof sv.offset === 'number') cfg.offset = sv.offset; cfg.mute = !!sv.mute; } catch (e) {}
  $('off').value = cfg.offset; $('offv').textContent = cfg.offset + ' ms'; $('mute').checked = cfg.mute;
  function save() { try { localStorage.setItem('ritmic', JSON.stringify({ offset: cfg.offset, mute: cfg.mute })); } catch (e) {} }
  $('off').oninput = function () { cfg.offset = +this.value; $('offv').textContent = cfg.offset + ' ms'; save(); };
  $('mute').onchange = function () { cfg.mute = this.checked; if (master) master.gain.value = cfg.mute ? 0 : 0.8; save(); };
  $('skip').onchange = function () { cfg.skip = this.checked; };

  // ---------- audio ----------
  var ctx = null, master = null, noiseBuf = null;
  function initAudio() {
    if (TEST || ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = cfg.mute ? 0 : 0.8; master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
  }
  function now() { return TEST ? T : ctx ? ctx.currentTime : performance.now() / 1000; }
  function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  function tone(type, f0, f1, t, dur, vol) {
    var o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.004, vol, dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(t, dur, vol, hp, bp) {
    var s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    s.buffer = noiseBuf; f.type = bp ? 'bandpass' : 'highpass'; f.frequency.value = bp || hp || 4000;
    env(g, t, 0.002, vol, dur); s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
  }
  var FREQ = { q: 100, w: 150, e: 225 };
  function snd(name, when, key) {
    if (!ctx) return; var t = Math.max(when || 0, ctx.currentTime);
    if (name === 'drum') { tone('sine', FREQ[key] * 1.9, FREQ[key], t, 0.22, 0.85); noise(t, 0.05, 0.25, 1800); }
    else if (name === 'army') { tone('sine', FREQ[key] * 1.4, FREQ[key] * 0.7, t, 0.34, 1.0); noise(t, 0.12, 0.35, 0, 1400); tone('triangle', FREQ[key] * 2, FREQ[key], t, 0.12, 0.25); }
    else if (name === 'hat') noise(t, 0.04, key ? 0.16 : 0.08, 7000);
    else if (name === 'kick') tone('sine', 120, 45, t, 0.18, 0.5);
    else if (name === 'windup') { var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(130, t + 2.6); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 2.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.9); o.connect(g); g.connect(master); o.start(t); o.stop(t + 3); }
    else if (name === 'smash') { tone('sine', 90, 28, t, 0.5, 1.2); noise(t, 0.35, 0.7, 0, 300); }
    else if (name === 'clang') { tone('square', 880, 880, t, 0.25, 0.25); tone('square', 1320, 1320, t, 0.2, 0.15); noise(t, 0.08, 0.3, 5000); }
    else if (name === 'hit') { tone('square', 300, 90, t, 0.1, 0.3); noise(t, 0.07, 0.4, 2500); }
    else if (name === 'miss') { tone('sawtooth', 120, 60, t, 0.18, 0.3); }
    else if (name === 'roar') { tone('sawtooth', 70, 40, t, 0.9, 0.5); noise(t, 0.9, 0.3, 0, 220); }
    else if (name === 'win') [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone('square', f, f, t + i * 0.12, 0.3, 0.25); });
    else if (name === 'lose') [392, 330, 262, 196].forEach(function (f, i) { tone('triangle', f, f, t + i * 0.25, 0.5, 0.4); });
    else if (name === 'ding') { tone('triangle', 988, 988, t, 0.25, 0.3); tone('triangle', 1319, 1319, t + 0.08, 0.3, 0.3); }
  }

  // ---------- game state ----------
  var T = 0;                      // manual test clock
  var mode = 'title';             // title | playing | paused | ended
  var g = null, start = 0, lat = 0, nextBeat = 0, endAt = null;
  var vis, parts = [], floats = [], shake = 0, lastS = 0, seedN = 1;
  var armyAt = [], hurtBoss = 0, hurtSquad = 0, shieldFlash = 0, deadT = 0, squadDead = 0, judgeText = '';
  var lastCmd = null, lastTapEls = {};

  function gs() { return now() - start - lat - cfg.offset / 1000; }

  function resetVis() {
    parts = []; floats = []; shake = 0; armyAt = []; hurtBoss = 0; hurtSquad = 0; deadT = 0; squadDead = 0; lastCmd = null; endAt = null;
  }
  function begin(opts) {
    opts = opts || {};
    initAudio();
    if (ctx && ctx.state !== 'running') ctx.resume();
    lat = ctx ? (ctx.outputLatency || ctx.baseLatency || 0) : 0;
    seedN = opts.seed != null ? opts.seed : (Math.random() * 1e9) | 0;
    g = C.createGame({ seed: seedN, skipTraining: opts.skip != null ? opts.skip : cfg.skip });
    resetVis();
    start = now() + 1.4; nextBeat = 0;
    mode = 'playing';
    ['title', 'end', 'pause'].forEach(function (i) { $(i).hidden = true; });
    $('pausebtn').hidden = false;
    $('banner').className = 'calm'; $('banner').innerHTML = 'GET READY<small>the drums begin in a moment…</small>';
    clearSlots(); hud();
  }
  $('go').onclick = function () { begin(); };
  $('again').onclick = function () { begin(); };

  // ---------- HUD ----------
  var slotEls = [].slice.call(document.querySelectorAll('.slot'));
  function clearSlots(expected) {
    slotEls.forEach(function (el, i) {
      el.className = 'slot ' + (i < 4 ? 'me' : 'army'); el.firstChild.textContent = '';
      if (i < 4 && expected) { el.classList.add('cue'); el.firstChild.textContent = expected[i].toUpperCase(); }
    });
  }
  function hud() {
    if (!g) return;
    var st = g.st;
    $('bossbar').firstChild.style.width = (st.bossHp / C.BOSS.hp * 100) + '%';
    $('squadbar').firstChild.style.width = (st.hp / C.BOSS.squadHp * 100) + '%';
    $('combo').textContent = st.combo >= 3 ? 'FEVER x' + st.combo + '!' : st.combo > 0 ? 'COMBO x' + st.combo : '';
    $('combo').style.color = st.combo >= 3 ? '#ffe36a' : '#f4ecd8';
  }
  function banner(cls, big, small) { var b = $('banner'); b.className = cls; b.innerHTML = big + (small ? '<small>' + small + '</small>' : ''); }
  var SPELL = function (c) { return c.toUpperCase().split('').join(' '); };
  function showJudge(txt, col) {
    var j = $('judge'); j.textContent = txt; j.style.color = col; j.classList.remove('show'); void j.offsetWidth; j.classList.add('show'); judgeText = txt;
  }

  // ---------- particles ----------
  function spawn(x, y, n, cols, sp, g0) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283, v = (0.3 + Math.random()) * sp;
      parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * 0.4, s: Math.random() < 0.4 ? 2 : 1, col: cols[(Math.random() * cols.length) | 0], life: 0.5 + Math.random() * 0.4, max: 0.9, g: g0 == null ? 160 : g0 });
    }
  }
  function floatNum(x, y, v, col) { floats.push({ x: x, y: y, v: Math.round(v), col: col, life: 0.9 }); }
  var BOSS_X = 232, SQUAD_X = [34, 50, 66, 82, 98];

  // ---------- events ----------
  function handle(e, s) {
    switch (e.type) {
      case 'tap':
        var el = slotEls[e.slot]; if (!el) break;
        el.classList.remove('cue'); el.classList.add(e.judge === 'perfect' ? 'pg' : e.judge === 'good' ? 'pf' : 'ms');
        el.firstChild.textContent = e.key.toUpperCase();
        showJudge(e.judge === 'perfect' ? 'PERFECT' : e.judge === 'good' ? 'GOOD' : 'MISS', e.judge === 'perfect' ? '#7be07b' : e.judge === 'good' ? '#ffe36a' : '#ff5c5c');
        if (e.judge === 'miss') snd('miss', 0);
        break;
      case 'cycle': newCycle(e); break;
      case 'command':
        lastCmd = e;
        if (e.ok) { showJudge(e.combo === 'attack' ? 'ATTACK!' : 'SHIELD!', e.combo === 'attack' ? '#ffb347' : '#3fb6c4'); }
        else { showJudge('COMBO BROKEN', '#ff5c5c'); }
        break;
      case 'army':
        armyAt.push(e.at);
        if (ctx) snd('army', start + e.at, e.key);
        var sl = slotEls[4 + e.slot]; sl.firstChild.textContent = e.key.toUpperCase(); sl.classList.add(lastCmd && lastCmd.combo === 'shield' ? 'pg' : 'pf');
        break;
      case 'stumble': snd('miss', 0); break;
      case 'bossHit':
        hurtBoss = 1; shake = Math.max(shake, 1.5);
        spawn(BOSS_X - 20, 90 + Math.random() * 20, 6, ['#fff', '#ffd58a', '#9aa0b0'], 70);
        floatNum(BOSS_X - 30, 62 + Math.random() * 10, e.dmg, '#ffe36a'); snd('hit', 0); hud(); break;
      case 'strike':
        if (e.blocked) { shieldFlash = 1; spawn(112, 118, 14, ['#fff', '#8fe8f4', '#3fb6c4'], 90, 80); snd('clang', 0); floatNum(100, 80, 0, '#8fe8f4'); }
        else { hurtSquad = 1; shake = 4; spawn(80, 128, 12, ['#ff5c5c', '#fff', '#c93a2b'], 80); if (e.dmg > 0) floatNum(70, 80, e.dmg, '#ff5c5c'); }
        spawn(BOSS_X - 54, 138, e.kind === 'quake' ? 26 : 14, ['#6b4c8a', '#9a7cb8', '#4a3a60'], 70);
        shake = Math.max(shake, e.kind === 'quake' ? 6 : 3); snd('smash', 0); hud(); break;
      case 'phase':
        if (e.n > 1) { shake = 5; snd('roar', 0); banner('warn', 'GRUMBOLD IS ENRAGED!', 'phase ' + e.n + ' — he strikes faster'); }
        break;
      case 'lessonPass': snd('ding', 0); banner('hit', 'WELL DONE!', e.mode === 'fight' ? 'the real fight begins…' : 'next lesson…'); break;
      case 'lessonRetry': banner('warn', 'TRY AGAIN', 'tap each key right on the beat'); break;
      case 'fightStart': hud(); break;
      case 'win': deadT = 0.001; snd('win', 0); endAt = s + 2.2; endInfo = { win: true, rank: e.rank }; break;
      case 'lose': squadDead = 0.001; snd('lose', 0); endAt = s + 2; endInfo = { win: false }; break;
    }
  }
  var endInfo = null;
  function newCycle(e) {
    var a = e.action.type, ex = C.COMBOS[e.expected];
    clearSlots(ex); armyAt = armyAt.filter(function (t) { return t > e.at - 1; });
    if (ctx && (a === 'smash' || a === 'quake')) snd('windup', start + e.at + 0.5);
    if (e.mode === 'lesson-attack') banner('calm', 'TRAINING 1/2 — ATTACK', 'tap <b>W W E W</b> on beats 1·2·3·4, then your army attacks');
    else if (e.mode === 'lesson-shield') banner('warn', 'TRAINING 2/2 — SHIELD!', 'he raises his fist — tap <b>Q Q W W</b> to block');
    else if (a === 'smash') banner('warn', 'FIST SMASH INCOMING!', 'SHIELD: <b>' + SPELL(C.COMBOS.shield) + '</b>');
    else if (a === 'double') banner('warn', 'DOUBLE STOMP INCOMING!', 'SHIELD: <b>' + SPELL(C.COMBOS.shield) + '</b>');
    else if (a === 'quake') banner('warn', 'EARTHQUAKE INCOMING!', 'SHIELD: <b>' + SPELL(C.COMBOS.shield) + '</b>');
    else if (a === 'stagger') banner('hit', 'HE\'S DIZZY — HIT HARD!', 'ATTACK: <b>' + SPELL(C.COMBOS.attack) + '</b> (x1.5 damage)');
    else banner('calm', 'OPENING — ATTACK!', 'ATTACK: <b>' + SPELL(C.COMBOS.attack) + '</b>');
    hud();
  }

  // ---------- input ----------
  var padEl = { q: document.querySelector('.pad[data-k=q]'), w: document.querySelector('.pad[data-k=w]'), e: document.querySelector('.pad[data-k=e]') };
  function inputKey(k, ts) {
    if (mode !== 'playing' || !g) return;
    var tt = (ts == null ? now() : ts) - start - lat - cfg.offset / 1000;
    if (tt < -0.2) return;
    var el = padEl[k]; el.classList.add('on'); setTimeout(function () { el.classList.remove('on'); }, 90);
    if (ctx) snd('drum', 0, k);
    g.press(k, tt);
    spawn(36 + Math.random() * 60, 40, 2, ['#ffe36a', '#fff'], 30, 0);
  }
  addEventListener('keydown', function (ev) {
    var k = ev.key.toLowerCase();
    if (ev.repeat) return;
    if (k === 'p' || k === 'escape') { togglePause(); return; }
    if ((k === 'enter' || k === ' ') && mode === 'title') { begin(); ev.preventDefault(); return; }
    if ((k === 'enter' || k === ' ') && mode === 'ended') { begin(); ev.preventDefault(); return; }
    if (C.KEYS.indexOf(k) >= 0) { ev.preventDefault(); inputKey(k); }
  });
  [].forEach.call(document.querySelectorAll('.pad'), function (b) {
    b.addEventListener('pointerdown', function (ev) { ev.preventDefault(); inputKey(b.dataset.k); });
  });
  function togglePause() {
    if (mode === 'playing') { mode = 'paused'; $('pause').hidden = false; if (ctx) ctx.suspend(); pausedAt = now(); }
    else if (mode === 'paused') { mode = 'playing'; $('pause').hidden = true; if (ctx) ctx.resume(); }
  }
  var pausedAt = 0;
  $('pausebtn').onclick = togglePause; $('resume').onclick = togglePause;
  document.addEventListener('visibilitychange', function () { if (document.hidden && mode === 'playing') togglePause(); });

  // ---------- pose ----------
  function ramp(b, a, z) { return Math.max(0, Math.min(1, (b - a) / (z - a))); }
  function bossPose(s) {
    var p = { raise: 0, slam: 0, stomp: 0, stagger: false, hurt: hurtBoss, dead: deadT ? Math.min(1, deadT) : 0, rage: g && C.phaseOf(g.st) === 3 ? 1 : 0, t: Math.max(0, s) };
    if (!g || g.cycle < 0) return p;
    var b = (s - g.cycle * CT) / BEAT, a = g.action ? g.action.type : 'idle';
    if (a === 'smash' || a === 'quake') {
      var r = ramp(b, 0.5, 5.4), sl = b < 5.6 ? 0 : b < 6 ? (b - 5.6) / 0.4 : b < 6.6 ? 1 : Math.max(0, 1 - (b - 6.6) / 0.6);
      if (b > 6.6) r = Math.max(0, 1 - (b - 6.6) / 0.8);
      p.raise = r; p.slam = sl; if (a === 'quake') p.raise2 = r;
    } else if (a === 'double') {
      p.raise = 0.25 + 0.15 * Math.sin(b * 3); p.raise2 = 0.25;
      p.stomp = Math.max(0, 1 - Math.abs(b - 5) * 2.5, 1 - Math.abs(b - 7) * 2.5);
    } else if (a === 'stagger') p.stagger = true;
    return p;
  }

  // ---------- main tick ----------
  var lastFrame = 0;
  function tick(dt) {
    var s = mode === 'title' ? now() % 1000 : gs();
    if (mode === 'playing' || mode === 'ended') {
      lastS = s;
      if (s >= 0 && mode === 'playing') {
        g.step(s);
        g.drain().forEach(function (e) { handle(e, s); });
        if (ctx) sched(s);
        if (endAt != null && s >= endAt) finish();
      }
      if (hurtBoss > 0) hurtBoss = Math.max(0, hurtBoss - dt * 4);
      if (hurtSquad > 0) hurtSquad = Math.max(0, hurtSquad - dt * 3);
      if (shieldFlash > 0) shieldFlash = Math.max(0, shieldFlash - dt * 3);
      if (deadT > 0) deadT += dt * 0.6; if (squadDead > 0) squadDead += dt * 0.7;
      shake = Math.max(0, shake - dt * 14);
      if (g && g.cycle >= 0 && s >= 0) $('head').style.left = (((s - g.cycle * CT) / CT) * 100) + '%';
    }
    for (var i = parts.length - 1; i >= 0; i--) { var p = parts[i]; p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.y > 140 && p.g > 0) { p.y = 140; p.vy *= -0.3; p.vx *= 0.6; } if (p.life <= 0) parts.splice(i, 1); }
    for (var j = floats.length - 1; j >= 0; j--) { floats[j].life -= dt; floats[j].y -= dt * 18; if (floats[j].life <= 0) floats.splice(j, 1); }
    draw(s);
  }
  function sched(s) {
    var look = ctx.currentTime - start + 0.25;
    while (nextBeat * BEAT < look) {
      var t = start + nextBeat * BEAT, j = nextBeat % 8;
      if (j === 0 || j === 4) snd('kick', t); snd('hat', t, j % 4 === 0);
      nextBeat++;
    }
  }
  function finish() {
    mode = 'ended'; endAt = null; $('pausebtn').hidden = true; $('end').hidden = false;
    var st = g.st, secs = Math.round(Math.max(0, lastS)), mm = Math.floor(secs / 60), ss = ('0' + (secs % 60)).slice(-2);
    $('endt').textContent = endInfo && endInfo.win ? 'VICTORY — RANK ' + endInfo.rank : 'DEFEATED';
    $('endt').style.color = endInfo && endInfo.win ? '#ffd58a' : '#ff7a5c';
    $('endp').innerHTML = (endInfo && endInfo.win ? 'Grumbold crumbles.' : 'The Stone Warden stands.') + '<br>Time ' + mm + ':' + ss + ' · Hits taken ' + st.hitsTaken + ' · Boss HP left ' + Math.round(st.bossHp) +
      '<br>Tip: shield on the telegraph, attack when he is dizzy or idle.';
  }

  // ---------- draw ----------
  function draw(s) {
    var t = Math.max(0, s);
    cx.save();
    if (shake > 0) cx.translate(Math.round((Math.random() - .5) * shake), Math.round((Math.random() - .5) * shake));
    cx.translate(0, -24);
    A.drawBg(cx, t);
    A.drawBoss(cx, BOSS_X, bossPose(s));
    var anim = 'idle', pulse = 0, shieldT = 1;
    if (g && g.cycle >= 0 && lastCmd) {
      var b = (s - g.cycle * CT) / BEAT;
      if (b >= 3.6 && b < 8.2) anim = !lastCmd.ok ? 'stumble' : lastCmd.combo === 'attack' ? 'attack' : 'shield';
    }
    for (var q = 0; q < armyAt.length; q++) { var d = s - armyAt[q]; if (d >= 0 && d < 0.3) pulse = Math.max(pulse, 1 - d / 0.3); }
    if (anim === 'shield' && shieldFlash > 0) pulse = Math.max(pulse, shieldFlash);
    var dead = squadDead > 0;
    for (var i = 0; i < 5; i++) {
      if (dead) { cx.save(); cx.globalAlpha = Math.max(0, 1 - squadDead); cx.translate(0, Math.min(8, squadDead * 10)); }
      A.drawWarrior(cx, SQUAD_X[i] + (i % 2) * 2, i, { anim: dead ? 'stumble' : anim, pulse: pulse, hurt: hurtSquad, t: t, shieldT: 1 });
      if (dead) cx.restore();
    }
    A.drawParticles(cx, parts);
    floats.forEach(function (f) { if (f.v === 0 && f.col === '#8fe8f4') { A.text(cx, '0', f.x, f.y, f.col, true); } else A.text(cx, f.v, f.x, f.y, f.col, true); });
    if (g && mode !== 'title' && s >= 0 && g.cycle >= 0) {
      // beat pulse on ground line
      var bp = ((s / BEAT) % 1); if (bp < 0.12) A.rect(cx, 0, 141, 320, 1, 'rgba(255,255,255,.5)');
    }
    cx.restore();
  }

  // ---------- loop ----------
  function loop(ts) {
    var dt = Math.min(0.05, (ts - lastFrame) / 1000 || 0.016); lastFrame = ts;
    if (mode !== 'paused') tick(dt);
    requestAnimationFrame(loop);
  }
  if (!TEST) requestAnimationFrame(loop);
  else { draw(0); }

  // ---------- test hook ----------
  if (TEST) {
    window.__rt = {
      begin: function (o) { begin(o); },
      advance: function (dt) { var n = Math.max(1, Math.round(dt * 60)); for (var i = 0; i < n; i++) { T += dt / n; tick(dt / n); } },
      press: function (k) { inputKey(k); },
      info: function () { return g ? { mode: mode, over: g.st.over, bossHp: g.st.bossHp, hp: g.st.hp, hits: g.st.hitsTaken, cycle: g.cycle, action: g.action && g.action.type, gmode: g.mode, s: gs(), start: start, expected: g.expected, combo: g.st.combo, banner: $('banner').textContent, fever: g.st.combo } : { mode: mode }; },
      now: now,
      // run a bot: policy 'perfect' | 'greedy' | 'idle'; returns summary
      bot: function (kind, maxSec) {
        var cyc = -1, planned = {}, plan = null, fin = 0;
        for (var n = 0; n < maxSec * 60 && mode !== 'ended'; n++) {
          this.advance(1 / 60);
          if (!g || g.cycle < 0) continue;
          if (g.cycle !== cyc) { cyc = g.cycle; planned = {};
            var atk = C.isAttack(g.action), lesson = g.mode.indexOf('lesson') === 0;
            plan = kind === 'idle' ? null : kind === 'greedy' ? C.COMBOS.attack : (g.expected === 'shield' ? C.COMBOS.shield : C.COMBOS.attack); }
          if (plan) for (var i = 0; i < 4; i++) { var tt = start + cyc * CT + i * BEAT; if (!planned[i] && T >= tt) { planned[i] = 1; inputKey(plan[i], tt); } }
        }
        var inf = this.info(); inf.t = T; return inf;
      }
    };
  }
})();
