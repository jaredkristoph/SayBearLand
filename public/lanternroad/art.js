/* Lanternroad art: every sprite is drawn in code, pixel by pixel, once at load.
   All sprites face right. Foes are mirrored by ART.mon(). */
(function (root) {
  'use strict';
  var ART = {};
  function rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function hex(a) { return '#' + a.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function mix(a, b, t) { var A = rgb(a), B = rgb(b); return hex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]); }
  function lt(c, t) { return mix(c, '#ffffff', t == null ? .25 : t); }
  function dk(c, t) { return mix(c, '#0d0a1a', t == null ? .3 : t); }
  ART.mix = mix; ART.lt = lt; ART.dk = dk;
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  function Pix(w, h) {
    this.w = w; this.h = h; this.c = document.createElement('canvas'); this.c.width = w; this.c.height = h; this.x = this.c.getContext('2d');
  }
  Pix.prototype = {
    px: function (x, y, c) { this.x.fillStyle = c; this.x.fillRect(Math.round(x), Math.round(y), 1, 1); return this; },
    r: function (x, y, w, h, c) { this.x.fillStyle = c; this.x.fillRect(Math.round(x), Math.round(y), w, h); return this; },
    e: function (cx, cy, rx, ry, c) { // filled ellipse
      this.x.fillStyle = c;
      for (var y = -ry; y <= ry; y++) { var w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + .01)))); this.x.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1); }
      return this;
    },
    ln: function (x0, y0, x1, y1, c) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, er = dx + dy;
      for (; ;) { this.px(x0, y0, c); if (x0 === x1 && y0 === y1) break; var e2 = 2 * er; if (e2 >= dy) { er += dy; x0 += sx; } if (e2 <= dx) { er += dx; y0 += sy; } }
      return this;
    },
    tri: function (x0, y0, x1, y1, x2, y2, c) { // filled triangle by scanline
      var ys = [y0, y1, y2], mn = Math.min.apply(null, ys), mx = Math.max.apply(null, ys), P = [[x0, y0], [x1, y1], [x2, y2]];
      this.x.fillStyle = c;
      for (var y = mn; y <= mx; y++) {
        var xs = [];
        for (var i = 0; i < 3; i++) { var a = P[i], b = P[(i + 1) % 3]; if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
        if (xs.length >= 2) { var l = Math.round(Math.min.apply(null, xs)), rr = Math.round(Math.max.apply(null, xs)); this.x.fillRect(l, y, Math.max(1, rr - l + 1), 1); }
      }
      return this;
    },
    // rim light on the upper-left, shade on the lower-right, then a dark outline
    finish: function (outline, noShade) {
      var w = this.w, h = this.h, id = this.x.getImageData(0, 0, w, h), d = id.data, o = rgb(outline || '#16101f');
      var a = function (x, y) { return x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3] > 8; };
      var out = new Uint8ClampedArray(d);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        if (d[i + 3] > 8) {
          if (!noShade) {
            var k = 0;
            if (!a(x, y - 1) || !a(x - 1, y)) k = .2; else if (!a(x + 1, y) || !a(x, y + 1)) k = -.22;
            if (k > 0) { out[i] = d[i] + (255 - d[i]) * k; out[i + 1] = d[i + 1] + (255 - d[i + 1]) * k; out[i + 2] = d[i + 2] + (255 - d[i + 2]) * k; }
            else if (k < 0) { out[i] = d[i] * (1 + k); out[i + 1] = d[i + 1] * (1 + k); out[i + 2] = d[i + 2] * (1 + k); }
          }
        } else if (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1)) { out[i] = o[0]; out[i + 1] = o[1]; out[i + 2] = o[2]; out[i + 3] = 255; }
      }
      id.data.set(out); this.x.putImageData(id, 0, 0); return this;
    }
  };
  function mirror(src) { var c = document.createElement('canvas'); c.width = src.width; c.height = src.height; var x = c.getContext('2d'); x.translate(src.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0); return c; }
  function scale2(src, k) { var c = document.createElement('canvas'); c.width = src.width * k; c.height = src.height * k; var x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(src, 0, 0, c.width, c.height); return c; }
  ART.mirror = mirror;

  /* ---------------- heroes (32x32, facing right, feet on y=30) ---------------- */
  var SK = '#f0c9a0', SK2 = '#d9a77c';
  function legs(p, pants, boots) {
    p.r(13, 23, 3, 6, pants); p.r(17, 23, 3, 6, dk(pants, .15)); p.r(12, 28, 4, 2, boots); p.r(17, 28, 5, 2, boots);
  }
  function head(p, hair, o) {
    o = o || {};
    p.r(13, 5, 8, 8, SK); p.r(13, 11, 8, 2, SK2);
    p.px(18, 8, '#1a1020'); p.px(19, 8, '#1a1020'); p.px(19, 11, '#a0584a');
    if (hair) { p.r(12, 4, 9, 3, hair); p.r(12, 4, 2, 8, hair); }
  }
  var HEROES = {
    warden: function (p) {
      var steel = '#8c96ab', ST = '#b3bccf';
      legs(p, '#4a4f60', '#2b2a36');
      p.r(12, 13, 9, 10, steel); p.r(12, 21, 9, 1, '#5a3b22'); p.r(14, 15, 5, 1, ST);
      p.r(11, 13, 3, 3, ST); // pauldron
      p.r(13, 4, 8, 9, steel); p.r(13, 4, 8, 2, ST); p.r(17, 8, 4, 1, '#14121c'); p.r(15, 1, 3, 4, '#c2362e'); p.px(14, 3, '#c2362e'); // helm + plume
      p.r(13, 9, 1, 3, steel);
      p.e(23, 19, 3, 6, '#6e4426'); p.e(23, 19, 2, 5, '#8c5a32'); p.px(23, 19, '#ffcb52'); p.px(23, 18, '#ffcb52'); p.px(23, 20, '#ffcb52'); // shield + lantern emblem
      p.r(20, 17, 2, 4, steel);
    },
    pikeman: function (p) {
      legs(p, '#5a4632', '#2c2018');
      p.r(12, 13, 9, 10, '#b4432c'); p.r(14, 13, 5, 10, '#d9c9a0'); p.r(12, 21, 9, 1, '#4a2f18'); p.r(15, 15, 3, 1, '#b4432c');
      p.r(20, 15, 3, 7, '#8a3523'); p.r(21, 20, 2, 2, SK);
      head(p, '#3b2a1e'); p.r(12, 3, 10, 3, '#6a4a2b'); p.r(21, 4, 2, 2, '#6a4a2b');
      p.r(24, 4, 1, 26, '#8d6a3c'); p.tri(24, 0, 22, 6, 26, 6, '#cfd6e3'); p.r(23, 6, 3, 1, '#b4432c');
      p.r(22, 18, 4, 3, SK2);
    },
    witch: function (p) {
      var rob = '#5f3d96';
      for (var y = 13; y < 29; y++) { var w = 4 + Math.floor((y - 13) * .4); p.r(16 - w, y, w * 2, 1, y > 20 ? dk(rob, .12) : rob); }
      p.r(11, 28, 11, 1, '#2c2040'); p.r(13, 21, 7, 1, '#e0b44a');
      p.r(13, 6, 8, 8, SK); p.px(18, 9, '#1a1020'); p.px(19, 9, '#1a1020'); p.r(12, 9, 2, 8, '#e08838'); p.r(12, 6, 3, 4, '#e08838');
      p.r(9, 5, 14, 2, '#3a2766'); p.tri(11, 5, 21, 5, 17, -1, '#4a3280'); p.r(12, 3, 8, 2, '#4a3280'); p.r(13, 4, 8, 1, '#e0b44a'); p.px(19, 0, '#3a2766');
      p.r(21, 16, 3, 6, rob); p.r(22, 20, 2, 2, SK);
      p.r(25, 4, 1, 26, '#7a5230'); p.e(25, 4, 2, 2, '#58f0d0'); p.px(25, 4, '#ffffff');
    },
    chanter: function (p) {
      var rob = '#e6dcc2';
      for (var y = 13; y < 29; y++) { var w = 4 + Math.floor((y - 13) * .3); p.r(16 - w, y, w * 2, 1, y > 22 ? dk(rob, .08) : rob); }
      p.r(12, 22, 9, 1, '#5aa070'); p.r(15, 13, 3, 14, '#5aa070'); p.r(16, 14, 1, 12, '#8fd0a0');
      head(p, null); p.r(12, 3, 10, 4, rob); p.r(12, 4, 2, 9, rob); p.r(13, 13, 3, 1, rob); p.px(14, 12, SK); // hood
      p.px(19, 11, '#a0584a'); p.px(20, 11, '#a0584a');
      p.r(21, 16, 3, 6, rob); p.r(22, 20, 2, 2, SK);
      p.r(25, 7, 1, 23, '#9b7a4a'); p.e(25, 5, 2, 3, '#e6c05a'); p.px(25, 8, '#6a4a22'); p.px(25, 5, '#fff3b0');
    },
    trapper: function (p) {
      legs(p, '#4a3a28', '#241a12');
      p.r(11, 13, 11, 11, '#5e6e3c'); p.r(11, 22, 11, 2, '#4a5830'); p.r(12, 21, 9, 1, '#2a2218');
      p.r(11, 12, 11, 3, '#e0d3ab'); p.r(12, 11, 9, 1, '#d2c294'); // fur collar
      head(p, null); p.r(12, 3, 10, 4, '#4f5e32'); p.r(12, 4, 2, 9, '#4f5e32'); p.px(20, 11, '#a0584a');
      p.r(20, 16, 3, 5, '#4f5e32'); p.r(22, 18, 3, 2, SK2);
      p.r(22, 17, 7, 2, '#5a3a22'); p.r(27, 14, 1, 8, '#3a2614'); p.px(26, 14, '#3a2614'); p.px(26, 21, '#3a2614'); p.ln(27, 14, 22, 17, '#d8d0b8'); p.ln(27, 21, 22, 18, '#d8d0b8');
      p.r(5, 26, 6, 3, '#7b7d86'); p.px(6, 25, '#c3c6d0'); p.px(8, 25, '#c3c6d0'); p.px(10, 25, '#c3c6d0'); // trap jaws
    },
    tinker: function (p) {
      legs(p, '#3f4e6e', '#2a2018');
      p.r(7, 11, 7, 11, '#72603f'); p.e(10, 16, 2, 2, '#c8b84c'); p.px(10, 16, '#72603f'); p.r(8, 9, 2, 3, '#a0a4ac'); p.r(11, 9, 2, 3, '#a0a4ac'); p.r(6, 21, 8, 2, '#5a4a30'); // backpack
      p.r(12, 13, 9, 10, '#3c82c4'); p.r(12, 14, 9, 8, '#d98e2f'); p.r(14, 14, 1, 8, '#a96a1b'); p.r(12, 21, 9, 1, '#4a2f18');
      head(p, '#7a3b24'); p.r(12, 4, 10, 2, '#7a3b24'); p.r(13, 3, 7, 2, '#7a3b24');
      p.r(13, 5, 8, 1, '#4a3a2a'); p.r(14, 4, 3, 3, '#6fe0f0'); p.r(18, 4, 3, 3, '#6fe0f0'); p.px(15, 4, '#ffffff'); p.px(19, 4, '#ffffff');
      p.r(20, 15, 3, 6, '#d98e2f'); p.r(22, 19, 2, 2, SK);
      p.r(24, 12, 1, 14, '#9aa0aa'); p.r(23, 10, 3, 3, '#b9bfca'); p.px(24, 11, '#16101f');
    }
  };
  var heroCache = {};
  ART.hero = function (id) {
    if (heroCache[id]) return heroCache[id];
    var p = new Pix(32, 32); (HEROES[id] || HEROES.warden)(p); p.finish(); return (heroCache[id] = p.c);
  };

  /* ---------------- monsters (32x32, mirrored to face left) ---------------- */
  var PALS = {
    meadow: [['#7b5cd6', '#ffd24a'], ['#4fb25e', '#ff7a5a'], ['#c86e3c', '#fff09a']],
    pine: [['#3f8f8a', '#ffe48a'], ['#5a7a3a', '#ff9a4a'], ['#7a5a3c', '#9affd0']],
    marsh: [['#5c9a4a', '#f4ff7a'], ['#8aa84a', '#ff6a8a'], ['#4a8a7c', '#fff0a0']],
    pass: [['#8ec8f0', '#ffffff'], ['#a8b6c8', '#7ad0ff'], ['#7a82b8', '#ffe27a']],
    ruins: [['#a0705a', '#ffd04a'], ['#8a8a9c', '#ff5a5a'], ['#7a5a9c', '#8affea']],
    ash: [['#d6532f', '#ffe04a'], ['#5a4a48', '#ff7a2a'], ['#d68a2a', '#fff0b0']]
  };
  var MON = {
    blob: function (p, m, d, l, eye) {
      p.e(15, 22, 11, 7, m); p.e(15, 18, 8, 7, m); p.r(5, 24, 21, 4, m); p.e(15, 28, 11, 1, d);
      p.e(11, 15, 3, 2, l); p.px(10, 14, '#ffffff');
      p.r(18, 17, 3, 4, '#fff'); p.r(19, 18, 2, 3, '#1a1020'); p.r(13, 18, 3, 4, '#fff'); p.r(14, 19, 2, 3, '#1a1020');
      p.r(14, 24, 8, 1, d); p.px(8, 21, l); p.px(22, 23, l); p.px(6, 28, d); p.px(7, 29, d);
    },
    imp: function (p, m, d, l, eye) {
      p.tri(8, 12, 14, 18, 4, 24, dk(m, .2)); p.tri(22, 12, 16, 18, 26, 24, dk(m, .2)); // wings
      p.e(15, 21, 5, 6, m); p.e(15, 12, 5, 5, m);
      p.tri(10, 9, 12, 5, 13, 9, d); p.tri(20, 9, 18, 5, 17, 9, d); // horns
      p.r(17, 11, 2, 2, eye); p.r(13, 11, 2, 2, eye); p.r(14, 15, 4, 1, '#1a1020');
      p.ln(20, 26, 27, 23, d); p.px(28, 22, d); p.px(28, 23, d); p.ln(11, 26, 13, 29, d); p.ln(18, 27, 19, 29, d);
      p.e(26, 17, 2, 2, eye); p.px(26, 17, '#ffffff'); p.r(22, 18, 4, 2, m);
    },
    wolf: function (p, m, d, l, eye) {
      p.e(13, 19, 10, 6, m); p.e(24, 15, 5, 4, m); p.tri(26, 15, 31, 18, 25, 19, l);
      p.tri(21, 9, 24, 12, 22, 14, d); p.tri(25, 9, 27, 12, 25, 14, d);
      p.r(24, 14, 2, 2, eye); p.px(30, 17, '#1a1020'); p.r(26, 19, 4, 1, '#fff');
      p.r(6, 22, 3, 7, d); p.r(10, 24, 3, 5, m); p.r(17, 24, 3, 5, d); p.r(21, 22, 3, 7, m);
      p.ln(4, 15, 0, 10, m); p.ln(5, 16, 1, 12, m); p.ln(5, 17, 2, 15, d);
      p.r(8, 14, 12, 2, d); p.px(10, 13, d); p.px(14, 13, d); p.px(18, 13, d);
    },
    golem: function (p, m, d, l, eye) {
      p.r(9, 10, 14, 14, m); p.r(11, 3, 10, 8, m); p.r(10, 12, 12, 2, l);
      p.r(3, 11, 6, 13, d); p.r(23, 11, 6, 13, d); p.r(2, 22, 8, 5, m); p.r(22, 22, 8, 5, m);
      p.r(10, 24, 5, 6, d); p.r(17, 24, 5, 6, d);
      p.r(14, 6, 3, 2, eye); p.r(19, 6, 3, 2, eye); p.ln(13, 14, 15, 20, dk(m, .45)); p.ln(19, 12, 17, 17, dk(m, .45)); p.px(12, 11, '#6dbb5a'); p.px(13, 11, '#6dbb5a'); p.px(24, 12, '#6dbb5a');
    },
    wraith: function (p, m, d, l, eye) {
      for (var y = 7; y < 30; y++) { var w = 3 + Math.floor((y - 7) * .35); var o = Math.round(Math.sin(y * .7) * 1.5); p.r(15 - w + o, y, w * 2, 1, y > 22 ? mix(m, '#0d0a1a', .35) : y > 14 ? dk(m, .12) : m); }
      p.e(15, 10, 5, 5, dk(m, .35)); p.r(17, 9, 2, 2, eye); p.r(21, 9, 2, 2, eye);
      p.tri(21, 15, 29, 17, 21, 19, dk(m, .1)); p.px(30, 17, l); p.px(29, 16, l); p.px(29, 18, l);
      p.e(5, 28, 2, 1, d); p.e(9, 30, 2, 1, d);
    },
    ghoul: function (p, m, d, l, eye) {
      p.r(10, 24, 4, 6, d); p.r(17, 24, 4, 6, d);
      p.e(15, 18, 7, 8, '#4a4046'); p.r(9, 24, 13, 3, '#2a2228');
      p.e(21, 11, 5, 5, m); p.r(23, 9, 2, 2, eye); p.r(25, 13, 2, 2, '#16101f'); p.px(21, 14, '#e8e8d0'); p.px(23, 14, '#e8e8d0');
      p.r(23, 17, 4, 3, m); p.r(26, 19, 4, 2, m); p.px(30, 19, d); p.px(30, 21, d); p.r(7, 14, 4, 8, m); p.r(5, 20, 4, 3, d);
      p.r(12, 14, 5, 1, d); p.px(14, 18, d); p.px(16, 20, d); p.px(12, 20, d);
    },
    bat: function (p, m, d, l, eye) {
      p.tri(14, 14, 0, 4, 3, 18, d); p.tri(14, 14, 3, 18, 10, 20, m); p.tri(18, 14, 31, 4, 28, 18, d); p.tri(18, 14, 28, 18, 21, 20, m);
      p.ln(14, 14, 4, 6, l); p.ln(18, 14, 28, 6, l);
      p.e(16, 17, 3, 5, m); p.e(16, 11, 4, 4, m); p.tri(13, 9, 12, 4, 15, 8, d); p.tri(19, 9, 20, 4, 17, 8, d);
      p.r(17, 11, 2, 2, eye); p.r(14, 11, 2, 2, eye); p.px(16, 14, '#fff'); p.px(17, 14, '#fff'); p.ln(15, 21, 13, 24, d); p.ln(17, 21, 19, 24, d);
    },
    wisp: function (p, m, d, l, eye) {
      p.tri(11, 20, 19, 20, 15, 2, mix(m, '#ffffff', .1)); p.tri(8, 22, 22, 22, 15, 6, m);
      p.e(15, 21, 8, 8, m); p.e(15, 21, 5, 5, lt(m, .5)); p.e(15, 22, 3, 3, '#ffffff');
      p.r(12, 19, 2, 3, '#1a1020'); p.r(17, 19, 2, 3, '#1a1020'); p.px(12, 19, '#fff'); p.px(17, 19, '#fff');
      p.px(5, 14, eye); p.px(25, 10, eye); p.px(27, 20, eye); p.px(4, 24, eye);
    },
    lizard: function (p, m, d, l, eye) {
      p.e(14, 19, 9, 5, m); p.e(14, 22, 8, 2, l);
      p.e(24, 14, 4, 4, m); p.tri(26, 14, 31, 17, 25, 18, m); p.r(25, 12, 2, 2, eye); p.px(30, 16, '#16101f');
      p.tri(21, 9, 23, 13, 19, 12, d); p.tri(24, 8, 26, 12, 22, 11, d);
      p.r(18, 22, 3, 7, d); p.r(7, 22, 3, 7, d); p.r(21, 23, 4, 6, m); p.r(10, 23, 4, 6, m);
      p.ln(6, 17, 0, 22, m); p.ln(6, 18, 1, 22, m); p.ln(6, 19, 2, 21, d);
      for (var i = 0; i < 5; i++) p.tri(8 + i * 3, 15, 10 + i * 3, 15, 9 + i * 3, 11, d);
      p.r(26, 17, 4, 1, '#ffffff');
    }
  };
  var monCache = {};
  ART.mon = function (arch, biome, idx, boss) {
    var key = [arch, biome, idx, boss ? 1 : 0].join();
    if (monCache[key]) return monCache[key];
    var pal = (PALS[biome] || PALS.meadow)[idx % 3];
    var p = new Pix(32, 32); (MON[arch] || MON.blob)(p, pal[0], dk(pal[0], .35), lt(pal[0], .4), pal[1]); p.finish();
    var c = mirror(p.c);
    if (boss) {
      c = scale2(c, 2);
      var q = c.getContext('2d'); q.globalCompositeOperation = 'source-atop'; q.fillStyle = 'rgba(255,60,40,.16)'; q.fillRect(0, 0, 64, 64);
      q.globalCompositeOperation = 'source-over';
      var ps = new Pix(64, 64); ps.x.drawImage(c, 0, 0);
      // crown of spikes
      for (var i = 0; i < 5; i++) ps.tri(14 + i * 9, 10, 18 + i * 9, 10, 16 + i * 9, 2 + (i % 2) * 3, '#e6c05a');
      ps.finish('#16101f', true); c = ps.c;
    }
    return (monCache[key] = c);
  };

  /* ---------------- props ---------------- */
  var P = {
    meadow: {
      tree: function (p, r) {
        p.r(21, 38, 6, 24, '#6a4528'); p.r(21, 38, 2, 24, '#83583a'); p.r(18, 58, 12, 4, '#6a4528');
        var gs = ['#2f7a3a', '#3f9a47', '#58b85a'];
        for (var i = 0; i < 9; i++) p.e(14 + r() * 20, 18 + r() * 18, 8 + r() * 5, 6 + r() * 4, gs[i % 2]);
        for (i = 0; i < 6; i++) p.e(16 + r() * 16, 14 + r() * 12, 4 + r() * 3, 3 + r() * 2, gs[2]);
        for (i = 0; i < 5; i++) p.px(10 + r() * 28, 14 + r() * 26, '#f4d94a');
      },
      small: function (p, r) {
        p.e(16, 24, 11, 6, '#2f7a3a'); p.e(12, 22, 6, 4, '#3f9a47'); p.e(21, 21, 6, 4, '#58b85a');
        var cs = ['#ff6a8a', '#ffe14a', '#ffffff', '#b58cff']; for (var i = 0; i < 6; i++) p.px(7 + r() * 18, 18 + r() * 9, cs[i % 4]);
      }
    },
    pine: {
      tree: function (p, r) {
        p.r(22, 48, 4, 14, '#4a3020');
        for (var i = 0; i < 5; i++) { var y = 50 - i * 10, w = 7 + i * 3; p.tri(24 - w, y, 24 + w, y, 24, y - 16, i % 2 ? '#1f5a43' : '#2a7050'); p.tri(24 - w + 3, y - 2, 24 + w - 3, y - 2, 24, y - 13, '#348a60'); }
        p.tri(20, 12, 28, 12, 24, 0, '#1f5a43'); p.px(24, 2, '#e8f4f0'); p.px(23, 4, '#e8f4f0'); p.px(25, 4, '#e8f4f0');
        for (i = 0; i < 10; i++) p.px(8 + r() * 32, 12 + r() * 40, '#d8ece8');
      },
      small: function (p, r) {
        p.e(16, 26, 10, 3, '#2a7050'); for (var i = 0; i < 6; i++) p.ln(16, 27, 6 + i * 4, 14 + r() * 5, '#348a60');
        p.r(23, 24, 2, 4, '#e8dcc0'); p.e(24, 23, 3, 2, '#c2362e'); p.px(23, 22, '#fff');
      }
    },
    marsh: {
      tree: function (p, r) {
        p.r(21, 22, 5, 40, '#4a4238'); p.r(21, 22, 2, 40, '#5e5448');
        p.ln(23, 30, 10, 14, '#4a4238'); p.ln(24, 28, 38, 10, '#4a4238'); p.ln(23, 40, 12, 32, '#4a4238'); p.ln(10, 14, 6, 8, '#4a4238'); p.ln(38, 10, 42, 6, '#4a4238');
        for (var i = 0; i < 18; i++) { var x = 8 + r() * 34; p.ln(x, 14 + r() * 14, x + r() * 2 - 1, 30 + r() * 14, i % 3 ? '#6f8a5a' : '#8aa06a'); }
        p.e(24, 62, 10, 2, '#2a3a38');
      },
      small: function (p, r) {
        for (var i = 0; i < 7; i++) { var x = 6 + i * 3.4, h = 14 + r() * 10; p.ln(x, 28, x + r() * 2 - 1, 28 - h, '#6f9a52'); if (i % 3 == 0) { p.r(Math.round(x) - 1, 28 - h - 2, 3, 5, '#6a4528'); } }
        p.e(16, 29, 12, 2, '#2a4a46');
      }
    },
    pass: {
      tree: function (p, r) {
        p.tri(4, 62, 44, 62, 24, 6, '#6a7488'); p.tri(24, 6, 44, 62, 28, 62, '#525c70'); p.tri(24, 6, 14, 36, 22, 34, '#8892a6');
        p.tri(16, 24, 32, 24, 24, 6, '#f2f6fa'); p.tri(24, 6, 32, 24, 26, 20, '#cfd8e4');
        for (var i = 0; i < 7; i++) p.ln(10 + r() * 24, 30 + r() * 28, 14 + r() * 24, 36 + r() * 26, '#454e62');
      },
      small: function (p, r) {
        p.e(12, 24, 9, 6, '#7a8498'); p.e(10, 22, 5, 3, '#9aa4b8'); p.e(23, 26, 6, 4, '#626c80'); p.e(12, 19, 5, 2, '#f2f6fa');
      }
    },
    ruins: {
      tree: function (p, r) {
        p.r(12, 26, 10, 36, '#8a8498'); p.r(12, 26, 3, 36, '#a09aae'); p.r(10, 58, 14, 4, '#6a6478'); p.r(10, 22, 14, 5, '#9a94a8');
        p.tri(10, 22, 24, 22, 20, 14, '#7a748a'); p.ln(17, 30, 19, 46, '#4a4458'); p.ln(19, 46, 16, 56, '#4a4458');
        p.r(28, 40, 12, 22, '#7a748a'); p.r(28, 40, 3, 22, '#9a94a8'); p.r(26, 58, 16, 4, '#6a6478');
        for (var i = 0; i < 9; i++) p.px(10 + r() * 30, 28 + r() * 32, '#5c8a52');
      },
      small: function (p, r) {
        p.r(4, 22, 10, 6, '#8a8498'); p.r(14, 25, 8, 5, '#6a6478'); p.r(20, 18, 7, 12, '#9a94a8'); p.r(20, 18, 2, 12, '#b0aabc'); p.px(8, 22, '#5c8a52'); p.px(13, 24, '#5c8a52');
      }
    },
    ash: {
      tree: function (p, r) {
        p.r(21, 20, 5, 42, '#241c22'); p.r(21, 20, 2, 42, '#3a2c34');
        p.ln(23, 30, 8, 12, '#241c22'); p.ln(24, 26, 40, 8, '#241c22'); p.ln(23, 42, 12, 34, '#241c22'); p.ln(24, 36, 38, 28, '#241c22'); p.ln(8, 12, 6, 4, '#241c22'); p.ln(40, 8, 44, 2, '#241c22');
        for (var i = 0; i < 12; i++) p.px(22 + r() * 2, 24 + r() * 36, '#ff7a2a');
        p.px(8, 12, '#ff9a4a'); p.px(40, 8, '#ff9a4a'); p.px(44, 2, '#ffd04a');
      },
      small: function (p, r) {
        p.tri(4, 28, 14, 28, 9, 12, '#2a2026'); p.tri(12, 28, 26, 28, 19, 8, '#3a2c34'); p.px(9, 22, '#ff7a2a'); p.px(19, 20, '#ff7a2a'); p.px(18, 24, '#ffb04a'); p.px(10, 26, '#ffb04a');
      }
    }
  };
  var propCache = {};
  ART.prop = function (kind, biome, seed) {
    var key = kind + '|' + biome + '|' + seed;
    if (propCache[key]) return propCache[key];
    var big = kind === 'tree', p = new Pix(big ? 48 : 32, big ? 64 : 32), r = rng(hash(key));
    (P[biome] || P.meadow)[kind](p, r); p.finish(); return (propCache[key] = p.c);
  };

  // waystone: tall rune stone with a lit candle
  ART.stone = function () {
    var p = new Pix(32, 48);
    p.r(9, 14, 14, 30, '#8c8aa0'); p.r(11, 8, 10, 8, '#8c8aa0'); p.r(13, 5, 6, 5, '#8c8aa0'); p.r(9, 14, 3, 30, '#a8a6bc'); p.r(21, 14, 2, 30, '#6e6c84');
    p.r(6, 42, 20, 4, '#6e6c84'); p.r(14, 18, 4, 1, '#ffd24a'); p.r(15, 17, 2, 8, '#ffd24a'); p.r(12, 22, 8, 1, '#ffd24a'); p.r(13, 28, 6, 1, '#ffd24a'); p.r(15, 29, 2, 6, '#ffd24a');
    p.finish(); return p.c;
  };
  // the caravan wagon with its lantern pole
  ART.wagon = function () {
    var p = new Pix(64, 48);
    p.r(8, 20, 40, 14, '#7a5230'); p.r(8, 20, 40, 3, '#966a40'); p.r(8, 31, 40, 3, '#5a3a20');
    p.tri(6, 20, 50, 20, 28, 4, '#d9c9a0'); p.tri(28, 4, 50, 20, 34, 20, '#bfae82'); p.ln(20, 14, 32, 6, '#e8dcc0'); p.r(10, 16, 4, 4, '#b4432c'); p.r(40, 18, 5, 3, '#4a8a5a');
    p.e(16, 36, 7, 7, '#3a2614'); p.e(16, 36, 5, 5, '#6a4528'); p.px(16, 36, '#3a2614'); p.e(40, 36, 7, 7, '#3a2614'); p.e(40, 36, 5, 5, '#6a4528'); p.px(40, 36, '#3a2614');
    p.r(50, 26, 10, 2, '#5a3a22'); // shaft
    p.r(55, 2, 2, 28, '#4a3020'); p.r(52, 2, 6, 2, '#4a3020'); // lantern pole
    p.r(52, 4, 6, 8, '#d8b24a'); p.r(53, 5, 4, 6, '#ffe9a0'); p.r(51, 3, 8, 2, '#3a2c20'); p.r(51, 12, 8, 2, '#3a2c20');
    p.finish(); return p.c;
  };
  ART.tent = function () {
    var p = new Pix(48, 40);
    p.tri(2, 38, 46, 38, 24, 4, '#c9573a'); p.tri(24, 4, 46, 38, 30, 38, '#a2432c'); p.tri(17, 38, 31, 38, 24, 18, '#2a1c2a'); p.r(23, 2, 2, 6, '#4a3020'); p.px(25, 2, '#ffd24a'); p.px(26, 3, '#ffd24a');
    p.ln(10, 36, 24, 6, '#e07a58'); p.finish(); return p.c;
  };
  ART.log = function () {
    var p = new Pix(32, 14); p.r(2, 4, 28, 8, '#6a4528'); p.r(2, 4, 28, 2, '#8a5e38'); p.e(3, 8, 2, 4, '#c79a62'); p.px(3, 8, '#8a5e38'); p.r(2, 11, 28, 1, '#4a3020'); p.finish(); return p.c;
  };
  ART.fire = function (n) { // n = frame 0..3
    var p = new Pix(24, 32), o = [0, 1, -1, 0][n % 4];
    p.r(3, 27, 18, 3, '#4a3020'); p.r(5, 25, 14, 3, '#6a4528');
    p.tri(5, 26, 19, 26, 12 + o, 4, '#e8641e'); p.tri(7, 26, 17, 26, 12 - o, 9, '#ffa629'); p.tri(9, 26, 15, 26, 12 + o, 14, '#ffe27a'); p.tri(11, 26, 13, 26, 12, 19, '#fffbe6');
    p.finish('#3a1208', true); return p.c;
  };
  ART.spark = function () { var p = new Pix(8, 8); p.e(4, 4, 3, 3, 'rgba(255,220,140,.35)'); p.e(4, 4, 2, 2, 'rgba(255,240,190,.7)'); p.r(3, 3, 2, 2, '#ffffff'); return p.c; };

  /* ---------------- ground, road, parallax ---------------- */
  var G = {
    meadow: { g: '#4a8a3c', g2: '#5aa048', g3: '#3a7230', rd: '#b09468', sky: [0x5a9be0, 0xbfe4ff], far: '#8fb4d8', mid: '#3f7a46' },
    pine: { g: '#2f6e55', g2: '#3a8264', g3: '#265a45', rd: '#8a7458', sky: [0x4a7fa8, 0xb8dce0], far: '#7a9ab0', mid: '#1f5a43' },
    marsh: { g: '#4a6a4a', g2: '#587a52', g3: '#3a5a42', rd: '#7a7254', sky: [0x6a8a8a, 0xc8d8b8], far: '#8aa09a', mid: '#3a5648' },
    pass: { g: '#8a94a6', g2: '#a2acbc', g3: '#727c90', rd: '#6a6470', sky: [0x6a8ec8, 0xdce8f4], far: '#b4c4dc', mid: '#7a8aa4' },
    ruins: { g: '#6a6a5a', g2: '#7c7c6a', g3: '#585a4c', rd: '#8a8294', sky: [0x7a78a8, 0xdcc8c0], far: '#9a98b8', mid: '#5a5870' },
    ash: { g: '#3a3036', g2: '#4a3c42', g3: '#2a2228', rd: '#5a4a48', sky: [0x5a2a2a, 0xe08850], far: '#6a3a3a', mid: '#2a1c22' }
  };
  ART.biomeCol = function (id) { return G[id] || G.meadow; };
  ART.ground = function (biome) {
    var c = G[biome] || G.meadow, p = new Pix(64, 64), r = rng(hash('g' + biome));
    p.r(0, 0, 64, 64, c.g);
    for (var i = 0; i < 160; i++) p.px(r() * 64, r() * 64, r() < .5 ? c.g2 : c.g3);
    for (i = 0; i < 26; i++) { var x = r() * 62, y = r() * 60; p.px(x, y, c.g2); p.px(x, y + 1, c.g2); p.px(x + 1, y - 1, lt(c.g2, .2)); }
    if (biome === 'pass') for (i = 0; i < 20; i++) p.px(r() * 64, r() * 64, '#eef4fa');
    if (biome === 'ash') for (i = 0; i < 8; i++) p.px(r() * 64, r() * 64, '#ff7a2a');
    if (biome === 'ruins') for (i = 0; i < 6; i++) p.r(r() * 58, r() * 58, 5 + r() * 3, 4, '#8a8294');
    return p.c;
  };
  ART.road = function (biome) {
    var c = G[biome] || G.meadow, p = new Pix(64, 64), r = rng(hash('r' + biome));
    p.r(0, 0, 64, 64, c.rd);
    for (var i = 0; i < 200; i++) p.px(r() * 64, r() * 64, r() < .5 ? dk(c.rd, .14) : lt(c.rd, .12));
    for (i = 0; i < 14; i++) { var x = r() * 60, y = r() * 60; p.r(x, y, 3, 2, dk(c.rd, .25)); p.px(x, y, lt(c.rd, .25)); }
    p.r(0, 18, 64, 2, dk(c.rd, .28)); p.r(0, 44, 64, 2, dk(c.rd, .28)); // wheel ruts
    return p.c;
  };
  function tileBand(w, h, col, seed, base, amp, jag) {
    var p = new Pix(w, h), r = rng(seed), ph = [r() * 6.28, r() * 6.28, r() * 6.28], k = [2, 5, 9];
    for (var x = 0; x < w; x++) {
      var t = x / w * 6.2832, y = base + amp * (Math.sin(t * k[0] + ph[0]) * .55 + Math.sin(t * k[1] + ph[1]) * .3 + Math.sin(t * k[2] + ph[2]) * .15);
      y = Math.round(y / jag) * jag;
      p.r(x, y, 1, h - y, col);
    }
    return p;
  }
  ART.far = function (biome) { // mountains / hills silhouette, tileable, 256x96
    var c = G[biome] || G.meadow, p = tileBand(256, 96, c.far, hash('f' + biome), biome === 'pass' ? 40 : 62, biome === 'pass' ? 34 : 22, 1);
    var r = rng(hash('fs' + biome)); for (var i = 0; i < 90; i++) { var x = r() * 256, y = 60 + r() * 34; p.px(x, y, lt(c.far, .12)); }
    if (biome === 'pass') for (i = 0; i < 40; i++) p.px(r() * 256, 18 + r() * 14, '#f4f8fc');
    return p.c;
  };
  ART.mid = function (biome) { // treeline silhouette, tileable, 256x96
    var c = G[biome] || G.meadow, p = new Pix(256, 96), r = rng(hash('m' + biome)), cnt = 38;
    p.r(0, 78, 256, 18, c.mid);
    for (var i = 0; i < cnt; i++) {
      var x = Math.round(i * 256 / cnt + r() * 3), h = 18 + r() * 24, col = r() < .5 ? c.mid : dk(c.mid, .18);
      if (biome === 'pine' || biome === 'pass') { for (var k = 0; k < 4; k++) p.tri(x - 8 + k, 78 - k * 8, x + 8 - k, 78 - k * 8, x, 70 - h - k * 4, col); }
      else if (biome === 'ruins') { p.r(x - 4, 78 - h, 8, h, col); if (r() < .5) p.r(x - 5, 78 - h, 10, 3, col); }
      else if (biome === 'ash') { p.tri(x - 6, 78, x + 6, 78, x, 78 - h * 1.3, col); }
      else { p.e(x, 74 - h * .5, 8 + r() * 4, 8 + h * .35, col); p.r(x - 1, 74, 3, 8, dk(col, .3)); }
    }
    return p.c;
  };
  ART.cloud = function () { var p = new Pix(48, 16); p.e(16, 10, 12, 5, 'rgba(255,255,255,.85)'); p.e(28, 8, 12, 6, 'rgba(255,255,255,.9)'); p.e(36, 11, 9, 4, 'rgba(255,255,255,.8)'); return p.c; };
  ART.portrait = function (id) { // head-and-shoulders crop of the hero sprite, doubled
    var s = ART.hero(id), c = document.createElement('canvas'); c.width = 28; c.height = 24; var x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(s, 2, 0, 28, 24, 0, 0, 28, 24); return c;
  };
  root.ART = ART;
})(typeof window !== 'undefined' ? window : this);
