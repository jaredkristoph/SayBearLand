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
    board: { label: 'Announcement board', wall: true },
    logo: { label: 'Logo plaque', wall: true },
    door: { label: 'Door', wall: true },
    window: { label: 'Window', wall: true },
    screen: { label: 'Wall screen', wall: true },
  };
  var LIMITS = { minW: 8, maxW: 40, minH: 6, maxH: 30, maxObjects: 300 };

  function defaultLayout() {
    var w = 24, h = 16, rows = [];
    for (var j = 0; j < h; j++) {
      var row = '';
      for (var i = 0; i < w; i++) {
        var c = 'c';
        if (i >= 16 && i <= 23 && j >= 1 && j <= 7) c = 'u';
        if (i >= 9 && i <= 14 && j >= 12 && j <= 14) c = 'r';
        row += c;
      }
      rows.push(row);
    }
    var o = function (id, type, x, z, rot) { return { id: id, type: type, x: x, z: z, rot: rot || 0 }; };
    return {
      v: 1, w: w, h: h, floor: rows,
      objects: [
        o('d1', 'desk', 4, 4.5), o('d2', 'desk', 8.5, 4.5), o('d3', 'desk', 4, 9), o('d4', 'desk', 8.5, 9),
        o('mt', 'meetingTable', 20, 4.4), o('gl', 'glass', 20, 7.6), o('sc', 'screen', 20, 0.5),
        o('sf', 'sofa', 12, 14.2),
        o('p1', 'plant', 1, 1), o('p2', 'plant', 23, 1), o('p3', 'plant', 1, 15), o('p4', 'plant', 23, 15),
        o('p5', 'plant', 6.5, 14.4), o('p6', 'plant', 17.5, 14.4),
        o('bd', 'board', 12, 0.5), o('lg', 'logo', 5.5, 0.5), o('dr', 'door', 16.8, 0.5),
        o('w1', 'window', 2.5, 0.5), o('w2', 'window', 21.5, 0.5),
      ],
    };
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
    return { layout: { v: 1, w: w, h: h, floor: l.floor.slice(), objects: objs } };
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

  return { FLOORS: FLOORS, TYPES: TYPES, LIMITS: LIMITS, defaultLayout: defaultLayout, validate: validate, toWorld: toWorld, floorAt: floorAt, blocked: blocked, seatFor: seatFor, spawn: spawn, randomSpot: randomSpot };
});
