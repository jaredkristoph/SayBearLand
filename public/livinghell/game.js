/* Living Hell, phase 1: menu, character creator, the Sun, and the tutorial fight. Rules live in core.js. */
(function () {
  var C = window.LH, Art = window.LHArt, IMG = Art.IMG;
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('c'), ctx = cv.getContext('2d'), W = 960, H = 540;
  ctx.imageSmoothingEnabled = false;
  var KEY = 'livinghell.save.v1';
  var rng = Math.random;

  /* ---------- fit the 960x540 stage to the window ---------- */
  function fit() { var s = Math.min(innerWidth / W, innerHeight / H); $('stage').style.transform = 'scale(' + s + ')'; }
  addEventListener('resize', fit); fit();

  /* ---------- game clock: everything waits while paused ---------- */
  var gt = 0, paused = false, timers = [], tweens = [];
  function sleep(ms) { return new Promise(function (res) { timers.push({ t: gt + ms, res: res }); }); }
  function tw(o, k, to, ms) { return new Promise(function (res) { tweens.push({ o: o, k: k, from: o[k], to: to, t0: gt, ms: Math.max(1, ms), res: res }); }); }
  function stepClock(dt) {
    gt += dt;
    for (var i = timers.length - 1; i >= 0; i--) if (gt >= timers[i].t) { var r = timers[i].res; timers.splice(i, 1); r(); }
    for (var j = tweens.length - 1; j >= 0; j--) { var a = tweens[j], k = Math.min(1, (gt - a.t0) / a.ms), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; a.o[a.k] = a.from + (a.to - a.from) * e; if (k >= 1) { tweens.splice(j, 1); a.res(); } }
  }

  /* ---------- sound ---------- */
  var AC = null, master = null, muted = false, droneGain = null;
  try { muted = localStorage.getItem('livinghell.muted') === '1'; } catch (e) {}
  function audioStart() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
    var Ctor = window.AudioContext || window.webkitAudioContext; if (!Ctor) return;
    AC = new Ctor(); master = AC.createGain(); master.gain.value = muted ? 0 : .6; master.connect(AC.destination);
    droneGain = AC.createGain(); droneGain.gain.value = .07; droneGain.connect(master);
    [[49, 'sawtooth'], [49.5, 'sawtooth'], [73.4, 'triangle'], [98.6, 'sine']].forEach(function (f, i) { var o = AC.createOscillator(), lp = AC.createBiquadFilter(), g = AC.createGain(); o.type = f[1]; o.frequency.value = f[0]; lp.type = 'lowpass'; lp.frequency.value = 260; g.gain.value = i < 2 ? .5 : .3; o.connect(lp); lp.connect(g); g.connect(droneGain); o.start(); });
    var lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = .07; lg.gain.value = .03; lfo.connect(lg); lg.connect(droneGain.gain); lfo.start();
    var nb = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate), d = nb.getChannelData(0); for (var n = 0; n < d.length; n++) d[n] = Math.random() * 2 - 1; AC.noiseBuf = nb;
  }
  function tone(f, t0, dur, vol, type, f2) { if (!AC) return; var t = AC.currentTime + t0, o = AC.createOscillator(), g = AC.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0008, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05); }
  function noise(t0, dur, f0, f1, vol, q) { if (!AC) return; var t = AC.currentTime + t0, s = AC.createBufferSource(); s.buffer = AC.noiseBuf; var b = AC.createBiquadFilter(), g = AC.createGain(); b.type = 'bandpass'; b.Q.value = q || 1.2; b.frequency.setValueAtTime(f0, t); b.frequency.exponentialRampToValueAtTime(f1, t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); s.connect(b); b.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + .05); }
  var SFX = {
    click: function () { tone(520, 0, .05, .08, 'square'); },
    swing: function () { noise(0, .25, 500, 2400, .18, .8); },
    hit: function () { tone(140, 0, .2, .35, 'sine', 50); noise(0, .14, 1200, 300, .28); },
    crit: function () { SFX.hit(); tone(880, .02, .35, .12, 'square'); tone(1320, .06, .4, .08, 'square'); },
    miss: function () { noise(0, .3, 900, 300, .12, .6); },
    block: function () { tone(1700, 0, .2, .16, 'square'); noise(0, .1, 3000, 1500, .12, 4); },
    parry: function () { tone(2400, 0, .5, .14, 'sine'); tone(3100, .02, .4, .08, 'sine'); noise(0, .12, 4000, 2000, .14, 6); },
    fire: function () { noise(0, .8, 300, 2000, .22, .5); tone(90, 0, .6, .2, 'sawtooth', 40); },
    roar: function () { noise(0, 1.4, 400, 700, .18, .4); },
    warn: function () { tone(220, 0, .12, .1, 'square'); },
    ping: function () { tone(1040, 0, .08, .1, 'square'); },
    thud: function () { tone(70, 0, .6, .4, 'sine', 30); noise(0, .3, 300, 80, .3); },
    sun: function () { tone(61, 0, .2, .1, 'sawtooth'); tone(61.7, 0, .2, .08, 'sawtooth'); }
  };
  function sfx(n) { if (AC && !muted && SFX[n]) { try { SFX[n](); } catch (e) {} } }
  function setMuted(m) { muted = m; try { localStorage.setItem('livinghell.muted', m ? '1' : '0'); } catch (e) {} if (master) master.gain.value = m ? 0 : .6; $('sndBtn').textContent = m ? 'SOUND OFF' : 'SOUND ON'; }

  /* ---------- state + saving ---------- */
  var ch = C.newCharacter(), tutorialDone = 0, wins = 0, cloud = { user: null }, best = null;
  function snap() { return { v: 1, ch: ch, tutorial: tutorialDone, wins: wins }; }
  function readLocal() { try { var j = JSON.parse(localStorage.getItem(KEY) || 'null'); var s = j && C.sanitize(j.state); return s ? { state: s, savedAt: j.savedAt || 0 } : null; } catch (e) { return null; } }
  function save(manual) {
    var ok = true; try { localStorage.setItem(KEY, JSON.stringify({ state: snap(), savedAt: Date.now() })); } catch (e) { ok = false; }
    if (cloud.user) fetch('/api/livinghell/save', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: snap() }) }).then(function (r) { if (manual) toast(r.ok ? 'Saved.' : 'Saved here. Online save failed.'); }).catch(function () {});
    else if (manual) toast(ok ? 'Saved on this device.' : 'Could not save.');
  }
  function fetchCloud() { return fetch('/api/livinghell/save', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { var s = j && j.state && C.sanitize(j.state); return s ? { state: s, savedAt: j.savedAt || 0 } : null; }).catch(function () { return null; }); }
  var toastT = 0; function toast(t) { var e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove('on'); }, 1800); }

  /* ---------- scene + effects ---------- */
  var mode = 'load', V = { p: mkV(300, 505, false), e: mkV(1200, 505, true) }, parts = [], floats = [], shake = 0, glitch = 0, flashA = 0, sunAlpha = 1, sunPulse = 0, ring = null, fire = null;
  function mkV(x, y, flip) { return { x: x, y: y, ox: 0, oy: 0, rot: 0, flash: 0, alpha: 1, ang: -25, flip: flip, canvas: null, weapon: 'cleaver', lean: 0 }; }
  var embers = []; for (var q = 0; q < 46; q++) embers.push({ x: Math.random() * W, y: Math.random() * H, s: .4 + Math.random(), v: 8 + Math.random() * 22, ph: Math.random() * 6 });
  var noiseC = Art.mk(160, 90), noiseG = noiseC.getContext('2d'), noiseN = 0;
  var tmp = Art.mk(256, 256), tg = tmp.getContext('2d'), glitchBuf = Art.mk(W, H), gbg = glitchBuf.getContext('2d');

  function spawn(x, y, n, cols, spd, grav) { for (var i = 0; i < n; i++) { var a = Math.random() * 6.28, s = spd * (.3 + Math.random()); parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - spd * .4, life: .5 + Math.random() * .5, max: 1, col: cols[(Math.random() * cols.length) | 0], size: 2 + (Math.random() * 3 | 0), g: grav == null ? 240 : grav }); } }
  function floatText(x, y, text, col, big) { floats.push({ x: x, y: y, text: text, col: col || '#fff', t: 0, big: big }); }

  function drawSun(cx, base, scale, alpha, tint) {
    if (!IMG.sun) return; var w = 170 * scale, h = 256 * scale, bob = Math.sin(gt / 900) * 3 * scale;
    ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(IMG.sun, cx - w / 2, base - h + bob, w, h);
    if (tint) { tg.clearRect(0, 0, 256, 256); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * (.12 + .06 * Math.sin(gt / 400)); ctx.drawImage(IMG.sun, cx - w / 2, base - h + bob, w, h); }
    ctx.restore();
  }
  function whiteOf(img, a) { tg.clearRect(0, 0, 256, 256); tg.globalCompositeOperation = 'source-over'; tg.drawImage(img, 0, 0); tg.globalCompositeOperation = 'source-atop'; tg.fillStyle = 'rgba(255,230,210,' + a + ')'; tg.fillRect(0, 0, 256, 256); tg.globalCompositeOperation = 'source-over'; return tmp; }
  function drawFighter(v, show) {
    if (!v.canvas || v.alpha <= 0) return;
    ctx.save(); ctx.translate(v.x + v.ox, v.y + v.oy); ctx.globalAlpha = v.alpha;
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(0, 0, 54 * (v.sc || 1), 9 * (v.sc || 1), 0, 0, 6.3); ctx.fill();
    ctx.rotate(v.rot * Math.PI / 180); ctx.scale((v.flip ? -1 : 1) * (v.sc || 1), v.sc || 1); ctx.translate(v.lean, 0);
    var img = v.flash > .02 ? whiteOf(v.canvas, v.flash) : v.canvas; ctx.drawImage(img, -128, -246);
    if (show !== false) { // weapon in the hand nearest the opponent
      var wp = Art.weapon(v.weapon); ctx.save(); ctx.translate(42, -108); ctx.rotate(v.ang * Math.PI / 180); ctx.drawImage(wp, -12, -72); ctx.restore();
    }
    ctx.restore();
  }
  function drawBackground() {
    if (IMG.hell) ctx.drawImage(IMG.hell, 0, 0, W, H); else { ctx.fillStyle = '#200808'; ctx.fillRect(0, 0, W, H); }
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(160,40,12,' + (.05 + .03 * Math.sin(gt / 700)) + ')'; ctx.fillRect(0, 0, W, H); ctx.restore();
    embers.forEach(function (e) { e.y -= e.v * .016 * (paused ? 0 : 1); e.x += Math.sin(gt / 900 + e.ph) * .25; if (e.y < -4) { e.y = H + 4; e.x = Math.random() * W; } ctx.fillStyle = 'rgba(255,' + (110 + (e.s * 60 | 0)) + ',40,' + (.5 + .3 * Math.sin(gt / 300 + e.ph)) + ')'; ctx.fillRect(e.x | 0, e.y | 0, e.s > 1 ? 2 : 1, e.s > 1 ? 2 : 1); });
  }
  function render(dt) {
    var sx = 0, sy = 0; if (shake > 0) { sx = (Math.random() - .5) * shake; sy = (Math.random() - .5) * shake; shake = Math.max(0, shake - dt * 60); }
    ctx.save(); ctx.translate(sx, sy); ctx.fillStyle = '#000'; ctx.fillRect(-8, -8, W + 16, H + 16);
    drawBackground();
    if (mode === 'menu') { drawSun(700, 540, 1.75, 1, true); }
    else if (mode === 'create') { drawSun(540, 510, 1.55, .92, true); V.p.x = 790; V.p.y = 520; V.p.flip = false; drawFighter(V.p, false); }
    else if (mode === 'dlg') { drawSun(480, 600, 2.1, 1, true); var g = ctx.createLinearGradient(0, 330, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.8)'); ctx.fillStyle = g; ctx.fillRect(0, 330, W, 210); }
    else if (mode === 'fight' || mode === 'end') {
      drawSun(480, 400, .9, .8 * sunAlpha, true);
      drawFighter(V.p); drawFighter(V.e);
      if (fire) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; var gr = ctx.createRadialGradient(fire.x, fire.y, 2, fire.x, fire.y, 26); gr.addColorStop(0, 'rgba(255,240,180,1)'); gr.addColorStop(.4, 'rgba(255,120,30,.8)'); gr.addColorStop(1, 'rgba(255,40,10,0)'); ctx.fillStyle = gr; ctx.fillRect(fire.x - 30, fire.y - 30, 60, 60); ctx.restore(); }
      if (ring) { var k = Math.max(0, Math.min(1, (gt - ring.t0) / ring.dur)), r = 74 - 56 * k; ctx.save(); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(ring.x, ring.y, r, 0, 6.3); ctx.stroke(); var zr = ring.zone; ctx.strokeStyle = 'rgba(255,210,74,.75)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ring.x, ring.y, 18 + zr * 56, 0, 6.3); ctx.stroke(); ctx.beginPath(); ctx.arc(ring.x, ring.y, 18, 0, 6.3); ctx.stroke(); ctx.restore(); }
    }
    parts.forEach(function (p, i) { p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.life > 0) { ctx.fillStyle = p.col; ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillRect(p.x | 0, p.y | 0, p.size, p.size); ctx.globalAlpha = 1; } }); parts = parts.filter(function (p) { return p.life > 0; });
    floats.forEach(function (f) { f.t += dt; var a = Math.max(0, 1 - f.t / 1.3); ctx.globalAlpha = a; ctx.font = '700 ' + (f.big ? 34 : 26) + 'px "Pixelify Sans",monospace'; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = '#000'; ctx.strokeText(f.text, f.x, f.y - f.t * 46); ctx.fillStyle = f.col; ctx.fillText(f.text, f.x, f.y - f.t * 46); ctx.globalAlpha = 1; }); floats = floats.filter(function (f) { return f.t < 1.3; });
    ctx.restore();
    vhs(dt);
  }
  function vhs(dt) {
    if (flashA > 0) { ctx.fillStyle = 'rgba(255,255,255,' + flashA + ')'; ctx.fillRect(0, 0, W, H); flashA = Math.max(0, flashA - dt * 3); }
    // tracking glitch: a band of the picture slides sideways with a colour fringe
    if (glitch <= 0 && Math.random() < dt * .22) glitch = .18 + Math.random() * .25;
    if (glitch > 0) { glitch -= dt; gbg.drawImage(cv, 0, 0); var y = (Math.random() * (H - 60)) | 0, h = 10 + (Math.random() * 40 | 0), dx = (Math.random() - .5) * 40; ctx.drawImage(glitchBuf, 0, y, W, h, dx, y, W, h); ctx.fillStyle = 'rgba(255,40,40,.12)'; ctx.fillRect(0, y, W, 2); ctx.fillStyle = 'rgba(40,200,255,.1)'; ctx.fillRect(0, y + h - 2, W, 2); }
    if ((noiseN++ % 3) === 0) { var d = noiseG.createImageData(160, 90), p = d.data; for (var i = 0; i < p.length; i += 4) { var v = Math.random() * 255 | 0; p[i] = p[i + 1] = p[i + 2] = v; p[i + 3] = 26; } noiseG.putImageData(d, 0, 0); }
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(noiseC, 0, 0, W, H); ctx.restore();
    var ry = ((gt / 12) % (H + 120)) - 60; ctx.fillStyle = 'rgba(255,255,255,.025)'; ctx.fillRect(0, ry, W, 40);
  }
  var last = 0;
  function loop(now) {
    requestAnimationFrame(loop); var dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
    if (!paused) { stepClock(dt * 1000); }
    if (mode === 'load') return;
    if (meter) meterTick();
    ['p', 'e'].forEach(function (k) { V[k].flash = Math.max(0, V[k].flash - dt * 3.2); });
    render(paused ? 0 : dt);
  }
  setInterval(function () { if (paused) return; var s = Math.floor(performance.now() / 1000) + 187, h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60, sc = s % 60; $('clock').textContent = [h, m, sc].map(function (n) { return n < 10 ? '0' + n : n; }).join(':'); }, 1000);

  /* ---------- screens ---------- */
  var screens = ['menu', 'create', 'dlg', 'fight', 'endS'];
  function show(name) { screens.forEach(function (s) { $(s).hidden = s !== name; }); $('menuBtn').hidden = !(name === 'create' || name === 'fight' || name === 'dlg'); }
  function toMenu() { mode = 'menu'; paused = false; $('pause').hidden = true; show('menu'); refreshMenu(); endFight(); }

  function refreshMenu() {
    var loc = readLocal(); best = loc;
    function paint() { var b = $('contBtn'); b.hidden = !best; if (best) $('contSub').textContent = best.state.ch.name + (best.state.tutorial ? ' · phase 1 cleared' : ' · the pit awaits'); }
    paint();
    fetch('/api/me', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      var a = $('acct');
      if (j && j.user) { cloud.user = j.user.username || 'you'; a.textContent = 'SIGNED IN AS ' + String(j.user.name || cloud.user).toUpperCase() + ' // PROGRESS ALSO SAVES ONLINE'; fetchCloud().then(function (c) { if (c && (!best || c.savedAt > best.savedAt)) { best = c; paint(); } }); }
      else { cloud.user = null; a.innerHTML = 'GUEST // SAVES ON THIS DEVICE // <a href="/">LOG IN TO SAYBEARLAND</a> TO SAVE ONLINE'; }
    }).catch(function () { $('acct').textContent = 'SAVES ON THIS DEVICE'; });
  }

  /* ---- character creator ---- */
  function buildStats() {
    var p = $('statP'); p.innerHTML = '<h3>stats</h3>';
    C.STATS.forEach(function (s) {
      var r = document.createElement('div'); r.className = 'srow'; r.id = 'sr_' + s[0];
      r.innerHTML = '<span class="n">' + s[1].toLowerCase() + '</span><span class="v" id="sv_' + s[0] + '">1</span><button class="btn" data-s="' + s[0] + '" data-d="-1" type="button" aria-label="Lower ' + s[1] + '">&minus;</button><button class="btn" data-s="' + s[0] + '" data-d="1" type="button" aria-label="Raise ' + s[1] + '">+</button><span class="bar"><i id="sb_' + s[0] + '"></i></span>';
      r.addEventListener('mouseenter', function () { $('tipP').textContent = s[1] + ': ' + s[2]; });
      r.addEventListener('focusin', function () { $('tipP').textContent = s[1] + ': ' + s[2]; });
      p.appendChild(r);
    });
    p.addEventListener('click', function (e) { var b = e.target.closest('button[data-s]'); if (!b) return; audioStart(); if (C.setStat(ch, b.dataset.s, +b.dataset.d)) sfx('click'); syncCreate(); });
  }
  function syncCreate() {
    $('vSkin').innerHTML = '<span class="sw" style="background:rgb(' + C.SKINS[ch.skin][1].join(',') + ')"></span>' + C.SKINS[ch.skin][0].toLowerCase();
    $('vHair').textContent = C.HAIRS[ch.hair].toLowerCase();
    $('vHcol').innerHTML = '<span class="sw" style="background:rgb(' + C.HAIR_COLORS[ch.hcol][1].join(',') + ')"></span>' + C.HAIR_COLORS[ch.hcol][0].toLowerCase();
    $('vStub').textContent = C.STUBBLES[ch.stub].toLowerCase();
    C.STATS.forEach(function (s) { $('sv_' + s[0]).textContent = ch.stats[s[0]]; $('sb_' + s[0]).style.width = ch.stats[s[0]] * 10 + '%'; });
    var left = C.pointsLeft(ch); $('pts').textContent = left;
    var nameOk = C.validName($('nameIn').value); $('goBtn').disabled = !(nameOk && left === 0);
    $('goHint').textContent = !nameOk ? 'Enter a name (2 letters or more).' : left > 0 ? 'Spend all your skill points.' : '';
    V.p.canvas = Art.character(ch, C);
  }
  function startCreate() {
    mode = 'create'; show('create'); ch = C.newCharacter(); ch.name = ''; $('nameIn').value = ''; V.p = mkV(790, 520, false); V.p.sc = 1.5; V.p.weapon = 'cleaver'; syncCreate();
    sunAlpha = 1; $('tipP').textContent = 'Spend your skill points. Hover a stat to read what it does.';
  }
  document.querySelectorAll('#lookP .arrow').forEach(function (b) {
    b.addEventListener('click', function () {
      audioStart(); sfx('click'); var k = b.dataset.k, d = +b.dataset.d, n = { skin: C.SKINS.length, hair: C.HAIRS.length, hcol: C.HAIR_COLORS.length, stub: C.STUBBLES.length }[k];
      ch[k] = (ch[k] + d + n) % n; syncCreate();
    });
  });
  $('randBtn').onclick = function () { audioStart(); sfx('click'); C.randomize(ch); syncCreate(); };
  $('nameIn').addEventListener('input', function () { ch.name = C.cleanName($('nameIn').value); syncCreate(); });
  $('nameIn').addEventListener('keydown', function (e) { e.stopPropagation(); });
  $('goBtn').onclick = function () { audioStart(); ch.name = C.cleanName($('nameIn').value); tutorialDone = 0; save(); sfx('sun'); intro(); };

  /* ---- dialogue with the Sun ---- */
  var dlgResolve = null, typing = null;
  function drawFace(canvas) { var g = canvas.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, 64, 64); g.fillStyle = '#100404'; g.fillRect(0, 0, 64, 64); if (IMG.sun) g.drawImage(IMG.sun, 49, 25, 72, 72, 0, 0, 64, 64); }
  function say(who, text) {
    return new Promise(function (res) {
      $('dlgWho').textContent = who; drawFace($('dlgFace')); var t = $('dlgText'); t.textContent = ''; var i = 0; dlgResolve = null; typing = { done: false };
      $('dlgNext').style.visibility = 'hidden';
      function fin() { typing.done = true; t.textContent = text; $('dlgNext').style.visibility = 'visible'; dlgResolve = res; }
      typing.skip = fin;
      (function tick() { if (typing.done) return; if (paused) { setTimeout(tick, 60); return; } i++; t.textContent = text.slice(0, i); if (i % 2 === 0) sfx('sun'); if (i >= text.length) { fin(); return; } setTimeout(tick, 38); })();
    });
  }
  function advance() { if (!typing) return; if (!typing.done) { typing.skip(); return; } var r = dlgResolve; dlgResolve = null; typing = null; if (r) { sfx('click'); r(); } }
  $('dlgBox').addEventListener('click', advance);

  async function intro() {
    mode = 'dlg'; show('dlg'); flashA = 1; glitch = .4; shake = 10; sfx('thud');
    var lines = [
      ['THE SUN', 'WELCOME, ' + ch.name.toUpperCase() + '.'],
      ['THE SUN', 'YOU DIED, AND THE DEAD ARE WARM HERE. WARM FOR AS LONG AS THEY ARE WATCHED.'],
      ['THE SUN', 'THE DAMNED FIGHT IN THE PIT. THE WINNERS ARE ALLOWED TO REMEMBER THEIR NAMES.'],
      ['THE SUN', 'THERE IS A PRISONER WAITING. HE HAS FORGOTTEN HIS. I WILL TEACH YOU HOW TO TAKE IT.']
    ];
    for (var i = 0; i < lines.length; i++) await say(lines[i][0], lines[i][1]);
    fightTutorial();
  }

  /* ---------- the fight ---------- */
  var P, E, tut = true, fightRun = 0, allowed = null, pickRes = null, meter = null, blockWin = null;
  function endFight() { fightRun++; meter = null; blockWin = null; ring = null; fire = null; pickRes = null; $('meter').hidden = true; $('blockBtn').classList.remove('on'); timers = []; tweens = []; }
  function hud() {
    [['hudP', P], ['hudE', E]].forEach(function (x) {
      var f = x[1], el = $(x[0]); if (!f) return;
      el.innerHTML = '<div class="nm">' + f.name.toUpperCase() + '</div><div class="bar2 hp"><i style="width:' + (100 * f.hp / f.maxHp) + '%"></i><span>' + f.hp + ' / ' + f.maxHp + '</span></div><div class="bar2 sp sm"><i style="width:' + (100 * f.sp / f.maxSp) + '%"></i><span>' + f.sp + ' / ' + f.maxSp + '</span></div>';
    });
  }
  function coach(t) { $('coachT').textContent = t; drawFace($('coachFace')); }
  function log(t) { $('log').textContent = t || ''; }
  function buildActs() {
    var box = $('acts'); box.innerHTML = '';
    ['quick', 'heavy', 'guard', 'hellfire'].forEach(function (id, i) {
      var m = C.MOVES[id], b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.id = 'act_' + id; b.dataset.id = id;
      b.innerHTML = m.name.toUpperCase() + '<small>' + (m.cost ? m.cost + ' stamina' : 'free') + '</small><kbd>[' + (i + 1) + ']</kbd>'; b.title = m.note;
      b.onclick = function () { choose(id); }; box.appendChild(b);
    });
  }
  function setActs(list) { ['quick', 'heavy', 'guard', 'hellfire'].forEach(function (id) { $('act_' + id).disabled = !(list && list.indexOf(id) >= 0 && C.canUse(P, id)); }); }
  function choose(id) { if (pickRes && !$('act_' + id).disabled) { var r = pickRes; pickRes = null; setActs(null); r(id); } }
  function pickAction(list) { allowed = list; setActs(list); return new Promise(function (res) { pickRes = res; }); }

  function handPos(v) { var s = v.flip ? -1 : 1; return { x: v.x + v.ox + s * 42, y: v.y + v.oy - 108 }; }
  function chestPos(v) { return { x: v.x + v.ox, y: v.y + v.oy - 140 }; }

  // timing meter: stop the marker inside the glowing zone
  function timingMeter() {
    var perf = Math.min(.15, .05 + P.stats.attack * .008), good = Math.min(.38, perf * 2.4);
    $('mPerf').style.left = (50 - perf * 100) + '%'; $('mPerf').style.width = perf * 200 + '%'; $('mGood').style.left = (50 - good * 100) + '%'; $('mGood').style.width = good * 200 + '%';
    $('meter').hidden = false; $('mTxt').textContent = 'STOP IT IN THE LIGHT  [SPACE]';
    return new Promise(function (res) { meter = { t0: gt, sweep: 900, perf: perf, good: good, res: res, pos: 0 }; });
  }
  function meterPos(m) { var k = ((gt - m.t0) / m.sweep) % 2; return k < 1 ? k : 2 - k; }
  function meterTick() { if (!meter) return; var p = meterPos(meter); $('mMark').style.left = 'calc(' + p * 100 + '% - 3px)'; if (gt - meter.t0 > meter.sweep * 3.2) stopMeter(); }
  function stopMeter() {
    if (!meter) return; var m = meter, p = meterPos(m), d = Math.abs(p - .5), r = d <= m.perf ? 'perfect' : d <= m.good ? 'good' : 'poor'; meter = null;
    $('meter').hidden = true; $('mTxt').textContent = ''; m.res(r);
  }
  // block: press as the ring closes
  function tryBlock() {
    if (!blockWin || blockWin.done) return; var rem = blockWin.dur - (gt - blockWin.t0), k = tut ? 1.7 : 1;
    blockWin.done = true;
    blockWin.reaction = rem <= 140 * k ? 'parry' : rem <= 340 * k ? 'block' : 'early';
    sfx(blockWin.reaction === 'early' ? 'miss' : 'click');
  }
  $('blockBtn').addEventListener('pointerdown', function (e) { e.preventDefault(); tryBlock(); });

  function say2(t) { log(t); }
  async function swingAnim(v, target, heavy) {
    var dir = v.flip ? -1 : 1; sfx('swing');
    await Promise.all([tw(v, 'ang', -115, heavy ? 280 : 160), tw(v, 'ox', -14 * dir, heavy ? 280 : 160)]);
    await Promise.all([tw(v, 'ang', 60, 110), tw(v, 'ox', 70 * dir, 110)]);
  }
  async function recover(v) { await Promise.all([tw(v, 'ang', -25, 240), tw(v, 'ox', 0, 260)]); }
  function impact(v, res, col) {
    var c = chestPos(v); v.flash = 1; shake = res.crit ? 18 : 9; sfx(res.crit ? 'crit' : 'hit'); spawn(c.x, c.y, res.crit ? 34 : 18, ['#ff3a22', '#c2261b', '#ff8a3a', '#fff'], 190);
    floatText(c.x, c.y - 70, '-' + res.dmg, res.crit ? '#ffd24a' : '#ff5a4a', res.crit); if (res.crit) floatText(c.x, c.y - 112, 'CRITICAL', '#ffd24a');
    v.lean = (v.flip ? 1 : -1) * 10; tw(v, 'lean', 0, 260);
  }
  async function fireball(from, to) {
    sfx('fire'); var h = handPos(from), t = chestPos(to); fire = { x: h.x, y: h.y }; var o = { k: 0 }; var trail = setInterval(function () { if (fire && !paused) spawn(fire.x, fire.y, 3, ['#ff8a3a', '#ffd24a', '#c2261b'], 40, -60); }, 30);
    var ps = tw(o, 'k', 1, 420); var upd = setInterval(function () { if (fire) { fire.x = h.x + (t.x - h.x) * o.k; fire.y = h.y + (t.y - h.y) * o.k - Math.sin(o.k * Math.PI) * 30; } }, 16); await ps; clearInterval(trail); clearInterval(upd); fire = null;
  }

  async function playerAttack(id) {
    var m = C.MOVES[id], timing = 'good';
    if (id === 'guard') { C.apply(P, E, 'guard', { dmg: 0 }); hud(); log('You brace yourself. +3 stamina, and the next hit is halved.'); floatText(V.p.x, V.p.y - 250, 'GUARD', '#9ad0ff'); sfx('block'); await sleep(700); return; }
    log(m.name + '. Stop the marker in the light.'); timing = await timingMeter(); log('');
    var mine = fightRun;
    if (id === 'hellfire') { V.p.ang = -80; await tw(V.p, 'ang', -140, 220); await fireball(V.p, V.e); }
    else await swingAnim(V.p, V.e, id === 'heavy');
    if (mine !== fightRun) return;
    var res = C.resolve(P, E, id, timing, null, rng); C.apply(P, E, id, res); hud();
    if (res.hit) impact(V.e, res); else { sfx('miss'); floatText(chestPos(V.e).x, chestPos(V.e).y - 60, 'MISS', '#c8c0b8'); }
    if (timing === 'perfect') log('Perfect timing!'); else if (timing === 'poor') log('Too early or too late.');
    await recover(V.p); await sleep(380);
  }
  async function enemyAttack(id, first) {
    var mine = fightRun, wind = tut ? (first ? 1700 : 1300) : 900;
    log(E.name + ' raises his weapon.'); sfx('warn');
    var c = chestPos(V.p); ring = { x: c.x, y: c.y, t0: gt, dur: wind, zone: .3 }; blockWin = { t0: gt, dur: wind, done: false, reaction: null };
    $('blockBtn').classList.add('on'); tw(V.e, 'ang', -125, wind - 60); tw(V.e, 'ox', 16, wind - 60);
    await sleep(wind); if (mine !== fightRun) return; ring = null; $('blockBtn').classList.remove('on');
    var reaction = blockWin.reaction === 'early' ? null : blockWin.reaction; blockWin = null;
    sfx('swing'); await Promise.all([tw(V.e, 'ang', 60, 100), tw(V.e, 'ox', -80, 100)]);
    var res = C.resolve(E, P, id, 'good', reaction, rng); C.apply(E, P, id, res); hud();
    if (res.parried) { sfx('parry'); floatText(c.x, c.y - 60, 'PARRY!', '#9ad0ff', true); flashA = .3; log('You turn his blow aside. He staggers.'); V.e.lean = 22; tw(V.e, 'lean', 0, 400); }
    else if (res.hit) { impact(V.p, res); if (res.blocked) { floatText(c.x, c.y - 112, 'BLOCKED', '#9ad0ff'); sfx('block'); log('You catch most of it.'); } else if (res.guarded) log('Your guard softens the blow.'); else log('It hurts.'); }
    else { sfx('miss'); floatText(c.x, c.y - 60, 'MISS', '#c8c0b8'); log('He misses.'); }
    await Promise.all([tw(V.e, 'ang', -25, 260), tw(V.e, 'ox', 0, 260)]); await sleep(420);
  }

  var pTurns = 0, eTurns = 0;
  async function playerTurn() {
    var st = C.startTurn(P, rng, true); pTurns++; hud();
    if (st.cheer) { floatText(V.p.x, V.p.y - 270, 'THE DAMNED ROAR', '#ffd24a'); sfx('roar'); }
    var list = ['quick', 'heavy', 'guard', 'hellfire'];
    if (tut) {
      if (pTurns === 1) { list = ['quick']; coach('This one is called ASH. Strike first. Choose QUICK STRIKE, then stop the marker in the light.'); }
      else if (pTurns === 2) { list = ['guard']; coach('The yellow bar is stamina. Every strike spends it. GUARD to win some back and halve the next hit.'); }
      else if (pTurns === 3) { list = ['heavy', 'quick', 'guard']; coach('HEAVY STRIKE costs more stamina and hits hard, but it is easier to miss.'); }
      else if (pTurns === 4) { list = ['hellfire', 'heavy', 'quick', 'guard']; coach('HELLFIRE needs no weapon. Magicka makes it burn, and armour cannot stop it.'); }
      else coach('Finish him. Or be finished. The sun does not mind which.');
      if (!list.some(function (i) { return C.canUse(P, i); })) list = ['guard'];
      if (list.length === 1 && !C.canUse(P, list[0])) list = ['guard'];
    }
    var id = await pickAction(list); await playerAttack(id);
  }
  async function enemyTurn() {
    var st = C.startTurn(E, rng, false); eTurns++; hud();
    if (E.stagger) { E.stagger = false; log('Ash is still reeling.'); await sleep(900); return; }
    var id = C.enemyChoose(E, rng, true);
    if (tut && eTurns === 1) { id = 'quick'; coach('Now he swings. Press SPACE (or BLOCK) just as the white ring closes on you. Perfect timing turns the blow aside.'); }
    else if (tut && eTurns === 2) coach('He is trying again. Keep your eye on the ring.');
    if (id === 'guard') { C.apply(E, P, 'guard', { dmg: 0 }); hud(); log('Ash raises his arms and waits.'); floatText(V.e.x, V.e.y - 250, 'GUARD', '#9ad0ff'); sfx('block'); await sleep(900); return; }
    await enemyAttack(id, eTurns === 1);
  }

  async function fightTutorial() {
    endFight(); var run = fightRun; mode = 'fight'; show('fight'); sunAlpha = 1; tut = true; pTurns = eTurns = 0;
    P = C.fighter(ch.name, Object.assign({}, ch.stats)); E = C.fighter('Ash', { strength: 2, agility: 1, attack: 1, defence: 1, vitality: 2, charisma: 1, stamina: 3, magicka: 1 }, { hp: 30 });
    V.p = mkV(290, 470, false); V.p.canvas = Art.character(ch, C); V.p.weapon = 'cleaver';
    V.e = mkV(1180, 470, true); V.e.weapon = 'shank'; V.e.canvas = Art.character({ skin: 6, hair: 7, hcol: 1, stub: 2, tone: [170, 176, 160] }, C);
    buildActs(); setActs(null); hud(); log(''); coach('A prisoner shuffles into the pit...'); sfx('thud');
    await tw(V.e, 'x', 670, 1800); if (run !== fightRun) return;
    coach('His name was ASH. He has forgotten it. Do not feel sorry for him.'); await sleep(1700); if (run !== fightRun) return;
    var turn = C.playerFirst(P, E) ? 'p' : 'e';
    while (run === fightRun) {
      if (turn === 'p') await playerTurn(); else await enemyTurn();
      if (run !== fightRun) return;
      if (E.hp <= 0) break;
      if (P.hp <= 0) { P.hp = Math.ceil(P.maxHp / 2); flashA = .8; sfx('thud'); coach('THE SUN DOES NOT ALLOW THIS. AGAIN.'); floatText(V.p.x, V.p.y - 250, 'DENIED', '#ffd24a', true); hud(); await sleep(1400); }
      turn = turn === 'p' ? 'e' : 'p';
    }
    // victory
    log(''); coach(''); sfx('thud'); sfx('roar'); V.e.flash = 1; shake = 16; spawn(V.e.x, V.e.y - 100, 40, ['#ff3a22', '#ff8a3a', '#2a0808'], 160);
    await Promise.all([tw(V.e, 'rot', V.e.flip ? -88 : 88, 700), tw(V.e, 'alpha', 0, 1600)]); await sleep(500); if (run !== fightRun) return;
    var all = ['AH.', 'THAT IS WARMTH. DO YOU FEEL IT?', 'NINE MORE PITS BELOW THIS ONE. EACH ONE KNOWS YOUR NAME A LITTLE BETTER.'];
    mode = 'dlg'; show('dlg'); for (var i = 0; i < all.length; i++) await say('THE SUN', all[i]);
    tutorialDone = 1; wins++; save(); finishPhase();
  }
  function finishPhase() {
    mode = 'end'; show('endS'); $('endText').textContent = ch.name + ' has taken a name from the pit. Somewhere above, the sun is smiling wider. Phase 2 is coming: more prisoners, better weapons, and a shop that sells back what you lost.';
  }

  /* ---------- buttons, keys, pause ---------- */
  $('playBtn').onclick = function () { audioStart(); sfx('click'); startCreate(); };
  $('contBtn').onclick = function () { audioStart(); sfx('click'); if (!best) return; var s = best.state; ch = s.ch; tutorialDone = s.tutorial; wins = s.wins; V.p.canvas = Art.character(ch, C); if (tutorialDone) { V.p = mkV(300, 505, false); V.p.canvas = Art.character(ch, C); mode = 'end'; show('endS'); finishPhase(); } else intro(); };
  $('againBtn').onclick = function () { audioStart(); fightTutorial(); };
  $('endMenu').onclick = toMenu;
  $('menuBtn').onclick = function () { setPause(true); };
  $('resume').onclick = function () { setPause(false); };
  $('toMenu').onclick = function () { if (tutorialDone || ch.name) save(); setPause(false); toMenu(); };
  $('sndBtn').onclick = function () { audioStart(); setMuted(!muted); };
  $('wipe').onclick = function () { var b = $('wipe'); if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'CLICK AGAIN TO ERASE'; setTimeout(function () { delete b.dataset.sure; b.textContent = 'ERASE SAVE'; }, 3000); return; } delete b.dataset.sure; b.textContent = 'ERASE SAVE'; try { localStorage.removeItem(KEY); } catch (e) {} if (cloud.user) fetch('/api/livinghell/save', { method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(function () {}); toast('Save erased.'); setPause(false); toMenu(); };
  function setPause(p) { paused = p; $('pause').hidden = !p; }
  addEventListener('keydown', function (e) {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape' && (mode === 'create' || mode === 'fight' || mode === 'dlg')) { setPause(!paused); return; }
    if (paused) return;
    if (e.key === ' ' || e.key === 'Enter') {
      if (typing && mode === 'dlg') { e.preventDefault(); advance(); return; }
      if (meter) { e.preventDefault(); stopMeter(); return; }
      if (blockWin && e.key === ' ') { e.preventDefault(); tryBlock(); return; }
    }
    if (mode === 'fight' && /^[1-4]$/.test(e.key)) choose(['quick', 'heavy', 'guard', 'hellfire'][+e.key - 1]);
  });
  $('fight').addEventListener('pointerdown', function (e) { if (meter && !e.target.closest('#acts') && !e.target.closest('#menuBtn')) stopMeter(); });

  /* ---------- go ---------- */
  Art.load(function (ok) {
    $('load').hidden = true; setMuted(muted); mode = 'menu'; show('menu'); refreshMenu(); requestAnimationFrame(loop);
    if (!ok) toast('Some art failed to load.');
    document.addEventListener('visibilitychange', function () { if (document.hidden && mode !== 'menu') save(); });
    buildStats(); syncCreate();
    window.__lh = { mode: function () { return mode; }, ch: function () { return ch; }, P: function () { return P; }, E: function () { return E; }, setCh: function (c) { ch = c; syncCreate(); }, fightTutorial: fightTutorial, intro: intro, gt: function () { return gt; } };
  });
})();
