/* Lanternroad game shell: accounts, loop, HUD, camp menus, events, saving. */
(function () {
  'use strict';
  var LR = window.LR, ART = window.ART, LRS = window.LRS;
  var $ = function (id) { return document.getElementById(id); };
  var S = null, user = null, mode = 'road', speed = 1, acc = 0, last = 0, saveAcc = 0, uiAcc = 0, tab = 'anvil', selHero = null, selSlot = null, tipsSeen = 0;
  var API = '/lanternroad/api';
  var NUM = ['I', 'II', 'III', 'IV'];

  function fmt(n) { n = Math.floor(n); if (n < 1e4) return String(n); var u = ['K', 'M', 'B', 'T', 'Qa']; var i = -1; while (n >= 1000 && i < 4) { n /= 1000; i++; } return (n < 100 ? n.toFixed(n < 10 ? 2 : 1) : Math.floor(n)) + u[i]; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function api(method, path, body, keep) {
    return fetch(API + path, { method: method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin', keepalive: !!keep })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); });
  }

  /* ---------------- auth ---------------- */
  var signup = false;
  function showAuth(msg) { $('boot').style.display = 'none'; $('auth').style.display = 'flex'; $('authErr').textContent = msg || ''; }
  function setAuthMode(s) { signup = s; $('nmRow').style.display = s ? 'block' : 'none'; $('abtn').textContent = s ? 'Make account' : 'Sign in'; $('aswap').textContent = s ? 'Have an account? Sign in' : 'New here? Make an account'; $('ap').autocomplete = s ? 'new-password' : 'current-password'; $('authErr').textContent = ''; }
  $('aswap').onclick = function () { setAuthMode(!signup); };
  $('af').onsubmit = function (e) {
    e.preventDefault(); var b = $('abtn'); b.disabled = true;
    var body = { username: $('au').value, password: $('ap').value }; if (signup) body.name = $('an').value;
    api('POST', signup ? '/signup' : '/login', body).then(function (r) {
      b.disabled = false;
      if (!r.ok) return ($('authErr').textContent = r.j.error || 'Something went wrong.');
      $('auth').style.display = 'none'; $('boot').style.display = 'flex'; start(r.j);
    }).catch(function () { b.disabled = false; $('authErr').textContent = 'Cannot reach the road. Check your connection.'; });
  };

  /* ---------------- boot ---------------- */
  function boot() {
    if (!LRS.init($('gl'), $('fx'))) { $('bootMsg').textContent = 'This device cannot draw the road (WebGL is unavailable).'; return; }
    new ResizeObserver(onResize).observe($('stage')); onResize();
    api('GET', '/me').then(function (r) { if (r.ok) start(r.j); else showAuth(); }).catch(function () { showAuth('Cannot reach the server.'); });
  }
  function onResize() {
    var st = $('stage'), w = st.clientWidth, h = st.clientHeight; if (w < 10 || h < 10) return; LRS.resize(w, h);
    var land = window.innerWidth / window.innerHeight > 1.1; LRS.setCampShift(land && mode === 'camp' ? Math.min(430, window.innerWidth * .46) / 2 : 0);
  }
  function start(data) {
    user = data.user; S = data.save ? LR.migrate(data.save) : LR.newState();
    if (!data.save) LR.log(S, 'The caravan set out with the last lantern.');
    $('boot').style.display = 'none';
    var away = data.awayMs || 0;
    if (data.save && away > 60000) { var res = LR.offline(S, away); showAway(res, away); }
    if (window.__lrTest) window.__lrTest(S);
    buildDock(); lastSig = ''; last = performance.now(); requestAnimationFrame(frame); setTimeout(save, 4000);
  }

  /* ---------------- saving ---------------- */
  function save(keep) { if (!S) return; api('PUT', '/save', { state: S }, keep).then(function (r) { if (r.status === 401) { S = null; location.reload(); } }).catch(function () {}); }
  document.addEventListener('visibilitychange', function () { if (document.hidden) save(true); });
  window.addEventListener('pagehide', function () { save(true); });

  /* ---------------- loop ---------------- */
  function walking() { return mode === 'road' && !S.fight && S.haltT <= 0 && !S.haltDawn && S.regroup <= 0 && S.league < S.gate - 1e-6; }
  function frame(ts) {
    requestAnimationFrame(frame); if (!S) return;
    var real = (ts - last) / 1000; last = ts; var dt = Math.min(.1, Math.max(0, real));
    if (real > 4 && mode === 'road') { var away = LR.offline(S, real * 1000); if (away.seconds > 20) showAway(away, real * 1000); acc = 0; }
    else if (mode === 'road') {
      acc += dt * speed; var n = 0;
      while (acc >= .1 && n++ < 12) { var out = []; LR.tick(S, .1, out); out.forEach(onEv); acc -= .1; }
    }
    LRS.render(S, dt, walking());
    uiAcc += dt; if (uiAcc > .12) { uiAcc = 0; updateUi(); }
    saveAcc += dt; if (saveAcc > 12) { saveAcc = 0; save(); }
  }

  /* ---------------- events from the simulation ---------------- */
  var toastN = 0;
  function toast(txt, big) { var d = document.createElement('div'); d.textContent = txt; if (big) d.className = 'big'; $('toast').appendChild(d); setTimeout(function () { d.remove(); }, big ? 3800 : 3200); while ($('toast').children.length > 4) $('toast').firstChild.remove(); }
  function onEv(e) {
    LRS.event(e, S);
    switch (e.e) {
      case 'start': if (e.boss) toast('Guardian: ' + S.fight.foes[0].name, true); break;
      case 'win':
        LRS.floatText('+' + fmt(e.gold) + ' gold' + (e.embers ? '  +' + e.embers + ' embers' : ''), '#ffd24a', 18);
        if (e.lvUp && e.lvUp.length) toast('Level up: ' + e.lvUp.join(', ')); break;
      case 'wipe': toast('The party fell. Back to the waystone at league ' + e.league, true); break;
      case 'guardian': toast(e.name + ' has fallen. Ahead: ' + e.next, true); break;
      case 'stone': toast('Waystone: league ' + e.league + (e.rest ? '. Camped for the night.' : '')); if (tipsSeen++ < 2) toast('Tap Camp to spend gold on gear, food and skills.'); break;
      case 'dusk': toast('Night falls. Tougher foes, richer loot.', true); break;
      case 'dawn': toast('Dawn. The road is quiet again.', true); break;
      case 'gutter': toast('The embers ran out. The lantern burns low.'); buildDock(); break;
      case 'evdone': if (e.msg) toast(e.msg); break;
    }
  }

  /* ---------------- HUD ---------------- */
  var lastSig = '', evSig = '';
  function buildDock() {
    var h = '';
    ['red', 'blue', 'green', 'white'].forEach(function (f) { var lock = f !== 'red' && !S.meta.legends[f]; h += '<div class="fd' + (S.flame === f ? ' sel' : '') + (lock ? ' lock' : '') + '" data-f="' + f + '" title="' + esc(LR.FLAMES[f].name + ': ' + LR.FLAMES[f].note) + '"></div>'; });
    $('flames').innerHTML = h;
  }
  $('flames').onclick = function (e) {
    var f = e.target.getAttribute && e.target.getAttribute('data-f'); if (!f) return;
    if (!LR.act.setFlame(S, f)) return toast(LR.FLAMES[f].name + ' is locked. Unlock it with Tales in Camp > Tale.');
    toast(LR.FLAMES[f].name + ': ' + LR.FLAMES[f].note); buildDock();
  };
  $('bDim').onclick = function () { LR.act.setBright(S, S.bright - 1); };
  $('bUp').onclick = function () { LR.act.setBright(S, S.bright + 1); };
  $('bFlare').onclick = doFlare;
  function doFlare() { if (!S || mode !== 'road') return; if (LR.act.flare(S)) { LRS.flare(); toast('The lantern flares!'); } else toast(S.flare.cd > 0 ? 'The lantern is still cooling.' : 'Not enough embers.'); }
  $('bPol').onclick = function () { LR.act.setPolicy(S, S.policy === 'camp' ? 'push' : 'camp'); toast(S.policy === 'camp' ? 'The caravan will camp at the next waystone when night falls.' : 'The caravan will push through the night.'); };
  $('bCamp').onclick = openCamp;
  $('bSpeed').onclick = function () { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; $('bSpeed').textContent = 'x' + speed; };
  $('bHide').onclick = function () { document.body.classList.add('nohud'); toast('Tap anywhere to bring the interface back.'); setTimeout(function () { $('stage').addEventListener('click', function f() { document.body.classList.remove('nohud'); $('stage').removeEventListener('click', f); }); }, 300); };
  window.addEventListener('keydown', function (e) { if (!S || e.target.tagName === 'INPUT') return; if (e.code === 'Space') { e.preventDefault(); doFlare(); } else if (e.key === 'c' || e.key === 'C') { mode === 'camp' ? closeCamp() : openCamp(); } else if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('nohud'); });

  function heroCards() {
    var sig = S.party.join() + '|' + S.party.map(function (id) { return id ? S.heroes[id].lvl : 0; }).join();
    if (sig !== lastSig) {
      lastSig = sig; var h = '';
      for (var i = 0; i < 4; i++) {
        var id = S.party[i];
        if (!id) { h += '<div class="hc pnl empty">' + NUM[i] + ' empty</div>'; continue; }
        h += '<div class="hc pnl" data-s="' + i + '"><span class="rn">' + NUM[i] + '</span><div class="row"><canvas width="28" height="24" data-id="' + id + '"></canvas><div class="lv" style="flex:1;text-align:right">Lv ' + S.heroes[id].lvl + '</div></div><div class="nm">' + esc(LR.HERO[id].name) + '</div><div class="bar hp"><i></i></div><div class="bar sk"><i></i></div></div>';
      }
      $('party').innerHTML = h;
      [].forEach.call($('party').querySelectorAll('canvas'), function (c) { c.getContext('2d').drawImage(ART.portrait(c.getAttribute('data-id')), 0, 0); });
    }
    var cards = $('party').querySelectorAll('.hc[data-s]');
    [].forEach.call(cards, function (c) {
      var i = +c.getAttribute('data-s'), id = S.party[i], hp = S.heroes[id].hp, alive = true, sk = 1;
      if (S.fight) { var u = S.fight.heroes.filter(function (x) { return x.slot === i; })[0]; if (u) { hp = u.hp / u.max; alive = u.alive; sk = 1 - Math.max(0, Math.min(1, u.sc / LR.HERO[id].cd)); } }
      c.classList.toggle('dead', !alive);
      c.querySelector('.hp i').style.width = Math.max(0, Math.min(1, hp)) * 100 + '%'; c.querySelector('.sk i').style.width = sk * 100 + '%';
    });
  }
  function updateUi() {
    $('league').textContent = Math.floor(S.league);
    var B = LR.biome(S); $('biome').textContent = B.name + (S.twist !== 'none' ? ' · ' + LR.TWISTS[S.twist].name : '');
    var base = S.gate - 50; $('gbar').style.width = Math.max(0, Math.min(1, (S.league - base) / 50)) * 100 + '%'; $('gtxt').textContent = 'Guardian at league ' + S.gate;
    $('gold').textContent = fmt(S.gold); $('emb').textContent = fmt(S.embers);
    $('clk').style.left = (S.tod * 100) + '%'; var n = LR.isNight(S); $('tod').textContent = 'Day ' + S.day + ' · ' + (n ? 'Night' : S.tod > .45 ? 'Dusk' : 'Day') + (S.route ? ' · ' + (S.route.kind === 'short' ? 'Short road' : 'Long road') : '') + (S.buffs.length ? ' · ' + S.buffs.length + ' buff' + (S.buffs.length > 1 ? 's' : '') : '');
    $('bv').textContent = S.bright + '/' + LR.lampMax(S); $('bburn').textContent = '-' + (LR.burn(S) * 60).toFixed(1) + '/min';
    var cost = Math.round(5 + S.league * .2); $('fcost').textContent = S.flare.t > 0 ? 'burning ' + Math.ceil(S.flare.t) + 's' : S.flare.cd > 0 ? 'cooling ' + Math.ceil(S.flare.cd) + 's' : cost + ' embers';
    $('bFlare').disabled = S.flare.cd > 0 || S.embers < cost;
    $('bPol').firstChild.nodeValue = S.policy === 'camp' ? 'Camp' : 'Push on'; $('bPol').lastChild.textContent = S.policy === 'camp' ? 'at dusk' : 'at night';
    $('bCamp').disabled = !!S.fight || mode === 'camp';
    if (mode === 'road') { heroCards(); evCard(); } else { $('campRes').textContent = ''; }
    document.body.classList.toggle('camping', mode === 'camp');
  }
  function evCard() {
    var el = $('ev'), ev = S.ev;
    if (!ev) { el.style.display = 'none'; evSig = ''; return; }
    var sig = ev.type + ev.title + ev.opts.length; if (!ev.max) ev.max = ev.exp;
    if (sig !== evSig) {
      evSig = sig; var h = '<h3>' + esc(ev.title) + '</h3><p>' + esc(ev.text) + '</p><div class="opts">';
      ev.opts.forEach(function (o, i) { h += '<button class="btn' + (i === ev.def ? '' : ' go') + '" data-o="' + i + '">' + esc(o.t) + '</button>'; });
      el.innerHTML = h + '</div><div class="tm"><i></i></div>'; el.style.display = 'flex';
    }
    el.querySelector('.tm i').style.width = Math.max(0, ev.exp / ev.max) * 100 + '%';
  }
  $('ev').onclick = function (e) { var b = e.target.closest && e.target.closest('[data-o]'); if (!b || !S.ev) return; var out = []; LR.resolveEvent(S, +b.getAttribute('data-o'), out); out.forEach(onEv); $('ev').style.display = 'none'; evSig = ''; };

  /* ---------------- away modal ---------------- */
  function showModal(html) { $('mbox').innerHTML = html; $('modal').style.display = 'flex'; }
  function closeModal() { $('modal').style.display = 'none'; }
  $('modal').onclick = function (e) { if (e.target === $('modal') || (e.target.getAttribute && e.target.getAttribute('data-close'))) closeModal(); };
  function dur(ms) { var m = Math.floor(ms / 60000), h = Math.floor(m / 60); return h > 0 ? h + 'h ' + (m % 60) + 'm' : m + ' min'; }
  function showAway(res, ms) {
    var h = '<h2>While you were away</h2><div style="color:var(--dim);font-size:13px">' + dur(ms) + ' on the road' + (res.capped ? ' (the caravan walks for ' + (8 + 2 * S.meta.legends.offline) + ' hours at most)' : '') + '</div>';
    h += '<div class="stats"><div><b>' + res.leagues + '</b>leagues</div><div><b>' + fmt(res.gold) + '</b>gold</div><div><b>' + res.embers + '</b>embers</div><div><b>' + res.kills + '</b>foes</div></div>';
    h += '<div class="sub">TRAVEL JOURNAL</div>';
    (res.entries.length ? res.entries : ['The road was quiet.']).forEach(function (x) { h += '<div class="ent">' + esc(x) + '</div>'; });
    if (res.gate) h += '<div class="ent" style="border-color:var(--gold)">The caravan is waiting at a Guardian.</div>';
    if (res.wipes) h += '<div style="color:var(--dim);font-size:12px;margin-top:4px">The party fell ' + res.wipes + ' time(s).</div>';
    showModal(h + '<button class="btn pri" style="width:100%;margin-top:12px" data-close="1">Walk on</button>');
    lastSig = '';
  }

  /* ---------------- camp ---------------- */
  var TABS = [['anvil', 'Anvil'], ['pot', 'Cookpot'], ['lamp', 'Lantern'], ['story', 'Stories'], ['party', 'Party'], ['tale', 'Tale']];
  function openCamp() {
    if (!S || S.fight) return toast('Not while the dark is at the door.');
    mode = 'camp'; LRS.setMode('camp'); $('camp').style.display = 'flex'; document.body.classList.add('camping'); $('ev').style.display = 'none'; evSig = '';
    $('tabs').innerHTML = TABS.map(function (t) { return '<button data-t="' + t[0] + '">' + t[1] + '</button>'; }).join(''); onResize(); renderTab();
  }
  function closeCamp() { mode = 'road'; LRS.setMode('road'); $('camp').style.display = 'none'; document.body.classList.remove('camping'); lastSig = ''; onResize(); save(); }
  $('bBreak').onclick = closeCamp;
  $('tabs').onclick = function (e) { var t = e.target.getAttribute && e.target.getAttribute('data-t'); if (t) { tab = t; renderTab(); } };
  function pips(n, max) { var h = '<span class="pips">'; for (var i = 0; i < max; i++) h += '<i class="' + (i < n ? 'on' : '') + '"></i>'; return h + '</span>'; }
  function btn(act, val, label, can, cls) { return '<button class="btn' + (cls ? ' ' + cls : '') + '" data-a="' + act + '" data-v="' + esc(val == null ? '' : val) + '"' + (can ? '' : ' disabled') + '>' + label + '</button>'; }
  function gl(n) { return '<span class="ico coin" style="width:9px;height:9px;margin-right:4px"></span>' + fmt(n); }
  function renderTab() {
    var body = $('tabBody'), sc = body.scrollTop, h = '';
    [].forEach.call($('tabs').children, function (b) { b.classList.toggle('on', b.getAttribute('data-t') === tab); });
    $('campRes').innerHTML = gl(S.gold) + ' &nbsp;<span class="ico emb" style="width:9px;height:9px;margin-right:4px"></span>' + fmt(S.embers);
    if (tab === 'anvil') {
      var G = { blade: ['Blade', 'Party attack +9% per level'], plate: ['Plate', 'Party health +9% and defence +7% per level'], charm: ['Charm', 'Skill power +7% and crit +1% per level'] };
      h += '<div class="sub">THE ANVIL</div>';
      ['blade', 'plate', 'charm'].forEach(function (k) { var c = LR.gearCost(S, k); h += '<div class="row2"><div class="t"><b>' + G[k][0] + ' <span class="tag g">Lv ' + S.gear[k] + '</span></b><span>' + G[k][1] + '</span></div>' + btn('gear', k, gl(c), S.gold >= c) + '</div>'; });
      h += '<div style="font-size:12px;color:var(--dim)">Gold comes from fights. Nights pay 2.4x as much.</div>';
    } else if (tab === 'pot') {
      h += '<div class="sub">THE COOKPOT: timed buffs for the next stretch of road</div>';
      Object.keys(LR.DISH).forEach(function (id) {
        var d = LR.DISH[id], c = LR.dishCost(S, id), b = S.buffs.filter(function (x) { return x.dish === id; })[0];
        h += '<div class="row2"><div class="t"><b>' + d.name + (b ? ' <span class="tag">' + b.left.toFixed(1) + ' leagues left</span>' : '') + '</b><span>' + d.note + '</span></div>' + btn('cook', id, gl(c), S.gold >= c) + '</div>';
      });
    } else if (tab === 'lamp') {
      h += '<div class="sub">FLAME COLOUR</div>';
      ['red', 'blue', 'green', 'white'].forEach(function (f) {
        var lock = f !== 'red' && !S.meta.legends[f], F = LR.FLAMES[f];
        h += '<div class="row2"><div class="fd" data-f="' + f + '" style="flex:none"></div><div class="t"><b>' + F.name + (S.flame === f ? ' <span class="tag g">lit</span>' : '') + '</b><span>' + F.note + (lock ? ' (Legend needed)' : '') + '</span></div>' + btn('flame', f, S.flame === f ? 'Lit' : lock ? 'Locked' : 'Light', !lock && S.flame !== f) + '</div>';
      });
      h += '<div class="sub">BRIGHTNESS ' + S.bright + ' of ' + LR.lampMax(S) + '</div><div class="row2"><div class="t"><b>Burns ' + (LR.burn(S) * 60).toFixed(1) + ' embers a minute</b><span>Each step of brightness weakens enemies by 4.5%, and burns more embers as the road goes on.</span></div>' + btn('bright', S.bright - 1, '-', S.bright > 0) + btn('bright', S.bright + 1, '+', S.bright < LR.lampMax(S)) + '</div>';
      var lc = LR.lampCost(S); h += '<div class="row2"><div class="t"><b>Bigger lantern <span class="tag g">Lv ' + S.lampLv + '/5</span></b><span>Raises the highest brightness to ' + (LR.lampMax(S) + 1) + '.</span></div>' + (S.lampLv >= 5 ? '' : btn('lampup', '', gl(lc), S.gold >= lc)) + '</div>';
      h += '<div style="font-size:12px;color:var(--dim)">With no embers the flame gutters out and the road gets slower and darker.</div>';
    } else if (tab === 'story') {
      var ids = LR.HERO_ORDER.filter(function (id) { return S.heroes[id]; }); if (!selHero || !S.heroes[selHero]) selHero = ids[0];
      h += '<div class="hsel">' + ids.map(function (id) { return '<button data-a="hero" data-v="' + id + '" class="' + (id === selHero ? 'on' : '') + '"><canvas width="28" height="24" data-id="' + id + '"></canvas></button>'; }).join('') + '</div>';
      var H = S.heroes[selHero], D = LR.HERO[selHero], st = LR.hstat(S, selHero), need = LR.xpNeed(H.lvl);
      h += '<div class="row2"><div class="t"><b>' + D.name + ' <span class="tag g">Lv ' + H.lvl + '</span> <span style="font-weight:400;color:var(--dim)">' + D.role + '</span></b><span>HP ' + fmt(st.hp) + ' · ATK ' + fmt(st.atk) + ' · DEF ' + fmt(st.def) + '</span><div class="bar"><i style="width:' + Math.min(100, H.xp / need * 100) + '%;background:var(--blue)"></i></div></div><div style="text-align:right;font-size:12px;color:var(--dim)">Points<br><b style="font-size:20px;color:var(--gold)">' + H.sp + '</b></div></div>';
      h += '<div class="sub">STORIES: spend a point per rank</div>';
      h += '<div class="row2"><div class="t"><b>' + D.skill + pips(H.sk, 5) + '</b><span>' + D.skillNote + '. Power +12% per rank.</span></div>' + btn('story', 'sk', '+1', H.sp > 0 && H.sk < 5) + '</div>';
      h += '<div class="row2"><div class="t"><b>' + D.passive + pips(H.ps, 5) + '</b><span>' + D.passiveNote + '. Stronger +20% per rank.</span></div>' + btn('story', 'ps', '+1', H.sp > 0 && H.ps < 5) + '</div>';
      h += '<div class="row2"><div class="t"><b>Hardened' + pips(H.vg, 5) + '</b><span>+8% health and +4% defence per rank.</span></div>' + btn('story', 'vg', '+1', H.sp > 0 && H.vg < 5) + '</div>';
      h += '<div style="font-size:12px;color:var(--dim)">Heroes level up from fights, even resting at camp. Benched heroes earn 40%.</div>';
    } else if (tab === 'party') {
      h += '<div class="sub">FORMATION: front row takes the hits, back row stays safe from melee</div><div class="slots">';
      for (var i = 0; i < 4; i++) { var id = S.party[i]; h += '<button class="slot' + (selSlot === i ? ' sel' : '') + '" data-a="slot" data-v="' + i + '"><span style="color:var(--gold);font-size:11px">' + NUM[i] + ' ' + (i < 2 ? 'FRONT' : 'BACK') + '</span><br>' + (id ? esc(LR.HERO[id].name) + ' Lv ' + S.heroes[id].lvl : '<span style="color:var(--dim)">empty</span>') + '</button>'; }
      h += '</div>';
      if (selSlot != null) {
        h += '<div class="sub">PUT INTO SLOT ' + NUM[selSlot] + '</div>';
        LR.HERO_ORDER.filter(function (id) { return S.heroes[id] && S.party[selSlot] !== id; }).forEach(function (id) { h += '<div class="row2"><div class="t"><b>' + LR.HERO[id].name + '</b><span>' + LR.HERO[id].role + ' · Lv ' + S.heroes[id].lvl + '</span></div>' + btn('seat', id, 'Seat', true) + '</div>'; });
        if (S.party[selSlot]) h += '<div class="row2"><div class="t"><b>Leave empty</b></div>' + btn('seat', '', 'Bench', S.party.filter(Boolean).length > 1) + '</div>';
      }
      h += '<div class="sub">RECRUITS: heroes waiting at the waystones</div>';
      var rc = LR.recruitCost(S), any = false;
      LR.HERO_ORDER.filter(function (id) { return !S.heroes[id]; }).forEach(function (id) { any = true; var D2 = LR.HERO[id]; h += '<div class="row2"><div class="t"><b>' + D2.name + ' <span class="tag">' + D2.role + '</span></b><span>' + D2.skill + ': ' + D2.skillNote + '. ' + D2.passive + ': ' + D2.passiveNote + '.</span></div>' + btn('recruit', id, gl(rc), S.gold >= rc) + '</div>'; });
      if (!any) h += '<div style="color:var(--dim);font-size:13px">Everyone has joined the caravan.</div>';
    } else if (tab === 'tale') {
      var tales = LR.talesFor(S);
      h += '<div class="sub">THE TALE SO FAR</div><div class="stats"><div><b>' + Math.floor(S.best) + '</b>furthest</div><div><b>' + S.meta.tales + '</b>Tales</div><div><b>' + S.meta.runs + '</b>retellings</div><div><b>' + Math.floor(S.meta.best) + '</b>record</div></div>';
      h += '<div class="row2"><div class="t"><b>Twist: ' + LR.TWISTS[S.twist].name + '</b><span>' + LR.TWISTS[S.twist].note + '</span></div></div>';
      h += '<div class="row2"><div class="t"><b>Retell the tale</b><span>' + (tales > 0 ? 'End this journey for ' + tales + ' Tales. You start again from league 0 with Legends kept, and the road may change.' : 'Reach league 10 to earn Tales.') + '</span></div>' + btn('retell', '', 'Retell (' + tales + ')', tales > 0, 'go') + '</div>';
      h += '<div class="sub">LEGENDS: permanent. ' + S.meta.tales + ' Tales to spend</div>';
      Object.keys(LR.LEGENDS).forEach(function (id) { var L = LR.LEGENDS[id], n = S.meta.legends[id], c = L.cost(n); h += '<div class="row2"><div class="t"><b>' + L.name + pips(n, Math.min(L.max, 8)) + '</b><span>' + L.note + (n >= L.max ? ' (max)' : '') + '</span></div>' + (n >= L.max ? '' : btn('legend', id, c + ' Tales', S.meta.tales >= c)) + '</div>'; });
      h += '<div class="sub">TRAVEL JOURNAL</div>';
      S.journal.slice(-10).reverse().forEach(function (j) { h += '<div class="ent" style="font-style:italic;color:#e6dff8;margin:4px 0;padding-left:8px;border-left:3px solid var(--ln);font-size:13px">' + esc(j.text) + '</div>'; });
      h += '<div style="margin-top:14px;display:flex;gap:8px;align-items:center"><span style="flex:1;font-size:12px;color:var(--dim)">Signed in as ' + esc(user.name) + '</span>' + btn('logout', '', 'Sign out', true) + '</div>';
    }
    body.innerHTML = h; body.scrollTop = sc;
    [].forEach.call(body.querySelectorAll('canvas[data-id]'), function (c) { c.getContext('2d').drawImage(ART.portrait(c.getAttribute('data-id')), 0, 0); });
  }
  $('tabBody').onclick = function (e) {
    var b = e.target.closest && e.target.closest('[data-a]'); if (!b || b.disabled) return; var a = b.getAttribute('data-a'), v = b.getAttribute('data-v');
    switch (a) {
      case 'gear': LR.act.buyGear(S, v); break; case 'cook': LR.act.cook(S, v); break; case 'flame': LR.act.setFlame(S, v); buildDock(); break;
      case 'bright': LR.act.setBright(S, +v); break; case 'lampup': LR.act.lampUp(S); break; case 'hero': selHero = v; break; case 'story': LR.act.story(S, selHero, v); break;
      case 'slot': selSlot = selSlot === +v ? null : +v; break; case 'seat': LR.act.swap(S, selSlot, v || null); lastSig = ''; break;
      case 'recruit': if (LR.act.recruit(S, v)) { lastSig = ''; toast(LR.HERO[v].name + ' joined the caravan.'); } break;
      case 'legend': LR.act.buyLegend(S, v); buildDock(); break;
      case 'retell': return confirmRetell();
      case 'logout': return api('POST', '/logout', {}).then(function () { S = null; location.reload(); });
    }
    renderTab();
  };
  function confirmRetell() {
    var t = LR.talesFor(S);
    showModal('<h2>Retell the tale?</h2><p style="margin:6px 0">You walked to league ' + Math.floor(S.best) + '. Retelling earns <b style="color:var(--gold)">' + t + ' Tales</b>. Gold, gear and heroes reset; Legends and Tales stay. The road may come back changed.</p><div style="display:flex;gap:8px"><button class="btn go" style="flex:1" id="rtGo">Retell</button><button class="btn" style="flex:1" data-close="1">Keep walking</button></div>');
    $('rtGo').onclick = function () { closeModal(); if (LR.act.retell(S) !== false) { closeCamp(); toast('A new telling begins.', true); toast(LR.TWISTS[S.twist].name + '. ' + LR.TWISTS[S.twist].note); buildDock(); save(); } };
  }

  window.__lr = { get S() { return S; }, LR: LR, LRS: LRS, openCamp: openCamp, closeCamp: closeCamp, setTab: function (t) { tab = t; renderTab(); }, selHero: function (h) { selHero = h; }, onEv: onEv, showAway: showAway, confirmRetell: confirmRetell };
  boot();
})();
