/* Living Hell, phase 1. Rules only (no drawing): the character, Sword and Sandals style stats, and the fight maths.
   Shared by the page and the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LH = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var STATS = [
    ['strength', 'Strength', 'Raises the damage of your strikes.'],
    ['agility', 'Agility', 'Harder to hit, and you act first in a fight.'],
    ['attack', 'Attack', 'How often your strikes land.'],
    ['defence', 'Defence', 'Cuts the damage you take from weapons.'],
    ['vitality', 'Vitality', 'More health.'],
    ['charisma', 'Charisma', 'The damned crowd cheers for you and sometimes gives you strength.'],
    ['stamina', 'Stamina', 'A bigger stamina pool, so you can swing more often.'],
    ['magicka', 'Magicka', 'Makes Hellfire stronger and more accurate.']
  ];
  var POINTS = 12, MAXSTAT = 10;
  var SKINS = [['Ash', [224, 208, 192]], ['Bone', [216, 198, 168]], ['Tan', [208, 158, 112]], ['Umber', [160, 110, 74]], ['Ebony', [98, 66, 52]], ['Ember', [204, 108, 88]], ['Sickly', [158, 186, 138]]];
  var HAIRS = ['Bald', 'Buzz', 'Short', 'Long', 'Dreadlocks', 'Mohawk', 'Topknot', 'Wild', 'Horns'];
  var HAIR_COLORS = [['Soot', [30, 26, 28]], ['Ash grey', [122, 118, 122]], ['Bone white', [226, 220, 204]], ['Mud', [92, 62, 40]], ['Rust', [150, 70, 40]], ['Ember', [196, 52, 36]], ['Gutter blue', [52, 74, 112]]];
  var STUBBLES = ['None', 'Stubble', 'Beard'];

  function newCharacter() {
    var s = {}; STATS.forEach(function (x) { s[x[0]] = 1; });
    return { name: '', skin: 0, hair: 4, hcol: 3, stub: 1, stats: s };
  }
  function spent(ch) { var t = 0; STATS.forEach(function (x) { t += ch.stats[x[0]] - 1; }); return t; }
  function pointsLeft(ch) { return POINTS - spent(ch); }
  function setStat(ch, key, delta) {
    var v = ch.stats[key]; if (v === undefined) return false;
    if (delta > 0 && (v >= MAXSTAT || pointsLeft(ch) <= 0)) return false;
    if (delta < 0 && v <= 1) return false;
    ch.stats[key] = v + (delta > 0 ? 1 : -1); return true;
  }
  function randomize(ch, rng) {
    rng = rng || Math.random;
    ch.skin = Math.floor(rng() * SKINS.length); ch.hair = Math.floor(rng() * HAIRS.length); ch.hcol = Math.floor(rng() * HAIR_COLORS.length); ch.stub = Math.floor(rng() * STUBBLES.length);
  }
  function cleanName(n) { return String(n == null ? '' : n).replace(/[^A-Za-z0-9 '.\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14); }
  function validName(n) { return cleanName(n).length >= 2; }

  // Clamp everything from an untrusted save. Returns null if it is not a usable character.
  function sanitize(s) {
    if (!s || s.v !== 1 || !s.ch || typeof s.ch !== 'object') return null;
    var c = s.ch, out = newCharacter(); out.name = cleanName(c.name);
    if (!validName(out.name)) return null;
    function pick(v, n) { v = v | 0; return v >= 0 && v < n ? v : 0; }
    out.skin = pick(c.skin, SKINS.length); out.hair = pick(c.hair, HAIRS.length); out.hcol = pick(c.hcol, HAIR_COLORS.length); out.stub = pick(c.stub, STUBBLES.length);
    var st = c.stats || {}; STATS.forEach(function (x) { var v = st[x[0]] | 0; out.stats[x[0]] = Math.max(1, Math.min(MAXSTAT, v || 1)); });
    while (pointsLeft(out) < 0) { // cheated or corrupt: take points back from the biggest stat
      var big = STATS.map(function (x) { return x[0]; }).sort(function (a, b) { return out.stats[b] - out.stats[a]; })[0]; out.stats[big]--;
    }
    return { v: 1, ch: out, tutorial: s.tutorial ? 1 : 0, wins: Math.max(0, s.wins | 0) };
  }

  /* ---------------- fight rules ---------------- */
  var MOVES = {
    quick: { id: 'quick', name: 'Quick strike', cost: 2, acc: 0.12, dmg: function (s) { return 3 + 1.5 * s.strength; }, note: 'Cheap and accurate.' },
    heavy: { id: 'heavy', name: 'Heavy strike', cost: 4, acc: -0.05, dmg: function (s) { return 6 + 2.5 * s.strength; }, note: 'Slow and brutal.' },
    hellfire: { id: 'hellfire', name: 'Hellfire', cost: 5, acc: 0.1, magic: true, dmg: function (s) { return 4 + 3 * s.magicka; }, note: 'Burns through armour.' },
    guard: { id: 'guard', name: 'Guard', cost: 0, note: 'Brace and catch your breath.' }
  };
  function derive(stats) {
    return { maxHp: 20 + stats.vitality * 8, maxSp: 6 + stats.stamina * 2, red: Math.min(.5, stats.defence * .04) };
  }
  function fighter(name, stats, opts) {
    var d = derive(stats), f = { name: name, stats: stats, maxHp: (opts && opts.hp) || d.maxHp, maxSp: d.maxSp, guard: false, stagger: false };
    f.hp = f.maxHp; f.sp = f.maxSp; return f;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function hitChance(att, def, moveId, timing) {
    var m = MOVES[moveId], skill = m.magic ? att.stats.magicka : att.stats.attack;
    var c = .55 + skill * .04 - def.stats.agility * .02 + (m.acc || 0) + (timing === 'perfect' ? .3 : timing === 'poor' ? -.2 : 0);
    return clamp(c, .1, .97);
  }
  /* timing: 'perfect' | 'good' | 'poor' (player attacks). reaction: null | 'block' | 'parry' (player defending).
     Returns what happened. Does not change hp or stamina, the caller applies it. */
  function resolve(att, def, moveId, timing, reaction, rng) {
    rng = rng || Math.random; var m = MOVES[moveId], r = { move: moveId, hit: false, dmg: 0, crit: false, blocked: false, parried: false, guarded: false };
    if (!m || moveId === 'guard') return r;
    if (reaction === 'parry') { r.parried = true; return r; }
    r.hit = rng() < hitChance(att, def, moveId, timing); if (!r.hit) return r;
    var d = m.dmg(att.stats) * (.85 + rng() * .3);
    if (timing === 'perfect') { d *= 1.5; r.crit = true; } else if (timing === 'poor') d *= .6;
    if (!m.magic) d *= 1 - derive(def.stats).red;
    if (reaction === 'block') { d *= .3; r.blocked = true; }
    if (def.guard) { d *= .5; r.guarded = true; }
    r.dmg = Math.max(1, Math.round(d)); return r;
  }
  function apply(att, def, moveId, res) {
    var m = MOVES[moveId]; att.sp = Math.max(0, att.sp - (m.cost || 0));
    if (moveId === 'guard') { att.guard = true; att.sp = Math.min(att.maxSp, att.sp + 3); }
    def.hp = Math.max(0, def.hp - res.dmg);
    if (res.parried) att.stagger = true;
    return res;
  }
  function canUse(f, moveId) { var m = MOVES[moveId]; return !!m && f.sp >= (m.cost || 0); }
  function startTurn(f, rng, crowd) {
    f.guard = false; f.sp = Math.min(f.maxSp, f.sp + 2); var cheer = false;
    if (crowd && (rng || Math.random)() < Math.min(.4, (f.stats.charisma || 0) * .04)) { f.sp = Math.min(f.maxSp, f.sp + 2); cheer = true; }
    return { cheer: cheer };
  }
  function enemyChoose(e, rng, tutorial) {
    rng = rng || Math.random; if (e.sp < 2) return 'guard';
    var r = rng(); if (r < .65) return 'quick'; if (r < .9) return (!tutorial && e.sp >= 4) ? 'heavy' : 'quick'; return 'guard';
  }
  function playerFirst(p, e) { return p.stats.agility >= e.stats.agility; }

  return { STATS: STATS, POINTS: POINTS, MAXSTAT: MAXSTAT, SKINS: SKINS, HAIRS: HAIRS, HAIR_COLORS: HAIR_COLORS, STUBBLES: STUBBLES, MOVES: MOVES,
    newCharacter: newCharacter, pointsLeft: pointsLeft, setStat: setStat, randomize: randomize, cleanName: cleanName, validName: validName, sanitize: sanitize,
    derive: derive, fighter: fighter, hitChance: hitChance, resolve: resolve, apply: apply, canUse: canUse, startTurn: startTurn, enemyChoose: enemyChoose, playerFirst: playerFirst };
});
