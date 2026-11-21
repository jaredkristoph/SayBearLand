/* Living Hell art helpers: image loading, skin recolouring, hand-pixelled hair, stubble, horns and weapons.
   All characters are built from the one prisoner sprite (256x256, figure about x79-177, y18-246). */
(function (root) {
  var IMG = {};
  function mk(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function load(done) {
    var list = { hell: 'img/hell.jpg', sun: 'img/sun.png', man: 'img/prisoner.png' }, n = 0, total = 3, failed = false;
    Object.keys(list).forEach(function (k) { var im = new Image(); im.onload = function () { IMG[k] = im; if (++n === total) done(!failed); }; im.onerror = function () { failed = true; if (++n === total) done(false); }; im.src = list[k]; });
  }
  function hash(x, y) { var h = (x * 374761393 + y * 668265263) ^ (x * y * 2246822519); h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
  function shade(c, k) { return [Math.max(0, Math.min(255, c[0] * k)) | 0, Math.max(0, Math.min(255, c[1] * k)) | 0, Math.max(0, Math.min(255, c[2] * k)) | 0]; }
  function css(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a == null ? 1 : a) + ')'; }

  /* ---- skin recolour: keep the outlines and rags, re-tone the flesh, keeping every shadow ---- */
  function recolor(skin, grey) {
    var c = mk(256, 256), x = c.getContext('2d'); x.drawImage(IMG.man, 0, 0);
    var d = x.getImageData(0, 0, 256, 256), p = d.data;
    for (var y = 0; y < 256; y++) for (var xx = 0; xx < 256; xx++) {
      var i = (y * 256 + xx) * 4; if (!p[i + 3]) continue;
      var lum = (p[i] + p[i + 1] + p[i + 2]) / 3; if (lum < 28) continue;
      if (y >= 106 && y <= 139 && xx >= 103 && xx <= 153) continue; // the rags
      var f = lum / 208; p[i] = Math.min(255, skin[0] * f); p[i + 1] = Math.min(255, skin[1] * f); p[i + 2] = Math.min(255, skin[2] * f);
    }
    x.putImageData(d, 0, 0); return c;
  }

  /* ---- hair: spans filled in sprite pixels, then outlined and dithered ---- */
  function ell(cx, cy, rx, ry) { return function (y) { var t = 1 - Math.pow((y - cy) / ry, 2); if (t < 0) return null; var w = rx * Math.sqrt(t); return [Math.round(cx - w), Math.round(cx + w)]; }; }
  function rows(g, y0, y1, f) { for (var y = y0; y <= y1; y++) { var s = f(y); if (s) g.fillRect(s[0], y, s[1] - s[0] + 1, 1); } }
  var CX = 127.5;
  function cap(g, bottomY, side) { // hair over the skull down to a ragged hairline, plus sideburns
    var o = ell(CX, 32, 16, 17), top = Math.round(CX - 16);
    for (var y = 13; y <= 38; y++) { var s = o(y); if (!s) continue; for (var x = s[0]; x <= s[1]; x++) { var edge = Math.abs(x - CX) > 12; var cut = bottomY + Math.floor(hash(x, 5) * 3) - (Math.abs(x - CX) < 5 ? 0 : -1); if (y <= cut || (edge && y <= (side || 0))) g.fillRect(x, y, 1, 1); } }
  }
  function strand(g, x, y0, y1, w, wob) { for (var y = y0; y <= y1; y++) g.fillRect(Math.round(x + Math.sin(y * .35 + x) * wob), y, w, 1); }
  var STYLES = {
    Bald: function () {},
    Buzz: function (g, L) { cap(L.front, 21, 30); },
    Short: function (g, L) { cap(L.front, 25, 36); },
    Long: function (g, L) { rows(L.back, 20, 84, function (y) { return y < 30 ? ell(CX, 32, 17, 15)(y) : [110, 145]; }); cap(L.front, 25, 40); strand(L.front, 110, 40, 84, 6, 1); strand(L.front, 139, 40, 84, 6, 1); },
    Dreadlocks: function (g, L) {
      cap(L.front, 24, 36); for (var k = 0; k < 6; k++) { var x = 111 + k * 4.6; strand(L.back, x, 28, 72 + (k % 3) * 8, 3, 1.2); }
      [[108, 90], [112, 100], [142, 96], [146, 86], [116, 74], [138, 78]].forEach(function (s, i) { strand(L.front, s[0], 40 - (i % 2) * 6, s[1] - 18 + (i % 3) * 3, 5, 1.4); });
    },
    Mohawk: function (g, L) { rows(L.front, 2, 24, function (y) { var w = 3 + (y - 2) * .1; var sp = (y % 6 < 3) ? 1.5 : 0; return [Math.round(CX - w - sp), Math.round(CX + w + sp)]; }); rows(L.front, 15, 21, function (y) { return [Math.round(CX - 6), Math.round(CX + 6)]; }); },
    Topknot: function (g, L) { cap(L.front, 21, 28); rows(L.front, 3, 17, ell(CX, 10, 6.5, 7.5)); L.front.fillStyle = 'rgba(0,0,0,1)'; L.front.fillRect(122, 17, 11, 2); },
    Wild: function (g, L) {
      cap(L.front, 24, 36); for (var a = -80; a <= 80; a += 20) { var r = (a * Math.PI) / 180, bx = CX + Math.sin(r) * 15, by = 30 - Math.cos(r) * 15, len = 12 + hash(a, 1) * 10; for (var t = 0; t < len; t++) { var w = Math.max(1, Math.round(4 - t * .3)); L.front.fillRect(Math.round(bx + Math.sin(r) * t - w / 2), Math.round(by - Math.cos(r) * t), w, 1); } }
    },
    Horns: function (g, L) { // bone horns curving up from the temples
      [-1, 1].forEach(function (s) { for (var t = 0; t <= 22; t++) { var w = Math.max(2, Math.round(8 - t * .3)), x = CX + s * (13 + t * .55 + t * t * .012), y = 24 - t * 1.15 + t * t * .02; L.horn.fillRect(Math.round(x - w / 2), Math.round(y), w, 2); } });
    }
  };
  function layer() { var c = mk(256, 256); return { c: c, g: c.getContext('2d') }; }
  function paintLayer(L, col, outlineCol) { // fill colour, dithered shading, 1px outline
    var d = L.g.getImageData(0, 0, 256, 256), p = d.data, o = new Uint8ClampedArray(p), out = shade(col, .32);
    var has = function (x, y) { return x >= 0 && y >= 0 && x < 256 && y < 256 && o[(y * 256 + x) * 4 + 3] > 0; };
    for (var y = 0; y < 256; y++) for (var x = 0; x < 256; x++) {
      var i = (y * 256 + x) * 4; if (!o[i + 3]) continue;
      var edge = !has(x - 1, y) || !has(x + 1, y) || !has(x, y - 1) || !has(x, y + 1), c;
      if (edge) c = outlineCol || out; else { var h = hash(x, y); c = h < .12 ? shade(col, 1.28) : h > .8 ? shade(col, .78) : (y % 7 < 2 ? shade(col, .9) : col); }
      p[i] = c[0]; p[i + 1] = c[1]; p[i + 2] = c[2]; p[i + 3] = 255;
    }
    L.g.putImageData(d, 0, 0);
  }
  function hairLayers(style, col) {
    var L = { back: layer(), front: layer(), horn: layer() }; var f = { back: L.back.g, front: L.front.g, horn: L.horn.g };
    var fn = STYLES[style] || STYLES.Bald; ['back', 'front', 'horn'].forEach(function (k) { f[k].fillStyle = '#fff'; });
    fn(null, f); paintLayer(L.back, shade(col, .85)); paintLayer(L.front, col); paintLayer(L.horn, [214, 204, 180], [30, 24, 22]);
    return { back: L.back.c, front: L.front.c, horn: L.horn.c };
  }
  function faceLayer(stub, hcol) { // stubble dots or a full beard, on the lower face
    var L = layer(), g = L.g;
    if (stub === 0) return L.c;
    for (var y = 40; y <= 58; y++) for (var x = 112; x <= 143; x++) {
      var dx = (x - CX) / 12.5, dy = (y - 34) / 18.5; if (dx * dx + dy * dy > 1) continue;
      if (y < 40 || (y >= 44 && y <= 46 && x >= 124 && x <= 131)) continue; // leave the mouth
      var h = hash(x, y);
      if (stub === 1) { if (y >= 41 && y <= 52 && h < .42) { g.fillStyle = css(shade(hcol, .7), .85); g.fillRect(x, y, 1, 1); } }
      else if (y >= 42 && !(y >= 44 && y <= 46 && x >= 125 && x <= 130)) { g.fillStyle = css(h < .15 ? shade(hcol, 1.3) : h > .8 ? shade(hcol, .7) : hcol); g.fillRect(x, y, 1, 1); }
    }
    return L.c;
  }

  /* ---- a finished character: back hair, body, face, front hair ---- */
  var cache = {};
  function character(ch, C) { // ch = {skin,hair,hcol,stub}; C = core data
    var key = [ch.skin, ch.hair, ch.hcol, ch.stub, ch.tone || ''].join('|'); if (cache[key]) return cache[key];
    var skin = ch.tone || C.SKINS[ch.skin][1], hcol = C.HAIR_COLORS[ch.hcol][1], c = mk(256, 256), x = c.getContext('2d');
    var hl = hairLayers(C.HAIRS[ch.hair], hcol);
    x.drawImage(hl.back, 0, 0); x.drawImage(recolor(skin), 0, 0); x.drawImage(faceLayer(ch.stub, hcol), 0, 0); x.drawImage(hl.front, 0, 0); x.drawImage(hl.horn, 0, 0);
    cache[key] = c; return c;
  }

  /* ---- weapons: a rusted cleaver and a shank, drawn small ---- */
  var wcache = {};
  function weapon(kind) {
    if (wcache[kind]) return wcache[kind]; var c = mk(24, 84), g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    var steel = kind === 'shank' ? '#9a9692' : '#8d8a86', rust = '#7a4a2e', dark = '#14100e', wood = '#4a3020';
    if (kind === 'shank') { rows(g, 12, 56, function (y) { var w = Math.max(1, 4 - (y - 12) * .08); g.fillStyle = steel; return [Math.round(12 - w), Math.round(12 + w)]; }); }
    else { g.fillStyle = steel; g.fillRect(6, 8, 13, 40); g.fillRect(8, 4, 9, 4); }
    for (var i = 0; i < 14; i++) { g.fillStyle = rust; g.fillRect(7 + ((i * 5) % 10), 10 + ((i * 11) % 38), 2, 2); }
    g.fillStyle = dark; g.fillRect(4, 56, 17, 3); g.fillStyle = wood; g.fillRect(10, 59, 5, 18); g.fillStyle = dark; g.fillRect(9, 77, 7, 3);
    var d = g.getImageData(0, 0, 24, 84), o = new Uint8ClampedArray(d.data), p = d.data, has = function (x, y) { return x >= 0 && y >= 0 && x < 24 && y < 84 && o[(y * 24 + x) * 4 + 3] > 0; };
    for (var y = 0; y < 84; y++) for (var x = 0; x < 24; x++) { if (has(x, y)) continue; if (has(x - 1, y) || has(x + 1, y) || has(x, y - 1) || has(x, y + 1)) { var k = (y * 24 + x) * 4; p[k] = 12; p[k + 1] = 8; p[k + 2] = 8; p[k + 3] = 255; } }
    g.putImageData(d, 0, 0); wcache[kind] = c; return c;
  }

  root.LHArt = { IMG: IMG, load: load, character: character, weapon: weapon, mk: mk, hash: hash };
})(window);
