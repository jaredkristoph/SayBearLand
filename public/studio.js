/* Animation studio (admin only). Opened from the admin page as /office.html?studio=1.
   Pose sliders drive your own avatar live. Add keyframes, or press Record and move the sliders to capture the motion. */
(function () {
  var AN = window.CLAnims, SBL = window.SBL;
  if (!AN || !SBL) return;
  var css = document.createElement('style');
  css.textContent = '#studio{position:fixed;top:0;right:0;bottom:0;width:min(360px,100vw);z-index:20;background:#17133a;color:#f3f0ff;border-left:3px solid #3a3380;overflow:auto;padding:10px 12px 40px;font:600 13px/1.35 var(--font,system-ui)}' +
    '#studio h2{margin:0 0 8px;font-size:16px;letter-spacing:.04em}#studio h3{margin:12px 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.75}' +
    '#studio .row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:6px 0}#studio label{display:flex;flex-direction:column;gap:2px;font-size:11px;opacity:.9}' +
    '#studio input[type=text],#studio input[type=number],#studio select{background:#0f0c28;color:#f3f0ff;border:2px solid #3a3380;border-radius:8px;padding:4px 6px;font:inherit}' +
    '#studio button{font:700 13px var(--font,system-ui);color:#f3f0ff;background:#211d47;border:2px solid #3a3380;border-radius:10px;padding:5px 10px;cursor:pointer}' +
    '#studio button.go{background:#3ee6c4;color:#0f0d24;border-color:#1b9c85}#studio button.rec{background:#ff5d5d;border-color:#b53030}#studio button.on{outline:2px solid #ffd166}#studio button.warn{background:#5a2036;border-color:#a8405f}' +
    '#studio .ch{display:grid;grid-template-columns:1fr 92px 44px;gap:6px;align-items:center;margin:2px 0}#studio .ch span{font-weight:500;font-size:12px}#studio .ch output{text-align:right;font-variant-numeric:tabular-nums;opacity:.8}' +
    '#studio input[type=range]{width:100%;accent-color:#6c5ce7}#studio .tl{position:relative;height:26px;background:#0f0c28;border:2px solid #3a3380;border-radius:8px;margin:4px 0}' +
    '#studio .kf{position:absolute;top:2px;width:12px;height:18px;margin-left:-6px;border-radius:4px;background:#ffd166;border:2px solid #17133a;padding:0}#studio .kf.sel{background:#ff7eb6;outline:2px solid #fff}' +
    '#studio .ph{position:absolute;top:0;bottom:0;width:2px;background:#3ee6c4;pointer-events:none}#studio .st{min-height:18px;color:#3ee6c4}#studio .st.bad{color:#ff8a8a}';
  document.head.appendChild(css);

  var el = function (tag, props, kids) { var e = document.createElement(tag); Object.assign(e, props || {}); (kids || []).forEach(function (k) { e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); }); return e; };
  var root = el('div', { id: 'studio', role: 'region', ariaLabel: 'Animation studio' });
  ['keydown', 'keyup'].forEach(function (ev) { root.addEventListener(ev, function (e) { e.stopPropagation(); }); });
  document.body.appendChild(root);
  var hud = document.querySelectorAll('.hud'); hud.forEach(function (h) { if (h.id === 'cam' || h.id === 'wallet') h.style.right = 'min(372px,100vw)'; });

  var anims = [], cur = null, pose = AN.zero(), t = 0, mode = 'edit', sel = -1, recStart = 0, recLast = null, recT = 0, lastTs = 0;
  var sliders = {}, status = el('div', { className: 'st', role: 'status' });
  function say(m, bad) { status.textContent = m; status.className = 'st' + (bad ? ' bad' : ''); }
  function blank() { return { id: '', name: 'New move', key: '', loop: false, speed: 1, dur: 2, frames: [{ t: 0, p: AN.zero() }] }; }
  function api(method, path, body) { return fetch('/api/' + path, { method: method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Request failed'); return j; }); }); }

  /* ---- layout ---- */
  root.appendChild(el('h2', { textContent: 'Animation studio' }));
  root.appendChild(el('div', { className: 'row' }, [el('a', { href: '/admin', textContent: '← Back to admin', style: 'color:#9d95e6' })]));
  var pick = el('select', { ariaLabel: 'Choose a move' });
  var nameIn = el('input', { type: 'text', maxLength: 24, ariaLabel: 'Move name' });
  var keySel = el('select', { ariaLabel: 'Number key' });
  keySel.appendChild(el('option', { value: '', textContent: 'No key' })); AN.KEYS.forEach(function (k) { keySel.appendChild(el('option', { value: k, textContent: 'Key ' + k })); });
  var loopIn = el('input', { type: 'checkbox' });
  var speedIn = el('input', { type: 'number', min: 0.25, max: 3, step: 0.25, style: 'width:70px' });
  var durIn = el('input', { type: 'number', min: 0.2, max: 30, step: 0.1, style: 'width:70px' });
  root.appendChild(el('h3', { textContent: 'Move' }));
  root.appendChild(el('div', { className: 'row' }, [pick]));
  root.appendChild(el('div', { className: 'row' }, [el('label', {}, ['Name', nameIn]), el('label', {}, ['Shortcut', keySel])]));
  root.appendChild(el('div', { className: 'row' }, [el('label', {}, ['Length (s)', durIn]), el('label', {}, ['Speed', speedIn]), el('label', { style: 'flex-direction:row;align-items:center;gap:6px' }, [loopIn, 'Repeat'])]));

  root.appendChild(el('h3', { textContent: 'Timeline' }));
  var tl = el('div', { className: 'tl' }), ph = el('div', { className: 'ph' }); tl.appendChild(ph);
  var scrub = el('input', { type: 'range', min: 0, max: 2, step: 0.01, value: 0, ariaLabel: 'Playhead' });
  var tlab = el('div', { style: 'opacity:.8;font-size:12px' });
  root.appendChild(tl); root.appendChild(scrub); root.appendChild(tlab);
  var bPlay = el('button', { type: 'button', textContent: 'Play' }), bRec = el('button', { type: 'button', className: 'rec', textContent: 'Record' });
  var bAdd = el('button', { type: 'button', textContent: 'Add keyframe' }), bDel = el('button', { type: 'button', textContent: 'Delete keyframe' });
  root.appendChild(el('div', { className: 'row' }, [bPlay, bRec, bAdd, bDel]));
  root.appendChild(el('div', { style: 'opacity:.7;font-size:11px' }, ['Record: press it, then move the sliders. Every change is captured on the timeline. Press Stop when you are done.']));

  root.appendChild(el('h3', { textContent: 'Pose' }));
  var chBox = el('div'); root.appendChild(chBox);
  var grp = '';
  AN.CHANNELS.forEach(function (c) {
    if (c.group !== grp) { grp = c.group; chBox.appendChild(el('h3', { textContent: grp })); }
    var inp = el('input', { type: 'range', min: c.min, max: c.max, step: c.step, value: 0, ariaLabel: c.group + ' ' + c.label });
    var out = el('output', { textContent: '0' });
    inp.oninput = function () { onSlide(c.k, +inp.value); };
    inp.ondblclick = function () { inp.value = 0; onSlide(c.k, 0); };
    sliders[c.k] = { inp: inp, out: out };
    chBox.appendChild(el('div', { className: 'ch' }, [el('span', { textContent: c.label }), inp, out]));
  });
  var bReset = el('button', { type: 'button', textContent: 'Reset pose' });
  var bSave = el('button', { type: 'button', className: 'go', textContent: 'Save move' }), bRemove = el('button', { type: 'button', className: 'warn', textContent: 'Delete move' });
  root.appendChild(el('div', { className: 'row' }, [bReset]));
  root.appendChild(el('div', { className: 'row' }, [bSave, bRemove]));
  root.appendChild(status);
  root.appendChild(el('div', { style: 'opacity:.7;font-size:11px;margin-top:8px' }, ['Double-click a slider to zero it. Saved moves appear in every player\'s Moves menu and on the number key you pick.']));

  /* ---- behaviour ---- */
  function showPose() { AN.CHANNELS.forEach(function (c) { var s = sliders[c.k]; s.inp.value = pose[c.k]; s.out.textContent = (+pose[c.k]).toFixed(2); }); }
  function fmt(x) { return x.toFixed(2) + 's'; }
  function drawTl() {
    Array.prototype.slice.call(tl.querySelectorAll('.kf')).forEach(function (n) { n.remove(); });
    cur.frames.forEach(function (f, i) {
      var b = el('button', { type: 'button', className: 'kf' + (i === sel ? ' sel' : ''), ariaLabel: 'Keyframe at ' + fmt(f.t), title: fmt(f.t) });
      b.style.left = (f.t / cur.dur * 100) + '%';
      b.onclick = function () { stopAll(); sel = i; t = f.t; pose = Object.assign({}, f.p); scrub.value = t; showPose(); drawTl(); };
      tl.appendChild(b);
    });
    ph.style.left = (Math.min(1, t / cur.dur) * 100) + '%';
    tlab.textContent = fmt(t) + ' of ' + fmt(cur.dur) + ' · ' + cur.frames.length + ' keyframe' + (cur.frames.length === 1 ? '' : 's');
  }
  function syncFields() {
    nameIn.value = cur.name; keySel.value = cur.key || ''; loopIn.checked = !!cur.loop; speedIn.value = cur.speed; durIn.value = cur.dur;
    scrub.max = cur.dur; drawTl();
  }
  function readFields() {
    cur.name = nameIn.value; cur.key = keySel.value; cur.loop = loopIn.checked; cur.speed = +speedIn.value || 1;
    var d = +durIn.value || cur.dur; cur.dur = Math.max(0.2, Math.min(30, d)); cur.frames.forEach(function (f) { f.t = Math.min(f.t, cur.dur); });
    scrub.max = cur.dur; t = Math.min(t, cur.dur); drawTl();
  }
  [nameIn, keySel, loopIn, speedIn, durIn].forEach(function (i) { i.onchange = readFields; });
  function loadMove(m) { stopAll(); cur = JSON.parse(JSON.stringify(m)); sel = 0; t = cur.frames.length ? cur.frames[0].t : 0; pose = Object.assign(AN.zero(), cur.frames.length ? cur.frames[0].p : {}); scrub.value = t; syncFields(); showPose(); }
  function fillPick(selId) {
    pick.innerHTML = ''; pick.appendChild(el('option', { value: '', textContent: '＋ New move' }));
    anims.forEach(function (a) { pick.appendChild(el('option', { value: a.id, textContent: a.name + (a.key ? '  [' + a.key + ']' : '') })); });
    pick.value = selId || '';
  }
  pick.onchange = function () { var m = anims.filter(function (a) { return a.id === pick.value; })[0]; loadMove(m || blank()); say(''); };

  function onSlide(k, v) {
    pose[k] = v; sliders[k].out.textContent = v.toFixed(2);
    if (mode === 'rec') return;
    if (sel >= 0 && cur.frames[sel]) cur.frames[sel].p[k] = v;
  }
  function stopAll() { if (mode === 'rec') finishRec(); mode = 'edit'; bPlay.textContent = 'Play'; bRec.textContent = 'Record'; bRec.classList.remove('on'); }
  bPlay.onclick = function () {
    if (mode === 'play') { stopAll(); return; }
    stopAll(); if (!cur.frames.length) return; if (t >= cur.dur - 0.01) t = 0; mode = 'play'; bPlay.textContent = 'Stop'; sel = -1; drawTl();
  };
  bRec.onclick = function () {
    if (mode === 'rec') { stopAll(); return; }
    stopAll(); mode = 'rec'; bRec.textContent = 'Stop'; bRec.classList.add('on'); sel = -1;
    cur.frames = [{ t: 0, p: Object.assign({}, pose) }]; recStart = performance.now(); recLast = Object.assign({}, pose); recT = 0; t = 0; say('Recording. Move the sliders.');
  };
  function finishRec() {
    var el0 = Math.min(18, (performance.now() - recStart) / 1000);
    cur.frames.push({ t: Math.max(el0, cur.frames[cur.frames.length - 1].t + 0.05), p: Object.assign({}, pose) });
    cur.dur = Math.max(0.5, Math.round(cur.frames[cur.frames.length - 1].t * 10) / 10 + 0.1); cur.frames.forEach(function (f) { f.t = Math.min(f.t, cur.dur); });
    t = 0; syncFields(); say('Captured ' + cur.frames.length + ' keyframes (' + fmt(cur.dur) + '). Press Play to check it, then Save.');
  }
  bAdd.onclick = function () {
    stopAll(); readFields(); var i = cur.frames.findIndex(function (f) { return Math.abs(f.t - t) < 0.03; });
    if (i >= 0) { cur.frames[i].p = Object.assign({}, pose); sel = i; }
    else { if (cur.frames.length >= 90) { say('Keyframe limit reached (90).', true); return; } cur.frames.push({ t: Math.round(t * 100) / 100, p: Object.assign({}, pose) }); cur.frames.sort(function (a, b) { return a.t - b.t; }); sel = cur.frames.findIndex(function (f) { return Math.abs(f.t - t) < 0.03; }); }
    drawTl(); say('Keyframe set at ' + fmt(t) + '.');
  };
  bDel.onclick = function () {
    stopAll(); if (sel < 0 || cur.frames.length <= 1) { say('Pick a keyframe (not the only one) to delete.', true); return; }
    cur.frames.splice(sel, 1); sel = -1; drawTl();
  };
  scrub.oninput = function () { stopAll(); t = +scrub.value; pose = Object.assign({}, AN.sample(cur, t)); sel = cur.frames.findIndex(function (f) { return Math.abs(f.t - t) < 0.03; }); showPose(); drawTl(); };
  bReset.onclick = function () { stopAll(); pose = AN.zero(); if (sel >= 0 && cur.frames[sel]) cur.frames[sel].p = AN.zero(); showPose(); };
  bSave.onclick = function () {
    stopAll(); readFields();
    api('PUT', 'admin/anims', { anim: cur }).then(function (j) { anims = j.anims; SBL.setAnims(anims); cur.id = j.anim.id; fillPick(cur.id); say('Saved "' + j.anim.name + '". Players can use it now.'); }).catch(function (e) { say(e.message, true); });
  };
  bRemove.onclick = function () {
    if (!cur.id) { loadMove(blank()); fillPick(''); return; }
    if (!bRemove.dataset.sure) { bRemove.dataset.sure = 1; bRemove.textContent = 'Click again to confirm'; setTimeout(function () { delete bRemove.dataset.sure; bRemove.textContent = 'Delete move'; }, 3000); return; }
    delete bRemove.dataset.sure; bRemove.textContent = 'Delete move';
    api('POST', 'admin/anims/delete', { id: cur.id }).then(function (j) { anims = j.anims; SBL.setAnims(anims); loadMove(blank()); fillPick(''); say('Move deleted.'); }).catch(function (e) { say(e.message, true); });
  };

  /* ---- frame loop: plays the pose on your avatar ---- */
  function tick(ts) {
    var dt = Math.min(0.1, (ts - lastTs) / 1000 || 0); lastTs = ts;
    if (mode === 'play') {
      t += dt * cur.speed;
      if (t > cur.dur) { if (cur.loop) t -= cur.dur; else { t = cur.dur; stopAll(); } }
      pose = Object.assign({}, AN.sample(cur, t)); showPose(); scrub.value = t; ph.style.left = (Math.min(1, t / cur.dur) * 100) + '%'; tlab.textContent = fmt(t) + ' of ' + fmt(cur.dur) + ' · ' + cur.frames.length + ' keyframes';
    } else if (mode === 'rec') {
      var now = (performance.now() - recStart) / 1000;
      if (now >= 18) { stopAll(); }
      else if (now - recT >= 0.12) {
        var chg = AN.CHANNELS.some(function (c) { return Math.abs(pose[c.k] - recLast[c.k]) > 0.005; });
        if (chg) { cur.frames.push({ t: Math.round(now * 100) / 100, p: Object.assign({}, pose) }); recLast = Object.assign({}, pose); recT = now; cur.dur = Math.max(cur.dur, now + 0.1); }
        t = now; ph.style.left = Math.min(100, now / 18 * 100) + '%'; tlab.textContent = 'Recording ' + fmt(now) + ' · ' + cur.frames.length + ' keyframes';
      }
    }
    SBL.setPose(AN.cleanPose(pose));
    requestAnimationFrame(tick);
  }

  api('GET', 'anims').then(function (j) {
    anims = j.anims || []; fillPick(''); loadMove(blank()); SBL.setStudio(true); SBL.setAnims(anims);
    say('Move the sliders, add keyframes, then Save.'); requestAnimationFrame(tick);
  }).catch(function (e) { say(e.message, true); });
})();
