/* Lanternroad art v2: detailed 64px characters (vector shapes, rasterised hard-edged, cel-shaded
   with rim light and shadow bands) plus procedural HD textures for the 3D world.
   Loaded after art.js; replaces ART.hero, ART.mon and ART.portrait. */
(function (root) {
  'use strict';
  var ART = root.ART, mix = ART.mix, lt = ART.lt, dk = ART.dk;
  var TAU = Math.PI * 2;
  function rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  var colCache = {}; function C(h) { if (!colCache[h]) { var x = h.length === 4 ? '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3] : h; colCache[h] = rgb(x); } return colCache[h]; }
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  /* ---------- path helpers (coordinates in a 64-unit design grid) ---------- */
  function E(cx, cy, rx, ry, rot) { return function (c) { c.ellipse(cx, cy, rx, ry, rot || 0, 0, TAU); }; }
  function PL(p) { return function (c) { c.moveTo(p[0][0], p[0][1]); for (var i = 1; i < p.length; i++) c.lineTo(p[i][0], p[i][1]); c.closePath(); }; }
  function RC(x, y, w, h) { return function (c) { c.rect(x, y, w, h); }; }
  function RR(x, y, w, h, r) { return function (c) { c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }; }
  function CV(p) { // smooth closed blob through points
    return function (c) { var n = p.length, m = function (a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }, s = m(p[n - 1], p[0]); c.moveTo(s[0], s[1]); for (var i = 0; i < n; i++) { var q = p[i], e = m(p[i], p[(i + 1) % n]); c.quadraticCurveTo(q[0], q[1], e[0], e[1]); } c.closePath(); };
  }
  function LN(x0, y0, x1, y1, w) { var dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l * w / 2, ny = dx / l * w / 2; return PL([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]]); }

  /* ---------- painter ---------- */
  function Paint(w, h, s) {
    this.w = w; this.h = h; this.s = s || 1; this.buf = new Uint8ClampedArray(w * h * 4);
    this.t = document.createElement('canvas'); this.t.width = w; this.t.height = h; this.tx = this.t.getContext('2d', { willReadFrequently: true });
  }
  Paint.prototype = {
    mask: function (fn) {
      var w = this.w, h = this.h, c = this.tx; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h); c.setTransform(this.s, 0, 0, this.s, 0, 0); c.fillStyle = '#000'; c.beginPath(); fn(c); c.fill();
      var d = c.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h); for (var i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 112 ? 1 : 0; return m;
    },
    put: function (x, y, col) { var i = (y * this.w + x) * 4; this.buf[i] = col[0]; this.buf[i + 1] = col[1]; this.buf[i + 2] = col[2]; this.buf[i + 3] = 255; },
  };
  Paint.prototype.sh = function (fn, base, o) {
    o = o || {}; var w = this.w, h = this.h, m = this.mask(fn), s = this.s;
    var hl = C(lt(base, o.hl == null ? .3 : o.hl)), md = C(base), sd = C(dk(base, o.sh == null ? .26 : o.sh)), dp = C(dk(base, .46));
    var r1 = Math.max(1, Math.round(1.1 * s)), r2 = Math.max(2, Math.round(2.6 * s));
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (!m[y * w + x]) continue;
      var col = md;
      if (!o.flat) {
        var up = 0; while (up < r2 + 1) { var xx = x - up - 1, yy = y - up - 1; if (xx < 0 || yy < 0 || !m[yy * w + xx]) break; up++; }
        var dn = 0; while (dn < r2 + 1) { var xx2 = x + dn + 1, yy2 = y + dn + 1; if (xx2 >= w || yy2 >= h || !m[yy2 * w + xx2]) break; dn++; }
        if (up < r1) col = hl; else if (dn <= 0) col = dp; else if (dn < r2) col = sd;
      }
      this.put(x, y, col);
    }
    return this;
  };
  Paint.prototype.fl = function (fn, color) { return this.sh(fn, color, { flat: true }); };
  Paint.prototype.dot = function (x, y, w, h, color) { x = Math.round(x * this.s); y = Math.round(y * this.s); w = Math.max(1, Math.round(w * this.s)); h = Math.max(1, Math.round(h * this.s)); var c = C(color); for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) if (x + i >= 0 && y + j >= 0 && x + i < this.w && y + j < this.h) this.put(x + i, y + j, c); return this; };
  Paint.prototype.finish = function (line) {
    var w = this.w, h = this.h, b = this.buf, o = new Uint8ClampedArray(b), L = C(line || '#120d1a');
    var a = function (x, y) { return x >= 0 && y >= 0 && x < w && y < h && b[(y * w + x) * 4 + 3] > 0; };
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var i = (y * w + x) * 4; if (b[i + 3]) continue;
      var n = a(x - 1, y) ? i - 4 : a(x + 1, y) ? i + 4 : a(x, y - 1) ? i - w * 4 : a(x, y + 1) ? i + w * 4 : -1;
      if (n < 0) continue;
      o[i] = b[n] * .22 + L[0] * .78; o[i + 1] = b[n + 1] * .22 + L[1] * .78; o[i + 2] = b[n + 2] * .22 + L[2] * .78; o[i + 3] = 255;
    }
    var c = document.createElement('canvas'); c.width = w; c.height = h; var x2 = c.getContext('2d'), id = x2.createImageData(w, h); id.data.set(o); x2.putImageData(id, 0, 0); return c;
  };

  /* ---------- heroes (64x64, facing right, feet near y=60) ---------- */
  var SKIN = '#f0c4a0';
  function eye(P, x, y, col) { P.dot(x, y, 2, 2, '#fff'); P.dot(x + 1, y, 1, 2, col || '#1a1020'); }
  function legs(P, c, boot, bc) {
    P.sh(PL([[25, 38], [31, 38], [30, 58], [24, 58]]), dk(c, .14)); P.sh(PL([[31, 38], [38, 38], [39, 58], [32, 58]]), c);
    P.sh(RR(20, 55, 12, 7, 3), boot); P.sh(RR(30, 55, 15, 7, 3), boot); P.dot(31, 59, 12, 1, bc || dk(boot, .3));
  }
  function face(P, hair) {
    P.sh(E(31, 15, 6.2, 7), SKIN); P.sh(RC(30, 20, 4, 3), dk(SKIN, .08), { flat: true });
    eye(P, 34, 14); P.dot(37, 16, 1, 2, dk(SKIN, .25)); P.dot(35, 19, 3, 1, '#b06458'); P.dot(33, 12, 4, 1, hair || '#3b2a1e');
  }
  var HEROES = {
    warden: function (P) {
      P.sh(PL([[24, 21], [17, 31], [14, 53], [28, 55], [28, 27]]), '#8e2c30');
      legs(P, '#7f8aa0', '#3b3f4e', '#2a2c36');
      P.sh(PL([[29, 40], [37, 40], [38, 56], [30, 58]]), '#d9dde6'); P.dot(33, 44, 2, 10, '#b5302e'); // tabard stripe
      P.sh(PL([[23, 21], [39, 21], [41, 41], [24, 42]]), '#a3adc2'); P.dot(29, 25, 8, 1, '#d6deee'); P.dot(28, 31, 9, 1, '#7a859b'); P.dot(28, 35, 9, 1, '#7a859b');
      P.sh(RR(24, 38, 17, 4, 1.5), '#5c3b20'); P.dot(31, 38, 4, 4, '#f0c850');
      P.sh(E(26, 24, 6.5, 4.6, -.35), '#c2cadc'); P.sh(RR(27, 18, 9, 5, 2), '#8f99ae');
      P.sh(E(31, 12.5, 7.4, 8), '#aeb8cb'); P.sh(PL([[31, 5], [32, 5], [33, 13], [31, 13]]), '#8a94aa', { flat: true });
      P.fl(RR(32, 11.5, 9, 3, 1.2), '#14111b'); P.dot(33, 17, 5, 1, '#6c7690'); P.dot(35, 12, 4, 1, '#ffcf78');
      P.sh(CV([[27, 6], [21, 1], [12, 3], [8, 11], [15, 9], [22, 11]]), '#c6403a');
      P.sh(PL([[38, 24], [52, 24], [52, 39], [45, 54], [38, 39]]), '#c9d0dd'); P.fl(PL([[40, 26], [50, 26], [50, 38], [45, 49], [40, 38]]), '#d9dfe9');
      P.sh(RC(43.4, 28, 3, 18), '#b5302e'); P.sh(RC(39.5, 33, 11, 3), '#b5302e');
      P.sh(LN(37, 26, 41, 35, 5.5), '#7f8aa0'); P.sh(E(41, 36, 3.4, 3.4), '#6a7488');
      P.sh(LN(48, 50, 58, 62, 2.6), '#e2e7f0'); P.sh(RC(45, 47, 8, 2.4), '#f0c850');
    },
    pikeman: function (P) {
      P.sh(PL([[24, 22], [18, 36], [19, 50], [26, 48]]), '#6a2f2a'); // short cloak
      legs(P, '#56402c', '#2d2018', '#1c140e');
      P.sh(PL([[24, 21], [39, 21], [40, 42], [25, 43]]), '#a8402e'); P.sh(PL([[29, 22], [35, 22], [35, 42], [29, 42]]), '#d8c9a0'); P.dot(31, 26, 2, 12, '#b9a97c');
      P.sh(RR(24, 38, 17, 4, 1.5), '#4a2f18'); P.dot(30, 38, 4, 4, '#c9a24a');
      P.sh(RR(35, 42, 6, 8, 2), '#6a4a2b'); // pouch
      P.sh(E(26, 24, 5.2, 4, -.3), '#7c7e86'); P.sh(RR(26, 19, 10, 5, 2), '#c63a34'); P.sh(PL([[26, 22], [22, 30], [26, 29], [29, 23]]), '#c63a34'); // scarf
      face(P, '#3b2a1e'); P.sh(PL([[24, 10], [31, 3], [38, 9], [39, 11], [24, 12]]), '#7a5a35'); P.sh(RC(23, 10, 17, 2.4), '#5a4025');
      P.sh(LN(36, 25, 43, 33, 5), '#8a3a2c'); P.sh(E(44, 34, 3.2, 3), SKIN);
      P.sh(LN(46, 2, 41, 62, 2.2), '#8d6a3c'); P.sh(PL([[46, 1], [43, 10], [48, 10]]), '#dfe6f2'); P.dot(43, 10, 6, 2, '#b4432c');
    },
    witch: function (P) {
      P.sh(PL([[22, 22], [14, 48], [20, 58], [30, 58], [30, 26]]), '#3f2a6e');
      P.sh(PL([[24, 21], [38, 21], [46, 59], [18, 59]]), '#6a45a8'); P.sh(PL([[18, 55], [46, 55], [46, 59], [18, 59]]), '#e0b44a', { flat: true });
      P.sh(RR(24, 36, 17, 3.4, 1.4), '#e0b44a'); P.sh(RR(37, 36, 5, 9, 2), '#58c8c0');
      P.sh(CV([[23, 12], [19, 22], [17, 36], [24, 30], [27, 20]]), '#e08838');
      face(P, null); P.sh(CV([[24, 12], [24, 4], [33, 2], [39, 6], [38, 13], [30, 10]]), '#e08838');
      P.sh(E(31, 9, 13, 3.2, -.05), '#3d2a70'); P.sh(PL([[22, 8], [40, 8], [34, 1], [36, -6], [30, -3], [27, 1]]), '#4d3590'); P.dot(23, 6, 17, 2, '#e0b44a'); P.dot(30, 5, 4, 3, '#f4d46a');
      P.sh(LN(37, 25, 43, 34, 5), '#5a3a94'); P.sh(E(44, 35, 3, 3), SKIN);
      P.sh(LN(48, 8, 44, 62, 2.2), '#7a5230'); P.sh(E(48, 6, 4.5, 4.5), '#58f0d0'); P.dot(46, 4, 2, 2, '#ffffff');
    },
    chanter: function (P) {
      P.sh(PL([[23, 20], [17, 40], [20, 59], [31, 58], [30, 26]]), '#cfc4a6');
      P.sh(PL([[24, 21], [38, 21], [46, 59], [18, 59]]), '#ece3ca'); P.sh(PL([[29, 22], [34, 22], [37, 59], [28, 59]]), '#4f9c68'); P.dot(31, 30, 1, 26, '#9ee0b0'); P.dot(18, 56, 28, 3, '#c9a24a');
      P.sh(RR(24, 37, 17, 3, 1.3), '#c9a24a');
      for (var i = 0; i < 5; i++) P.dot(35 + i * .8, 28 + i * 2.2, 2, 2, '#e6c05a');
      face(P, null); P.sh(CV([[22, 20], [20, 8], [30, 1], [41, 6], [41, 14], [37, 8], [29, 8], [26, 21]]), '#ece3ca'); P.fl(RC(23, 18, 5, 2), '#cfc4a6');
      P.sh(LN(37, 26, 44, 33, 5), '#ece3ca'); P.sh(E(45, 34, 3, 3), SKIN);
      P.sh(LN(49, 12, 45, 62, 2.2), '#9b7a4a'); P.sh(E(49, 9, 4.2, 5.2), '#e6c05a'); P.dot(48, 13, 2, 3, '#6a4a22'); P.dot(47, 6, 2, 2, '#fff4b8');
    },
    trapper: function (P) {
      P.sh(PL([[24, 21], [14, 44], [18, 54], [30, 50], [29, 27]]), '#4a5a30');
      legs(P, '#4a3a28', '#2c2016', '#1a120c');
      P.sh(PL([[23, 21], [40, 21], [42, 44], [24, 45]]), '#66783f'); P.sh(PL([[25, 36], [41, 36], [42, 46], [24, 46]]), '#4f5e32'); P.dot(28, 24, 1, 14, '#3a2614'); P.dot(36, 24, 1, 14, '#3a2614');
      P.sh(RR(24, 38, 17, 3.4, 1.4), '#3a2614'); P.sh(RR(8, 20, 8, 20, 2.5), '#6a4528'); P.dot(10, 16, 1, 6, '#d8d0b8'); P.dot(12, 15, 1, 7, '#d8d0b8'); P.dot(14, 16, 1, 6, '#d8d0b8');
      P.sh(E(31, 22, 9.4, 4.2), '#e4d8b0'); P.dot(26, 21, 10, 1, '#c8b88a');
      face(P, null); P.sh(CV([[22, 22], [20, 8], [30, 0], [41, 7], [42, 15], [37, 9], [29, 9], [26, 22]]), '#55663a');
      P.sh(LN(37, 26, 44, 34, 5), '#4f5e32'); P.sh(E(45, 35, 3, 3), SKIN);
      P.sh(RR(42, 31, 15, 4, 1.5), '#6a4528'); P.sh(LN(55, 22, 55, 44, 2.4), '#3a2614'); P.dot(41, 28, 15, 1, '#d8d0b8'); P.dot(41, 36, 15, 1, '#d8d0b8');
      P.sh(RR(4, 56, 14, 5, 1.5), '#7b7d86'); for (var j = 0; j < 4; j++) P.dot(5 + j * 3.4, 53, 1.6, 3, '#c9ccd6');
    },
    tinker: function (P) {
      P.sh(RR(8, 18, 16, 24, 3), '#7a6240'); P.sh(E(15, 28, 4.6, 4.6), '#c8b84c'); P.sh(E(15, 28, 1.8, 1.8), '#4a3a20', { flat: true }); P.sh(LN(11, 18, 11, 8, 3), '#a0a4ac'); P.sh(LN(18, 18, 18, 10, 3), '#a0a4ac'); P.dot(7, 8, 8, 2, '#dfe6ee'); P.sh(RR(10, 40, 14, 4, 1.5), '#5a4a30');
      legs(P, '#3f4e6e', '#2c2118', '#1a130d');
      P.sh(PL([[24, 21], [39, 21], [40, 41], [25, 42]]), '#3c82c4'); P.sh(PL([[26, 22], [38, 22], [40, 40], [27, 40]]), '#dd922f'); P.dot(32, 24, 1, 16, '#a96a1b'); P.dot(28, 28, 4, 3, '#b87a28');
      P.sh(RR(24, 38, 17, 3.4, 1.4), '#4a2f18'); P.sh(RR(36, 37, 5, 6, 1.5), '#8a8e98');
      P.sh(E(27, 24, 4.8, 3.8, -.3), '#c8c8d0');
      face(P, null); P.sh(CV([[23, 12], [24, 5], [32, 2], [39, 6], [39, 11], [31, 9]]), '#7a3b24');
      P.sh(RR(24, 8.5, 16, 3.2, 1.4), '#4a3a2a'); P.sh(E(29, 9.5, 3.6, 3.6), '#6fe0f0'); P.sh(E(36, 9.5, 3.6, 3.6), '#6fe0f0'); P.dot(27.4, 8, 1.6, 1.6, '#ffffff'); P.dot(34.4, 8, 1.6, 1.6, '#ffffff');
      P.sh(LN(37, 25, 44, 34, 5), '#dd922f'); P.sh(E(45, 35, 3, 3), SKIN);
      P.sh(LN(50, 28, 47, 56, 2.6), '#aab0ba'); P.sh(E(50, 27, 4, 3.4), '#c6ccd6'); P.fl(RC(48.5, 26, 3, 2), '#16101f');
    }
  };
  // the wizard is drawn chunky (32px, then doubled) in the bold-outline style of classic pixel wizards
  function wizard() {
    var P = new Paint(32, 32, .5);
    P.sh(PL([[12, 36], [47, 36], [53, 58], [8, 58]]), '#8c7c72', { hl: .16, sh: .3 });                 // robe
    P.sh(PL([[36, 36], [47, 36], [53, 58], [40, 58]]), '#6a5c5c', { hl: .05 });                         // shadowed side
    P.sh(RC(8, 55, 45, 4), '#6a3a3a', { hl: .1 });                                                      // hem
    P.sh(RR(18, 58, 11, 5, 2), '#4a3a4a'); P.sh(RR(32, 58, 12, 5, 2), '#4a3a4a');
    P.sh(CV([[18, 30], [41, 30], [44, 44], [35, 58], [29, 61], [22, 46]]), '#f4f4fa', { hl: .0, sh: .18 }); // beard
    P.fl(CV([[32, 34], [41, 32], [42, 44], [35, 58]]), '#b8c4dc');                                      // beard shade
    P.fl(RC(27, 44, 2, 12), '#d6dcec');
    P.sh(E(29, 29, 7, 4.6), '#f0b890', { hl: .1 }); P.dot(25, 28, 3, 2, '#1c1420'); P.dot(33, 28, 3, 2, '#1c1420'); P.dot(29, 31, 3, 2, '#c8826a'); // face
    P.fl(E(29, 25.5, 24, 5), '#16101c');                                                                // brim shadow
    P.sh(E(29, 23, 24, 5.4), '#9a8a86', { hl: .14 });                                                   // brim
    P.sh(CV([[14, 23], [22, 12], [30, 4], [40, 2], [51, 4], [58, 11], [52, 9], [46, 9], [41, 15], [46, 23]]), '#9a8a86', { hl: .14 }); // cone
    P.fl(CV([[40, 5], [51, 3], [58, 11], [51, 9], [45, 10], [41, 15]]), '#6c6a86');                     // slate fold
    P.fl(LN(18, 18, 44, 17, 2), '#2a2030');                                                             // hat band
    P.fl(LN(47, 5, 57, 10, 2), '#16101c');
    P.sh(LN(41, 40, 51, 46, 7), '#8c7c72'); P.sh(E(52, 47, 4.6, 4.6), '#f0b890');                       // sleeve + hand
    P.sh(LN(55, 16, 53, 63, 3.2), '#5a3a3a', { hl: .2 });                                              // staff
    P.sh(CV([[55, 15], [55, 7], [50, 2], [43, 4], [43, 11], [48, 11], [48, 7], [51, 8], [52, 15]]), '#5a3a3a', { hl: .2 }); // crook
    P.sh(E(16, 48, 4, 4), '#f0b890');
    var small = P.finish('#0e0a14'), c = document.createElement('canvas'); c.width = 64; c.height = 64; var x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(small, -2, 0, 32, 32, 0, 0, 62, 64); return c;
  }
  var heroCache = {};
  ART.hero = function (id) {
    if (heroCache[id]) return heroCache[id];
    if (id === 'witch') return (heroCache[id] = wizard());
    var P = new Paint(64, 64, 1); (HEROES[id] || HEROES.warden)(P); return (heroCache[id] = P.finish());
  };
  ART.portrait = function (id) {
    var s = ART.hero(id), c = document.createElement('canvas'); c.width = 28; c.height = 24; var x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(s, 17, 0, 28, 24, 0, 0, 28, 24); return c;
  };

  /* ---------- monsters (drawn on a 64 grid, facing right, mirrored) ---------- */
  var PALS = {
    meadow: [['#7b5cd6', '#ffd24a'], ['#4fb25e', '#ff7a5a'], ['#c86e3c', '#fff09a']],
    pine: [['#3f8f8a', '#ffe48a'], ['#5a7a3a', '#ff9a4a'], ['#7a5a3c', '#9affd0']],
    marsh: [['#5c9a4a', '#f4ff7a'], ['#8aa84a', '#ff6a8a'], ['#4a8a7c', '#fff0a0']],
    pass: [['#8ec8f0', '#ffffff'], ['#a8b6c8', '#7ad0ff'], ['#7a82b8', '#ffe27a']],
    ruins: [['#a0705a', '#ffd04a'], ['#8a8a9c', '#ff5a5a'], ['#7a5a9c', '#8affea']],
    ash: [['#d6532f', '#ffe04a'], ['#5a4a48', '#ff7a2a'], ['#d68a2a', '#fff0b0']]
  };
  function eyeG(P, x, y, col, r) { P.fl(E(x, y, r || 2.2, (r || 2.2) * 1.1), col); P.dot(x - .5, y - .5, 1, 1, '#ffffff'); }
  var MON = {
    blob: function (P, m, d, l, e) {
      P.sh(CV([[8, 50], [8, 36], [18, 22], [32, 18], [46, 24], [56, 38], [56, 52], [32, 58]]), m, { hl: .34 });
      P.fl(E(24, 30, 6, 3.4, -.6), lt(m, .5)); P.fl(E(44, 46, 3, 2), lt(m, .25)); P.fl(E(18, 46, 2, 2), dk(m, .15)); P.fl(E(34, 50, 2.4, 2.4), lt(m, .2));
      P.fl(E(26, 36, 4.6, 5.4), '#ffffff'); P.fl(E(40, 36, 4.6, 5.4), '#ffffff'); P.fl(E(27.6, 37, 2.4, 3.4), '#1a1020'); P.fl(E(41.6, 37, 2.4, 3.4), '#1a1020');
      P.fl(RR(28, 46, 14, 2.4, 1.2), dk(m, .5)); P.dot(30, 46, 2, 2, '#fff'); P.dot(36, 46, 2, 2, '#fff');
      P.sh(CV([[10, 56], [12, 52], [16, 58]]), dk(m, .1)); P.sh(CV([[50, 56], [52, 51], [56, 58]]), dk(m, .1));
    },
    imp: function (P, m, d, l, e) {
      P.sh(PL([[22, 28], [4, 14], [8, 36], [20, 42]]), dk(m, .2)); P.sh(PL([[40, 28], [58, 14], [54, 36], [42, 42]]), dk(m, .2));
      P.sh(LN(40, 50, 52, 46, 2), d); P.sh(PL([[52, 42], [58, 46], [54, 52]]), d);
      P.sh(RR(24, 30, 18, 20, 7), m); P.sh(RR(25, 48, 6, 11, 3), d); P.sh(RR(34, 48, 6, 11, 3), d);
      P.sh(E(33, 22, 9, 8.4), m); P.sh(PL([[26, 17], [22, 6], [31, 14]]), '#e8dcc0'); P.sh(PL([[40, 17], [44, 6], [35, 14]]), '#e8dcc0');
      eyeG(P, 29, 22, e, 2.4); eyeG(P, 38, 22, e, 2.4); P.fl(RR(29, 28, 10, 2, 1), '#1a1020'); for (var i = 0; i < 4; i++) P.dot(30 + i * 2.4, 28, 1, 2, '#fff');
      P.sh(LN(44, 32, 50, 38, 4), m); P.fl(E(51, 36, 4.6, 4.6), e); P.fl(E(51, 36, 2.4, 2.4), '#fff7c0');
    },
    wolf: function (P, m, d, l, e) {
      P.sh(CV([[2, 24], [10, 28], [14, 36], [6, 38], [0, 32]]), m); // tail
      P.sh(RR(10, 30, 8, 28, 3), d); P.sh(RR(40, 34, 8, 25, 3), d);
      P.sh(CV([[8, 38], [14, 28], [30, 26], [44, 30], [48, 40], [42, 48], [20, 50], [10, 46]]), m);
      for (var i = 0; i < 6; i++) P.fl(PL([[16 + i * 5, 28], [19 + i * 5, 24 - (i % 2) * 2], [21 + i * 5, 29]]), d);
      P.sh(RR(18, 38, 8, 22, 3), m); P.sh(RR(34, 40, 8, 20, 3), m);
      P.sh(CV([[40, 28], [48, 20], [58, 26], [62, 32], [54, 38], [44, 38]]), m); P.fl(PL([[54, 30], [63, 33], [55, 37]]), l);
      P.sh(PL([[42, 22], [44, 12], [50, 20]]), d); P.sh(PL([[48, 20], [52, 11], [56, 22]]), d); eyeG(P, 52, 28, e, 1.8);
      P.dot(57, 34, 5, 2, '#ffffff'); P.dot(61, 31, 2, 2, '#1a1020');
    },
    golem: function (P, m, d, l, e) {
      P.sh(RR(20, 44, 11, 17, 3), d); P.sh(RR(34, 44, 11, 17, 3), d);
      P.sh(CV([[16, 22], [22, 18], [44, 18], [50, 24], [48, 46], [18, 46]]), m);
      P.sh(RR(4, 22, 13, 28, 5), d); P.sh(RR(48, 22, 13, 28, 5), d); P.sh(RR(2, 46, 17, 11, 4), m); P.sh(RR(46, 46, 17, 11, 4), m);
      P.sh(RR(23, 4, 20, 16, 4), m); P.fl(RR(26, 10, 6, 3, 1), e); P.fl(RR(35, 10, 6, 3, 1), e); P.fl(E(33, 34, 5, 5), e); P.fl(E(33, 34, 2.6, 2.6), '#fff7c0');
      P.fl(LN(22, 22, 28, 32, 1.4), dk(m, .5)); P.fl(LN(42, 24, 38, 40, 1.4), dk(m, .5)); P.fl(LN(36, 6, 38, 12, 1.2), dk(m, .5));
      P.sh(E(18, 20, 6, 3.6), '#5ca84a'); P.sh(E(46, 21, 5, 3), '#5ca84a');
    },
    wraith: function (P, m, d, l, e) {
      P.sh(CV([[16, 60], [20, 40], [22, 20], [32, 8], [44, 16], [46, 38], [54, 54], [46, 52], [40, 62], [32, 54], [24, 62]]), dk(m, .1), { hl: .2 });
      P.sh(CV([[24, 22], [28, 8], [40, 8], [44, 22], [38, 26], [30, 26]]), dk(m, .4)); P.fl(E(36, 17, 6.4, 7), '#0a0710');
      eyeG(P, 34, 16, e, 2); eyeG(P, 41, 16, e, 2);
      P.sh(PL([[44, 34], [60, 38], [46, 42]]), dk(m, .1)); P.fl(LN(57, 36, 62, 33, 1.2), l); P.fl(LN(57, 38, 63, 38, 1.2), l); P.fl(LN(57, 40, 62, 43, 1.2), l);
      P.sh(LN(10, 6, 12, 60, 2), '#6a5a48'); P.fl(E(10, 6, 4, 4), e);
    },
    ghoul: function (P, m, d, l, e) {
      P.sh(RR(24, 44, 9, 16, 3), d); P.sh(RR(36, 44, 9, 16, 3), d);
      P.sh(CV([[16, 44], [14, 28], [24, 20], [38, 22], [44, 34], [40, 48]]), '#4a4046'); P.sh(PL([[18, 40], [44, 40], [48, 52], [14, 50]]), '#2c2330');
      P.sh(CV([[38, 20], [38, 10], [48, 6], [56, 12], [54, 24], [44, 26]]), m); P.fl(RR(46, 22, 10, 2, 1), '#1a1020'); for (var i = 0; i < 3; i++) P.dot(47 + i * 3, 22, 1.4, 2.4, '#e8e8d0');
      eyeG(P, 49, 14, e, 2); P.sh(PL([[40, 10], [38, 4], [44, 8]]), d);
      P.sh(LN(40, 28, 54, 40, 5), m); P.sh(PL([[52, 38], [62, 44], [56, 46]]), d); P.sh(LN(18, 30, 8, 46, 5), m); P.sh(PL([[6, 44], [10, 54], [14, 46]]), d);
      P.fl(LN(20, 30, 36, 36, 1), d); P.fl(LN(24, 40, 30, 46, 1), d);
    },
    bat: function (P, m, d, l, e) {
      P.sh(PL([[30, 28], [2, 10], [6, 30], [12, 24], [16, 38], [24, 34]]), dk(m, .1)); P.sh(PL([[34, 28], [62, 10], [58, 30], [52, 24], [48, 38], [40, 34]]), dk(m, .1));
      P.fl(LN(30, 28, 3, 11, 1.6), l); P.fl(LN(34, 28, 61, 11, 1.6), l); P.fl(LN(30, 30, 13, 26, 1.1), l); P.fl(LN(34, 30, 51, 26, 1.1), l);
      P.sh(E(32, 38, 6, 11), m); P.sh(E(32, 24, 8, 7.6), m); P.sh(PL([[26, 20], [24, 8], [31, 17]]), d); P.sh(PL([[38, 20], [40, 8], [33, 17]]), d);
      eyeG(P, 29, 24, e, 2); eyeG(P, 36, 24, e, 2); P.fl(RR(29, 29, 8, 2.4, 1), '#1a1020'); P.dot(30, 29, 1.2, 2, '#fff'); P.dot(35, 29, 1.2, 2, '#fff');
      P.sh(LN(29, 48, 25, 58, 2.4), d); P.sh(LN(35, 48, 39, 58, 2.4), d); P.fl(E(32, 40, 3.4, 5), l);
    },
    wisp: function (P, m, d, l, e) {
      P.sh(PL([[22, 40], [42, 40], [36, 20], [32, 2], [27, 20]]), lt(m, .12)); P.sh(PL([[14, 46], [50, 46], [38, 26], [32, 8], [26, 26]]), m);
      P.sh(E(32, 44, 18, 16), m, { hl: .4 }); P.fl(E(32, 46, 11, 10), lt(m, .55)); P.fl(E(32, 47, 6, 6), '#ffffff');
      P.fl(E(27, 44, 2.2, 3.4), '#1a1020'); P.fl(E(37, 44, 2.2, 3.4), '#1a1020'); P.dot(26, 42, 1.4, 1.4, '#fff'); P.dot(36, 42, 1.4, 1.4, '#fff');
      P.dot(8, 28, 3, 3, e); P.dot(54, 20, 3, 3, e); P.dot(58, 42, 2, 2, e); P.dot(6, 50, 2, 2, e); P.dot(48, 12, 2, 2, e);
    },
    lizard: function (P, m, d, l, e) {
      P.sh(CV([[0, 40], [10, 36], [18, 40], [10, 46], [2, 46]]), m);
      P.sh(RR(14, 40, 9, 20, 3), d); P.sh(RR(42, 42, 9, 18, 3), d);
      P.sh(CV([[12, 46], [14, 34], [30, 28], [46, 32], [50, 44], [44, 54], [20, 54]]), m); P.sh(CV([[18, 48], [32, 44], [46, 48], [44, 54], [20, 54]]), lt(m, .3));
      for (var i = 0; i < 6; i++) P.sh(PL([[18 + i * 5, 31], [22 + i * 5, 31], [20 + i * 5, 23]]), d);
      P.sh(RR(24, 44, 9, 16, 3), m); P.sh(RR(38, 46, 9, 14, 3), m);
      P.sh(CV([[42, 30], [50, 22], [60, 28], [62, 36], [54, 40], [46, 38]]), m); P.sh(PL([[46, 24], [44, 14], [52, 22]]), d); P.sh(PL([[52, 22], [56, 12], [58, 24]]), d);
      eyeG(P, 54, 29, e, 1.8); P.dot(59, 36, 4, 2, '#ffffff'); P.dot(60, 32, 2, 2, '#1a1020');
    }
  };
  var monCache = {};
  ART.mon = function (arch, biome, idx, boss) {
    var key = [arch, biome, idx, boss ? 1 : 0].join();
    if (monCache[key]) return monCache[key];
    var pal = (PALS[biome] || PALS.meadow)[idx % 3], sc = boss ? 1.6 : 1, N = Math.round(64 * sc);
    var P = new Paint(N, N, sc); (MON[arch] || MON.blob)(P, pal[0], dk(pal[0], .35), lt(pal[0], .4), pal[1]);
    if (boss) { for (var i = 0; i < 5; i++) P.sh(PL([[(14 + i * 8) * sc, 12 * sc], [(19 + i * 8) * sc, 12 * sc], [(16.5 + i * 8) * sc, (2 + (i % 2) * 3) * sc]]), '#e6c05a'); }
    var cv = P.finish(), out = ART.mirror(cv); return (monCache[key] = out);
  };

  /* ---------- procedural textures for the 3D world ---------- */
  var TX = ART.tx = {};
  function noise2(seed, cell) { // tileable value noise sampler (period = cell grid size n)
    var r = rng(seed), g = []; for (var i = 0; i < cell * cell; i++) g.push(r());
    return function (x, y) { // x,y in 0..1 (tiling)
      var fx = x * cell, fy = y * cell, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      var a = g[(y0 % cell) * cell + (x0 % cell)], b = g[(y0 % cell) * cell + ((x0 + 1) % cell)], c = g[((y0 + 1) % cell) * cell + (x0 % cell)], d = g[((y0 + 1) % cell) * cell + ((x0 + 1) % cell)];
      return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    };
  }
  function fbm(seed) { var n = [noise2(seed, 4), noise2(seed + 1, 8), noise2(seed + 2, 16), noise2(seed + 3, 32)]; return function (x, y) { return n[0](x, y) * .5 + n[1](x, y) * .27 + n[2](x, y) * .15 + n[3](x, y) * .08; }; }
  function cnv(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  var GCOL = {
    meadow: { a: '#3f8a35', b: '#68b448', c: '#2a6a2a', flow: ['#ffe14a', '#ffffff', '#ff8aa8'] }, pine: { a: '#2c6a4c', b: '#4a9468', c: '#1f4c38', flow: ['#e8f0e8'] },
    marsh: { a: '#46663e', b: '#6a8a48', c: '#2e4a3a', flow: ['#b8d86a'] }, pass: { a: '#9aa4b4', b: '#eef3f8', c: '#6c7688', flow: [] },
    ruins: { a: '#5e6a4c', b: '#84906a', c: '#454e3a', flow: ['#c8b8d8'] }, ash: { a: '#2e262c', b: '#4a3c40', c: '#1c161c', flow: [] }
  };
  TX.ground = function (biome) { // 512 tile: grass with blades
    var G = GCOL[biome] || GCOL.meadow, S = 512, cv = cnv(S, S), x = cv.getContext('2d'), f = fbm(hash('g' + biome)), id = x.createImageData(S, S), A = rgb(G.a), B = rgb(G.b), Cc = rgb(G.c);
    for (var j = 0; j < S; j++) for (var i = 0; i < S; i++) {
      var n = f(i / S, j / S), k = (j * S + i) * 4, t = Math.max(0, Math.min(1, (n - .3) * 2.2)), u = Math.max(0, (.45 - n) * 2.4);
      id.data[k] = A[0] + (B[0] - A[0]) * t - (A[0] - Cc[0]) * u; id.data[k + 1] = A[1] + (B[1] - A[1]) * t - (A[1] - Cc[1]) * u; id.data[k + 2] = A[2] + (B[2] - A[2]) * t - (A[2] - Cc[2]) * u; id.data[k + 3] = 255;
    }
    x.putImageData(id, 0, 0); var r = rng(hash('b' + biome)); x.lineWidth = 1.4;
    for (var q = 0; q < 5200; q++) {
      var px = r() * S, py = r() * S, h = 3 + r() * 6, lean = (r() - .5) * 3, dl = r(); x.strokeStyle = dl < .5 ? mix(G.a, '#000000', .25 + r() * .2) : mix(G.b, '#ffffff', r() * .25);
      x.globalAlpha = .35 + r() * .4; x.beginPath(); x.moveTo(px, py); x.lineTo(px + lean, py - h); x.stroke();
      if (px < 8) { x.beginPath(); x.moveTo(px + S, py); x.lineTo(px + S + lean, py - h); x.stroke(); } if (py < 10) { x.beginPath(); x.moveTo(px, py + S); x.lineTo(px + lean, py + S - h); x.stroke(); }
    }
    x.globalAlpha = 1; for (q = 0; q < (G.flow.length ? 70 : 0); q++) { x.fillStyle = G.flow[q % G.flow.length]; var fx = r() * S, fy = r() * S; x.fillRect(fx, fy, 2, 2); x.fillRect(fx - 1, fy + 1, 1, 1); }
    if (biome === 'ash') { x.strokeStyle = '#ff6a20'; x.globalAlpha = .55; for (q = 0; q < 22; q++) { var sx = r() * S, sy = r() * S; x.lineWidth = 1 + r(); x.beginPath(); x.moveTo(sx, sy); for (var z = 0; z < 5; z++) { sx += (r() - .5) * 26; sy += (r() - .5) * 26; x.lineTo(sx, sy); } x.stroke(); } x.globalAlpha = 1; }
    return cv;
  };
  var PCOL = { meadow: ['#a8a090', '#7c7468', '#5d7a3a'], pine: ['#8f9288', '#68706a', '#4c7a56'], marsh: ['#7c7660', '#5c5848', '#4a6a3a'], pass: ['#8a8e9c', '#646878', '#f0f4f8'], ruins: ['#9a94a4', '#6e6878', '#5c7a4c'], ash: ['#6a5a58', '#463a3a', '#ff6a20'] };
  TX.path = function (biome) { // 512 cobblestone tile; returns {map, bump}
    var S = 512, N = 9, cv = cnv(S, S), bm = cnv(S, S), x = cv.getContext('2d'), bx = bm.getContext('2d'), r = rng(hash('p' + biome)), P = PCOL[biome] || PCOL.meadow, pts = [], cc = [];
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) { pts.push([(i + .15 + r() * .7) / N, (j + .15 + r() * .7) / N]); cc.push(mix(P[0], P[1], r())); }
    var id = x.createImageData(S, S), bd = bx.createImageData(S, S), nz = fbm(hash('pn' + biome)), mo = rgb(P[2]);
    for (var y = 0; y < S; y++) for (var xx = 0; xx < S; xx++) {
      var u = xx / S, v = y / S, ci = Math.floor(u * N), cj = Math.floor(v * N), d1 = 9, d2 = 9, bi = 0;
      for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) {
        var gi = (ci + di + N) % N, gj = (cj + dj + N) % N, p = pts[gj * N + gi], px = p[0] + (ci + di < 0 ? -1 : ci + di >= N ? 1 : 0) * 0, ddx = Math.abs(u - p[0]); ddx = Math.min(ddx, 1 - ddx); var ddy = Math.abs(v - p[1]); ddy = Math.min(ddy, 1 - ddy);
        var dd = Math.hypot(ddx, ddy) * N; if (dd < d1) { d2 = d1; d1 = dd; bi = gj * N + gi; } else if (dd < d2) d2 = dd;
      }
      var edge = Math.max(0, Math.min(1, (d2 - d1) * 5.2)), col = rgb(cc[bi]), n = nz(u, v), k = (y * S + xx) * 4, sh = .78 + .3 * n + .18 * edge, g = Math.max(0, .45 - edge) * 1.3 * (n > .5 ? 1 : .4);
      id.data[k] = (col[0] * (.35 + .65 * edge) * sh) * (1 - g) + mo[0] * g * .8; id.data[k + 1] = (col[1] * (.35 + .65 * edge) * sh) * (1 - g) + mo[1] * g * .8; id.data[k + 2] = (col[2] * (.35 + .65 * edge) * sh) * (1 - g) + mo[2] * g * .8; id.data[k + 3] = 255;
      var hv = 255 * (edge * (.8 + .2 * n)); bd.data[k] = bd.data[k + 1] = bd.data[k + 2] = hv; bd.data[k + 3] = 255;
    }
    x.putImageData(id, 0, 0); bx.putImageData(bd, 0, 0); return { map: cv, bump: bm };
  };
  TX.bark = function (col) { var cv = cnv(128, 128), x = cv.getContext('2d'), r = rng(hash('bk' + col)); x.fillStyle = col; x.fillRect(0, 0, 128, 128); for (var i = 0; i < 90; i++) { x.fillStyle = r() < .5 ? 'rgba(0,0,0,.22)' : 'rgba(255,255,255,.1)'; x.fillRect(r() * 128, r() * 128, 1 + r() * 2.4, 14 + r() * 50); } return cv; };
  TX.leaf = function (col) { var cv = cnv(128, 128), x = cv.getContext('2d'), r = rng(hash('lf' + col)); x.fillStyle = col; x.fillRect(0, 0, 128, 128); for (var i = 0; i < 380; i++) { var t = r(); x.fillStyle = t < .4 ? mix(col, '#000000', .25) : mix(col, '#ffffff', .1 + r() * .22); x.save(); x.translate(r() * 128, r() * 128); x.rotate(r() * 6.28); x.beginPath(); x.ellipse(0, 0, 4 + r() * 4, 2 + r() * 2, 0, 0, 6.28); x.fill(); x.restore(); } return cv; };
  TX.rock = function (col) { var S = 256, cv = cnv(S, S), x = cv.getContext('2d'), f = fbm(hash('rk' + col)), id = x.createImageData(S, S), A = rgb(col); for (var j = 0; j < S; j++) for (var i = 0; i < S; i++) { var n = f(i / S, j / S), k = (j * S + i) * 4, s = .6 + n * .75, cr = Math.abs(f(i / S * 2 % 1, j / S * 2 % 1) - .5) < .02 ? .55 : 1; id.data[k] = A[0] * s * cr; id.data[k + 1] = A[1] * s * cr; id.data[k + 2] = A[2] * s * cr; id.data[k + 3] = 255; } x.putImageData(id, 0, 0); return cv; };
  TX.waterBump = function () { var S = 256, cv = cnv(S, S), x = cv.getContext('2d'), f = fbm(77), id = x.createImageData(S, S); for (var j = 0; j < S; j++) for (var i = 0; i < S; i++) { var v = Math.sin((f(i / S, j / S) * 10 + i / S * 6.28 * 2)) * .5 + .5, k = (j * S + i) * 4; id.data[k] = id.data[k + 1] = id.data[k + 2] = v * 255; id.data[k + 3] = 255; } x.putImageData(id, 0, 0); return cv; };
  TX.grassTuft = function (col) { var cv = cnv(64, 64), x = cv.getContext('2d'), r = rng(hash('tf' + col)); for (var i = 0; i < 26; i++) { var bx = 8 + r() * 48, h = 20 + r() * 36, lean = (r() - .5) * 22; x.strokeStyle = mix(col, r() < .5 ? '#000000' : '#ffffff', .1 + r() * .3); x.lineWidth = 1.6 + r(); x.beginPath(); x.moveTo(bx, 63); x.quadraticCurveTo(bx + lean * .3, 63 - h * .6, bx + lean, 63 - h); x.stroke(); } return cv; };
  TX.slash = function () { var cv = cnv(64, 64), x = cv.getContext('2d'); var g = x.createLinearGradient(8, 56, 58, 8); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.6, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.strokeStyle = g; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); x.moveTo(8, 56); x.quadraticCurveTo(14, 18, 58, 8); x.stroke(); x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.moveTo(14, 50); x.quadraticCurveTo(20, 22, 54, 12); x.stroke(); return cv; };
})(window);
