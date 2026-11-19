/* Am I Alive? Phase 1: The Room. Game rules only (no drawing), shared by the page and the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AIA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var VIEWS = ['The bed', 'The door', 'The desk', 'The window'];
  var CODE = '0307'; // the clock on the wall stopped at 3:07

  var ITEMS = {
    hairpin: { name: 'Hairpin', desc: 'A thin silver hairpin. Thin enough to open a cheap lock.' },
    windkey: { name: 'Winding key', desc: 'A tiny brass key, shaped like a butterfly. It looks made for a music box.' },
    ribbon: { name: 'Red ribbon', desc: 'A hair ribbon, faded red. It is long and strong.' },
    clip: { name: 'Newspaper clipping', desc: 'MARLOW LANE MOTHER LAID TO REST. "...the girl, 11, still has not been..." The rest is torn away.' },
    coin: { name: 'Old coin', desc: 'A worn coin. Its edge is thin and flat, like a screwdriver.' },
    tape: { name: 'Masking tape', desc: 'Half a roll of masking tape. Still sticky.' },
    band: { name: 'Wristband', desc: 'A plastic hospital band. ELLIE M. ROOM 3. The date has been scratched out.' },
    sticky: { name: 'Sticky ribbon', desc: 'The ribbon with tape wrapped around its end. Something small would stick to it.' },
    key: { name: 'Brass key', desc: 'A heavy brass key. It is warm, though the room is freezing.' }
  };
  var COMBOS = [{ a: 'ribbon', b: 'tape', out: 'sticky', msg: 'I wind the tape around the end of the ribbon, sticky side out. A fishing line for small things.' }];

  // Each step of the escape adds to the progress bar. The weights add up to 100.
  var STEPS = [['woke', 4], ['pillow', 8], ['drawer', 12], ['wound', 10], ['coin', 4], ['clock', 8], ['nightstand', 12], ['tape', 4], ['sticky', 8], ['vent', 10], ['key', 10], ['door', 10]];

  function newState() { return { v: 1, view: 0, flags: { woke: 1 }, inv: [], sel: null, plays: 0 }; }
  function progress(s) { var p = 0; STEPS.forEach(function (x) { if (s.flags[x[0]]) p += x[1]; }); return p; }
  function has(s, id) { return s.inv.indexOf(id) >= 0; }
  function give(s, id) { if (!has(s, id) && !s.flags['got_' + id]) { s.inv.push(id); s.flags['got_' + id] = 1; } }
  function take(s, id) { s.inv = s.inv.filter(function (x) { return x !== id; }); if (s.sel === id) s.sel = null; }
  function valid(s) { return !!s && s.v === 1 && Array.isArray(s.inv) && s.flags && typeof s.flags === 'object' && s.inv.every(function (i) { return ITEMS[i]; }) && s.view >= 0 && s.view < VIEWS.length; }
  function sanitize(s) {
    if (!valid(s)) return null;
    var f = {}; Object.keys(s.flags).forEach(function (k) { if (/^[a-z_]{1,20}$/.test(k) && s.flags[k]) f[k] = 1; });
    return { v: 1, view: s.view | 0, flags: f, inv: s.inv.slice(0, 12), sel: null, plays: Math.max(0, s.plays | 0) };
  }

  // Which view each hotspot lives in, and what clicking it (alone, or with an item) does.
  // Returns { msg, sound?, modal?, done? }.
  function use(s, hid, item) {
    var F = s.flags, r = function (msg, extra) { var o = { msg: msg }; if (extra) for (var k in extra) o[k] = extra[k]; return o; };
    var wrong = r('That does not work here.');
    switch (hid) {
      case 'pillow':
        if (!F.pillow) { F.pillow = 1; give(s, 'hairpin'); return r('Something is under the pillow. A hairpin. The pillow is cold, like nobody has slept here for a long time.', { sound: 'pick' }); }
        return r('A flat grey pillow. There is a dent where a head used to be.');
      case 'blanket': return r('The blanket is damp. It smells like old rain and lavender.');
      case 'lamp': return r('Click. Click. The bulb is dead. The only light comes from the thing that is following me.');
      case 'photo': return r('A woman, a little girl and a house with a red door. The girl\'s face has been scratched out.');
      case 'nightstand':
        if (F.nightstand) return r('The drawer is empty now.');
        if (item) return wrong;
        return r('Four number wheels. I need the code.', { modal: 'code' });
      case 'door':
        if (F.door) return r('The door is open.');
        if (item === 'key') { F.door = 1; take(s, 'key'); return r('The padlock falls open. The chain slides to the floor. The door breathes out, and cold air touches my face.', { sound: 'unlock', done: true }); }
        if (item) return r('It does not fit the padlock.');
        return r('A chain and a heavy brass padlock hold the door shut. The paint is scratched with tiny fingernail marks.');
      case 'vent':
        if (!F.vent) {
          if (item === 'coin') { F.vent = 1; take(s, 'coin'); return r('The coin fits the screw heads. The grate swings loose. Deep inside, something brass catches the light. Too far to reach by hand.', { sound: 'screw' }); }
          if (item) return wrong;
          return r('A floor vent held shut by four flat screws.');
        }
        if (!F.key) {
          if (item === 'sticky') { F.key = 1; give(s, 'key'); take(s, 'sticky'); return r('The tape catches the key. I pull it out through the dust. A brass key, warm in my hand.', { sound: 'pick' }); }
          if (item) return wrong;
          return r('A brass key lies deep inside the vent, out of reach. I need something long and sticky.');
        }
        return r('Just dust now.');
      case 'raincoat': return r('A small yellow raincoat on a hook. It is dripping, but the floor beneath it is dry.');
      case 'drawer':
        if (F.drawer) return r('Empty. Only crayon dust.');
        if (item === 'hairpin') { F.drawer = 1; take(s, 'hairpin'); give(s, 'windkey'); give(s, 'ribbon'); give(s, 'clip'); return r('The lock clicks. Inside: a butterfly key, a red ribbon and a torn newspaper clipping.', { sound: 'unlock' }); }
        if (item) return wrong;
        return r('Locked. The keyhole is tiny.');
      case 'musicbox':
        if (F.wound) return r('The lullaby is still playing in my head. I know this song.');
        if (item === 'windkey') {
          F.wound = 1; F.coin = 1; take(s, 'windkey'); give(s, 'coin');
          return r('The box plays a soft lullaby. Behind me, the light grows warm and trembles. The lid springs open. A coin rolls out.', { sound: 'lullaby' });
        }
        if (item) return wrong;
        return r('An old music box with a butterfly-shaped hole in its side. The winding key is missing.');
      case 'drawings': return r('Crayon drawings. A house. A little girl. A woman drawn in white wax, glowing, holding the girl\'s hand.');
      case 'chair': return r('The chair has been pulled out, as if someone just got up.');
      case 'clock': F.clock = 1; return r('The clock has stopped at 3:07. The glass is cracked. The second hand twitches and goes nowhere.');
      case 'boards': return r('Boards are nailed across the window. From the outside.');
      case 'chart': return r('A height chart. ELLIE, age 4, 5, 6 ... 11. The pencil marks stop there. Someone has drawn a very small flower next to the last one.');
      case 'curtain': return r('Torn curtains. They sway, but there is no draft.');
    }
    return r('Nothing.');
  }

  function enterCode(s, digits) {
    if (String(digits) !== CODE) return { ok: false, msg: 'The wheels stay locked. Wrong code.' };
    s.flags.nightstand = 1; give(s, 'tape'); give(s, 'band'); s.flags.tape = 1;
    return { ok: true, msg: 'The drawer slides open. Masking tape and a hospital wristband.', sound: 'unlock' };
  }

  // Click an inventory item while another is selected.
  function combine(s, a, b) {
    for (var i = 0; i < COMBOS.length; i++) {
      var c = COMBOS[i];
      if ((a === c.a && b === c.b) || (a === c.b && b === c.a)) { take(s, c.a); take(s, c.b); give(s, c.out); s.flags.sticky = 1; return { ok: true, msg: c.msg, sound: 'pick' }; }
    }
    return { ok: false, msg: 'Those do not go together.' };
  }

  return { VIEWS: VIEWS, CODE: CODE, ITEMS: ITEMS, STEPS: STEPS, newState: newState, progress: progress, use: use, enterCode: enterCode, combine: combine, sanitize: sanitize, valid: valid, has: has };
});
