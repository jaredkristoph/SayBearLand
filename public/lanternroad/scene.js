/* Lanternroad scene v2 (HD-2D): real 3D world (textured cobble road, grass, modelled trees, rocks, water,
   sun shadows) with lit pixel-sprite characters standing in it, a high camera looking down,
   one real lantern light, bloom, tilt-shift blur, fog and particles. */
(function (root) {
  'use strict';
  var T = THREE, LR = root.LR, ART = root.ART, LRS = {};
  var PXH = .04, LOOP = 80, BASE0 = -40, UPL = 36, LEAN = .3;
  var R, cvs, fx, fxc, W = 1, H = 1, XS = 1, mode = 'road', camDist = 17, lowPower = false;
  var rt, postScene, postCam, postMat, cam, sc, camp, ccam, texCache = new Map();
  var dist = 0, lastLeague = null, tNow = 0, fl = [], flash = 0, fade = 0, fadeTarget = 0, ringT = 0, campDX = 0;

  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function tex(cv, o) {
    o = o || {}; if (texCache.has(cv)) return texCache.get(cv);
    var t = new T.CanvasTexture(cv); t.encoding = o.linear ? T.LinearEncoding : T.sRGBEncoding;
    if (o.smooth) { t.magFilter = T.LinearFilter; t.minFilter = o.mip ? T.LinearMipmapLinearFilter : T.LinearFilter; t.generateMipmaps = !!o.mip; if (o.mip && R) t.anisotropy = Math.min(8, R.capabilities.getMaxAnisotropy()); }
    else { t.magFilter = t.minFilter = T.NearestFilter; t.generateMipmaps = false; }
    if (o.wrap) t.wrapS = t.wrapT = T.RepeatWrapping; texCache.set(cv, t); return t;
  }
  var geoCache = {};
  function planeGeo(w, h) { var k = w.toFixed(3) + 'x' + h.toFixed(3); if (!geoCache[k]) { var g = new T.PlaneGeometry(w, h); g.translate(0, h / 2, 0); geoCache[k] = g; } return geoCache[k]; }
  function sprite(cv, mul, lit) {
    var w = cv.width * PXH * (mul || 1), h = cv.height * PXH * (mul || 1), M = lit === false ? T.MeshBasicMaterial : T.MeshLambertMaterial;
    var m = new T.Mesh(planeGeo(w, h), new M({ map: tex(cv), transparent: true, alphaTest: .45, side: T.DoubleSide }));
    m.userData.w = w; m.userData.h = h; return m;
  }
  function radial(size, stops) { var c = document.createElement('canvas'); c.width = c.height = size; var x = c.getContext('2d'), g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); stops.forEach(function (s) { g.addColorStop(s[0], s[1]); }); x.fillStyle = g; x.fillRect(0, 0, size, size); return c; }
  var shGeo, shMat;
  function blob(w) { if (!shGeo) { shGeo = new T.CircleGeometry(1, 20); shGeo.rotateX(-Math.PI / 2); shMat = new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .32, depthWrite: false }); } var m = new T.Mesh(shGeo, shMat); m.scale.set(w * .36, 1, w * .17); m.position.y = .05; m.renderOrder = 1; return m; }

  /* ---------------- geometry builder: merges shaped parts into one vertex-coloured mesh ---------------- */
  function h3(x, y, z) { var s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
  function vn(x, y, z) {
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx_ = x - xi, fy = y - yi, fz = z - zi; fx_ = fx_ * fx_ * (3 - 2 * fx_); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    function L(a, b, t) { return a + (b - a) * t; }
    return L(L(L(h3(xi, yi, zi), h3(xi + 1, yi, zi), fx_), L(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), fx_), fy), L(L(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), fx_), L(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), fx_), fy), fz);
  }
  function weld(g) {
    var pos = g.attributes.position, map = {}, np = [], idx = [];
    for (var i = 0; i < pos.count; i++) { var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), k = Math.round(x * 1e3) + ',' + Math.round(y * 1e3) + ',' + Math.round(z * 1e3); if (map[k] === undefined) { map[k] = np.length / 3; np.push(x, y, z); } idx.push(map[k]); }
    var ng = new T.BufferGeometry(); ng.setAttribute('position', new T.Float32BufferAttribute(np, 3)); ng.setIndex(idx); return ng;
  }
  function Builder() { this.p = []; this.n = []; this.c = []; this.i = []; this.k = 0; }
  var col1 = new T.Color(), col2 = new T.Color(), colT = new T.Color(), v3 = new T.Vector3(), n3 = new T.Vector3(), q4 = new T.Quaternion(), eu = new T.Euler(), m4 = new T.Matrix4(), nm = new T.Matrix3();
  Builder.prototype.add = function (geo, o) {
    var g = geo.index ? geo.clone() : weld(geo); o = o || {};
    var P = g.attributes.position, sd = o.seed || 0, f = o.freq || 1.3, i;
    if (o.disp) for (i = 0; i < P.count; i++) { v3.set(P.getX(i), P.getY(i), P.getZ(i)); var len = v3.length() || 1, a = (vn(v3.x * f + sd, v3.y * f + sd, v3.z * f + sd) - .5) * 2 * o.disp; v3.multiplyScalar(1 + a / len); P.setXYZ(i, v3.x, v3.y, v3.z); }
    if (o.fn) for (i = 0; i < P.count; i++) { v3.set(P.getX(i), P.getY(i), P.getZ(i)); o.fn(v3); P.setXYZ(i, v3.x, v3.y, v3.z); }
    g.computeVertexNormals();
    var pos = o.pos || [0, 0, 0], rot = o.rot || [0, 0, 0], scl = o.scl || [1, 1, 1];
    m4.compose(new T.Vector3(pos[0], pos[1], pos[2]), q4.setFromEuler(eu.set(rot[0], rot[1], rot[2])), new T.Vector3(scl[0], scl[1], scl[2])); nm.getNormalMatrix(m4);
    g.computeBoundingBox(); var bb = g.boundingBox, hh = (bb.max.y - bb.min.y) || 1, hw = o.hw == null ? .5 : o.hw;
    col1.set(o.c1 == null ? 0x808080 : o.c1); col2.set(o.c2 == null ? (o.c1 == null ? 0xb0b0b0 : o.c1) : o.c2); var jit = 1 + ((h3(pos[0], pos[1], pos[2] + sd) - .5) * (o.jit == null ? .16 : o.jit));
    var N = g.attributes.normal, off = this.k;
    for (i = 0; i < P.count; i++) {
      v3.set(P.getX(i), P.getY(i), P.getZ(i)); var ly = (v3.y - bb.min.y) / hh; v3.applyMatrix4(m4); n3.set(N.getX(i), N.getY(i), N.getZ(i)).applyMatrix3(nm).normalize();
      var t = Math.max(0, Math.min(1, ly * hw + (n3.y * .5 + .5) * (1 - hw) + (vn(v3.x * 3, v3.y * 3, v3.z * 3) - .5) * .18));
      var r = (col1.r + (col2.r - col1.r) * t) * jit, gg = (col1.g + (col2.g - col1.g) * t) * jit, b = (col1.b + (col2.b - col1.b) * t) * jit;
      if (o.top && n3.y > o.topT) { var k2 = Math.min(1, (n3.y - o.topT) / (1 - o.topT) * 2.2); colT.set(o.top); r += (colT.r - r) * k2; gg += (colT.g - gg) * k2; b += (colT.b - b) * k2; }
      this.p.push(v3.x, v3.y, v3.z); this.n.push(n3.x, n3.y, n3.z); this.c.push(r, gg, b); this.k++;
    }
    var I = g.index; for (i = 0; i < I.count; i++) this.i.push(I.getX(i) + off);
    return this;
  };
  Builder.prototype.mesh = function (mat) {
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3)); g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3)); g.setIndex(this.i);
    var m = new T.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
  };
  function rnd(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var ico = function (r, d) { return new T.IcosahedronGeometry(r, d == null ? 2 : d); };

  /* ---------------- scenery pieces ---------------- */
  function tree_oak(B, x, z, s, r) {
    var h = 3.4 * s; B.add(new T.CylinderGeometry(.3 * s, .55 * s, h, 9, 5), { pos: [x, h / 2, z], c1: 0x4a3020, c2: 0x7a5a3c, disp: .06, fn: function (v) { v.x += Math.sin(v.y * 1.3) * .12 * s; } });
    for (var k = 0; k < 5; k++) { var a = k / 5 * 6.28 + r() * .6; B.add(new T.CylinderGeometry(.06 * s, .16 * s, 1.6 * s, 5), { pos: [x + Math.cos(a) * .5 * s, h * .78 + .2, z + Math.sin(a) * .5 * s], rot: [Math.sin(a) * .9, 0, -Math.cos(a) * .9], c1: 0x4a3020, c2: 0x6a4a30 }); }
    var G = [0x34802c, 0x44962f, 0x5eb03c], n = 7;
    for (var i = 0; i < n; i++) { var aa = i / n * 6.28 + r(), rr = i === 0 ? 0 : 1.5 * s, yy = h + .6 * s + (i === 0 ? 1.1 : (r() * 1.2)) * s; B.add(ico((1.3 + r() * .5) * s), { pos: [x + Math.cos(aa) * rr, yy, z + Math.sin(aa) * rr], scl: [1.15, .92, 1.15], c1: 0x1f5a22, c2: G[(i + 1) % 3], disp: .38 * s, freq: 1.1, seed: i * 7, hw: .65, jit: .2 }); }
  }
  function tree_pine(B, x, z, s, r, snow) {
    B.add(new T.CylinderGeometry(.18 * s, .4 * s, 2.4 * s, 7), { pos: [x, 1.2 * s, z], c1: 0x3a2a1c, c2: 0x5a4430 });
    for (var i = 0; i < 6; i++) { var y = 1.8 * s + i * 1.15 * s, rad = (2.3 - i * .32) * s; B.add(new T.ConeGeometry(rad, 2.2 * s, 11, 3), { pos: [x, y + 1.1 * s, z], c1: 0x143e2c, c2: i % 2 ? 0x2a7a50 : 0x1f6644, disp: .22 * s, seed: i * 3, freq: 1.4, hw: .35, top: snow ? 0xf2f6fa : null, topT: .45, jit: .2 }); }
  }
  function tree_dead(B, x, z, s, r) {
    var pts = [], i; for (i = 0; i < 6; i++) pts.push(new T.Vector3(x + Math.sin(i * 1.4) * .5 * s, i * 1.1 * s, z + Math.cos(i * 1.1) * .4 * s));
    B.add(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 16, .3 * s, 7, false), { c1: 0x3a342c, c2: 0x6a6252, disp: .05, hw: .7 });
    for (var k = 0; k < 4; k++) { var a = k * 1.7 + r(), y0 = (2.6 + k * .8) * s, bp = [new T.Vector3(x, y0, z), new T.Vector3(x + Math.cos(a) * 1.1 * s, y0 + .8 * s, z + Math.sin(a) * 1.1 * s), new T.Vector3(x + Math.cos(a) * 2 * s, y0 + 1.1 * s, z + Math.sin(a) * 2 * s)]; B.add(new T.TubeGeometry(new T.CatmullRomCurve3(bp), 8, .09 * s, 5, false), { c1: 0x3a342c, c2: 0x5a5242 }); for (var m = 0; m < 4; m++) B.add(new T.ConeGeometry(.05 * s, 1.6 * s, 4), { pos: [bp[2].x + (m - 1.5) * .18, bp[2].y - .8 * s, bp[2].z + (r() - .5) * .3], rot: [Math.PI, 0, 0], c1: 0x4a6a3a, c2: 0x8aaa5a, hw: .9 }); }
    B.add(ico(1.1 * s, 2), { pos: [x, 5.2 * s, z], scl: [1.5, .5, 1.3], c1: 0x2a4a2a, c2: 0x5a8a40, disp: .3, hw: .7 });
  }
  function rock(B, x, z, s, r, o) {
    o = o || {}; B.add(ico(1, 2), { pos: [x, .3 * s, z], rot: [r() * 3, r() * 3, r() * 3], scl: [s * (1 + r() * .5), s * (.55 + r() * .4), s * (.9 + r() * .5)], c1: o.c1 || 0x4e4e58, c2: o.c2 || 0x8a8a96, disp: .3, freq: 1.7, seed: r() * 50, top: o.top, topT: .5, hw: .5 });
  }
  function bush(B, x, z, s, r, c1, c2, flowers) {
    for (var i = 0; i < 3; i++) B.add(ico(.7 * s, 2), { pos: [x + (i - 1) * .6 * s, .45 * s + r() * .2, z + (r() - .5) * .5 * s], scl: [1.1, .85, 1], c1: c1, c2: c2, disp: .22 * s, seed: r() * 30, hw: .7 });
    if (flowers) for (var f = 0; f < 6; f++) B.add(ico(.09, 0), { pos: [x + (r() - .5) * 1.6 * s, .6 * s + r() * .5, z + (r() - .5) * .8 * s + .3], c1: flowers[f % flowers.length], c2: flowers[f % flowers.length], jit: 0 });
  }
  function column(B, x, z, s, r, broken) {
    var h = (broken ? 2.2 + r() * 2 : 5.2) * s, tw = function (v) { var a = Math.atan2(v.z, v.x), rad = Math.hypot(v.x, v.z), k = 1 + .06 * Math.sin(a * 12); v.x = Math.cos(a) * rad * k; v.z = Math.sin(a) * rad * k; };
    B.add(new T.BoxGeometry(1.5 * s, .35 * s, 1.5 * s), { pos: [x, .17 * s, z], c1: 0x6a6478, c2: 0x9a94a8, jit: .1 });
    B.add(new T.CylinderGeometry(.5 * s, .56 * s, h, 16, 4), { pos: [x, .35 * s + h / 2, z], c1: 0x7a748a, c2: 0xb0aabe, fn: tw, disp: broken ? .1 : .03, hw: .4 });
    if (!broken) B.add(new T.BoxGeometry(1.4 * s, .4 * s, 1.4 * s), { pos: [x, h + .55 * s, z], c1: 0x8a849a, c2: 0xb8b2c6 });
    else { B.add(ico(.7 * s, 1), { pos: [x, .35 * s + h, z], scl: [1, .35, 1], c1: 0x7a748a, c2: 0xaaa4b8, disp: .2 }); for (var i = 0; i < 3; i++) B.add(new T.BoxGeometry(.5 * s, .35 * s, .45 * s), { pos: [x + (r() - .5) * 2.4, .18, z + (r() - .5) * 2], rot: [r(), r() * 3, r()], c1: 0x6a6478, c2: 0x9a94a8 }); }
    B.add(ico(.45 * s, 1), { pos: [x + .3 * s, .9 * s, z + .4 * s], scl: [1, 1.5, 1], c1: 0x2a5a2a, c2: 0x5a8a40, disp: .15 });
  }
  function spire(B, x, z, s, r, snow) { B.add(new T.DodecahedronGeometry(1, 1), { pos: [x, 1.7 * s, z], scl: [1.1 * s, 2.6 * s, 1.1 * s], rot: [0, r() * 3, .04], c1: 0x4a5266, c2: 0x8a94aa, disp: .22, freq: 1.5, seed: r() * 40, top: snow ? 0xf4f8fc : null, topT: .35, hw: .6 }); }
  function charred(B, x, z, s, r) { var h = (3 + r() * 3) * s; B.add(new T.CylinderGeometry(.18 * s, .5 * s, h, 7, 4), { pos: [x, h / 2, z], c1: 0x141014, c2: 0x3a2c30, disp: .1, fn: function (v) { v.x += Math.sin(v.y * 2.1) * .15; } }); for (var k = 0; k < 3; k++) { var a = r() * 6.28; B.add(new T.CylinderGeometry(.04 * s, .12 * s, 1.8 * s, 5), { pos: [x + Math.cos(a) * .4, h * .7, z + Math.sin(a) * .4], rot: [Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1], c1: 0x141014, c2: 0x2a2024 }); } }

  var BIO = {
    meadow: { rockC: [0x58585a, 0x908f86], moss: 0x4a8a3a, bush: [0x2a6a28, 0x58a83c, [0xffe14a, 0xffffff, 0xff8aa8]], water: 0x3aa6b8 },
    pine: { rockC: [0x4a4e54, 0x8a9096], moss: 0x3a6a4a, bush: [0x1f4c38, 0x3c7a58, null], water: 0x3a86a0 },
    marsh: { rockC: [0x3e4238, 0x6a7058], moss: 0x4a6a3a, bush: [0x2e4a2e, 0x6a8a4a, null], water: 0x3a5a46 },
    pass: { rockC: [0x4a5266, 0x8a94aa], moss: 0xf0f4f8, bush: [0x6a7a8a, 0xb0bccc, null], water: 0x9ac8e8 },
    ruins: { rockC: [0x5a5868, 0x8e8c9e], moss: 0x4a6a3a, bush: [0x2a4a2a, 0x5a7a40, null], water: 0x4a6a78 },
    ash: { rockC: [0x161216, 0x3a2c30], moss: null, bush: [0x1a1414, 0x3a2c2c, null], water: 0xff6a20 }
  };
  function buildScenery(id) {
    var B = new Builder(), r = rnd(hash('sc' + id)), D = BIO[id] || BIO.meadow, i, g = new T.Group(), x, z;
    var path = function () { return LOOP * r(); };
    var colF = function (b, xx, zz, ss, rr) { column(b, xx, zz, ss, rr, rr() < .5); };
    for (i = 0; i < 34; i++) { x = path(); z = -(7 + r() * 26); var s = .85 + r() * .7;
      if (id === 'meadow') tree_oak(B, x, z, s * 1.1, r); else if (id === 'pine') tree_pine(B, x, z, s * 1.1, r, false); else if (id === 'marsh') (i % 3 ? tree_dead : tree_oak)(B, x, z, s, r);
      else if (id === 'pass') { if (i % 3) spire(B, x, z, s * 1.4, r, true); else tree_pine(B, x, z, s, r, true); } else if (id === 'ruins') (i % 2 ? tree_oak : colF)(B, x, z, s, r); else charred(B, x, z, s * 1.2, r); }
    for (i = 0; i < 16; i++) { x = path(); z = -(4.8 + r() * 3.2); var s2 = .7 + r() * .5;
      if (id === 'meadow') tree_oak(B, x, z, s2, r); else if (id === 'pine') tree_pine(B, x, z, s2, r, false); else if (id === 'marsh') tree_dead(B, x, z, s2, r); else if (id === 'pass') tree_pine(B, x, z, s2, r, true); else if (id === 'ruins') column(B, x, z, s2, r, r() < .6); else charred(B, x, z, s2, r); }
    var rc = D.rockC; for (i = 0; i < 30; i++) { x = path(); z = (r() < .5 ? -1 : 1) * (3.8 + r() * 6); if (z > 0) z *= .8; rock(B, x, z, .35 + r() * .9, r, { c1: rc[0], c2: rc[1], top: D.moss }); }
    var bc = D.bush; for (i = 0; i < 26; i++) { x = path(); z = (r() < .55 ? -1 : 1) * (3.6 + r() * 5.5); if (z > 7) z = 7; bush(B, x, z, .8 + r() * .8, r, bc[0], bc[1], bc[2]); }
    for (i = 0; i < 90; i++) { x = (i + r() * .6) * LOOP / 90; var side = i % 2 ? -1 : 1; B.add(ico(1, 1), { pos: [x, .08, side * (2.95 + r() * .35)], scl: [.3 + r() * .35, .22, .26 + r() * .2], rot: [0, r() * 3, 0], c1: rc[0] + 0x101010, c2: rc[1], disp: .1, seed: i }); }
    if (id === 'meadow' || id === 'pine') for (i = 0; i < 10; i++) { x = i * LOOP / 10 + r() * 3; for (var k = 0; k < 3; k++) { B.add(new T.BoxGeometry(.18, 1.1, .18), { pos: [x + k * 1.6, .55, -3.9], c1: 0x4a3626, c2: 0x7a5a3a }); if (k < 2) { B.add(new T.BoxGeometry(1.6, .12, .1), { pos: [x + k * 1.6 + .8, .85, -3.9], c1: 0x5a4430, c2: 0x8a6a46 }); B.add(new T.BoxGeometry(1.6, .12, .1), { pos: [x + k * 1.6 + .8, .5, -3.9], c1: 0x5a4430, c2: 0x8a6a46 }); } } }
    g.add(B.mesh(new T.MeshStandardMaterial({ vertexColors: true, roughness: .92, metalness: 0 })));
    var tp = [], tn = [], tu = [], tc = [], ti = [], G = id === 'ash' ? 0x3a2a2a : id === 'pass' ? 0xcfd8e4 : id === 'ruins' ? 0x6a8a50 : id === 'marsh' ? 0x587a48 : id === 'pine' ? 0x3c8060 : 0x4a9a3a, gc = new T.Color(G), kk = 0;
    for (i = 0; i < (id === 'ash' ? 120 : 900); i++) {
      x = path(); z = -14 + r() * 24; if (Math.abs(z) < 2.8) continue; var ww = .45 + r() * .45, hh = ww * (.8 + r() * .5), a = r() * 3.14, c = gc.clone().multiplyScalar(.75 + r() * .5);
      for (var q = 0; q < 2; q++) { var aa = a + q * 1.57, dx = Math.cos(aa) * ww / 2, dz = Math.sin(aa) * ww / 2;
        tp.push(x - dx, 0, z - dz, x + dx, 0, z + dz, x + dx, hh, z + dz, x - dx, hh, z - dz); for (var v = 0; v < 4; v++) { tn.push(0, 1, 0); tc.push(c.r, c.g, c.b); } tu.push(0, 0, 1, 0, 1, 1, 0, 1); ti.push(kk, kk + 1, kk + 2, kk, kk + 2, kk + 3); kk += 4; }
    }
    var tg = new T.BufferGeometry(); tg.setAttribute('position', new T.Float32BufferAttribute(tp, 3)); tg.setAttribute('normal', new T.Float32BufferAttribute(tn, 3)); tg.setAttribute('uv', new T.Float32BufferAttribute(tu, 2)); tg.setAttribute('color', new T.Float32BufferAttribute(tc, 3)); tg.setIndex(ti);
    g.add(new T.Mesh(tg, new T.MeshLambertMaterial({ map: tex(ART.tx.grassTuft('#ffffff'), { smooth: true, mip: true }), vertexColors: true, alphaTest: .45, side: T.DoubleSide })));
    g.position.x = BASE0; return g;
  }

  /* ---------------- init ---------------- */
  LRS.init = function (canvas, fxCanvas) {
    try {
      cvs = canvas; fx = fxCanvas; fxc = fx.getContext('2d');
      R = new T.WebGLRenderer({ canvas: cvs, antialias: false, alpha: false, powerPreference: 'high-performance' });
      R.outputEncoding = T.sRGBEncoding; R.setClearColor(0x101020, 1); R.shadowMap.enabled = true; R.shadowMap.type = T.PCFSoftShadowMap;
      lowPower = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    } catch (e) { return false; }
    cam = new T.PerspectiveCamera(32, 1.6, .5, 400); sc = new T.Scene(); buildRoad();
    postScene = new T.Scene(); postCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    postMat = new T.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, px: { value: new T.Vector2(1, 1) }, uBloom: { value: 1 }, uBlur: { value: 1 }, uFocus: { value: .5 }, uVig: { value: 1.05 }, uFlash: { value: 0 }, uNight: { value: 0 }, uFade: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
      fragmentShader: [
        'uniform sampler2D tDiffuse; uniform vec2 px; uniform float uBloom,uBlur,uFocus,uVig,uFlash,uNight,uFade; varying vec2 vUv;',
        'vec3 S(vec2 u){ return texture2D(tDiffuse,u).rgb; }',
        'void main(){',
        '  float d=abs(vUv.y-uFocus); float amt=smoothstep(.2,.62,d)*uBlur;',
        '  vec3 c=S(vUv);',
        '  if(amt>.03){ vec3 a=c; for(int i=0;i<8;i++){ float fi=float(i)+1.; float r=sqrt(fi/8.)*amt*6.; a+=S(vUv+vec2(cos(fi*2.39996),sin(fi*2.39996))*r*px); } c=a/9.; }',
        '  vec3 b=vec3(0.);',
        '  for(int i=0;i<12;i++){ float fi=float(i)+1.; float r=2.+fi*1.9; vec3 t=S(vUv+vec2(cos(fi*2.4),sin(fi*2.4))*r*px); b+=max(t-vec3(.8),vec3(0.))*(1.-fi/14.); }',
        '  c+=b*uBloom*.2;',
        '  float l=dot(c,vec3(.3,.59,.11)); c=mix(vec3(l),c,1.12); c=(c-.5)*1.05+.5+.02;',
        '  c+=vec3(1.,.95,.8)*uFlash*.35;',
        '  vec2 q=vUv-.5; c*=1.-dot(q,q)*uVig;',
        '  c=pow(max(c,vec3(0.)),vec3(1./2.2));',
        '  c=mix(c,vec3(0.),uFade);',
        '  gl_FragColor=vec4(c,1.);',
        '}'].join('\n'), depthTest: false, depthWrite: false
    });
    var quad = new T.Mesh(new T.PlaneGeometry(2, 2), postMat); quad.frustumCulled = false; postScene.add(quad);
    return true;
  };
  LRS.resize = function (w, h) {
    W = Math.max(2, w); H = Math.max(2, h);
    var dpr = Math.min(window.devicePixelRatio || 1, 1.75), cap = (lowPower ? 1.1e6 : 1.7e6) / (W * H); dpr = Math.min(dpr, Math.sqrt(Math.max(.5, cap)));
    R.setPixelRatio(dpr); R.setSize(W, H, false);
    fx.width = Math.round(W * Math.min(2, window.devicePixelRatio || 1)); fx.height = Math.round(H * Math.min(2, window.devicePixelRatio || 1));
    var pw = Math.round(W * dpr), ph = Math.round(H * dpr); if (rt) rt.dispose();
    rt = new T.WebGLRenderTarget(pw, ph, { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, depthBuffer: true, stencilBuffer: false });
    postMat.uniforms.px.value.set(1 / pw, 1 / ph); postMat.uniforms.tDiffuse.value = rt.texture;
    var asp = W / H; XS = Math.max(.62, Math.min(1, asp / 1.5)); cam.aspect = asp; camDist = Math.max(21, 18 * XS / (2 * Math.tan(16 * Math.PI / 180) * asp)); cam.updateProjectionMatrix();
    if (ccam) { ccam.aspect = asp; ccam.updateProjectionMatrix(); }
  };

  /* ---------------- road scene ---------------- */
  var ground, pathM, edgeM, skyM, skyCv, skyTex, starPts, sunM, moonM, clouds = [], lamp, hemi, sunL, glowM, ringM, scenA, scenB, water, waterMat;
  var wagonG, lantM, wheels = [], stones = [], gateA, gateB, heroObj = {}, foeObj = {}, curBiome = null, lastFight = null, slashes = [];
  var fall, fallV, floatP, floatV, fallKind = null, floatKind = null;

  function buildWagon() {
    var B = new Builder();
    B.add(new T.BoxGeometry(4.2, 1.2, 2), { pos: [0, 1.5, 0], c1: 0x4a3020, c2: 0x8a6240, jit: .08 });
    B.add(new T.BoxGeometry(4.4, .16, 2.2), { pos: [0, .9, 0], c1: 0x3a2618, c2: 0x5a3e28 });
    B.add(new T.CylinderGeometry(1.25, 1.25, 4.4, 14, 1, true, 0, Math.PI), { pos: [0, 2.1, 0], rot: [0, 0, Math.PI / 2], c1: 0xb8a67c, c2: 0xefe2bc, hw: .3, jit: .05 });
    B.add(new T.BoxGeometry(.12, 1.8, 2), { pos: [-2.15, 2.2, 0], c1: 0x4a3020, c2: 0x6a4a30 }); B.add(new T.BoxGeometry(.2, 2.4, .2), { pos: [2.6, 1.2, .95], c1: 0x3a2618, c2: 0x5a3e28 });
    B.add(new T.CylinderGeometry(.06, .06, 3.8, 6), { pos: [2.65, 2.9, .95], c1: 0x3a2618, c2: 0x5a3e28 }); B.add(new T.BoxGeometry(1.2, .08, .08), { pos: [2.1, 4.75, .95], c1: 0x3a2618, c2: 0x5a3e28 });
    for (var s = -1; s <= 1; s += 2) B.add(new T.BoxGeometry(.9, .8, .6), { pos: [s * 1.1, 2.5, 1.05], c1: 0x6a4a2a, c2: 0x9a7a4a });
    B.add(new T.BoxGeometry(.7, .6, .7), { pos: [-.4, 2.45, -1.1], c1: 0x8a3a30, c2: 0xc2584a });
    wagonG = new T.Group(); wagonG.add(B.mesh(new T.MeshStandardMaterial({ vertexColors: true, roughness: .9 })));
    [[-1.3, 1.15], [1.3, 1.15], [-1.3, -1.15], [1.3, -1.15]].forEach(function (p) {
      var w = new T.Group(), tire = new T.Mesh(new T.TorusGeometry(.72, .12, 6, 18), new T.MeshStandardMaterial({ color: 0x3a2618, roughness: .9 })), hub = new T.Mesh(new T.CylinderGeometry(.14, .14, .3, 8), new T.MeshStandardMaterial({ color: 0x2a2018 }));
      hub.rotation.x = Math.PI / 2; w.add(tire); w.add(hub); for (var k = 0; k < 6; k++) { var sp = new T.Mesh(new T.BoxGeometry(.08, 1.4, .08), new T.MeshStandardMaterial({ color: 0x5a3e28 })); sp.rotation.z = k * Math.PI / 6; w.add(sp); }
      w.position.set(p[0], .72, p[1]); wagonG.add(w); wheels.push(w);
    });
    lantM = new T.Mesh(new T.BoxGeometry(.5, .7, .5), new T.MeshBasicMaterial({ color: 0xffd890 })); lantM.position.set(2.1, 4.35, .95); wagonG.add(lantM);
    var frame = new T.Mesh(new T.BoxGeometry(.6, .1, .6), new T.MeshStandardMaterial({ color: 0x2a2018 })); frame.position.set(2.1, 4.75, .95); wagonG.add(frame);
    wagonG.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); sc.add(wagonG);
  }
  function makeStone() {
    var B = new Builder();
    B.add(new T.BoxGeometry(2.2, .4, 2.2), { pos: [0, .2, 0], c1: 0x5a586a, c2: 0x8a889a }); B.add(new T.CylinderGeometry(.62, .9, 3.2, 6, 3), { pos: [0, 2, 0], c1: 0x6a687a, c2: 0xa6a4b6, disp: .06, hw: .5 }); B.add(new T.ConeGeometry(.66, .7, 6), { pos: [0, 4.0, 0], c1: 0x7a788a, c2: 0xb0aec0 });
    var g = new T.Group(); g.add(B.mesh(new T.MeshStandardMaterial({ vertexColors: true, roughness: .85 })));
    var rc = document.createElement('canvas'); rc.width = 64; rc.height = 128; var x = rc.getContext('2d'); x.strokeStyle = '#ffd24a'; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); x.moveTo(32, 16); x.lineTo(32, 108); x.moveTo(12, 44); x.lineTo(52, 44); x.moveTo(18, 72); x.lineTo(46, 72); x.stroke();
    var rune = new T.Mesh(new T.PlaneGeometry(.9, 1.8), new T.MeshBasicMaterial({ map: tex(rc), transparent: true, blending: T.AdditiveBlending, depthWrite: false })); rune.position.set(0, 2.2, .86); g.add(rune);
    var halo = new T.Mesh(new T.PlaneGeometry(3, 3), new T.MeshBasicMaterial({ map: tex(radial(64, [[0, 'rgba(255,210,100,.55)'], [1, 'rgba(255,210,100,0)']]), { smooth: true }), transparent: true, blending: T.AdditiveBlending, depthWrite: false })); halo.position.set(0, 2.2, 1.2); g.add(halo);
    g.userData.rune = rune; return g;
  }
  function makeGate() { var B = new Builder(); column(B, 0, 0, 1.25, rnd(5), false); return B.mesh(new T.MeshStandardMaterial({ vertexColors: true, roughness: .9 })); }

  function buildRoad() {
    sc.fog = new T.Fog(0x202040, 30, 110);
    hemi = new T.HemisphereLight(0xfff0d0, 0x302848, .9); sc.add(hemi);
    sunL = new T.DirectionalLight(0xfff2d8, .9); sunL.position.set(-12, 20, 8); sunL.target.position.set(0, 0, -2); sc.add(sunL); sc.add(sunL.target);
    sunL.castShadow = true; var ms = lowPower ? 1024 : 2048; sunL.shadow.mapSize.set(ms, ms); var sh = sunL.shadow.camera; sh.left = -19; sh.right = 19; sh.top = 15; sh.bottom = -15; sh.near = 1; sh.far = 70; sunL.shadow.bias = -.0006; sunL.shadow.normalBias = .03;
    lamp = new T.PointLight(0xff9a50, 2.2, 16, 1.2); sc.add(lamp);
    var gm = new T.PlaneGeometry(320, 150); gm.rotateX(-Math.PI / 2);
    ground = new T.Mesh(gm, new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1 })); ground.position.set(0, 0, -40); ground.receiveShadow = true; sc.add(ground);
    var eg = new T.PlaneGeometry(320, 6.9); eg.rotateX(-Math.PI / 2); edgeM = new T.Mesh(eg, new T.MeshStandardMaterial({ color: 0x5a4a34, roughness: 1 })); edgeM.position.set(0, .012, 0); edgeM.receiveShadow = true; sc.add(edgeM);
    var pg = new T.PlaneGeometry(320, 5.6); pg.rotateX(-Math.PI / 2); pathM = new T.Mesh(pg, new T.MeshStandardMaterial({ color: 0xffffff, roughness: .85 })); pathM.position.set(0, .025, 0); pathM.receiveShadow = true; sc.add(pathM);
    skyCv = document.createElement('canvas'); skyCv.width = 2; skyCv.height = 128; skyTex = new T.CanvasTexture(skyCv); skyTex.encoding = T.sRGBEncoding;
    skyM = new T.Mesh(new T.PlaneGeometry(520, 260), new T.MeshBasicMaterial({ map: skyTex, fog: false, depthWrite: false })); skyM.position.set(0, 80, -130); skyM.renderOrder = -10; sc.add(skyM);
    var sp = [], r = LR.seeded(7); for (var i = 0; i < 180; i++) sp.push((r() - .5) * 420, 14 + r() * 110, -128);
    var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(sp, 3));
    starPts = new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false })); starPts.renderOrder = -9; sc.add(starPts);
    sunM = new T.Mesh(new T.PlaneGeometry(36, 36), new T.MeshBasicMaterial({ map: tex(radial(64, [[0, 'rgba(255,250,220,1)'], [.25, 'rgba(255,240,180,.95)'], [.5, 'rgba(255,200,120,.25)'], [1, 'rgba(255,200,120,0)']]), { smooth: true }), transparent: true, fog: false, depthWrite: false })); sunM.renderOrder = -8; sc.add(sunM);
    moonM = new T.Mesh(new T.PlaneGeometry(20, 20), new T.MeshBasicMaterial({ map: tex(radial(64, [[0, 'rgba(240,244,255,1)'], [.4, 'rgba(220,230,255,.95)'], [.55, 'rgba(160,180,255,.3)'], [1, 'rgba(160,180,255,0)']]), { smooth: true }), transparent: true, fog: false, depthWrite: false })); moonM.renderOrder = -8; sc.add(moonM);
    for (i = 0; i < 7; i++) { var c = sprite(ART.cloud(), 2.4 + i % 3 * .7, false); c.material.fog = false; c.material.opacity = .8; c.position.set(-90 + i * 30, 34 + (i % 3) * 8, -110); c.userData.sp = .3 + i % 3 * .2; c.renderOrder = -7; sc.add(c); clouds.push(c); }
    buildWagon();
    glowM = new T.Mesh(new T.PlaneGeometry(8, 8), new T.MeshBasicMaterial({ map: tex(radial(128, [[0, 'rgba(255,255,255,.9)'], [.2, 'rgba(255,255,255,.4)'], [.6, 'rgba(255,255,255,.08)'], [1, 'rgba(255,255,255,0)']]), { smooth: true }), transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false })); glowM.renderOrder = 10; sc.add(glowM);
    ringM = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: tex(radial(128, [[0, 'rgba(255,255,255,0)'], [.7, 'rgba(255,255,255,0)'], [.86, 'rgba(255,255,255,.9)'], [.93, 'rgba(255,255,255,.25)'], [1, 'rgba(255,255,255,0)']]), { smooth: true }), transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 })); ringM.renderOrder = 11; sc.add(ringM);
    for (i = 0; i < 4; i++) { var st = makeStone(); sc.add(st); stones.push(st); }
    gateA = makeGate(); gateB = makeGate(); sc.add(gateA); sc.add(gateB);
    waterMat = new T.MeshStandardMaterial({ color: 0x3aa6b8, roughness: .12, metalness: .15, transparent: true, opacity: .88 });
    var wg = new T.CircleGeometry(1, 28); wg.rotateX(-Math.PI / 2); water = new T.Mesh(wg, waterMat); water.receiveShadow = true; sc.add(water);
    for (i = 0; i < 4; i++) { var sl = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: tex(ART.tx.slash(), { smooth: true }), transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0 })); sl.renderOrder = 12; sl.userData.t = 9; sc.add(sl); slashes.push(sl); }
    var fg = new T.BufferGeometry(); fg.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(230 * 3), 3));
    fall = new T.Points(fg, new T.PointsMaterial({ color: 0xbfd8ff, size: .12, transparent: true, opacity: .8, depthWrite: false })); fall.frustumCulled = false; sc.add(fall); fallV = new Float32Array(230 * 2);
    var lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(100 * 3), 3));
    floatP = new T.Points(lg, new T.PointsMaterial({ color: 0xffee88, size: .55, map: tex(ART.spark(), { smooth: true }), transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 1 })); floatP.frustumCulled = false; sc.add(floatP); floatV = new Float32Array(100 * 3);
  }
  function setBiome(id) {
    curBiome = id; var D = BIO[id] || BIO.meadow;
    var gt = tex(ART.tx.ground(id), { smooth: true, mip: true, wrap: true }); gt.repeat.set(320 / 9, 150 / 9); ground.material.map = gt; ground.material.needsUpdate = true;
    var pt = ART.tx.path(id), pm = tex(pt.map, { smooth: true, mip: true, wrap: true }), pb = tex(pt.bump, { smooth: true, mip: true, wrap: true, linear: true }); pm.repeat.set(320 / 5.6, 1); pb.repeat.set(320 / 5.6, 1);
    pathM.material.map = pm; pathM.material.bumpMap = pb; pathM.material.bumpScale = 2.4; pathM.material.needsUpdate = true;
    edgeM.material.color.setHex(id === 'pass' ? 0xcfd8e4 : id === 'ash' ? 0x2a2024 : 0x5a4a34);
    [scenA, scenB].forEach(function (g) { if (g) { sc.remove(g); g.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); } });
    scenA = buildScenery(id); scenB = scenA.clone(); sc.add(scenA); sc.add(scenB);
    water.visible = id !== 'ruins' && id !== 'pine'; waterMat.color.setHex(D.water);
    if (id === 'ash') { waterMat.emissive.setHex(0xff5a10); waterMat.emissiveIntensity = 1.2; waterMat.roughness = .6; } else { waterMat.emissive.setHex(0x000000); waterMat.roughness = .12; }
    var bt = tex(ART.tx.waterBump(), { smooth: true, mip: true, wrap: true, linear: true }); bt.repeat.set(3, 3); waterMat.bumpMap = bt; waterMat.bumpScale = .5; waterMat.needsUpdate = true;
    var cfg = { meadow: ['', 'firefly'], pine: ['', 'dust'], marsh: ['rain', 'firefly'], pass: ['snow', ''], ruins: ['', 'dust'], ash: ['', 'ember'] }[id] || ['', ''];
    fallKind = cfg[0]; floatKind = cfg[1]; initParticles();
    var fc = { rain: 0x9fc4ff, snow: 0xffffff }[fallKind]; if (fc) { fall.material.color.setHex(fc); fall.material.size = fallKind === 'snow' ? .18 : .09; }
    var lc = { firefly: 0xd8ff6a, ember: 0xff8a30, dust: 0xe8d8b8 }[floatKind]; if (lc) floatP.material.color.setHex(lc);
    skyKey = -1;
  }
  function initParticles() {
    var p = fall.geometry.attributes.position.array, i, n = p.length / 3;
    for (i = 0; i < n; i++) { p[i * 3] = (Math.random() - .5) * 46; p[i * 3 + 1] = Math.random() * 15; p[i * 3 + 2] = -10 + Math.random() * 24; fallV[i * 2] = fallKind === 'rain' ? 16 + Math.random() * 6 : 1.2 + Math.random() * 1.2; fallV[i * 2 + 1] = Math.random() * 6.28; }
    fall.geometry.attributes.position.needsUpdate = true;
    var q = floatP.geometry.attributes.position.array; n = q.length / 3;
    for (i = 0; i < n; i++) { q[i * 3] = (Math.random() - .5) * 36; q[i * 3 + 1] = .4 + Math.random() * 4; q[i * 3 + 2] = -9 + Math.random() * 18; floatV[i * 3] = Math.random() * 6.28; floatV[i * 3 + 1] = .3 + Math.random() * .8; floatV[i * 3 + 2] = Math.random() * 6.28; }
    floatP.geometry.attributes.position.needsUpdate = true;
  }
  function stepParticles(dt, speed, night, day) {
    fall.visible = !!fallKind; fall.material.opacity = fallKind === 'snow' ? .85 : .5 * (.5 + .5 * day);
    if (fall.visible) {
      var p = fall.geometry.attributes.position.array, n = p.length / 3;
      for (var i = 0; i < n; i++) {
        p[i * 3 + 1] -= fallV[i * 2] * dt; p[i * 3] -= speed * dt * .9 + (fallKind === 'snow' ? Math.sin(tNow + fallV[i * 2 + 1]) * dt * .6 : -2.4 * dt);
        if (p[i * 3 + 1] < 0) { p[i * 3 + 1] = 13 + Math.random() * 3; p[i * 3] = (Math.random() - .5) * 46; }
        if (p[i * 3] < -23) p[i * 3] += 46; if (p[i * 3] > 23) p[i * 3] -= 46;
      }
      fall.geometry.attributes.position.needsUpdate = true;
    }
    floatP.visible = !!floatKind;
    if (floatP.visible) {
      var on = floatKind === 'firefly' ? night : floatKind === 'ember' ? 1 : .6; floatP.material.opacity = Math.min(1, on * (floatKind === 'dust' ? .4 : 1)); floatP.material.size = floatKind === 'dust' ? .35 : floatKind === 'ember' ? .42 : .55;
      var q = floatP.geometry.attributes.position.array, m = q.length / 3;
      for (var j = 0; j < m; j++) {
        floatV[j * 3] += dt * floatV[j * 3 + 1]; var ph = floatV[j * 3], ph2 = floatV[j * 3 + 2];
        q[j * 3] += Math.cos(ph) * dt * .5 - speed * dt * .55; q[j * 3 + 1] += (floatKind === 'ember' ? .7 * dt : Math.sin(ph + ph2) * dt * .35); q[j * 3 + 2] += Math.sin(ph) * dt * .3;
        if (q[j * 3 + 1] > 7) q[j * 3 + 1] = .3; if (q[j * 3 + 1] < .2) q[j * 3 + 1] = 4; if (q[j * 3] < -19) q[j * 3] += 38; if (q[j * 3] > 19) q[j * 3] -= 38;
      }
      floatP.geometry.attributes.position.needsUpdate = true;
    }
  }

  /* ---------------- sky and light ---------------- */
  var skyKey = -1, cNight = new T.Color(0x0a0e2a), cNightH = new T.Color(0x1d2050), cWarm = new T.Color(0xff8a4a), tmpA = new T.Color(), tmpB = new T.Color();
  var SKY = { meadow: [0x5a9be0, 0xbfe4ff], pine: [0x4a7fa8, 0xb8dce0], marsh: [0x6a8a8a, 0xc8d8b8], pass: [0x6a8ec8, 0xdce8f4], ruins: [0x7a78a8, 0xdcc8c0], ash: [0x5a2a2a, 0xe08850] };
  function dayness(t) { return t < .08 ? .35 + .65 * t / .08 : t < .48 ? 1 : t < .62 ? 1 - .95 * (t - .48) / .14 : t < .9 ? .05 : .05 + .30 * (t - .9) / .1; }
  function warmth(t) { var a = Math.max(0, 1 - Math.abs(t - .56) / .09), b = Math.max(0, 1 - Math.abs(t - .96) / .07) + Math.max(0, 1 - t / .04); return Math.min(1, a + b * .8); }
  function updateSky(S, day, warm) {
    var key = Math.round(S.tod * 260) + (S.beaten % 6) * 1000; if (key === skyKey) return; skyKey = key;
    var b = SKY[curBiome] || SKY.meadow, top = tmpA.setHex(b[0]).lerp(cNight, 1 - day), hor = tmpB.setHex(b[1]).lerp(cNightH, 1 - day);
    hor.lerp(cWarm, warm * .55); top.lerp(cWarm, warm * .15);
    var x = skyCv.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#' + top.getHexString()); g.addColorStop(.55, '#' + top.clone().lerp(hor, .55).getHexString()); g.addColorStop(1, '#' + hor.getHexString());
    x.fillStyle = g; x.fillRect(0, 0, 2, 128); skyTex.needsUpdate = true;
    sc.fog.color.copy(hor).multiplyScalar(.85); R.setClearColor(hor, 1);
    var t = S.tod, f = t < .55 ? t / .55 : -1;
    sunM.visible = f >= 0 && day > .2; if (f >= 0) { sunM.position.set(-70 + 140 * f, 12 + 44 * Math.sin(Math.PI * f), -126); sunM.material.opacity = Math.min(1, day * 1.3); }
    var g2 = t >= .5 ? (t - .5) / .5 : (t + .5) / .5 - 1, gg = Math.max(0, Math.min(1, g2)); moonM.visible = day < .8; moonM.position.set(-70 + 140 * gg, 14 + 40 * Math.sin(Math.PI * gg), -126);
    moonM.material.opacity = Math.min(1, (1 - day) * 1.3); starPts.material.opacity = Math.max(0, (.6 - day) * 1.4);
  }
  var FL = { red: 0xff7a3c, blue: 0x5aa8ff, green: 0x6aff8a, white: 0xfff0d8 }, lampCol = new T.Color(0xff9a50);

  /* ---------------- units ---------------- */
  var HP_ = [[-1.0, -1.6], [-2.1, 1.5], [-4.0, -1.4], [-5.1, 1.45]], FP_ = [[3.4, -1.6], [4.5, 1.5], [6.4, -1.4], [7.5, 1.45]];
  function heroPos(slot) { return { x: HP_[slot][0] * XS, z: HP_[slot][1] }; }
  function foePos(slot, boss) { return boss ? { x: 5.6 * XS, z: 0 } : { x: FP_[slot][0] * XS, z: FP_[slot][1] }; }
  function biomeId(S) { return LR.biome(S).id; }
  function mkUnit(cv, mul, key, side) {
    var m = sprite(cv, mul); m.castShadow = true; m.rotation.x = LEAN; var s = blob(m.userData.w); sc.add(m); sc.add(s);
    return { m: m, s: s, key: key, side: side, x: 0, z: 0, tx: 0, tz: 0, lunge: 0, flash: 0, dead: 0, vis: 1, bob: Math.random() * 6, w: m.userData.w, h: m.userData.h, hp: 1, name: '', boss: false, cast: 0, alive: true };
  }
  function killUnit(u) { sc.remove(u.m); sc.remove(u.s); u.m.material.dispose(); }
  function syncUnits(S, dt) {
    var seen = {};
    for (var s = 0; s < 4; s++) {
      var id = S.party[s]; if (!id) continue; seen[id] = 1; var u = heroObj[id];
      if (!u) { u = heroObj[id] = mkUnit(ART.hero(id), 1.05, '', 0); u.x = u.tx = heroPos(s).x; u.z = u.tz = heroPos(s).z; }
      u.slot = s; u.key = '0:' + s; var p = heroPos(s); u.tx = p.x; u.tz = p.z; u.id = id;
    }
    Object.keys(heroObj).forEach(function (id) { if (!seen[id]) { killUnit(heroObj[id]); delete heroObj[id]; } });
    if (S.fight !== lastFight) {
      if (lastFight) Object.keys(foeObj).forEach(function (k) { foeObj[k].leaving = 1; });
      if (S.fight) S.fight.foes.forEach(function (f) {
        var bi = LR.biome(S), idx = Math.max(0, bi.mon.map(function (x) { return x[0]; }).indexOf(f.name));
        var u = mkUnit(ART.mon(f.arch, bi.id, idx, f.boss), f.boss ? 1.12 : 1.05, f.key, 1), p = foePos(f.slot, f.boss);
        u.x = p.x + 18; u.z = p.z; u.tx = p.x; u.tz = p.z; u.boss = f.boss; u.name = f.name; u.unit = f; foeObj['n' + Math.random()] = u;
      });
      lastFight = S.fight;
    }
    Object.keys(foeObj).forEach(function (k) { var u = foeObj[k]; if (u.leaving) { u.vis -= dt * 2.2; if (u.vis <= 0) { killUnit(u); delete foeObj[k]; } } });
  }
  function allUnits() { var a = []; Object.keys(heroObj).forEach(function (k) { a.push(heroObj[k]); }); Object.keys(foeObj).forEach(function (k) { a.push(foeObj[k]); }); return a; }
  function findUnit(key) { var k, u; for (k in heroObj) { u = heroObj[k]; if (u.key === key) return u; } for (k in foeObj) { u = foeObj[k]; if (u.key === key && !u.leaving) return u; } return null; }
  function animUnits(S, dt, walking) {
    var F = S.fight;
    allUnits().forEach(function (u) {
      if (u.unit) { u.hp = u.unit.hp / u.unit.max; u.alive = u.unit.alive; }
      else if (F) { var hh = F.heroes.filter(function (x) { return x.key === u.key; })[0]; u.hp = hh ? hh.hp / hh.max : 1; u.alive = hh ? hh.alive : true; }
      else { u.hp = S.heroes[u.id] ? S.heroes[u.id].hp : 1; u.alive = true; }
      u.x += (u.tx - u.x) * Math.min(1, dt * (u.side ? 3.2 : 4)); u.z += (u.tz - u.z) * Math.min(1, dt * 4);
      u.lunge = Math.max(0, u.lunge - dt * 4.2); u.flash = Math.max(0, u.flash - dt * 5); u.cast = Math.max(0, u.cast - dt);
      var dir = u.side ? -1 : 1, lx = Math.sin(u.lunge * Math.PI) * 1.4 * dir, bob = 0, sy = 1;
      if (walking && !u.side) bob = Math.abs(Math.sin(tNow * 8 + u.bob)) * .13; else sy = 1 + Math.sin(tNow * 2.2 + u.bob) * .016;
      if (!u.alive) u.dead = Math.min(1, u.dead + dt * (u.side ? 1.5 : 2)); else u.dead = Math.max(0, u.dead - dt * 3);
      var m = u.m; m.position.set(u.x + lx, bob + .02, u.z); m.scale.set(1, sy, 1); m.rotation.z = u.side ? u.dead * .9 : -u.dead * 1.2;
      var vis = u.vis * (u.side ? 1 - u.dead * .85 : 1 - u.dead * .35); m.material.opacity = vis; m.material.alphaTest = vis < .95 ? .02 : .45;
      var f = u.flash; m.material.emissive.setRGB(f * .9, f * .55, f * .45); if (u.cast > 0) m.material.emissive.setRGB(.35 * u.cast, .3 * u.cast, .12 * u.cast);
      u.s.position.set(u.x + lx, .05, u.z); u.s.scale.set(u.w * .36 * (1 - bob), 1, u.w * .17); u.s.visible = vis > .3;
    });
  }

  /* ---------------- events ---------------- */
  function head(u) { return { x: u.m.position.x, y: u.h * .98, z: u.m.position.z }; }
  function floater(u, txt, col, size, big) { if (!u) return; var h = head(u); fl.push({ x: h.x + (Math.random() - .5) * .6, y: h.y, z: h.z, t: 0, life: big ? 1.4 : .95, txt: txt, col: col, size: size || 18 }); }
  LRS.floatText = function (txt, col, size) { fl.push({ x: -1.5, y: 4, z: 0, t: 0, life: 1.6, txt: txt, col: col, size: size || 20 }); };
  function slash(u, big) { var s = slashes.filter(function (x) { return x.userData.t > .3; })[0]; if (!s || !u) return; s.userData.t = 0; s.userData.big = big ? 1.4 : 1; s.position.set(u.m.position.x, u.h * .5, u.m.position.z + .8); s.userData.rz = (Math.random() - .5) * 1.2; s.userData.flip = u.side ? 1 : -1; }
  LRS.event = function (e, S) {
    if (e.e === 'hit') { var a = findUnit(e.s), t = findUnit(e.t); if (a) a.lunge = 1; if (t) { t.flash = 1; slash(t, e.c || e.sk); floater(t, String(e.d), t.side ? (e.c ? '#ffe45a' : e.sk ? '#ffb04a' : '#ffffff') : '#ff6a6a', e.c ? 26 : e.sk ? 22 : 17); } }
    else if (e.e === 'heal') floater(findUnit(e.t), '+' + e.d, '#7aff9a', 18);
    else if (e.e === 'cast') { var c = findUnit(e.s); if (c) { c.cast = .8; floater(c, e.n, '#9fe8ff', 15, true); } }
    else if (e.e === 'win') flash = Math.max(flash, .08);
    else if (e.e === 'wipe') { fadeTarget = 1; setTimeout(function () { fadeTarget = 0; }, 1500); }
    else if (e.e === 'guardian') flash = .5;
  };
  LRS.flare = function () { flash = .6; ringT = 1; };

  /* ---------------- per-frame road ---------------- */
  var tmpP = new T.Vector3(), nightTint = new T.Color(.3, .32, .55), cNightH2 = new T.Color(.34, .4, .8), cNightS = new T.Color(.45, .55, 1), cDuskS = new T.Color(1, .62, .4), cWhite = new T.Color(1, 1, 1);
  function roadFrame(S, dt, walking) {
    var b = biomeId(S); if (b !== curBiome) setBiome(b);
    if (lastLeague === null) lastLeague = S.league;
    var dl = S.league - lastLeague; lastLeague = S.league; if (Math.abs(dl) > 2) dl = 0; dist += dl * UPL;
    var day = dayness(S.tod), night = 1 - day, warm = warmth(S.tod); updateSky(S, day, warm);
    var ang = 29 * Math.PI / 180, cy = 1 + camDist * Math.sin(ang), cz = camDist * Math.cos(ang) + 1;
    cam.position.set(.8, cy, cz); cam.lookAt(0, .6, -.5);
    var off = dist % LOOP; scenA.position.x = BASE0 - off; scenB.position.x = BASE0 - off + LOOP;
    ground.material.map.offset.x = dist / 9; pathM.material.map.offset.x = dist / 5.6; pathM.material.bumpMap.offset.x = dist / 5.6;
    var wx = 8 - off; if (wx < -30) wx += LOOP; water.position.set(wx, .03, -11); water.scale.set(9, 1, 4.4);
    var wmap = waterMat.bumpMap; if (wmap) { wmap.offset.x = tNow * .02; wmap.offset.y = tNow * .015; }
    hemi.intensity = .3 + .45 * day; hemi.color.setRGB(1, .96, .86).lerp(cNightH2, 1 - day); hemi.groundColor.setRGB(.24, .2, .28);
    sunL.intensity = .35 + .7 * day; sunL.color.setRGB(1, .94, .82).lerp(cNightS, 1 - day).lerp(cDuskS, warm * .55); sunL.position.set(-12 + Math.sin(S.tod * 6.28) * 3, 20, 8);
    var br = S.bright, tgt = tmpB.setHex(FL[S.flame] || FL.red), flick = 1 + Math.sin(tNow * 9) * .04 + Math.sin(tNow * 23.7) * .03 + Math.sin(tNow * 3.1) * .05, fl_ = S.flare && S.flare.t > 0 ? 1 + .8 * Math.min(1, S.flare.t) : 1;
    lampCol.lerp(tgt, Math.min(1, dt * 4)); lamp.color.copy(lampCol); lamp.intensity = (.6 + br * .85) * flick * fl_ * (1 + .6 * night); lamp.distance = (8 + br * 3.6) * Math.sqrt(fl_);
    var wp = -8.3 * XS; wagonG.position.set(wp, .02, -.4); wagonG.rotation.y = .12;
    wheels.forEach(function (w) { w.rotation.z = -dist / .72; });
    lamp.position.set(wp + 2.1, 4.4, .8); lantM.material.color.copy(lampCol).lerp(cWhite, .55);
    var ps = lamp.position; glowM.position.set(ps.x, ps.y, ps.z + .3); glowM.quaternion.copy(cam.quaternion);
    var gs = (.5 + br * .4) * flick * fl_ * (.5 + .7 * night); glowM.scale.set(gs, gs, 1); glowM.material.color.copy(lampCol); glowM.material.opacity = Math.min(1, .3 + night * .6) * (br > 0 ? 1 : .3);
    if (ringT > 0) { ringT = Math.max(0, ringT - dt * 1.4); var rs = 3 + (1 - ringT) * 30; ringM.scale.set(rs, rs, 1); ringM.position.copy(ps); ringM.quaternion.copy(cam.quaternion); ringM.material.opacity = ringT; ringM.material.color.copy(lampCol); } else ringM.material.opacity = 0;
    clouds.forEach(function (c) { c.position.x += c.userData.sp * dt; if (c.position.x > 140) c.position.x = -140; c.material.opacity = (.3 + .6 * day) * (curBiome === 'ash' ? .35 : 1); c.material.color.setRGB(1, 1, 1).lerp(nightTint, Math.pow(night, .8)); });
    var k0 = Math.floor(S.league / 10) - 1;
    stones.forEach(function (st, i) { var k = k0 + i, x2 = (k * 10 - S.league) * UPL + .4 * XS; st.position.set(x2, 0, -3.8); st.visible = k >= 1 && x2 < 60; st.userData.rune.material.opacity = .6 + .4 * Math.sin(tNow * 2 + i); });
    var gx = (S.gate - S.league) * UPL + 10 * XS; gateA.position.set(gx, 0, -3.8); gateB.position.set(gx + .5, 0, 3.9); gateA.visible = gateB.visible = gx < 60;
    slashes.forEach(function (s) { var u = s.userData; if (u.t < .3) { u.t += dt; var p = u.t / .3, z_ = (1.4 + p * .8) * (u.big || 1) * 1.6; s.quaternion.copy(cam.quaternion); s.rotateZ(u.rz || 0); s.scale.set(z_ * (u.flip || 1), z_, 1); s.material.opacity = (1 - p) * .95; } else s.material.opacity = 0; });
    syncUnits(S, dt); animUnits(S, dt, walking);
    stepParticles(dt, walking ? UPL * .09 : 0, night, day);
    tmpP.set(-2, .8, 0).project(cam); postMat.uniforms.uFocus.value = tmpP.y * .5 + .5; postMat.uniforms.uNight.value = night;
  }

  /* ---------------- camp scene ---------------- */
  var campBuilt = false, campFire, campFireLight, campLamp, campFlies, campFliesV, campGround, campSeat = [], campSeatKey = '', campLampCol = new T.Color(0xff9a50), campTrees = null, campLanternM;
  function buildCamp() {
    camp = new T.Scene(); camp.fog = new T.Fog(0x141632, 22, 80); ccam = new T.PerspectiveCamera(34, W / H, .5, 300);
    camp.add(new T.HemisphereLight(0x8a98e8, 0x2a2030, .9));
    var moon = new T.DirectionalLight(0x9fb0ff, .8); moon.position.set(-10, 18, 8); moon.target.position.set(0, 0, 0); camp.add(moon); camp.add(moon.target);
    moon.castShadow = true; moon.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048); var sh = moon.shadow.camera; sh.left = -14; sh.right = 14; sh.top = 12; sh.bottom = -12; sh.near = 1; sh.far = 50; moon.shadow.bias = -.0006; moon.shadow.normalBias = .03;
    campFireLight = new T.PointLight(0xff9040, 2.2, 18, 1.3); campFireLight.position.set(0, 1.2, 2.2); camp.add(campFireLight);
    campLamp = new T.PointLight(0xff9a50, 1.6, 11, 1.4); campLamp.position.set(6.3, 3.6, -2.4); camp.add(campLamp);
    var sk = document.createElement('canvas'); sk.width = 2; sk.height = 128; var x = sk.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#070a1f'); g.addColorStop(.6, '#1b1e4a'); g.addColorStop(1, '#3a2a58'); x.fillStyle = g; x.fillRect(0, 0, 2, 128);
    var skm = new T.Mesh(new T.PlaneGeometry(500, 260), new T.MeshBasicMaterial({ map: tex(sk, { smooth: true }), fog: false, depthWrite: false })); skm.position.set(0, 70, -120); skm.renderOrder = -10; camp.add(skm);
    var sp = [], r = LR.seeded(21); for (var i = 0; i < 160; i++) sp.push((r() - .5) * 400, 10 + r() * 100, -118);
    var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(sp, 3)); camp.add(new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: false, fog: false, depthWrite: false })));
    var mm = new T.Mesh(new T.PlaneGeometry(18, 18), new T.MeshBasicMaterial({ map: tex(radial(64, [[0, 'rgba(240,244,255,1)'], [.4, 'rgba(220,230,255,.95)'], [.55, 'rgba(160,180,255,.3)'], [1, 'rgba(160,180,255,0)']]), { smooth: true }), transparent: true, fog: false, depthWrite: false })); mm.position.set(-40, 50, -116); camp.add(mm);
    var gm = new T.CircleGeometry(60, 48); gm.rotateX(-Math.PI / 2); campGround = new T.Mesh(gm, new T.MeshStandardMaterial({ roughness: 1 })); campGround.receiveShadow = true; camp.add(campGround);
    var B = new Builder(), rr = rnd(9); for (i = 0; i < 12; i++) { var a = i / 12 * 6.28; B.add(ico(1, 1), { pos: [Math.cos(a) * 1.25, .2, 1.6 + Math.sin(a) * 1.25], scl: [.35, .28, .32], rot: [0, rr() * 3, 0], c1: 0x3a3a44, c2: 0x8a8a96, disp: .12, seed: i }); }
    for (i = 0; i < 5; i++) { var a2 = i / 5 * 6.28 + .4; B.add(new T.CylinderGeometry(.16, .18, 1.7, 8), { pos: [Math.cos(a2) * .35, .3, 1.6 + Math.sin(a2) * .35], rot: [Math.PI / 2, 0, a2 + 1.57], c1: 0x2a1c12, c2: 0x6a4a30 }); }
    B.add(new T.CylinderGeometry(1.8, 1.8, 3.6, 3, 1, false), { pos: [-7.5, 1.5, -4.8], rot: [0, 0, Math.PI / 2], c1: 0x8a2e24, c2: 0xd8644a, hw: .4, jit: .04 });
    B.add(new T.CylinderGeometry(1.8, 1.8, 3.6, 3, 1, false), { pos: [-3.5, 1.4, -7.2], rot: [0, 0, Math.PI / 2], c1: 0x3a5a8a, c2: 0x6a98d0, jit: .04 });
    for (i = 0; i < 7; i++) { var ax = -4.6 + 9.2 * ((i + .5) / 7); B.add(new T.CylinderGeometry(.36, .4, 2.3, 9), { pos: [ax, .38, -1.1 + Math.pow(ax / 4.8, 2) * -.9 + .55], rot: [0, 0, Math.PI / 2], c1: 0x4a3020, c2: 0x8a6240 }); }
    camp.add(B.mesh(new T.MeshStandardMaterial({ vertexColors: true, roughness: .9 })));
    campFire = sprite(ART.fire(0), 2.3, false); campFire.position.set(0, .1, 1.6); camp.add(campFire);
    var lp = new T.Mesh(new T.CylinderGeometry(.07, .09, 3.4, 6), new T.MeshStandardMaterial({ color: 0x3a2618 })); lp.position.set(6.3, 1.7, -2.4); lp.castShadow = true; camp.add(lp);
    campLanternM = new T.Mesh(new T.BoxGeometry(.55, .75, .55), new T.MeshBasicMaterial({ color: 0xffd890 })); campLanternM.position.set(6.3, 3.55, -2.4); camp.add(campLanternM);
    var cf = new T.BufferGeometry(); cf.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(60 * 3), 3));
    campFlies = new T.Points(cf, new T.PointsMaterial({ color: 0xffd86a, size: .5, map: tex(ART.spark(), { smooth: true }), transparent: true, blending: T.AdditiveBlending, depthWrite: false })); campFlies.frustumCulled = false; camp.add(campFlies); campFliesV = new Float32Array(60 * 3);
    var q = cf.attributes.position.array; for (i = 0; i < 60; i++) { q[i * 3] = (Math.random() - .5) * 20; q[i * 3 + 1] = .5 + Math.random() * 5; q[i * 3 + 2] = (Math.random() - .5) * 14 - 1; campFliesV[i * 3] = Math.random() * 6; campFliesV[i * 3 + 1] = .4 + Math.random(); campFliesV[i * 3 + 2] = Math.random() * 6; }
    campBuilt = true;
  }
  function campSync(S) {
    var id = biomeId(S), key = Object.keys(S.heroes).join() + '|' + id; if (key === campSeatKey) return; campSeatKey = key;
    var gt2 = tex(ART.tx.ground(id), { smooth: true, mip: true, wrap: true }).clone(); gt2.needsUpdate = true; gt2.wrapS = gt2.wrapT = T.RepeatWrapping; gt2.repeat.set(120 / 9, 120 / 9); campGround.material.map = gt2; campGround.material.color.setRGB(.7, .72, .95); campGround.material.needsUpdate = true;
    if (campTrees) { camp.remove(campTrees); campTrees.geometry.dispose(); }
    var B = new Builder(), r = rnd(hash('ct' + id)), D = BIO[id] || BIO.meadow;
    for (var i = 0; i < 20; i++) { var a = (i / 20) * Math.PI + Math.PI, rad = 16 + r() * 14, x = Math.cos(a) * rad * 1.3, z = Math.sin(a) * rad * .9 - 6, s = .9 + r() * .7;
      if (id === 'pine' || id === 'pass') tree_pine(B, x, z, s, r, id === 'pass'); else if (id === 'marsh') tree_dead(B, x, z, s, r); else if (id === 'ash') charred(B, x, z, s * 1.2, r); else if (id === 'ruins' && i % 2) column(B, x, z, s, r, true); else tree_oak(B, x, z, s, r); }
    for (i = 0; i < 18; i++) { var a3 = r() * 6.28, rd = 8 + r() * 14; rock(B, Math.cos(a3) * rd, Math.sin(a3) * rd * .7 - 4, .4 + r() * .7, r, { c1: D.rockC[0], c2: D.rockC[1], top: D.moss }); }
    campTrees = B.mesh(new T.MeshStandardMaterial({ vertexColors: true, roughness: .92 })); camp.add(campTrees);
    campSeat.forEach(function (c) { camp.remove(c.m); camp.remove(c.s); }); campSeat = [];
    var ids = LR.HERO_ORDER.filter(function (h) { return S.heroes[h]; }), n = ids.length;
    ids.forEach(function (hid, i2) {
      var x2 = -4.6 + 9.2 * ((i2 + .5) / n), z2 = -1.1 + Math.pow(x2 / 4.8, 2) * -.9 + .3, m = sprite(ART.hero(hid), 1.15); m.castShadow = true; m.rotation.x = LEAN; m.position.set(x2, .45, z2); var sh = blob(m.userData.w); sh.position.set(x2, .05, z2);
      camp.add(m); camp.add(sh); campSeat.push({ m: m, s: sh, ph: Math.random() * 6 });
    });
  }
  function campFrame(S, dt) {
    if (!campBuilt) buildCamp(); campSync(S);
    var f = Math.floor(tNow * 8) % 4; if (campFire.userData.f !== f) { campFire.userData.f = f; campFire.material.map = tex(ART.fire(f)); }
    campFireLight.intensity = 2.1 + Math.sin(tNow * 11) * .25 + Math.sin(tNow * 27) * .18;
    campLampCol.lerp(tmpB.setHex(FL[S.flame] || FL.red), Math.min(1, dt * 4)); campLamp.color.copy(campLampCol); campLamp.intensity = .6 + S.bright * .6; campLanternM.material.color.copy(campLampCol).lerp(cWhite, .5);
    if (campDX) ccam.setViewOffset(W, H, campDX, 0, W, H); else ccam.clearViewOffset();
    var a = Math.sin(tNow * .12) * .1, cd = 17 * Math.max(1, 1.15 / ccam.aspect); ccam.position.set(Math.sin(a) * cd, 6.8 + (cd - 17) * .35, Math.cos(a) * cd + 1); ccam.lookAt(0, ccam.aspect < 1.2 ? 2.4 : 1.1, -.6);
    campSeat.forEach(function (c) { c.m.position.y = .45 + Math.sin(tNow * 1.6 + c.ph) * .02; });
    var q = campFlies.geometry.attributes.position.array;
    for (var i = 0; i < 60; i++) { campFliesV[i * 3] += dt * campFliesV[i * 3 + 1]; var ph = campFliesV[i * 3]; q[i * 3] += Math.cos(ph) * dt * .6; q[i * 3 + 1] += Math.sin(ph * 1.3 + campFliesV[i * 3 + 2]) * dt * .4; q[i * 3 + 2] += Math.sin(ph) * dt * .4; if (q[i * 3 + 1] < .3) q[i * 3 + 1] = 3; if (q[i * 3 + 1] > 7) q[i * 3 + 1] = 1; }
    campFlies.geometry.attributes.position.needsUpdate = true;
  }

  /* ---------------- render ---------------- */
  LRS.setMode = function (m) { mode = m; };
  LRS.setCampShift = function (dx) { campDX = dx; };
  LRS.render = function (S, dt, walking) {
    tNow += dt; var scn, cm;
    if (mode === 'camp') { campFrame(S, dt); scn = camp; cm = ccam; postMat.uniforms.uFocus.value = .5; postMat.uniforms.uBlur.value = .55; postMat.uniforms.uBloom.value = 1.1; }
    else { roadFrame(S, dt, walking); scn = sc; cm = cam; postMat.uniforms.uBlur.value = 1; postMat.uniforms.uBloom.value = 1; }
    flash = Math.max(0, flash - dt * 1.2); fade += (fadeTarget - fade) * Math.min(1, dt * 5); postMat.uniforms.uFlash.value = flash; postMat.uniforms.uFade.value = fade;
    R.setRenderTarget(rt); R.render(scn, cm); R.setRenderTarget(null); R.render(postScene, postCam); drawFx(S, dt, cm);
  };
  function drawFx(S, dt, cm) {
    var sx = fx.width / W, sy = fx.height / H; fxc.setTransform(1, 0, 0, 1, 0, 0); fxc.clearRect(0, 0, fx.width, fx.height); fxc.setTransform(sx, 0, 0, sy, 0, 0);
    function proj(x, y, z) { tmpP.set(x, y, z).project(cm); return [(tmpP.x * .5 + .5) * W, (-tmpP.y * .5 + .5) * H]; }
    fxc.textAlign = 'center'; fxc.lineJoin = 'round';
    if (mode === 'road') {
      allUnits().forEach(function (u) {
        if (!u.alive && u.dead > .5) return; if (u.vis < .5) return;
        var p = proj(u.m.position.x, u.h * .92, u.m.position.z), wpx = u.side ? (u.boss ? 120 : 46) : 42, s = Math.min(1.2, Math.max(.55, W / 900)); wpx *= s; var y = p[1] - 2;
        if (u.side || u.hp < .999) { fxc.fillStyle = 'rgba(10,6,20,.85)'; fxc.fillRect(p[0] - wpx / 2 - 1, y - 1, wpx + 2, 7 * s + 2); fxc.fillStyle = u.side ? '#d64545' : (u.hp < .3 ? '#e0b030' : '#58c872'); fxc.fillRect(p[0] - wpx / 2, y, wpx * Math.max(0, Math.min(1, u.hp)), 7 * s); }
        if (u.boss) { fxc.font = '700 ' + Math.round(13 * s + 2) + 'px "Pixelify Sans", ui-monospace, monospace'; fxc.strokeStyle = '#120a1e'; fxc.lineWidth = 4; fxc.fillStyle = '#ffd98a'; fxc.strokeText(u.name, p[0], y - 6); fxc.fillText(u.name, p[0], y - 6); }
      });
    }
    for (var i = fl.length - 1; i >= 0; i--) {
      var f = fl[i]; f.t += dt; if (f.t > f.life) { fl.splice(i, 1); continue; }
      var p2 = proj(f.x, f.y + f.t * 1.4, f.z), a = 1 - Math.pow(f.t / f.life, 2.5), sz = f.size * Math.min(1.3, Math.max(.8, W / 800));
      fxc.globalAlpha = a; fxc.font = '700 ' + Math.round(sz) + 'px "Pixelify Sans", ui-monospace, monospace'; fxc.strokeStyle = '#120a1e'; fxc.lineWidth = 4; fxc.fillStyle = f.col; fxc.strokeText(f.txt, p2[0], p2[1]); fxc.fillText(f.txt, p2[0], p2[1]); fxc.globalAlpha = 1;
    }
  }
  LRS.debug = function () { return { dist: dist, units: allUnits().length }; };
  root.LRS = LRS;
})(window);
