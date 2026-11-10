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
    glass: { label: 'Glass wall', hw: 3.8, hd: 0.1, pass: true },
    divider: { label: 'Room divider', hw: 2, hd: 0.15 },
    stall: { label: 'Toilet stall', hw: 1, hd: 1 },
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
    var o = function (id, type, x, z, rot) { return { id: id, type: type, x: x, z: z, rot: rot || 0 }; };
    var objs = [
      // work area: two rows of desks
      o('d1', 'desk', 6, 6.5), o('d2', 'desk', 11, 6.5), o('d3', 'desk', 16, 6.5), o('d4', 'desk', 21, 6.5),
      o('d5', 'desk', 6, 12.5), o('d6', 'desk', 11, 12.5), o('d7', 'desk', 16, 12.5), o('d8', 'desk', 21, 12.5),
      // meeting room
      o('mt', 'meetingTable', 33, 5.5), o('gl', 'glass', 33, 9.8), o('sc', 'screen', 33, 0.5), o('wb2', 'whiteboard', 39.5, 5.5, 3),
      // walls decor
      o('bd', 'board', 14, 0.5), o('lg', 'logo', 8, 0.5), o('dr', 'door', 22, 0.5), o('w1', 'window', 3, 0.5), o('w2', 'window', 18, 0.5), o('w3', 'window', 26, 0.5),
      o('wb1', 'whiteboard', 39.5, 14.5, 3),
      // restroom (dividers form the room, gap on the right is the doorway)
      o('r1', 'divider', 4, 18.6), o('r2', 'divider', 8, 18.6), o('r3', 'divider', 11.2, 20.4, 1), o('r4', 'divider', 11.2, 26, 1), o('dw1', 'doorway', 11.2, 23.2, 1),
      o('s1', 'stall', 3.5, 20.6), o('s2', 'stall', 6, 20.6), o('s3', 'stall', 8.5, 20.6),
      o('k1', 'sink', 4, 26.5, 2), o('k2', 'sink', 6.5, 26.5, 2),
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
      objs.push({ id: id, type: ob.type, x: Math.round(ob.x * 100) / 100, z: Math.round(ob.z * 100) / 100, rot: ((ob.rot | 0) % 4 + 4) % 4 });
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

  function toWorld(l) {
    var ox = l.w / 2, oz = l.h / 2;
    var objects = l.objects.map(function (o) { return { id: o.id, type: o.type, rot: o.rot, x: o.x - ox, z: o.z - oz }; });
    var rects = [];
    objects.forEach(function (o) {
      var t = TYPES[o.type];
      if (t.wall || t.pass) return;
      var odd = o.rot % 2 === 1;
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
    var lx = -0.4, lz = 1.15; // local seat offset
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

  function randomSpot(lw) {
    for (var n = 0; n < 60; n++) {
      var x = (Math.random() * lw.w) - lw.ox, z = (Math.random() * lw.h) - lw.oz;
      if (!blocked(lw, x, z)) return { x: x, z: z };
    }
    return spawn(lw);
  }

  return { FLOORS: FLOORS, TYPES: TYPES, LIMITS: LIMITS, defaultLayout: defaultLayout, validate: validate, snapToWall: snapToWall, toWorld: toWorld, floorAt: floorAt, blocked: blocked, seatFor: seatFor, spawn: spawn, randomSpot: randomSpot };
});
