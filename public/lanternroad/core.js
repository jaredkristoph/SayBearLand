/* Lanternroad core: pure simulation, no DOM. Runs in the browser and in node tests. */
(function (root, f) { if (typeof module === 'object' && module.exports) module.exports = f(); else root.LR = f(); })(this, function () {
  'use strict';
  var API = {};
  var rnd = Math.random;
  API.setRng = function (f) { rnd = f; };
  API.seeded = function (seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  function R(a, b) { return a + rnd() * (b - a); }
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rr(v) { return Math.round(v); }

  var DAY_LEN = 240;           // seconds per full day
  var STONE = 10, GUARD = 50;  // leagues
  var BASE_SPEED = 0.09;       // leagues per second
  var ATK_INT = 1.3;

  var FLAMES = {
    red: { name: 'Ember red', note: 'Party attack +25%' },
    blue: { name: 'Moon blue', note: 'Skill power +35%' },
    green: { name: 'Fern green', note: 'Party regenerates 1.2% HP per second' },
    white: { name: 'Hearth white', note: 'Gold and embers +35%' }
  };
  var HERO = {
    warden: { name: 'Warden', role: 'Tank', hp: 110, atk: 8, def: 5, spd: .85, ranged: false, skill: 'Shield Wall', skillNote: 'Every ally takes 35% less damage for 4s', passive: 'Stalwart', passiveNote: '+15% max HP', cd: 10 },
    pikeman: { name: 'Pikeman', role: 'Striker', hp: 85, atk: 13, def: 3, spd: 1, ranged: false, skill: 'Long Thrust', skillNote: 'Pierces a front and a back enemy for 170%', passive: 'Keen Eye', passiveNote: '+10% crit chance', cd: 7 },
    witch: { name: 'Hedge-witch', role: 'Mage', hp: 58, atk: 11, def: 1, spd: .9, ranged: true, skill: 'Hex Bolt', skillNote: 'Hits every enemy for 100%, half defence ignored', passive: 'Brewer', passiveNote: 'Skills recharge 10% faster', cd: 8 },
    chanter: { name: 'Chanter', role: 'Healer', hp: 66, atk: 6, def: 2, spd: .9, ranged: true, skill: 'Hymn', skillNote: 'Heals the weakest ally for 30% of their health', passive: 'Soft Voice', passiveNote: 'Party regenerates 0.4% HP per second', cd: 7 },
    trapper: { name: 'Trapper', role: 'Control', hp: 76, atk: 10, def: 2, spd: 1.05, ranged: true, skill: 'Snare', skillNote: 'Stuns an enemy for 2.5s and hits for 140%', passive: 'Scavenger', passiveNote: '+12% gold', cd: 9 },
    tinker: { name: 'Tinker', role: 'Support', hp: 64, atk: 9, def: 2, spd: .95, ranged: true, skill: 'Overclock', skillNote: 'Party acts 30% faster for 5s', passive: 'Salvage', passiveNote: '+10% embers', cd: 11 }
  };
  var HERO_ORDER = ['warden', 'pikeman', 'witch', 'chanter', 'trapper', 'tinker'];
  // monster archetypes: hp/atk/def/spd multipliers; k = melee (front first) or ranged (anyone)
  var ARCH = {
    blob: { hp: 1.15, atk: .8, def: .4, spd: .9, k: 'melee' }, imp: { hp: .7, atk: 1.1, def: .3, spd: 1.1, k: 'ranged' },
    wolf: { hp: .9, atk: 1.2, def: .5, spd: 1.25, k: 'melee' }, golem: { hp: 1.9, atk: .9, def: 1.8, spd: .6, k: 'melee' },
    wraith: { hp: .8, atk: 1.15, def: .3, spd: 1, k: 'ranged' }, ghoul: { hp: 1.1, atk: 1, def: .8, spd: .85, k: 'melee' },
    bat: { hp: .6, atk: 1, def: .2, spd: 1.35, k: 'ranged' }, wisp: { hp: .55, atk: 1.25, def: .1, spd: 1.1, k: 'ranged' },
    lizard: { hp: 1.2, atk: 1.1, def: 1, spd: .95, k: 'melee' }
  };
  var BIOMES = [
    { id: 'meadow', name: 'Sunlit Meadow', mon: [['Gloom Slime', 'blob'], ['Thorn Imp', 'imp'], ['Dusk Wolf', 'wolf']], boss: ['Mother Bramble', 'golem'] },
    { id: 'pine', name: 'Pinewood', mon: [['Pine Wraith', 'wraith'], ['Bramble Ogre', 'golem'], ['Hollow Stag', 'wolf']], boss: ['The Antlered Hush', 'wolf'] },
    { id: 'marsh', name: 'Drowned Marsh', mon: [['Bog Lurker', 'lizard'], ['Marsh Wisp', 'wisp'], ['Reed Ghoul', 'ghoul']], boss: ['The Lantern Eater', 'wisp'] },
    { id: 'pass', name: 'Mountain Pass', mon: [['Frost Wolf', 'wolf'], ['Ice Golem', 'golem'], ['Crag Harpy', 'bat']], boss: ['Avalanche King', 'golem'] },
    { id: 'ruins', name: 'Ruined City', mon: [['Rusted Knight', 'ghoul'], ['Stone Gargoyle', 'bat'], ['Weeping Shade', 'wraith']], boss: ['The Hollow Regent', 'wraith'] },
    { id: 'ash', name: 'Ash Waste', mon: [['Cinder Imp', 'imp'], ['Ash Golem', 'golem'], ['Ember Drake', 'lizard']], boss: ['The Last Dark', 'lizard'] }
  ];
  var TWISTS = {
    none: { name: 'The road as it was', note: 'No change.' },
    flood: { name: 'The road was flooded', note: 'Walking is 25% slower, loot +25%.' },
    longnight: { name: 'The night ran long', note: 'Nights last longer, loot +15%.' },
    hollow: { name: 'The moon was hollow', note: 'Embers drop 50% more, lanterns weaken enemies less.' },
    frail: { name: 'The heroes were weary', note: 'Heroes have 15% less health, gold +30%.' },
    swift: { name: 'The road ran swift', note: 'Walking is 30% faster, enemies hit 15% harder.' }
  };
  var DISH = {
    stew: { name: 'Hearty stew', note: 'Attack +30% for 12 leagues', k: 1, leagues: 12 },
    tea: { name: 'Fernleaf tea', note: 'Regenerate 2% HP per second for 12 leagues', k: .8, leagues: 12 },
    cakes: { name: 'Honey cakes', note: 'Gold +40% for 10 leagues', k: 1.2, leagues: 10 },
    broth: { name: 'Pepper broth', note: 'Night loot +35% for 10 leagues', k: 1.1, leagues: 10 }
  };
  var LEGENDS = {
    start: { name: 'Old companions', note: 'Begin each tale with another hero', max: 3, cost: function (n) { return 3 * Math.pow(2, n); } },
    blue: { name: 'Moon blue flame', note: 'Unlocks the blue flame', max: 1, cost: function () { return 5; } },
    green: { name: 'Fern green flame', note: 'Unlocks the green flame', max: 1, cost: function () { return 5; } },
    white: { name: 'Hearth white flame', note: 'Unlocks the white flame', max: 1, cost: function () { return 8; } },
    offline: { name: 'Patient road', note: 'The caravan walks 2 hours longer while you are away', max: 8, cost: function (n) { return 4 + 2 * n; } },
    vigor: { name: 'Old songs', note: 'Heroes gain 15% health and attack, compounding', max: 20, cost: function (n) { return 2 + n; } },
    glow: { name: 'Gilded dusk', note: 'Gold +8% for every tale you retell', max: 10, cost: function (n) { return 3 + n * 2; } }
  };
  API.FLAMES = FLAMES; API.HERO = HERO; API.HERO_ORDER = HERO_ORDER; API.BIOMES = BIOMES; API.ARCH = ARCH;
  API.TWISTS = TWISTS; API.DISH = DISH; API.LEGENDS = LEGENDS; API.DAY_LEN = DAY_LEN; API.STONE = STONE; API.GUARD = GUARD;

  /* ---------------- state ---------------- */
  function newHero() { return { lvl: 1, xp: 0, hp: 1, sp: 0, sk: 0, ps: 0, vg: 0 }; }
  function freshRun(S) {
    var m = S.meta;
    S.league = 0; S.best = 0; S.beaten = 0; S.gate = GUARD; S.stoneIdx = 0;
    S.gold = 25 + 0; S.embers = 20; S.flame = 'red'; S.bright = 1; S.lampLv = 0;
    S.gear = { blade: 0, plate: 0, charm: 0 };
    S.heroes = { warden: newHero(), pikeman: newHero(), witch: newHero() };
    S.party = ['warden', 'pikeman', 'witch', null];
    var extra = ['chanter', 'trapper', 'tinker'];
    for (var i = 0; i < (m.legends.start || 0) && i < 3; i++) { S.heroes[extra[i]] = newHero(); S.party[3] = S.party[3] || extra[i]; }
    S.buffs = []; S.tod = .12; S.day = 1; S.fight = null; S.walkT = 5; S.haltT = 0; S.haltDawn = false; S.regroup = 0;
    S.route = null; S.ev = null; S.evCd = 12; S.flare = { t: 0, cd: 0 };
    S.twist = m.runs === 0 ? 'none' : pick(Object.keys(TWISTS));
    S.stats = { kills: 0, wipes: 0, nights: 0, gold: 0 };
  }
  API.newState = function () {
    var S = { v: 1, meta: { tales: 0, runs: 0, best: 0, legends: { start: 0, blue: 0, green: 0, white: 0, offline: 0, vigor: 0, glow: 0 } }, policy: 'push', journal: [], savedAt: 0, seed: Math.floor(rnd() * 1e9) };
    freshRun(S);
    return S;
  };
  API.migrate = function (S) { // defensive: fill gaps from older or tampered saves
    var N = API.newState();
    for (var k in N) if (S[k] === undefined) S[k] = N[k];
    for (var k2 in N.meta) if (S.meta[k2] === undefined) S.meta[k2] = N.meta[k2];
    for (var k3 in N.meta.legends) if (S.meta.legends[k3] === undefined) S.meta.legends[k3] = 0;
    return S;
  };
  function log(S, text) { S.journal.push({ t: Date.now(), text: text }); if (S.journal.length > 60) S.journal.shift(); }
  API.log = log;

  /* ---------------- helpers ---------------- */
  function isNight(S) { var d = S.twist === 'longnight' ? .5 : .62; return S.tod >= d; }
  API.isNight = isNight;
  API.biome = function (S) { return BIOMES[S.beaten % BIOMES.length]; };
  function buff(S, k) { var m = 1; for (var i = 0; i < S.buffs.length; i++) if (S.buffs[i].k === k) m *= S.buffs[i].m; return m; }
  function legendGlow(S) { return 1 + .08 * S.meta.legends.glow * S.meta.runs; }
  function owns(S, id) { return !!S.heroes[id]; }
  function partyHas(S, id) { return S.party.indexOf(id) >= 0; }
  function passive(S, id) { var h = S.heroes[id]; return h ? 1 + .2 * h.ps : 1; }
  API.hstat = function (S, id) {
    var h = S.heroes[id], d = HERO[id], lv = h.lvl;
    var vg = Math.pow(1.15, S.meta.legends.vigor);
    var hp = vg * d.hp * (1 + .2 * (lv - 1)) * (1 + .09 * S.gear.plate) * (1 + .08 * h.vg) * (id === 'warden' ? 1 + .15 * passive(S, id) : 1) * (S.twist === 'frail' ? .85 : 1);
    var atk = vg * d.atk * (1 + .15 * (lv - 1)) * (1 + .09 * S.gear.blade) * (S.flame === 'red' ? 1.25 : 1) * buff(S, 'atk') * (flareOn(S) ? 1.1 : 1);
    var def = d.def * (1 + .1 * (lv - 1)) * (1 + .07 * S.gear.plate) * (1 + .04 * h.vg);
    var sk = (1 + .12 * h.sk) * (1 + .07 * S.gear.charm) * (S.flame === 'blue' ? 1.35 : 1);
    return { hp: hp, atk: atk, def: def, spd: d.spd, sk: sk };
  };
  function flareOn(S) { return S.flare.t > 0; }
  API.xpNeed = function (lv) { return rr(30 * Math.pow(1.38, lv - 1)); };
  API.gearCost = function (S, k) { var base = { blade: 30, plate: 34, charm: 40 }[k]; return rr(base * Math.pow(1.3, S.gear[k])); };
  API.lampCost = function (S) { return rr(70 * Math.pow(2, S.lampLv)); };
  API.lampMax = function (S) { return 2 + S.lampLv; };
  API.recruitCost = function (S) { var n = Object.keys(S.heroes).length - 3; return rr(90 * Math.pow(1.9, Math.max(0, n))); };
  API.dishCost = function (S, id) { return rr(18 * DISH[id].k * Math.pow(1.09, S.league / 5)); };
  API.burn = function (S) { return S.bright * .045 * (1 + .012 * S.league); };
  function speedMul(S) { var m = 1; if (S.twist === 'flood') m *= .75; if (S.twist === 'swift') m *= 1.3; if (S.route) m *= S.route.kind === 'short' ? 1.5 : .8; return m; }
  function lootMul(S, night) {
    var m = legendGlow(S); if (S.twist === 'flood') m *= 1.25; if (S.twist === 'longnight') m *= 1.15; if (S.twist === 'frail') m *= 1.3;
    if (S.route) m *= S.route.kind === 'short' ? 1.5 : .9;
    if (S.flame === 'white') m *= 1.35; m *= buff(S, 'gold');
    if (night) m *= 2.4 * buff(S, 'night');
    if (S.party.indexOf('trapper') >= 0) m *= 1 + .12 * passive(S, 'trapper');
    return m;
  }
  function ember(S) { return (S.flame === 'white' ? 1.35 : 1) * (S.twist === 'hollow' ? 1.5 : 1) * (S.party.indexOf('tinker') >= 0 ? 1 + .1 * passive(S, 'tinker') : 1); }
  API.lootMul = lootMul;
  function danger(S) { var m = 1; if (S.route) m *= S.route.kind === 'short' ? 1.35 : .8; return m; }

  /* ---------------- units and fights ---------------- */
  function heroUnit(S, id, slot) {
    var s = API.hstat(S, id), h = S.heroes[id];
    return { side: 0, id: id, slot: slot, key: '0:' + slot, hp: Math.max(1, h.hp * s.hp), max: s.hp, atk: s.atk, def: s.def, spd: s.spd, sk: s.sk, t: R(0, .7), sc: R(2, 5), stun: 0, guard: 0, haste: 0, alive: true, ranged: HERO[id].ranged };
  }
  function foeStat(S, arch, boss) {
    var n = Math.pow(1.062, S.league), night = isNight(S);
    var a = ARCH[arch], b = S.bright, hollow = S.twist === 'hollow' ? .5 : 1;
    var wk = 1 - (.045 * b * hollow);
    var dark = (b === 0 && night) ? 1.2 : 1;
    var nm = night ? [1.5, 1.35] : [1, 1];
    var dg = danger(S) * (S.twist === 'swift' ? 1.15 : 1);
    var bossM = boss ? [12, 2.1, 1.6] : [1, 1, 1];
    return { hp: 22 * n * a.hp * nm[0] * dg * wk * bossM[0], atk: 3.4 * Math.pow(1.048, S.league) * a.atk * nm[1] * dg * wk * dark * bossM[1], def: 1.2 * Math.pow(1.045, S.league) * a.def * bossM[2], spd: a.spd * (boss ? .8 : 1) };
  }
  function foeUnit(S, name, arch, slot, boss) {
    var s = foeStat(S, arch, boss), a = ARCH[arch];
    return { side: 1, name: name, arch: arch, boss: !!boss, slot: slot, key: '1:' + slot, hp: s.hp, max: s.hp, atk: s.atk, def: s.def, spd: s.spd, t: R(0, 1), sc: boss ? 8 : 99, stun: 0, guard: 0, haste: 0, alive: true, ranged: a.k === 'ranged' };
  }
  function startFight(S, boss, out) {
    var B = API.biome(S), foes = [], n;
    if (boss) { foes.push(foeUnit(S, B.boss[0], B.boss[1], 0, true)); }
    else {
      var night = isNight(S);
      n = clamp(1 + Math.floor(rnd() * (2 + S.league / 22)) + (night ? 1 : 0), 1, 4);
      var types = []; for (var i = 0; i < n; i++) types.push(pick(B.mon));
      types.sort(function (a, b) { return (ARCH[a[1]].k === 'melee' ? 0 : 1) - (ARCH[b[1]].k === 'melee' ? 0 : 1); });
      var order = [0, 1, 2, 3];
      for (var j = 0; j < n; j++) foes.push(foeUnit(S, types[j][0], types[j][1], order[j], false));
    }
    var heroes = [];
    for (var s = 0; s < 4; s++) if (S.party[s]) heroes.push(heroUnit(S, S.party[s], s));
    S.fight = { heroes: heroes, foes: foes, boss: !!boss, t: 0, night: isNight(S) };
    if (out) out.push({ e: 'start', boss: !!boss });
  }
  function living(a) { return a.filter(function (u) { return u.alive; }); }
  function foeTarget(S, f, heroes) {
    var al = living(heroes); if (!al.length) return null;
    if (!f.ranged) { var fr = al.filter(function (u) { return u.slot < 2; }); if (fr.length) return pick(fr); }
    return pick(al);
  }
  function dmgRoll(atk, mul, def, ig) { return Math.max(1, atk * mul - def * (ig || .6)) * R(.9, 1.1); }
  function hurt(U, tgt, amt, out, o) {
    if (!tgt || !tgt.alive) return 0;
    if (tgt.guard > 0) amt *= .65;
    tgt.hp -= amt;
    if (out) out.push({ e: 'hit', s: U.key, t: tgt.key, d: Math.round(amt), c: o && o.crit, sk: o && o.sk });
    if (tgt.hp <= 0) { tgt.hp = 0; tgt.alive = false; if (out) out.push({ e: 'die', t: tgt.key }); }
    return amt;
  }
  function heroAct(S, F, u, out) {
    var d = HERO[u.id], foes = living(F.foes);
    if (!foes.length) return;
    var crit = .08 + (u.id === 'pikeman' ? .1 * passive(S, 'pikeman') : 0) + .01 * S.gear.charm;
    var k = d.skill;
    if (u.sc <= 0) {
      var cd = d.cd * (u.id === 'witch' ? 1 - .1 * passive(S, 'witch') : 1) * (S.flame === 'blue' ? .9 : 1);
      if (k === 'Shield Wall') { F.heroes.forEach(function (h) { if (h.alive) h.guard = 4; }); u.sc = cd; if (out) out.push({ e: 'cast', s: u.key, n: k }); return; }
      if (k === 'Long Thrust') {
        var fr = foes.filter(function (x) { return x.slot < 2; }), bk = foes.filter(function (x) { return x.slot >= 2; });
        var tg = [pick(fr.length ? fr : foes)]; if (bk.length && fr.length) tg.push(pick(bk));
        tg.forEach(function (t) { hurt(u, t, dmgRoll(u.atk, 1.7 * u.sk, t.def), out, { sk: 1 }); });
        u.sc = cd; if (out) out.push({ e: 'cast', s: u.key, n: k }); return;
      }
      if (k === 'Hex Bolt') { foes.forEach(function (t) { hurt(u, t, dmgRoll(u.atk, 1.0 * u.sk, t.def, .3), out, { sk: 1 }); }); u.sc = cd; if (out) out.push({ e: 'cast', s: u.key, n: k }); return; }
      if (k === 'Hymn') {
        var al = living(F.heroes).sort(function (a, b) { return a.hp / a.max - b.hp / b.max; })[0];
        if (al && al.hp < al.max) { var hv = (.3 * al.max + u.atk * .5) * u.sk; al.hp = Math.min(al.max, al.hp + hv); if (out) out.push({ e: 'heal', s: u.key, t: al.key, d: Math.round(hv) }); u.sc = cd; if (out) out.push({ e: 'cast', s: u.key, n: k }); return; }
      }
      if (k === 'Snare') { var tt = pick(foes); if (!tt.boss) tt.stun = 2.5; hurt(u, tt, dmgRoll(u.atk, 1.4 * u.sk, tt.def), out, { sk: 1 }); u.sc = cd; if (out) out.push({ e: 'cast', s: u.key, n: k }); return; }
      if (k === 'Overclock') { F.heroes.forEach(function (h) { if (h.alive) h.haste = 5; }); u.sc = cd; if (out) out.push({ e: 'cast', s: u.key, n: k }); return; }
    }
    var tg2 = !u.ranged ? (function () { var fr = foes.filter(function (x) { return x.slot < 2; }); return pick(fr.length ? fr : foes); })() : pick(foes);
    var c = rnd() < crit, a = dmgRoll(u.atk, c ? 1.7 : 1, tg2.def);
    hurt(u, tg2, a, out, { crit: c });
  }
  function fightTick(S, dt, out) {
    var F = S.fight; F.t += dt;
    var flare = flareOn(S);
    var all = F.heroes.concat(F.foes);
    for (var i = 0; i < all.length; i++) {
      var u = all[i]; if (!u.alive) continue;
      if (u.guard > 0) u.guard -= dt; if (u.haste > 0) u.haste -= dt;
      if (u.stun > 0) { u.stun -= dt; continue; }
      var spd = u.spd * (u.haste > 0 ? 1.3 : 1) * (u.side === 0 && flare ? 1.25 : 1) * (u.side === 1 && flare ? .7 : 1);
      u.t += dt * spd; if (u.side === 0) u.sc -= dt; else if (u.boss) u.sc -= dt;
      if (u.t >= ATK_INT) {
        u.t -= ATK_INT;
        if (u.side === 0) heroAct(S, F, u, out);
        else {
          if (u.boss && u.sc <= 0) { u.sc = 9; living(F.heroes).forEach(function (h) { hurt(u, h, dmgRoll(u.atk, .85, h.def), out, { sk: 1 }); }); if (out) out.push({ e: 'cast', s: u.key, n: 'Slam' }); }
          else { var t = foeTarget(S, u, F.heroes); if (t) hurt(u, t, dmgRoll(u.atk, 1, t.def), out, {}); }
        }
      }
    }
    // chanter aura and green flame regen
    var reg = 0; if (S.flame === 'green') reg += .012; if (partyHas(S, 'chanter')) reg += .004 * passive(S, 'chanter'); reg += buff(S, 'regen') - 1;
    if (reg > 0) F.heroes.forEach(function (h) { if (h.alive) h.hp = Math.min(h.max, h.hp + h.max * reg * dt); });
    if (!living(F.foes).length) return endFight(S, true, out);
    if (!living(F.heroes).length) return endFight(S, false, out);
  }
  function saveHp(S, F) { F.heroes.forEach(function (h) { var H = S.heroes[h.id]; H.hp = h.alive ? clamp(h.hp / h.max, .02, 1) : .3; }); }
  function endFight(S, win, out) {
    var F = S.fight; saveHp(S, F); S.fight = null;
    if (win) {
      var night = F.night, mul = lootMul(S, night), g = 0, e = 0, xp = 0, kills = F.foes.length;
      F.foes.forEach(function (f) {
        var base = 3.2 * Math.pow(1.05, S.league) * (f.boss ? 14 : 1);
        g += base * R(.8, 1.25) * mul; xp += 7 * Math.pow(1.04, S.league) * (f.boss ? 10 : 1);
        var pe = (night ? .38 : .13) + (f.boss ? 1 : 0);
        if (rnd() < pe) e += Math.ceil((1 + R(0, 1.5) + S.league * .04 + (night ? 1 : 0) + (f.boss ? 8 : 0)) * ember(S));
      });
      g = Math.max(1, Math.round(g)); S.gold += g; S.embers += e; S.stats.gold += g; S.stats.kills += kills;
      var lvUp = [];
      Object.keys(S.heroes).forEach(function (id) {
        var H = S.heroes[id]; H.xp += xp * (partyHas(S, id) ? 1 : .4);
        while (H.lvl < 60 && H.xp >= API.xpNeed(H.lvl)) { H.xp -= API.xpNeed(H.lvl); H.lvl++; H.sp++; if (partyHas(S, id)) lvUp.push(HERO[id].name + ' ' + H.lvl); }
      });
      S.walkT = night ? R(3, 6) : R(6, 11);
      if (out) out.push({ e: 'win', gold: g, embers: e, xp: Math.round(xp), lvUp: lvUp, boss: F.boss });
      if (F.boss) beatGuardian(S, out);
    } else {
      S.stats.wipes++;
      var from = S.league;
      var back = Math.max(0, Math.floor((S.league - .001) / STONE) * STONE);
      S.league = back; S.stoneIdx = Math.floor(back / STONE);
      Object.keys(S.heroes).forEach(function (id) { S.heroes[id].hp = 1; });
      S.regroup = 5; S.haltT = 4; S.walkT = 5; S.route = null; S.ev = null;
      log(S, 'The party fell at league ' + Math.floor(from) + ' and woke by the waystone at ' + back + '. The lantern still burned.');
      if (out) out.push({ e: 'wipe', league: back, boss: F.boss });
    }
  }
  function beatGuardian(S, out) {
    var B = API.biome(S);
    S.beaten++; S.gate += GUARD;
    var nb = API.biome(S);
    S.gold += Math.round(40 * Math.pow(1.05, S.league)); S.embers += 12 + S.beaten * 3;
    log(S, B.boss[0] + ' fell at league ' + Math.floor(S.league) + '. Beyond it lay the ' + nb.name + '.');
    if (out) out.push({ e: 'guardian', name: B.boss[0], next: nb.name });
  }

  /* ---------------- walking ---------------- */
  function spawnEvent(S) {
    var r = rnd();
    if (S.league >= 25 && Math.floor(S.league / 25) > (S.forkIdx || 0) && S.league % STONE > 2 && !S.route) {
      S.forkIdx = Math.floor(S.league / 25);
      S.ev = { type: 'fork', exp: 25, title: 'The road forks', text: 'The short path cuts through the dark: faster, with fiercer things and richer spoils. The long path hugs the lanternlight.', opts: [{ t: 'Short and dangerous', k: 'short' }, { t: 'Long and safe', k: 'long' }], def: 1 };
      return;
    }
    var scale = Math.pow(1.05, S.league);
    if (r < .38) S.ev = { type: 'merchant', exp: 22, title: 'A wandering merchant', text: '"Lanternlight is the only warmth I trust," she says, unrolling her wares.', opts: [{ t: 'Buy embers (' + rr(60 * scale) + ' gold)', k: 'embers' }, { t: 'Buy a lucky charm (' + rr(45 * scale) + ' gold)', k: 'charm' }, { t: 'Wave her on', k: 'no' }], def: 2, cost: scale };
    else if (r < .7) S.ev = { type: 'shrine', exp: 22, title: 'A roadside shrine', text: 'A cracked stone, a ring of old wax. It asks for one ember.', opts: [{ t: 'Offer an ember', k: 'pray' }, { t: 'Walk on', k: 'no' }], def: 1 };
    else S.ev = { type: 'traveller', exp: 22, title: 'A tired traveller', text: 'He has walked the dark road and lived. He wants only a little help.', opts: [{ t: 'Share supplies (' + rr(25 * scale) + ' gold)', k: 'help' }, { t: 'Pass by', k: 'no' }], def: 1, cost: scale };
  }
  API.resolveEvent = function (S, i, out) {
    var ev = S.ev; if (!ev) return null; var k = ev.opts[clamp(i, 0, ev.opts.length - 1)].k, msg = '', sc = Math.pow(1.05, S.league);
    if (ev.type === 'fork') { S.route = { kind: k, left: 10 }; msg = k === 'short' ? 'The caravan took the short path. Everything felt louder.' : 'The caravan took the long road, warm and slow.'; }
    else if (ev.type === 'merchant') {
      if (k === 'embers') { var c = rr(60 * sc); if (S.gold >= c) { S.gold -= c; S.embers += 18 + rr(S.league * .5); msg = 'Embers, wrapped in cloth.'; } else msg = 'Not enough gold. She shrugged and rolled up her wares.'; }
      else if (k === 'charm') { var c2 = rr(45 * sc); if (S.gold >= c2) { S.gold -= c2; S.buffs.push({ k: 'gold', m: 1.3, left: 5 }); msg = 'A lucky charm for the next 5 leagues.'; } else msg = 'Not enough gold.'; }
      else msg = 'You waved the merchant on.';
    } else if (ev.type === 'shrine') {
      if (k === 'pray' && S.embers >= 1) { S.embers -= 1; if (rnd() < .65) { S.buffs.push({ k: 'atk', m: 1.2, left: 10 }); msg = 'The wax flared. The party felt braver for 10 leagues.'; } else { S.buffs.push({ k: 'atk', m: .9, left: 5 }); msg = 'The wax guttered. A chill followed the party for 5 leagues.'; } } else msg = 'You walked on.';
    } else if (ev.type === 'traveller') {
      if (k === 'help') { var c3 = rr(25 * sc); if (S.gold >= c3) { S.gold -= c3; var r = rnd(); if (r < .5) { S.embers += 10 + rr(S.league * .3); msg = 'He pressed embers into your hand.'; } else { Object.keys(S.heroes).forEach(function (id) { S.heroes[id].xp += 12 * sc; }); msg = 'He taught the party an old marching song.'; } } else msg = 'You had nothing to spare.'; } else msg = 'You passed by.';
    }
    if (msg) log(S, msg);
    S.ev = null; S.evCd = R(12, 20);
    if (out) out.push({ e: 'evdone', msg: msg });
    return msg;
  };
  function atStone(S, out) {
    var tw = isNight(S);
    S.haltT = 7;
    if (tw && S.policy === 'camp') { S.haltDawn = true; log(S, 'Night fell and the caravan made camp at the waystone at league ' + S.stoneIdx * STONE + '.'); }
    if (out) out.push({ e: 'stone', league: S.stoneIdx * STONE, rest: S.haltDawn });
  }
  API.breakCamp = function (S) { S.haltT = 0; S.haltDawn = false; };
  API.restUntilDawn = function (S) { if (isNight(S)) { S.tod = 0; S.day++; Object.keys(S.heroes).forEach(function (id) { S.heroes[id].hp = 1; }); S.embers = Math.max(0, S.embers - 2); } };
  function stepBuffs(S, leagues) { for (var i = S.buffs.length - 1; i >= 0; i--) { S.buffs[i].left -= leagues; if (S.buffs[i].left <= 0) S.buffs.splice(i, 1); } if (S.route) { S.route.left -= leagues; if (S.route.left <= 0) S.route = null; } }

  API.tick = function (S, dt, out, off) {
    var wasNight = isNight(S);
    S.tod += dt / DAY_LEN * (S.twist === 'longnight' && false ? 1 : 1);
    if (S.tod >= 1) { S.tod -= 1; S.day++; }
    var night = isNight(S);
    if (night && !wasNight) { S.stats.nights++; if (out) out.push({ e: 'dusk' }); }
    if (!night && wasNight && out) out.push({ e: 'dawn' });
    if (S.flare.t > 0) S.flare.t -= dt; if (S.flare.cd > 0) S.flare.cd -= dt;
    if (S.bright > 0) { S.embers -= API.burn(S) * dt; if (S.embers <= 0) { S.embers = 0; S.bright = 0; if (out) out.push({ e: 'gutter' }); log(S, 'The embers ran out and the flame guttered low.'); } }
    if (S.regroup > 0) { S.regroup -= dt; return; }
    if (S.fight) return fightTick(S, dt, out);
    var heal = (S.haltT > 0 || S.haltDawn) ? .09 : .012; heal += (S.flame === 'green' ? .012 : 0) + (partyHas(S, 'chanter') ? .004 * passive(S, 'chanter') : 0) + buff(S, 'regen') - 1;
    Object.keys(S.heroes).forEach(function (id) { var H = S.heroes[id]; H.hp = Math.min(1, H.hp + heal * dt); });
    if (S.ev) { S.ev.exp -= dt; if (S.ev.exp <= 0 || off) API.resolveEvent(S, S.ev.def, out); }
    if (S.haltDawn) { if (!night) { S.haltDawn = false; log(S, 'Dawn found the camp rested and the lantern low.'); } return; }
    if (S.haltT > 0) { S.haltT -= dt; return; }
    var sp = BASE_SPEED * speedMul(S) * (night && S.bright === 0 ? .8 : 1);
    var prev = S.league;
    if (S.league >= S.gate - 1e-6) { S.league = S.gate; if (off) return 'gate'; startFight(S, true, out); return; }
    S.league = Math.min(S.gate, S.league + sp * dt);
    if (S.league > S.best) S.best = S.league;
    stepBuffs(S, S.league - prev);
    S.walkT -= dt;
    S.evCd -= (S.league - prev);
    if (!S.ev && S.evCd <= 0 && !off) spawnEvent(S);
    var idx = Math.floor(S.league / STONE);
    if (idx > S.stoneIdx) { S.stoneIdx = idx; atStone(S, out); return; }
    if (S.league >= S.gate - 1e-6) return;
    if (S.walkT <= 0) startFight(S, false, out);
  };

  /* ---------------- actions ---------------- */
  var A = API.act = {};
  A.buyGear = function (S, k) { var c = API.gearCost(S, k); if (S.gold < c) return false; S.gold -= c; S.gear[k]++; return true; };
  A.setFlame = function (S, f) { if (!FLAMES[f]) return false; if (f !== 'red' && !S.meta.legends[f]) return false; S.flame = f; return true; };
  A.setBright = function (S, b) { b = clamp(Math.round(b), 0, API.lampMax(S)); S.bright = b; return true; };
  A.lampUp = function (S) { if (S.lampLv >= 5) return false; var c = API.lampCost(S); if (S.gold < c) return false; S.gold -= c; S.lampLv++; return true; };
  A.flare = function (S) { var c = 5 + S.league * .2; if (S.flare.cd > 0 || S.embers < c) return false; S.embers -= c; S.flare.t = 8; S.flare.cd = 45; return true; };
  A.cook = function (S, id) { var c = API.dishCost(S, id); if (!DISH[id] || S.gold < c) return false; S.gold -= c; var d = DISH[id];
    var b = { stew: ['atk', 1.3], tea: ['regen', 1.02], cakes: ['gold', 1.4], broth: ['night', 1.35] }[id];
    S.buffs = S.buffs.filter(function (x) { return x.dish !== id; }); S.buffs.push({ k: b[0], m: b[1], left: d.leagues, dish: id }); return true; };
  A.recruit = function (S, id) {
    if (S.heroes[id] || !HERO[id]) return false; var c = API.recruitCost(S); if (S.gold < c) return false; S.gold -= c;
    S.heroes[id] = newHero(); var h = S.heroes[id]; var lv = Math.max(1, Math.floor(API.avgLevel(S) - 1)); h.lvl = lv; h.sp = Math.max(0, lv - 1);
    var e = S.party.indexOf(null); if (e >= 0) S.party[e] = id; log(S, HERO[id].name + ' joined the caravan.'); return true; };
  A.story = function (S, id, k) { var h = S.heroes[id]; if (!h || !(k in { sk: 1, ps: 1, vg: 1 }) || h[k] >= 5 || h.sp < 1) return false; h.sp--; h[k]++; return true; };
  A.swap = function (S, slot, id) { // put hero id into slot (or null to empty); swaps if hero is already seated
    if (slot < 0 || slot > 3) return false; if (id && !S.heroes[id]) return false;
    var cur = S.party[slot], at = S.party.indexOf(id);
    if (id && at >= 0) S.party[at] = cur; S.party[slot] = id || null; if (!S.party.some(Boolean)) { S.party[slot] = cur; return false; } return true; };
  A.setPolicy = function (S, p) { S.policy = p === 'camp' ? 'camp' : 'push'; };
  A.buyLegend = function (S, id) { var L = LEGENDS[id], n = S.meta.legends[id]; if (!L || n >= L.max) return false; var c = L.cost(n); if (S.meta.tales < c) return false; S.meta.tales -= c; S.meta.legends[id]++; return true; };
  API.avgLevel = function (S) { var a = 0, n = 0; Object.keys(S.heroes).forEach(function (id) { a += S.heroes[id].lvl; n++; }); return a / Math.max(1, n); };
  API.talesFor = function (S) { return S.best >= 10 ? Math.floor(Math.pow(S.best / 10, 1.5)) : 0; };
  A.retell = function (S) {
    var t = API.talesFor(S); if (t < 1) return false;
    S.meta.tales += t; S.meta.runs++; S.meta.best = Math.max(S.meta.best, Math.floor(S.best));
    log(S, 'The tale was told again. It reached league ' + Math.floor(S.best) + ' and earned ' + t + ' Tales.');
    var j = S.journal, pol = S.policy; freshRun(S); S.journal = j; S.policy = pol;
    log(S, 'A new telling begins. ' + TWISTS[S.twist].name + '.'); return t;
  };

  /* ---------------- offline ---------------- */
  var DIARY = {
    walk: ['We walked %L league(s) while you were away. The lantern held.', 'The road unrolled for %L league(s). Nothing followed us home.', 'Another %L league(s) behind us. The Warden hummed all day.'],
    night: ['Night %N was loud. We pushed through %K shapes in the dark.', 'The dark tested us for night %N, and we counted %K fewer things in it.', 'We kept walking through night %N. %K creatures regretted it.'],
    camp: ['We rested through the dark. The fire kept its promises.', 'The caravan slept at the waystone until the sky greyed.'],
    wipe: ['We fell %W time(s), and woke beside a waystone, a little embarrassed.', 'The dark won %W time(s). The lantern did not mind.'],
    gate: ['A Guardian stands across the road. We stopped to wait for you.', 'The road ends at a Guardian. We did not want to decide without you.'],
    dry: ['The embers ran out. The Hedge-witch lit a small, stubborn flame of her own.']
  };
  function dline(a, o) { return pick(a).replace(/%(\w)/g, function (m, c) { return o[c] !== undefined ? o[c] : m; }); }
  API.offline = function (S, ms, rng) {
    var cap = (8 + 2 * S.meta.legends.offline) * 3600; var sec = Math.min(ms / 1000, cap);
    var res = { seconds: Math.floor(sec), capped: ms / 1000 > cap, entries: [], gold: 0, embers: 0, leagues: 0, kills: 0, wipes: 0, lvls: 0, gate: false };
    if (sec < 30) return res;
    var g0 = S.gold, e0 = S.embers, l0 = S.league, k0 = S.stats.kills, w0 = S.stats.wipes, n0 = S.stats.nights, lv0 = API.avgLevel(S), d0 = S.day;
    var dt = .5, t = 0, ptr = { l: l0, k: k0, w: w0, n: n0, d: d0 }, ent = [], stop = false;
    var oldBright = S.bright;
    while (t < sec && !stop) {
      var r = API.tick(S, dt, null, true); t += dt;
      if (r === 'gate') { res.gate = true; stop = true; }
      if (S.day !== ptr.d) { // diary line for the day that just ended
        var lt = Math.floor(S.league - ptr.l), kd = S.stats.kills - ptr.k, wd = S.stats.wipes - ptr.w, nn = S.stats.nights - ptr.n;
        if (lt > 0) ent.push(dline(DIARY.walk, { L: lt }));
        if (kd > 0 && nn > 0) ent.push(dline(DIARY.night, { N: S.stats.nights, K: kd }));
        if (wd > 0) ent.push(dline(DIARY.wipe, { W: wd }));
        ptr = { l: S.league, k: S.stats.kills, w: S.stats.wipes, n: S.stats.nights, d: S.day };
      }
    }
    if (S.bright === 0 && oldBright > 0) ent.push(dline(DIARY.dry, {}));
    if (res.gate) ent.push(dline(DIARY.gate, {}));
    if (S.haltDawn) ent.push(dline(DIARY.camp, {}));
    res.gold = Math.round(S.gold - g0); res.embers = Math.round(S.embers - e0); res.leagues = Math.floor(S.league - l0); res.kills = S.stats.kills - k0; res.wipes = S.stats.wipes - w0; res.lvls = Math.round((API.avgLevel(S) - lv0) * 10) / 10;
    if (!ent.length && res.leagues > 0) ent.push(dline(DIARY.walk, { L: res.leagues }));
    res.entries = ent.slice(-8);
    res.entries.forEach(function (x) { log(S, x); });
    // heroes and walkT should not be mid-action when the player returns
    S.fight = null; S.ev = null; S.haltT = Math.max(S.haltT, 0);
    return res;
  };
  API.startGuardianNow = function (S, out) { if (!S.fight) startFight(S, true, out); };
  return API;
});
