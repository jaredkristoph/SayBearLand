/* Shared by the server (bots, validation) and the browser (rendering, collision).
   Layout units: 1 cell = 1 world unit. x grows right, z grows down, origin top-left.
   toWorld() shifts the origin to the map centre. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CLLayout = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var FLOORS = { c: 'Checker', w: 'Wood', g: 'Grey tile', r: 'Pink carpet', u: 'Purple carpet' };
  // hw/hd: half size of the blocking box (rot 0). wall: mounted on a wall. pass: can be walked through.
  var TYPES = {
    desk: { label: 'Desk + chair', hw: 1.5, hd: 0.75, seat: true },
    plant: { label: 'Plant', hw: 0.5, hd: 0.5 },
    sofa: { label: 'Sofa', hw: 1.9, hd: 0.7 },
    meetingTable: { label: 'Meeting table', hw: 2.2, hd: 1 },
    chair: { label: 'Chair (sit, snaps to tables)', hw: 0.3, hd: 0.3, chair: true },
    glass: { label: 'Glass wall', hw: 3.8, hd: 0.1, pass: true },
    divider: { label: 'Room divider', hw: 2, hd: 0.15 },
    stall: { label: 'Toilet stall', hw: 1, hd: 1, parts: [[-0.95, 0, 0.06, 1], [0.95, 0, 0.06, 1], [0, -0.95, 1, 0.06]] },
    cubicle: { label: 'Cubicle panel', hw: 1, hd: 0.08 },
    toilet: { label: 'Toilet', hw: 0.45, hd: 0.5 },
    sink: { label: 'Sink + mirror', hw: 1, hd: 0.4 },
    waterCooler: { label: 'Water cooler', hw: 0.4, hd: 0.4 },
    fountain: { label: 'Fountain', hw: 1.1, hd: 1.1 },
    aquarium: { label: 'Aquarium', hw: 1.3, hd: 0.55 },
    board: { label: 'Announcement board', wall: true },
    whiteboard: { label: 'Whiteboard (draw)', wall: true, draw: true },
    logo: { label: 'Logo plaque', wall: true },
    door: { label: 'Wall door (decor)', wall: true },
    doorway: { label: 'Door (walk-through)', hw: 0.9, hd: 0.15, pass: true },
    window: { label: 'Window', wall: true },
    screen: { label: 'Wall screen', wall: true },
    moneyboard: { label: 'Coin leaderboard (wall)', wall: true },
    clock: { label: 'Wall clock', wall: true },
    poster: { label: 'Poster', wall: true },
    frame: { label: 'Picture frame', wall: true },
    shelf: { label: 'Wall shelf', wall: true },
    lamp: { label: 'Wall lamp', wall: true },
    banner: { label: 'Party banner', wall: true },
    sign: { label: 'Sign (you write the text)', wall: true, text: true },
    neon: { label: 'Neon sign (you write the text)', wall: true, text: true },
  };
  var LIMITS = { minW: 8, maxW: 60, minH: 6, maxH: 40, maxObjects: 500 };

  function defaultLayout() {
    var w = 40, h = 28, g = [];
    for (var j = 0; j < h; j++) { g.push([]); for (var i = 0; i < w; i++) g[j].push('c'); }
    var fill = function (x0, y0, x1, y1, ch) { for (var j = y0; j <= y1; j++) for (var i = x0; i <= x1; i++) g[j][i] = ch; };
    fill(28, 1, 38, 9, 'u');   // meeting room carpet
    fill(16, 21, 24, 26, 'r'); // lounge carpet
    fill(2, 19, 10, 26, 'g');  // restroom tile
    fill(29, 19, 38, 26, 'w'); // pantry wood
    var o = function (id, type, x, z, rot, text, color) { var r = { id: id, type: type, x: x, z: z, rot: rot || 0 }; if (text) { r.text = text; r.color = color; } return r; };
    var objs = [
      // work area: two rows of desks
      o('d1', 'desk', 6, 6.5), o('d2', 'desk', 11, 6.5), o('d3', 'desk', 16, 6.5), o('d4', 'desk', 21, 6.5),
      o('d5', 'desk', 6, 12.5), o('d6', 'desk', 11, 12.5), o('d7', 'desk', 16, 12.5), o('d8', 'desk', 21, 12.5),
      // meeting room
      o('mt', 'meetingTable', 33, 5.5), o('ck', 'clock', 11, 0.5), o('mb', 'moneyboard', 0.5, 3, 1), o('sg1', 'sign', 29.5, 0.5, 0, 'MEETING ROOM', '#5d4fb3'), o('nn1', 'neon', 37.5, 0.5, 0, 'SAYBEARLAND', '#ff4fd8'), o('ps1', 'poster', 0.5, 6, 1), o('fr1', 'frame', 0.5, 11, 1), o('sh1', 'shelf', 0.5, 15, 1), o('sg2', 'sign', 0.5, 22, 1, 'RESTROOM', '#3ee6c4'), o('lp1', 'lamp', 5, 0.5), o('bn1', 'banner', 17, 27.5, 2), o('mc1', 'chair', 31.5, 3.88, 0), o('mc2', 'chair', 33, 3.88, 0), o('mc3', 'chair', 34.5, 3.88, 0), o('mc4', 'chair', 31.5, 7.12, 2), o('mc5', 'chair', 33, 7.12, 2), o('mc6', 'chair', 34.5, 7.12, 2), o('mc7', 'chair', 30.18, 5.5, 1), o('mc8', 'chair', 35.82, 5.5, 3), o('gl', 'glass', 33, 9.8), o('sc', 'screen', 33, 0.5), o('wb2', 'whiteboard', 39.5, 5.5, 3),
      // walls decor
      o('bd', 'board', 14, 0.5), o('lg', 'logo', 8, 0.5), o('dr', 'door', 22, 0.5), o('w1', 'window', 3, 0.5), o('w2', 'window', 18, 0.5), o('w3', 'window', 26, 0.5),
      o('wb1', 'whiteboard', 39.5, 14.5, 3),
      // restroom (dividers form the room, gap on the right is the doorway)
      o('r1', 'divider', 4, 18.6), o('r2', 'divider', 8, 18.6), o('r3', 'divider', 11.2, 20.4, 1), o('r4', 'divider', 11.2, 26, 1), o('dw1', 'doorway', 11.2, 23.2, 1),
      o('s1', 'stall', 3.5, 20.6), o('s2', 'stall', 6, 20.6), o('s3', 'stall', 8.5, 20.6),
      o('cb1', 'cubicle', 4.2, 23.2), o('cb2', 'cubicle', 8.2, 23.2), o('k1', 'sink', 4, 26.5, 2), o('k2', 'sink', 6.5, 26.5, 2),
      // pantry and water things
      o('wc1', 'waterCooler', 30.5, 20), o('wc2', 'waterCooler', 32, 20), o('ft', 'fountain', 34, 23.5), o('aq', 'aquarium', 20, 19.6),
      // lounge
      o('sf', 'sofa', 20, 24.6),
      // plants
      o('p1', 'plant', 1, 1), o('p2', 'plant', 39, 1), o('p3', 'plant', 1, 27), o('p4', 'plant', 39, 27), o('p5', 'plant', 14.5, 24), o('p6', 'plant', 25.5, 24), o('p7', 'plant', 27, 17), o('p8', 'plant', 13, 17),
    ];
    return { v: 1, w: w, h: h, floor: g.map(function (r) { return r.join(''); }), objects: objs };
  }

  function validate(l) {
    if (!l || typeof l !== 'object') return { error: 'Layout missing.' };
    var w = l.w, h = l.h;
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < LIMITS.minW || w > LIMITS.maxW || h < LIMITS.minH || h > LIMITS.maxH) return { error: 'Map must be ' + LIMITS.minW + 'x' + LIMITS.minH + ' to ' + LIMITS.maxW + 'x' + LIMITS.maxH + ' cells.' };
    if (!Array.isArray(l.floor) || l.floor.length !== h) return { error: 'Floor rows do not match the map height.' };
    var cells = 0;
    for (var j = 0; j < h; j++) {
      var r = l.floor[j];
      if (typeof r !== 'string' || r.length !== w) return { error: 'Floor row ' + (j + 1) + ' has the wrong width.' };
      for (var i = 0; i < w; i++) {
        var ch = r[i];
        if (ch === ' ') continue;
        if (!FLOORS[ch]) return { error: 'Unknown floor type "' + ch + '".' };
        cells++;
      }
    }
    if (cells < 20) return { error: 'The floor needs at least 20 cells.' };
    if (!Array.isArray(l.objects) || l.objects.length > LIMITS.maxObjects) return { error: 'Too many objects (max ' + LIMITS.maxObjects + ').' };
    var seen = {}, objs = [];
    for (var k = 0; k < l.objects.length; k++) {
      var ob = l.objects[k];
      if (!ob || !TYPES[ob.type]) return { error: 'Unknown object type.' };
      if (typeof ob.x !== 'number' || typeof ob.z !== 'number' || !isFinite(ob.x) || !isFinite(ob.z) || ob.x < 0 || ob.x > w || ob.z < 0 || ob.z > h) return { error: 'An object is outside the map.' };
      var id = String(ob.id || 'o' + k).slice(0, 16);
      if (seen[id]) id = id + '_' + k;
      seen[id] = 1;
      var rec = { id: id, type: ob.type, x: Math.round(ob.x * 100) / 100, z: Math.round(ob.z * 100) / 100, rot: ((ob.rot | 0) % 4 + 4) % 4 };
      if (TYPES[ob.type].text) {
        rec.text = String(ob.text == null ? '' : ob.text).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 40) || 'Sign';
        rec.color = /^#[0-9a-fA-F]{6}$/.test(ob.color) ? String(ob.color).toLowerCase() : '#6c5ce7';
      }
      objs.push(rec);
    }
    var out = { v: 1, w: w, h: h, floor: l.floor.slice(), objects: objs };
    objs.forEach(function (ob) { snapToWall(out, ob); });
    return { layout: out };
  }

  // Wall-mounted items (door, window, logo, boards, screens) always sit on the outer wall,
  // the edge between floor and empty space, and face into the room.
  function snapToWall(l, o) {
    var t = TYPES[o.type];
    if (!t || !t.wall) return o;
    var best = null;
    function cell(i, j) { return i >= 0 && j >= 0 && i < l.w && j < l.h && l.floor[j][i] !== ' '; }
    for (var j = 0; j < l.h; j++) for (var i = 0; i < l.w; i++) {
      if (!cell(i, j)) continue;
      var c = [[0, -1, 0], [-1, 0, 1], [0, 1, 2], [1, 0, 3]];
      for (var k = 0; k < 4; k++) {
        var d = c[k];
        if (cell(i + d[0], j + d[1])) continue;
        var x, z;
        if (d[1] !== 0) { x = Math.max(i + 0.5, Math.min(i + 0.5, o.x)); x = Math.max(i, Math.min(i + 1, o.x)); z = j + 0.5; }
        else { z = Math.max(j, Math.min(j + 1, o.z)); x = i + 0.5; }
        var dist = Math.hypot(x - o.x, z - o.z) + (d[1] !== 0 ? Math.abs(z - o.z) * 0 : 0);
        if (!best || dist < best.dist) best = { dist: dist, x: x, z: z, rot: d[2] };
      }
    }
    if (best) { o.x = Math.round(best.x * 2) / 2; o.z = best.z; o.rot = best.rot; }
    return o;
  }

  // A loose chair placed near a meeting table jumps to the table's edge and faces it,
  // so chairs line up around a table and a whole group can sit.
  function snapChair(l, o) {
    if (o.type !== 'chair') return o;
    var best = null;
    l.objects.forEach(function (t) {
      if (t.type !== 'meetingTable') return;
      var T = TYPES.meetingTable, odd = t.rot % 2 === 1, hw = odd ? T.hd : T.hw, hd = odd ? T.hw : T.hd;
      var dx = o.x - t.x, dz = o.z - t.z, ox = Math.abs(dx) - hw, oz = Math.abs(dz) - hd;
      var dist = Math.hypot(Math.max(ox, 0), Math.max(oz, 0));
      if (dist > 2.2) return;
      if (!best || dist < best.dist) best = { dist: dist, t: t, hw: hw, hd: hd, dx: dx, dz: dz, ox: ox, oz: oz };
    });
    if (!best) return o;
    var G = 0.62, t = best.t, r2 = function (v) { return Math.round(v * 2) / 2; };
    var cl = function (v, m) { return Math.max(-m, Math.min(m, v)); };
    if (best.oz >= best.ox) { o.x = t.x + cl(r2(best.dx), best.hw - 0.3); o.z = t.z + (best.dz >= 0 ? 1 : -1) * (best.hd + G); o.rot = best.dz >= 0 ? 2 : 0; }
    else { o.z = t.z + cl(r2(best.dz), best.hd - 0.3); o.x = t.x + (best.dx >= 0 ? 1 : -1) * (best.hw + G); o.rot = best.dx >= 0 ? 3 : 1; }
    return o;
  }

  // Chairs all the way round a meeting table (layout coordinates).
  function chairsAround(t, idPrefix) {
    var T = TYPES.meetingTable, odd = t.rot % 2 === 1, hw = odd ? T.hd : T.hw, hd = odd ? T.hw : T.hd, out = [], n = 0;
    function add(x, z) { out.push(snapChair({ objects: [t] }, { id: idPrefix + (n++), type: 'chair', x: x, z: z, rot: 0 })); }
    var per = Math.max(1, Math.floor((2 * hw) / 1.4));
    for (var i = 0; i < per; i++) {
      var off = (i - (per - 1) / 2) * 1.4;
      add(t.x + off, t.z - hd - 0.62); add(t.x + off, t.z + hd + 0.62);
    }
    add(t.x - hw - 0.62, t.z); add(t.x + hw + 0.62, t.z);
    return out;
  }

  // Sitting on a toilet: the sitter faces the way the toilet faces, camera and exit are in front.
  function toiletSeat(o, lz) {
    var th = o.rot * Math.PI / 2;
    return { x: o.x + Math.sin(th) * lz, z: o.z + Math.cos(th) * lz, face: th, theta: th };
  }

  // Seat for a loose chair: the sitter faces the way the chair faces.
  function chairSeat(o) {
    var th = o.rot * Math.PI / 2;
    return { x: o.x, z: o.z, face: th, theta: th + Math.PI };
  }

  function toWorld(l) {
    var ox = l.w / 2, oz = l.h / 2;
    var objects = l.objects.map(function (o) { return { id: o.id, type: o.type, rot: o.rot, x: o.x - ox, z: o.z - oz, text: o.text, color: o.color }; });
    var rects = [];
    objects.forEach(function (o) {
      var t = TYPES[o.type];
      if (t.wall || t.pass) return;
      var odd = o.rot % 2 === 1;
      if (t.parts) {
        var th = o.rot * Math.PI / 2, sn = Math.round(Math.sin(th)), cs = Math.round(Math.cos(th));
        t.parts.forEach(function (q) { rects.push({ x: o.x + q[0] * cs + q[1] * sn, z: o.z - q[0] * sn + q[1] * cs, hw: odd ? q[3] : q[2], hd: odd ? q[2] : q[3] }); });
        return;
      }
      rects.push({ x: o.x, z: o.z, hw: odd ? t.hd : t.hw, hd: odd ? t.hw : t.hd });
    });
    return { w: l.w, h: l.h, ox: ox, oz: oz, floor: l.floor, objects: objects, rects: rects };
  }

  function floorAt(lw, x, z) {
    var i = Math.floor(x + lw.ox), j = Math.floor(z + lw.oz);
    if (i < 0 || j < 0 || i >= lw.w || j >= lw.h) return ' ';
    return lw.floor[j][i];
  }

  var R = 0.35; // body radius
  function blocked(lw, x, z) {
    if (floorAt(lw, x - R, z - R) === ' ' || floorAt(lw, x + R, z - R) === ' ' || floorAt(lw, x - R, z + R) === ' ' || floorAt(lw, x + R, z + R) === ' ') return true;
    for (var i = 0; i < lw.rects.length; i++) {
      var r = lw.rects[i];
      if (Math.abs(x - r.x) < r.hw + R && Math.abs(z - r.z) < r.hd + R) return true;
    }
    return false;
  }

  // Where the desk's chair stands (world coords) and the way a sitter faces.
  function seatFor(o) {
    var th = o.rot * Math.PI / 2, c = Math.cos(th), s = Math.sin(th);
    var lx = -0.4, lz = 1.75; // local seat offset (centre of the chair cushion)
    return { x: o.x + lx * c + lz * s, z: o.z - lx * s + lz * c, face: th + Math.PI, theta: th };
  }

  function spawn(lw) {
    var best = null, bd = 1e9;
    for (var j = 0; j < lw.h; j++) for (var i = 0; i < lw.w; i++) {
      if (lw.floor[j][i] === ' ') continue;
      var x = i + 0.5 - lw.ox, z = j + 0.5 - lw.oz;
      if (blocked(lw, x, z)) continue;
      var d = x * x + z * z;
      if (d < bd) { bd = d; best = { x: x, z: z }; }
    }
    return best || { x: 0, z: 0 };
  }

  // True when a body at (x,z) has at least `m` of free room around it (keeps bots off walls).
  function clear(lw, x, z, m) {
    return !blocked(lw, x, z) && !blocked(lw, x + m, z) && !blocked(lw, x - m, z) && !blocked(lw, x, z + m) && !blocked(lw, x, z - m);
  }

  function randomSpot(lw, margin) {
    var m = margin || 0;
    for (var n = 0; n < 120; n++) {
      var x = (Math.random() * lw.w) - lw.ox, z = (Math.random() * lw.h) - lw.oz;
      if (m ? clear(lw, x, z, m) : !blocked(lw, x, z)) return { x: x, z: z };
    }
    return m ? randomSpot(lw, 0) : spawn(lw);
  }

  // Where new arrivals appear: just inside the wall door (the entrance), facing the room.
  function entrance(lw) {
    for (var k = 0; k < lw.objects.length; k++) {
      var o = lw.objects[k];
      if (o.type !== 'door') continue;
      var th = o.rot * Math.PI / 2, sn = Math.sin(th), cs = Math.cos(th);
      for (var d = 1.5; d <= 3.5; d += 0.5) {
        var x = o.x + sn * d, z = o.z + cs * d;
        if (clear(lw, x, z, 0.3)) return { x: x, z: z, r: th, lx: cs, lz: -sn };
      }
    }
    return null;
  }

  // A bot's fixed post next to a piece of furniture (layout coordinates). Desks seat the bot.
  function postFor(o) {
    var st = seatFor(o);
    return { x: Math.round(st.x * 100) / 100, z: Math.round(st.z * 100) / 100, r: Math.round(st.face * 100) / 100, seat: o.type === 'desk' };
  }

  return { FLOORS: FLOORS, TYPES: TYPES, LIMITS: LIMITS, defaultLayout: defaultLayout, validate: validate, snapToWall: snapToWall, snapChair: snapChair, chairsAround: chairsAround, chairSeat: chairSeat, toiletSeat: toiletSeat, toWorld: toWorld, floorAt: floorAt, blocked: blocked, seatFor: seatFor, spawn: spawn, randomSpot: randomSpot, postFor: postFor, entrance: entrance, clear: clear };
});
