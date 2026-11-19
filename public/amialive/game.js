/* Am I Alive? Phase 1. Rendering, input, sound and saving. Rules live in core.js. */
(function () {
  var G = window.AIA, A = window.AIAArt, W = A.W, H = A.H;
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('c'), ctx = cv.getContext('2d'), scene = A.mk(W, H), sc = scene.getContext('2d'), dark = A.mk(W, H), dk = dark.getContext('2d');
  var KEY = 'amialive.save.v1';
  var st = G.newState(), mode = 'title', sceneKey = '', paused = false;
  var ptr = { x: W / 2, y: H / 2, in: false }, orb = { x: W / 2, y: H * .55, a: 0, pulse: 0 }, tWake = 0, fade = 0, fadeTo = -1, flick = 0, lidOpen = 0;
  var parts = [], i;
  for (i = 0; i < 70; i++) parts.push({ x: Math.random() * W, y: Math.random() * H, z: .3 + Math.random(), s: Math.random() * 6.28 });
  var cloud = { user: null, saved: 0 };

  /* ---------- sound ---------- */
  var AC = null, master = null, muted = false, tension = 0, hbTimer = 0;
  try { muted = localStorage.getItem('amialive.muted') === '1'; } catch (e) {}
  function audioStart() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
    var Ctor = window.AudioContext || window.webkitAudioContext; if (!Ctor) return;
    AC = new Ctor(); master = AC.createGain(); master.gain.value = muted ? 0 : .55; master.connect(AC.destination);
    [55, 55.6, 82.4].forEach(function (f, k) { var o = AC.createOscillator(), g = AC.createGain(), lp = AC.createBiquadFilter(); o.type = k === 2 ? 'triangle' : 'sine'; o.frequency.value = f; g.gain.value = k === 2 ? .025 : .07; lp.type = 'lowpass'; lp.frequency.value = 220; o.connect(lp); lp.connect(g); g.connect(master); o.start(); });
    var nb = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate), d = nb.getChannelData(0); for (var n = 0; n < d.length; n++) d[n] = Math.random() * 2 - 1;
    var ns = AC.createBufferSource(); ns.buffer = nb; ns.loop = true; var bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = .6; var wg = AC.createGain(); wg.gain.value = .05; ns.connect(bp); bp.connect(wg); wg.connect(master); ns.start();
    var lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = .11; lg.gain.value = .035; lfo.connect(lg); lg.connect(wg.gain); lfo.start();
    AC.noiseBuf = nb; heart();
  }
  function heart() {
    clearTimeout(hbTimer); if (!AC) return;
    if (mode === 'play' && !paused) { thump(0); thump(.17); }
    hbTimer = setTimeout(heart, 1300 - tension * 520);
  }
  function thump(dt) { var t = AC.currentTime + dt, o = AC.createOscillator(), g = AC.createGain(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(38, t + .16); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.22 + tension * .12, t + .015); g.gain.exponentialRampToValueAtTime(.001, t + .2); o.connect(g); g.connect(master); o.start(t); o.stop(t + .25); }
  function tone(f, t0, dur, vol, type) { var t = AC.currentTime + t0, o = AC.createOscillator(), g = AC.createGain(); o.type = type || 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0008, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05); }
  function noiseBurst(t0, dur, f0, f1, vol) { var t = AC.currentTime + t0, s = AC.createBufferSource(); s.buffer = AC.noiseBuf; var b = AC.createBiquadFilter(), g = AC.createGain(); b.type = 'bandpass'; b.Q.value = 5; b.frequency.setValueAtTime(f0, t); b.frequency.exponentialRampToValueAtTime(f1, t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); s.connect(b); b.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + .05); }
  var SFX = {
    pick: function () { tone(880, 0, .12, .12); tone(1320, .05, .18, .08); },
    unlock: function () { tone(520, 0, .08, .16, 'square'); tone(780, .09, .22, .14, 'square'); noiseBurst(0, .25, 1800, 900, .1); },
    screw: function () { for (var k = 0; k < 6; k++) noiseBurst(k * .09, .06, 2400, 1800, .12); },
    creak: function () { noiseBurst(0, 1.1, 160, 520, .22); },
    knock: function () { [0, .22, .4].forEach(function (d) { tone(95, d, .12, .3); }); },
    lullaby: function () {
      var n = [[329.6, 0], [329.6, .5], [392, 1], [329.6, 2], [329.6, 2.5], [392, 3], [329.6, 4], [392, 4.5], [523.3, 5], [493.9, 6], [440, 7], [440, 7.5], [392, 8]];
      n.forEach(function (x) { tone(x[0], x[1] * .62, 1.1, .1); tone(x[0] * 2, x[1] * .62, .6, .035); });
    },
    hum: function () { [220, 277, 329.6].forEach(function (f, k) { tone(f, k * .3, 5, .06); }); }
  };
  function sfx(n) { if (AC && !muted && SFX[n]) { try { SFX[n](); } catch (e) {} } }
  function setMuted(m) { muted = m; try { localStorage.setItem('amialive.muted', m ? '1' : '0'); } catch (e) {} if (master) master.gain.value = m ? 0 : .55; $('sndBtn').textContent = m ? 'Sound off' : 'Sound on'; $('sndBtn').setAttribute('aria-pressed', m ? 'false' : 'true'); }

  /* ---------- text ---------- */
  var msgT = 0, toastT = 0;
  function say(t, ms) { var m = $('msg'); m.textContent = t; m.classList.add('on'); clearTimeout(msgT); msgT = setTimeout(function () { m.classList.remove('on'); }, ms || (2600 + t.length * 45)); }
  function toast(t) { var e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove('on'); }, 1800); }

  /* ---------- saving ---------- */
  function readLocal() { try { var j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && G.valid(j.state)) return { state: G.sanitize(j.state), savedAt: j.savedAt || 0 }; } catch (e) {} return null; }
  function writeLocal() { try { localStorage.setItem(KEY, JSON.stringify({ state: st, savedAt: Date.now() })); return true; } catch (e) { return false; } }
  var cloudTimer = 0;
  function save(manual) {
    if (mode !== 'play') return;
    var ok = writeLocal();
    clearTimeout(cloudTimer);
    if (cloud.user) {
      cloudTimer = setTimeout(function () {
        fetch('/api/amialive/save', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: st }) })
          .then(function (r) { if (manual) toast(r.ok ? 'Saved on this device and online.' : 'Saved on this device. Online save failed.'); }).catch(function () { if (manual) toast('Saved on this device. Online save failed.'); });
      }, manual ? 0 : 1500);
    } else if (manual) toast(ok ? 'Saved on this device.' : 'Could not save here.');
  }
  function fetchCloud() {
    return fetch('/api/amialive/save', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { return j && j.state && G.valid(j.state) ? { state: G.sanitize(j.state), savedAt: j.savedAt || 0 } : null; }).catch(function () { return null; });
  }

  /* ---------- inventory + HUD ---------- */
  function refresh() {
    var p = G.progress(st); $('pbar').firstElementChild.style.width = p + '%'; $('pnum').textContent = 'Escape ' + p + '%';
    tension = Math.min(1, p / 100 * .8 + (st.sel ? .05 : 0));
    var box = $('inv'); box.innerHTML = '';
    for (var k = 0; k < 8; k++) {
      var id = st.inv[k], b = document.createElement('button'); b.type = 'button'; b.className = 'slot' + (id ? '' : ' empty') + (id && st.sel === id ? ' sel' : '');
      if (id) { var cc = document.createElement('canvas'); cc.width = cc.height = 112; A.icon(cc.getContext('2d'), id, 0, 0, 112); b.appendChild(cc); b.setAttribute('aria-label', G.ITEMS[id].name + (st.sel === id ? ', selected' : '')); b.title = G.ITEMS[id].name; b.onclick = (function (it) { return function () { pickItem(it); }; })(id); }
      else { b.disabled = true; b.setAttribute('aria-label', 'Empty slot'); }
      box.appendChild(b);
    }
    $('vname').textContent = G.VIEWS[st.view];
    var h = $('hint'); h.textContent = st.sel ? 'Click something to use ' + G.ITEMS[st.sel].name + ', or another item to combine' : '';
    h.style.opacity = st.sel ? 1 : 0;
  }
  function pickItem(id) {
    if (mode !== 'play') return; audioStart();
    if (st.sel && st.sel !== id) { var r = G.combine(st, st.sel, id); say(r.msg); if (r.ok) { sfx(r.sound); st.sel = null; save(); } refresh(); return; }
    if (st.sel === id) { st.sel = null; refresh(); return; }
    st.sel = id; say(G.ITEMS[id].desc); refresh();
  }
  function touch() { sceneKey = ''; refresh(); save(); }

  /* ---------- interaction ---------- */
  function spotAt(x, y) { var L = A.SPOTS[st.view]; for (var k = 0; k < L.length; k++) { var r = L[k].r; if (x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]) return L[k]; } return null; }
  function toLogical(e) { var b = cv.getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width * W, y: (e.clientY - b.top) / b.height * H }; }
  cv.addEventListener('pointermove', function (e) { var p = toLogical(e); ptr.x = p.x; ptr.y = p.y; ptr.in = true; if (mode === 'play') { var s = spotAt(p.x, p.y); cv.classList.toggle('hot', !!s); var t = $('tip'); t.textContent = s ? s.n : ''; t.classList.toggle('on', !!s); } });
  cv.addEventListener('pointerleave', function () { $('tip').classList.remove('on'); cv.classList.remove('hot'); });
  cv.addEventListener('pointerdown', function (e) {
    if (mode !== 'play' || paused) return; audioStart();
    var p = toLogical(e); ptr.x = p.x; ptr.y = p.y; var s = spotAt(p.x, p.y); orb.pulse = 1;
    if (!s) { if (st.sel) { say('Nothing here to use it on.', 1800); } return; }
    var r = G.use(st, s.id, st.sel);
    if (r.sound) sfx(r.sound);
    if (r.msg) say(r.msg);
    if (st.sel && st.inv.indexOf(st.sel) < 0) st.sel = null;
    if (r.modal === 'code') openCode();
    touch();
    if (r.done) setTimeout(finish, 2400);
  });
  function go(d) { if (mode !== 'play' || fadeTo >= 0) return; audioStart(); fadeTo = (st.view + d + 4) % 4; fade = 0; }
  $('prev').onclick = function () { go(-1); }; $('next').onclick = function () { go(1); };
  addEventListener('keydown', function (e) {
    if (mode !== 'play') return;
    if (e.key === 'Escape') { if (!$('code').hidden) closeCode(); else togglePause(); return; }
    if (paused || !$('code').hidden) return;
    if (e.key === 'ArrowLeft' || e.key === 'a') go(-1); else if (e.key === 'ArrowRight' || e.key === 'd') go(1); else if (e.key === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(true); }
    else if (/^[1-8]$/.test(e.key) && st.inv[+e.key - 1]) pickItem(st.inv[+e.key - 1]);
  });

  /* code lock */
  var digits = [0, 0, 0, 0];
  (function () { var w = $('wheels'); for (var k = 0; k < 4; k++) (function (k) { var d = document.createElement('div'); d.className = 'wheel'; var u = document.createElement('button'), o = document.createElement('output'), dn = document.createElement('button'); u.type = dn.type = 'button'; u.textContent = '+'; dn.textContent = '-'; u.setAttribute('aria-label', 'Wheel ' + (k + 1) + ' up'); dn.setAttribute('aria-label', 'Wheel ' + (k + 1) + ' down'); o.textContent = '0'; u.onclick = function () { digits[k] = (digits[k] + 1) % 10; o.textContent = digits[k]; }; dn.onclick = function () { digits[k] = (digits[k] + 9) % 10; o.textContent = digits[k]; }; d.appendChild(u); d.appendChild(o); d.appendChild(dn); w.appendChild(d); })(k); })();
  function openCode() { $('code').hidden = false; }
  function closeCode() { $('code').hidden = true; }
  $('noCode').onclick = closeCode;
  $('tryCode').onclick = function () { var r = G.enterCode(st, digits.join('')); if (r.ok) { closeCode(); sfx(r.sound); touch(); } else { sfx('creak'); } say(r.msg); };

  /* ---------- game flow ---------- */
  function showHud(on) { ['hudL', 'hudR', 'prev', 'next', 'inv'].forEach(function (id) { $(id).hidden = !on; }); $('vname').style.display = on ? '' : 'none'; }
  function begin(state, intro) {
    st = state; mode = intro ? 'intro' : 'play'; sceneKey = ''; $('title').hidden = true; $('end').hidden = true; $('pause').hidden = true; paused = false; audioStart(); showHud(true); refresh();
    tWake = 0; orb.a = 0;
    if (intro) {
      cv.classList.add('blur'); lidOpen = 0; var t0 = 0;
      [[600, '...'], [3200, 'My head hurts.'], [6400, 'Where... am I?'], [9600, 'This is not my room. Is it?']].forEach(function (x) { setTimeout(function () { if (mode === 'intro' || mode === 'play') say(x[1], 2800); }, x[0]); });
      setTimeout(function () { cv.classList.remove('blur'); }, 300);
      setTimeout(function () { if (mode === 'intro') { mode = 'play'; sfx('creak'); save(); } }, 5200);
    } else { cv.classList.remove('blur'); lidOpen = 1; orb.a = 1; tWake = 30; }
  }
  function finish() {
    if (mode !== 'play') return; mode = 'end'; $('msg').classList.remove('on'); $('flash').classList.add('on'); sfx('hum');
    setTimeout(function () { showHud(false); $('end').hidden = false; $('flash').classList.remove('on'); writeLocal(); }, 1800);
  }
  function toTitle() { mode = 'title'; paused = false; showHud(false); $('pause').hidden = true; $('end').hidden = true; $('code').hidden = true; $('title').hidden = false; $('msg').classList.remove('on'); titleInfo(); }
  function togglePause() { paused = !paused; $('pause').hidden = !paused; if (paused) save(); }
  $('menuBtn').onclick = togglePause; $('resume').onclick = togglePause; $('toTitle').onclick = function () { save(); toTitle(); };
  $('wipe').onclick = function () { var b = $('wipe'); if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Click again to erase'; setTimeout(function () { delete b.dataset.sure; b.textContent = 'Erase my saved game'; }, 3000); return; } delete b.dataset.sure; b.textContent = 'Erase my saved game'; try { localStorage.removeItem(KEY); } catch (e) {} if (cloud.user) fetch('/api/amialive/save', { method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(function () {}); toast('Saved game erased.'); toTitle(); };
  $('saveBtn').onclick = function () { save(true); };
  $('sndBtn').onclick = function () { audioStart(); setMuted(!muted); };
  $('newg').onclick = function () { audioStart(); begin(G.newState(), true); };
  $('replay').onclick = function () { begin(G.newState(), true); };
  $('endTitle').onclick = toTitle;
  $('cont').onclick = function () { audioStart(); var b = best; if (b) begin(b.state, false); };

  var best = null;
  function titleInfo() {
    var loc = readLocal(); best = loc;
    fetchCloud().then(function (c) { if (c && (!best || c.savedAt > best.savedAt)) best = c; paint(); }); paint();
    function paint() { var b = $('cont'); b.hidden = !best; if (best) $('contSub').textContent = 'Escape ' + G.progress(best.state) + '% · ' + G.VIEWS[best.state.view]; }
    var a = $('acct'); a.innerHTML = '';
    fetch('/api/me', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && j.user) { cloud.user = j.user.username || j.user.name || 'you'; a.textContent = 'Signed in as ' + (j.user.name || cloud.user) + '. Your progress is also saved online, so you can pick it up on another device.'; fetchCloud().then(function (c) { if (c && (!best || c.savedAt > best.savedAt)) { best = c; paint(); } }); }
      else { a.innerHTML = 'Playing as a guest. Progress saves on this device. <a href="/">Log in to SayBearLand</a> to save online too.'; }
    }).catch(function () { a.textContent = 'Progress saves on this device.'; });
  }

  /* ---------- rendering ---------- */
  function drawScene(now) {
    var key = st.view + '|' + JSON.stringify(st.flags) + '|' + st.inv.join(',') + (st.view === 1 && st.flags.vent && !st.flags.key ? '|' + Math.floor(now / 120) : '');
    if (key === sceneKey) return; sceneKey = key; sc.clearRect(0, 0, W, H); sc.textAlign = 'left'; A.DRAW[st.view](sc, st);
  }
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(.05, (now - (frame.last || now)) / 1000); frame.last = now;
    // fade between views
    if (fadeTo >= 0) { fade += dt / .22; if (fade >= 1 && st.view !== fadeTo) { st.view = fadeTo; sceneKey = ''; refresh(); save(); } if (fade >= 2) { fadeTo = -1; fade = 0; } }
    if (mode === 'title') { ctx.fillStyle = '#050507'; ctx.fillRect(0, 0, W, H); return; }
    if (!paused) tWake += dt;
    drawScene(now);
    ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(scene, 0, 0);

    // random scares: lights flicker, a knock, a whisper
    flick = Math.max(0, flick - dt);
    if (mode === 'play' && !paused) {
      frame.nextScare = frame.nextScare || (tWake + 20 + Math.random() * 20);
      if (tWake > frame.nextScare) {
        frame.nextScare = tWake + 25 + Math.random() * 30; flick = .6; var q = Math.random();
        if (q < .4) sfx('knock'); else sfx('creak'); if (q > .7) say('...Ellie...', 2200);
      }
    }
    // orb
    var lit = tWake > 6 || mode === 'play'; orb.a += ((lit ? 1 : 0) - orb.a) * Math.min(1, dt * .8); orb.pulse = Math.max(0, orb.pulse - dt * 1.6);
    var tx = ptr.in ? ptr.x - 46 : W * .5, ty = ptr.in ? ptr.y - 38 : H * .5, bob = Math.sin(now / 700) * 10, k = Math.min(1, dt * 2.2);
    orb.x += (tx - orb.x) * k; orb.y += (ty + bob - orb.y) * k;
    var fl = flick > 0 ? (Math.sin(now / 24) > 0 ? .1 : .5) : 1;
    var R = (230 + orb.a * 190 + orb.pulse * 70) * (1 + Math.sin(now / 480) * .03) * fl;

    // darkness with a hole cut out by the orb's light (or by your pointer before the orb arrives)
    dk.globalCompositeOperation = 'source-over'; dk.clearRect(0, 0, W, H);
    dk.fillStyle = 'rgba(3,5,12,' + (flick > 0 ? .97 : .82) + ')'; dk.fillRect(0, 0, W, H);
    dk.globalCompositeOperation = 'destination-out';
    dk.fillStyle = A.rad(dk, orb.x, orb.y, 6, R, [[0, 'rgba(0,0,0,1)'], [.3, 'rgba(0,0,0,.8)'], [1, 'rgba(0,0,0,0)']]); dk.fillRect(0, 0, W, H);
    if (orb.a < .98) { dk.fillStyle = A.rad(dk, ptr.x, ptr.y, 4, 170, [[0, 'rgba(0,0,0,' + (.6 * (1 - orb.a)) + ')'], [1, 'rgba(0,0,0,0)']]); dk.fillRect(0, 0, W, H); }
    if (st.view === 3) { dk.fillStyle = A.rad(dk, 800, 340, 30, 460, [[0, 'rgba(0,0,0,.5)'], [1, 'rgba(0,0,0,0)']]); dk.fillRect(0, 0, W, H); }
    if (st.view === 1 && !st.flags.door) { dk.fillStyle = A.rad(dk, 800, 830, 10, 280, [[0, 'rgba(0,0,0,.45)'], [1, 'rgba(0,0,0,0)']]); dk.fillRect(0, 0, W, H); }
    if (st.view === 1 && st.flags.door) { dk.fillStyle = 'rgba(0,0,0,.9)'; dk.fillRect(0, 0, W, H); }
    dk.globalCompositeOperation = 'source-over'; ctx.drawImage(dark, 0, 0);

    // cold blue grade, warm orb spill, dust, orb itself
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgb(168,184,222)'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = A.rad(ctx, orb.x, orb.y, 4, R * .8, [[0, 'rgba(255,238,215,' + (.2 * orb.a) + ')'], [1, 'rgba(255,238,215,0)']]); ctx.fillRect(0, 0, W, H);
    parts.forEach(function (p) { p.s += dt * .4; p.y -= dt * 6 * p.z; p.x += Math.sin(p.s) * dt * 8; if (p.y < -5) { p.y = H + 5; p.x = Math.random() * W; } var d = Math.hypot(p.x - orb.x, p.y - orb.y); var a = Math.max(0, 1 - d / (R * .9)) * .55 * p.z * Math.max(.2, orb.a); if (a > .02) { ctx.fillStyle = 'rgba(255,245,230,' + a + ')'; ctx.fillRect(p.x, p.y, 2 * p.z, 2 * p.z); } });
    if (orb.a > .01) {
      var o = orb.a * (flick > 0 ? .5 : 1);
      ctx.fillStyle = A.rad(ctx, orb.x, orb.y, 0, 90 + orb.pulse * 40, [[0, 'rgba(255,255,255,' + o + ')'], [.18, 'rgba(255,250,240,' + .75 * o + ')'], [.5, 'rgba(255,236,210,' + .2 * o + ')'], [1, 'rgba(255,236,210,0)']]); ctx.fillRect(orb.x - 140, orb.y - 140, 280, 280);
    }
    ctx.globalCompositeOperation = 'source-over';
    // vignette + grain
    var vg = A.rad(ctx, W / 2, H / 2, H * .35, H * .95, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,' + (.66 + Math.sin(now / 600) * .04 * tension) + ')']]); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = .07; ctx.globalCompositeOperation = 'overlay'; ctx.translate(-Math.random() * 256, -Math.random() * 256); ctx.fillStyle = ctx.createPattern(A.noise(), 'repeat'); ctx.fillRect(0, 0, W + 256, H + 256); ctx.restore();
    // view change dip and waking eyelids
    if (fadeTo >= 0) { ctx.fillStyle = 'rgba(0,0,0,' + (fade < 1 ? fade : 2 - fade) + ')'; ctx.fillRect(0, 0, W, H); }
    if (mode === 'intro') {
      var e = Math.max(0, (tWake - .6) / 4.2), ph = e < .3 ? e / .3 * .45 : e < .5 ? .45 - (e - .3) / .2 * .4 : e < .7 ? .05 + (e - .5) / .2 * .6 : Math.min(1, .65 + (e - .7) / .3 * .35); lidOpen = Math.max(0, Math.min(1, ph));
      var lh = (1 - lidOpen) * H / 2; if (lh > 1) { ctx.fillStyle = A.lin(ctx, 0, 0, 0, lh + 60, [[0, '#000'], [.85, '#000'], [1, 'rgba(0,0,0,0)']]); ctx.fillRect(0, 0, W, lh + 60); ctx.fillStyle = A.lin(ctx, 0, H, 0, H - lh - 60, [[0, '#000'], [.85, '#000'], [1, 'rgba(0,0,0,0)']]); ctx.fillRect(0, H - lh - 60, W, lh + 60); }
    }
  }

  function init() {
    setMuted(muted); titleInfo(); requestAnimationFrame(frame);
    setInterval(function () { if (mode === 'play' && !paused) save(); }, 20000);
    document.addEventListener('visibilitychange', function () { if (document.hidden) save(); });
    window.__aia = { st: function () { return st; }, begin: begin, mode: function () { return mode; }, go: go, finish: finish, spots: A.SPOTS };
  }
  init();
})();
