/* Am I Alive? painted room art, drawn with canvas gradients at 1600x900 and lit by the orb. */
(function (root) {
  var W = 1600, H = 900;
  var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function lin(c, x0, y0, x1, y1, st) { var g = c.createLinearGradient(x0, y0, x1, y1); st.forEach(function (s) { g.addColorStop(s[0], s[1]); }); return g; }
  function rad(c, x, y, r0, r1, st) { var g = c.createRadialGradient(x, y, r0, x, y, r1); st.forEach(function (s) { g.addColorStop(s[0], s[1]); }); return g; }
  function mk(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  var noiseTex = null;
  function noise() {
    if (noiseTex) return noiseTex;
    var n = mk(256, 256), c = n.getContext('2d'), d = c.createImageData(256, 256);
    for (var i = 0; i < d.data.length; i += 4) { var v = 90 + rnd() * 120; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    c.putImageData(d, 0, 0); noiseTex = n; return n;
  }
  function tex(c, x, y, w, h, a, mode) { c.save(); c.globalAlpha = a; c.globalCompositeOperation = mode || 'overlay'; c.fillStyle = c.createPattern(noise(), 'repeat'); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.fillRect(x, y, w, h); c.restore(); }

  function wood(c, x, y, w, h, base, dark, grainAlpha) {
    c.fillStyle = lin(c, x, y, x, y + h, [[0, base], [1, dark]]); c.fillRect(x, y, w, h);
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.strokeStyle = 'rgba(0,0,0,' + (grainAlpha || 0.25) + ')'; c.lineWidth = 1;
    for (var i = 0; i < Math.max(6, h / 7); i++) { var yy = y + rnd() * h; c.beginPath(); c.moveTo(x, yy); c.bezierCurveTo(x + w * .3, yy + (rnd() - .5) * 8, x + w * .7, yy + (rnd() - .5) * 8, x + w, yy + (rnd() - .5) * 6); c.stroke(); }
    c.restore(); tex(c, x, y, w, h, .35);
  }

  function room(c, wallTop, wallBot) {
    seed = 11;
    c.fillStyle = lin(c, 0, 0, 0, 650, [[0, wallTop || '#3a4352'], [1, wallBot || '#2a313e']]); c.fillRect(0, 0, W, 650);
    // faded wallpaper: vertical stripes and small damask diamonds
    for (var x = 0; x < W; x += 72) { c.fillStyle = 'rgba(255,255,255,.035)'; c.fillRect(x, 0, 34, 650); c.fillStyle = 'rgba(0,0,0,.05)'; c.fillRect(x + 34, 0, 3, 650); }
    c.fillStyle = 'rgba(210,220,240,.055)';
    for (var yy = 40; yy < 470; yy += 76) for (var xx = 36; xx < W; xx += 72) { c.beginPath(); c.moveTo(xx, yy - 14); c.lineTo(xx + 9, yy); c.lineTo(xx, yy + 14); c.lineTo(xx - 9, yy); c.closePath(); c.fill(); }
    tex(c, 0, 0, W, 650, .5);
    // water stains and peeling
    for (var i = 0; i < 7; i++) { var sx = rnd() * W, sy = rnd() * 360; c.fillStyle = rad(c, sx, sy, 5, 90 + rnd() * 120, [[0, 'rgba(70,52,30,.28)'], [1, 'rgba(70,52,30,0)']]); c.fillRect(sx - 240, sy - 240, 480, 480); }
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 2; c.beginPath(); c.moveTo(80, 0); c.lineTo(96, 90); c.lineTo(82, 160); c.lineTo(110, 250); c.stroke();
    // wainscot
    wood(c, 0, 470, W, 180, '#2f2a30', '#201c24', .35);
    c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(0, 470, W, 5); c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(0, 475, W, 5);
    for (var p = 0; p < W; p += 200) { c.strokeStyle = 'rgba(0,0,0,.4)'; c.strokeRect(p + 20, 496, 160, 122); c.strokeStyle = 'rgba(255,255,255,.05)'; c.strokeRect(p + 23, 499, 154, 116); }
    // baseboard
    wood(c, 0, 640, W, 34, '#3a3037', '#1d181d', .2); c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(0, 672, W, 4);
    // floor planks in perspective
    c.fillStyle = lin(c, 0, 676, 0, H, [[0, '#2a2018'], [1, '#150f0d']]); c.fillRect(0, 676, W, H - 676);
    var y0 = 676, k = 0; while (y0 < H) { var hh = 20 + k * 7; c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(0, y0, W, 2); for (var px = ((k * 137) % 260) - 260; px < W; px += 260) { c.fillRect(px, y0, 2, hh); } y0 += hh; k++; }
    tex(c, 0, 676, W, H - 676, .4);
  }

  /* ---------------- BED ---------------- */
  function drawBed(c, st) {
    room(c);
    // rug
    c.fillStyle = rad(c, 560, 790, 20, 520, [[0, '#5b2630'], [1, '#2c1218']]); c.beginPath(); c.ellipse(560, 800, 520, 70, 0, 0, 7); c.fill(); tex(c, 40, 730, 1040, 140, .3);
    // headboard (iron)
    c.fillStyle = '#17171d'; c.fillRect(140, 300, 26, 430); c.fillRect(140, 300, 330, 22); c.fillRect(140, 400, 330, 14);
    for (var bx = 176; bx < 470; bx += 34) c.fillRect(bx, 322, 7, 78);
    c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(143, 302, 4, 420); c.fillRect(145, 302, 322, 3);
    c.fillStyle = '#17171d'; for (var kx = 140; kx < 480; kx += 330) { c.beginPath(); c.arc(kx + 13, 296, 14, 0, 7); c.fill(); }
    // mattress + sheet
    c.fillStyle = lin(c, 0, 500, 0, 700, [[0, '#9aa3b0'], [1, '#6d7684']]); rr(c, 150, 500, 840, 170, 26); c.fill(); tex(c, 150, 500, 840, 170, .4);
    // footboard
    c.fillStyle = '#17171d'; c.fillRect(975, 470, 24, 260); c.fillRect(965, 462, 44, 16);
    // pillow with dent
    c.fillStyle = lin(c, 0, 458, 0, 545, [[0, '#cfd2d8'], [1, '#8d93a0']]); rr(c, 190, 458, 270, 92, 40); c.fill();
    c.fillStyle = rad(c, 330, 505, 6, 120, [[0, 'rgba(40,44,60,.55)'], [1, 'rgba(40,44,60,0)']]); c.beginPath(); c.ellipse(330, 505, 120, 32, 0, 0, 7); c.fill();
    tex(c, 190, 458, 270, 92, .35);
    // blanket pulled back, damp patches
    c.fillStyle = lin(c, 480, 520, 980, 700, [[0, '#59685f'], [1, '#34423a']]);
    c.beginPath(); c.moveTo(470, 560); c.bezierCurveTo(560, 505, 760, 520, 990, 545); c.lineTo(990, 740); c.bezierCurveTo(800, 760, 600, 745, 470, 730); c.bezierCurveTo(500, 650, 440, 610, 470, 560); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 3; for (var f = 0; f < 6; f++) { c.beginPath(); c.moveTo(520 + f * 80, 545 + f * 3); c.bezierCurveTo(540 + f * 80, 620, 500 + f * 80, 690, 540 + f * 80, 742); c.stroke(); }
    c.fillStyle = 'rgba(20,28,24,.4)'; c.beginPath(); c.ellipse(760, 640, 90, 36, .2, 0, 7); c.fill(); tex(c, 470, 505, 520, 250, .4);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(150, 728, 850, 14);
    // bed legs shadow
    c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.ellipse(570, 770, 460, 24, 0, 0, 7); c.fill();
    // photo on the wall
    c.fillStyle = '#4b3a2a'; c.fillRect(1160, 170, 150, 190); c.fillStyle = '#d8cdb4'; c.fillRect(1172, 182, 126, 166); tex(c, 1172, 182, 126, 166, .4);
    c.fillStyle = '#5a5246'; c.fillRect(1176, 246, 118, 96); c.fillStyle = '#6e3a30'; c.fillRect(1220, 290, 26, 52);
    c.fillStyle = '#2c2822'; c.beginPath(); c.arc(1200, 262, 12, 0, 7); c.fill(); c.fillRect(1190, 272, 20, 40);
    c.fillStyle = '#2c2822'; c.beginPath(); c.arc(1270, 270, 8, 0, 7); c.fill(); c.fillRect(1264, 278, 12, 26);
    c.fillStyle = '#d8cdb4'; c.beginPath(); c.arc(1235, 280, 7, 0, 7); c.fill(); c.strokeStyle = '#1a1612'; c.lineWidth = 2; for (var s = 0; s < 6; s++) { c.beginPath(); c.moveTo(1226 + s * 3, 272); c.lineTo(1242 - s * 2, 290); c.stroke(); }
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.moveTo(1176, 210); c.lineTo(1296, 340); c.stroke();
    // nightstand
    wood(c, 1090, 540, 250, 300, '#4a3526', '#2a1d15', .35);
    c.fillStyle = '#5b4332'; c.fillRect(1074, 520, 282, 28); c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(1074, 546, 282, 6);
    if (st.flags.nightstand) {
      c.fillStyle = '#20150f'; c.fillRect(1110, 612, 210, 116); wood(c, 1100, 640, 230, 100, '#523a29', '#33241a', .3);
      c.fillStyle = '#12100e'; c.fillRect(1118, 650, 194, 60);
      if (!st.inv.some(function (i) { return i === 'tape'; }) && !st.flags.got_tape) { c.fillStyle = '#d9c9a0'; c.beginPath(); c.arc(1200, 690, 20, 0, 7); c.fill(); c.fillStyle = '#12100e'; c.beginPath(); c.arc(1200, 690, 9, 0, 7); c.fill(); }
    } else {
      wood(c, 1108, 620, 214, 110, '#563c2b', '#38271c', .3); c.strokeStyle = 'rgba(0,0,0,.5)'; c.strokeRect(1108, 620, 214, 110);
      // brass 4-wheel lock plate
      c.fillStyle = lin(c, 0, 640, 0, 700, [[0, '#c9a24a'], [1, '#7a5a1c']]); rr(c, 1160, 646, 110, 50, 8); c.fill();
      for (var w = 0; w < 4; w++) { c.fillStyle = '#1b140a'; rr(c, 1170 + w * 24, 654, 18, 34, 3); c.fill(); c.fillStyle = '#e9d7a0'; c.font = '700 18px Georgia,serif'; c.textAlign = 'center'; c.fillText('?', 1179 + w * 24, 677); }
    }
    c.fillStyle = '#2a1d15'; c.fillRect(1100, 826, 22, 30); c.fillRect(1308, 826, 22, 30);
    // dead lamp
    c.fillStyle = lin(c, 1150, 0, 1260, 0, [[0, '#6b6f7b'], [1, '#3a3d48']]); c.beginPath(); c.ellipse(1205, 506, 52, 16, 0, 0, 7); c.fill(); c.fillRect(1196, 420, 18, 90);
    c.fillStyle = lin(c, 1140, 0, 1270, 0, [[0, '#a89a74'], [1, '#6a5f44']]); c.beginPath(); c.moveTo(1150, 430); c.lineTo(1260, 430); c.lineTo(1285, 340); c.lineTo(1125, 340); c.closePath(); c.fill(); tex(c, 1125, 340, 160, 90, .3);
  }

  /* ---------------- DOOR ---------------- */
  function drawDoor(c, st) {
    room(c, '#38404e', '#262c38');
    // frame
    wood(c, 570, 90, 460, 722, '#3d2f27', '#251c18', .25);
    if (st.flags.door) {
      c.fillStyle = rad(c, 800, 440, 20, 360, [[0, '#ffffff'], [.35, '#dfe9ff'], [1, '#6f86c4']]); c.fillRect(604, 124, 392, 688);
      c.fillStyle = 'rgba(15,12,20,.92)'; c.beginPath(); c.moveTo(604, 124); c.lineTo(700, 150); c.lineTo(700, 800); c.lineTo(604, 812); c.closePath(); c.fill();
      return;
    }
    // door panel (chipped green paint)
    c.fillStyle = lin(c, 604, 124, 996, 124, [[0, '#4c6258'], [.5, '#556d62'], [1, '#3d5148']]); c.fillRect(604, 124, 392, 688);
    tex(c, 604, 124, 392, 688, .45);
    for (var i = 0; i < 24; i++) { c.fillStyle = 'rgba(190,170,130,.' + (2 + Math.floor(rnd() * 4)) + ')'; var cx = 604 + rnd() * 392, cy = 124 + rnd() * 688; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + rnd() * 26, cy + rnd() * 10); c.lineTo(cx + rnd() * 14, cy + 6 + rnd() * 14); c.fill(); }
    var panels = [[640, 170, 150, 270], [810, 170, 150, 270], [640, 470, 150, 290], [810, 470, 150, 290]];
    panels.forEach(function (p) { c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(p[0], p[1], p[2], p[3]); c.strokeStyle = 'rgba(255,255,255,.1)'; c.lineWidth = 3; c.strokeRect(p[0] + 4, p[1] + 4, p[2] - 8, p[3] - 8); c.strokeStyle = 'rgba(0,0,0,.45)'; c.strokeRect(p[0], p[1], p[2], p[3]); });
    // tiny scratch marks near the bottom (fingernails)
    c.strokeStyle = 'rgba(230,220,190,.55)'; c.lineWidth = 1.5; for (var s = 0; s < 14; s++) { var sx = 700 + s * 8; c.beginPath(); c.moveTo(sx, 790); c.lineTo(sx + 3, 690 + rnd() * 30); c.stroke(); }
    // knob + keyhole plate
    c.fillStyle = lin(c, 920, 440, 970, 500, [[0, '#e8c868'], [1, '#6e4f12']]); c.beginPath(); c.arc(944, 490, 24, 0, 7); c.fill(); c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.arc(936, 482, 7, 0, 7); c.fill();
    // chain across the door to the frame, padlock hangs from it
    c.strokeStyle = '#9ea4ae'; c.lineWidth = 5; for (var l = 0; l < 9; l++) { c.beginPath(); c.ellipse(880 + l * 17, 540 + Math.sin(l * .8) * 4, 10, 6, .2, 0, 7); c.stroke(); }
    c.fillStyle = '#7d828c'; c.fillRect(1020, 524, 22, 28); c.fillRect(870, 524, 14, 28);
    c.strokeStyle = '#b5bac4'; c.lineWidth = 6; c.beginPath(); c.arc(944, 560, 14, Math.PI, 0); c.stroke();
    c.fillStyle = lin(c, 920, 560, 970, 620, [[0, '#e0bb5a'], [1, '#6e4f12']]); rr(c, 920, 558, 50, 56, 7); c.fill(); c.fillStyle = '#2b1f07'; c.beginPath(); c.arc(945, 580, 6, 0, 7); c.fill(); c.fillRect(943, 580, 4, 14);
    // light crack under the door
    c.fillStyle = lin(c, 0, 806, 0, 840, [[0, 'rgba(255,255,255,.9)'], [1, 'rgba(255,255,255,0)']]); c.fillRect(604, 806, 392, 34);
    // raincoat on a hook
    c.fillStyle = '#1b1b20'; c.fillRect(1176, 250, 70, 10); c.beginPath(); c.arc(1210, 262, 8, 0, 7); c.fill();
    c.fillStyle = lin(c, 1150, 0, 1280, 0, [[0, '#d6b11e'], [1, '#8f7410']]); c.beginPath(); c.moveTo(1180, 268); c.lineTo(1240, 268); c.lineTo(1270, 520); c.bezierCurveTo(1230, 540, 1190, 540, 1150, 520); c.closePath(); c.fill(); tex(c, 1150, 268, 130, 270, .3);
    c.fillStyle = 'rgba(90,150,200,.55)'; c.beginPath(); c.ellipse(1210, 560, 5, 9, 0, 0, 7); c.fill();
    // floor vent
    drawVent(c, st);
  }
  function drawVent(c, st) {
    var x = 190, y = 704, w = 240, h = 100;
    c.fillStyle = '#0a0a0e'; c.fillRect(x - 8, y - 8, w + 16, h + 16);
    c.fillStyle = '#4b4f58'; c.fillRect(x - 8, y - 8, w + 16, 8); c.fillRect(x - 8, y + h, w + 16, 8); c.fillRect(x - 8, y, 8, h); c.fillRect(x + w, y, 8, h);
    if (!st.flags.vent) {
      c.fillStyle = lin(c, 0, y, 0, y + h, [[0, '#8b909a'], [1, '#4d515b']]); c.fillRect(x, y, w, h);
      c.fillStyle = '#15161b'; for (var i = 0; i < 8; i++) c.fillRect(x + 8, y + 8 + i * 11, w - 16, 5);
      [[x + 10, y + 10], [x + w - 10, y + 10], [x + 10, y + h - 10], [x + w - 10, y + h - 10]].forEach(function (p) { c.fillStyle = '#c1c5cd'; c.beginPath(); c.arc(p[0], p[1], 6, 0, 7); c.fill(); c.strokeStyle = '#2a2d34'; c.lineWidth = 2; c.beginPath(); c.moveTo(p[0] - 5, p[1]); c.lineTo(p[0] + 5, p[1]); c.stroke(); });
    } else {
      c.fillStyle = rad(c, x + w / 2, y + h / 2, 10, 160, [[0, '#1a1a22'], [1, '#050507']]); c.fillRect(x, y, w, h);
      c.save(); c.translate(x + 12, y + h + 20); c.rotate(-.12); c.fillStyle = '#7c818b'; c.fillRect(0, 0, w - 24, 60); c.fillStyle = '#15161b'; for (var k = 0; k < 5; k++) c.fillRect(8, 8 + k * 10, w - 40, 4); c.restore();
      if (!st.flags.key) { var t = Date.now() / 400; c.fillStyle = '#e8c868'; c.save(); c.translate(x + 150, y + 50); c.rotate(.5); c.fillRect(-26, -3, 52, 6); c.beginPath(); c.arc(-30, 0, 9, 0, 7); c.fill(); c.fillRect(18, 2, 6, 10); c.restore(); c.fillStyle = 'rgba(255,240,170,' + (.5 + Math.sin(t) * .4) + ')'; c.beginPath(); c.arc(x + 150, y + 50, 14, 0, 7); c.fill(); }
    }
  }

  /* ---------------- DESK ---------------- */
  function drawDesk(c, st) {
    room(c, '#3c3a4a', '#2a2834');
    // children's drawings taped to the wall
    var sheets = [[300, 140, 210, 250, -.03], [550, 170, 220, 240, .02], [810, 135, 200, 255, -.015]];
    sheets.forEach(function (p, i) {
      c.save(); c.translate(p[0] + p[2] / 2, p[1] + p[3] / 2); c.rotate(p[4]); c.fillStyle = '#d9d2bd'; c.fillRect(-p[2] / 2, -p[3] / 2, p[2], p[3]); tex(c, -p[2] / 2, -p[3] / 2, p[2], p[3], .3);
      c.fillStyle = 'rgba(230,220,180,.8)'; c.fillRect(-18, -p[3] / 2 - 6, 36, 14); c.lineWidth = 4; c.lineCap = 'round';
      if (i === 0) { c.strokeStyle = '#a63a3a'; c.strokeRect(-60, 0, 120, 80); c.beginPath(); c.moveTo(-70, 0); c.lineTo(0, -60); c.lineTo(70, 0); c.stroke(); c.fillStyle = '#a63a3a'; c.fillRect(-10, 30, 22, 50); c.strokeStyle = '#3a6ab0'; c.beginPath(); c.arc(70, -70, 18, 0, 7); c.stroke(); }
      if (i === 1) { c.strokeStyle = '#2a2a3a'; c.beginPath(); c.arc(-40, -20, 14, 0, 7); c.moveTo(-40, -6); c.lineTo(-40, 50); c.moveTo(-40, 10); c.lineTo(-62, 30); c.moveTo(-40, 10); c.lineTo(-10, 24); c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = 8; c.beginPath(); c.arc(30, -28, 22, 0, 7); c.stroke(); c.beginPath(); c.moveTo(30, -4); c.lineTo(30, 56); c.moveTo(30, 14); c.lineTo(-8, 26); c.stroke(); c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.arc(30, 10, 54, 0, 7); c.fill(); }
      if (i === 2) { c.strokeStyle = '#201a26'; c.lineWidth = 6; for (var s = 0; s < 26; s++) { c.beginPath(); c.moveTo(-70 + rnd() * 140, -90 + rnd() * 180); c.lineTo(-70 + rnd() * 140, -90 + rnd() * 180); c.stroke(); } }
      c.restore();
    });
    // desk
    wood(c, 250, 586, 1100, 30, '#6a4a32', '#46301f', .35); c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(250, 614, 1100, 12);
    wood(c, 1290, 626, 44, 230, '#4a3324', '#2a1d14', .3); wood(c, 270, 626, 360, 214, '#4c3526', '#2c1f16', .35); wood(c, 640, 626, 30, 230, '#3f2b1f', '#25180f', .3);
    // drawer
    if (st.flags.drawer) { c.fillStyle = '#0d0907'; c.fillRect(300, 650, 300, 100); wood(c, 290, 680, 320, 90, '#593e2b', '#38261a', .3); c.fillStyle = '#100c09'; c.fillRect(306, 690, 288, 62); }
    else { wood(c, 298, 650, 304, 120, '#5a3f2c', '#3a281b', .3); c.strokeStyle = 'rgba(0,0,0,.55)'; c.strokeRect(298, 650, 304, 120); c.fillStyle = '#b89240'; c.beginPath(); c.ellipse(450, 700, 14, 18, 0, 0, 7); c.fill(); c.fillStyle = '#1b1306'; c.beginPath(); c.arc(450, 697, 4, 0, 7); c.fill(); c.fillRect(448, 697, 4, 14); }
    // music box
    var mx = 760, my = 470;
    wood(c, mx, my + 40, 220, 76, '#6e3b2c', '#3f2018', .3); c.strokeStyle = '#d2a94c'; c.lineWidth = 3; c.strokeRect(mx + 6, my + 46, 208, 64);
    c.fillStyle = '#d2a94c'; c.beginPath(); c.arc(mx + 112, my + 78, 10, 0, 7); c.fill();
    c.fillStyle = '#e8c868'; c.save(); c.translate(mx + 224, my + 78); c.beginPath(); c.ellipse(0, -6, 14, 7, .4, 0, 7); c.ellipse(0, 6, 14, 7, -.4, 0, 7); c.fill(); c.restore();
    if (st.flags.wound) {
      c.save(); c.translate(mx, my + 40); c.rotate(-.5); wood(c, -4, -34, 226, 34, '#7a4332', '#4a281e', .3); c.restore();
      c.fillStyle = '#1b0f0d'; c.fillRect(mx + 12, my + 24, 196, 18);
      c.fillStyle = '#f2ead8'; c.beginPath(); c.arc(mx + 112, my + 12, 7, 0, 7); c.fill(); c.fillRect(mx + 108, my + 18, 8, 20);
    } else { wood(c, mx - 4, my + 14, 228, 32, '#7a4332', '#4a281e', .3); c.strokeStyle = '#d2a94c'; c.lineWidth = 2; c.strokeRect(mx + 2, my + 18, 216, 24); }
    // crayons + cup
    ['#c64545', '#3d7fd0', '#e2b92f', '#4faf6a'].forEach(function (col, i) { c.save(); c.translate(1080 + i * 26, 572); c.rotate(.3 * (i - 1.5)); c.fillStyle = col; c.fillRect(-4, -8, 8, 36); c.restore(); });
    // chair pulled out
    wood(c, 1210, 520, 160, 22, '#3a2a20', '#241912', .3); wood(c, 1226, 540, 18, 300, '#2f2119', '#1a110c', .3); wood(c, 1340, 540, 18, 300, '#2f2119', '#1a110c', .3); wood(c, 1212, 330, 18, 200, '#2f2119', '#1a110c', .3); wood(c, 1212, 330, 150, 20, '#2f2119', '#1a110c', .3);
    c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(1290, 850, 140, 18, 0, 0, 7); c.fill();
  }

  /* ---------------- WINDOW ---------------- */
  function drawWindow(c, st) {
    room(c, '#2f3b52', '#232c3e');
    // window opening: cold moonlight behind boards
    c.fillStyle = '#0b1224'; c.fillRect(560, 130, 480, 440);
    c.fillStyle = lin(c, 0, 130, 0, 570, [[0, '#4a68a8'], [1, '#162448']]); c.fillRect(570, 140, 460, 420);
    c.fillStyle = 'rgba(235,242,255,.9)'; c.beginPath(); c.arc(900, 240, 40, 0, 7); c.fill();
    c.fillStyle = '#e8eefc'; c.fillRect(796, 338, 8, 8);
    // frame + cross bars
    wood(c, 548, 118, 504, 26, '#4a4038', '#2c2621', .3); wood(c, 548, 560, 504, 34, '#4a4038', '#2c2621', .3); wood(c, 548, 118, 26, 470, '#4a4038', '#2c2621', .3); wood(c, 1026, 118, 26, 470, '#4a4038', '#2c2621', .3);
    c.fillStyle = '#2c2621'; c.fillRect(796, 142, 8, 418); c.fillRect(574, 336, 452, 8);
    // boards nailed across
    [[520, 190, 560, 56, -.02], [540, 290, 530, 58, .018], [530, 410, 550, 60, -.012]].forEach(function (b) {
      c.save(); c.translate(b[0] + b[2] / 2, b[1] + b[3] / 2); c.rotate(b[4]); wood(c, -b[2] / 2, -b[3] / 2, b[2], b[3], '#5b4a3a', '#34281e', .4);
      c.fillStyle = '#9fa3ad'; [-b[2] / 2 + 22, b[2] / 2 - 22].forEach(function (nx) { c.beginPath(); c.arc(nx, 0, 5, 0, 7); c.fill(); }); c.restore();
    });
    // torn curtains
    var cur = function (x, dir) { c.fillStyle = lin(c, x, 0, x + dir * 140, 0, [[0, '#4b2d3a'], [1, '#2a1822']]); c.beginPath(); c.moveTo(x, 100); c.lineTo(x + dir * 150, 100); c.lineTo(x + dir * 130, 560); c.lineTo(x + dir * 90, 600); c.lineTo(x + dir * 70, 540); c.lineTo(x + dir * 30, 620); c.lineTo(x, 570); c.closePath(); c.fill(); tex(c, Math.min(x, x + dir * 150), 100, 150, 520, .3); };
    cur(560, -1); cur(1040, 1);
    // sill + radiator
    wood(c, 520, 592, 560, 22, '#5a4a3c', '#34281f', .3);
    c.fillStyle = lin(c, 0, 640, 0, 760, [[0, '#6e727c'], [1, '#34363e']]); for (var i = 0; i < 9; i++) rr(c, 590 + i * 46, 640, 34, 120, 14), c.fill();
    // stopped clock 3:07
    var cx = 1260, cy = 270;
    c.fillStyle = '#2a2018'; c.beginPath(); c.arc(cx, cy, 86, 0, 7); c.fill(); c.fillStyle = '#d9d3c0'; c.beginPath(); c.arc(cx, cy, 74, 0, 7); c.fill(); tex(c, cx - 74, cy - 74, 148, 148, .35);
    c.fillStyle = '#2a2018'; c.font = '700 22px Georgia,serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (var h = 1; h <= 12; h++) { var a = h / 12 * Math.PI * 2 - Math.PI / 2; c.fillText(String(h), cx + Math.cos(a) * 56, cy + Math.sin(a) * 56); }
    c.lineCap = 'round'; c.strokeStyle = '#1a140e'; c.lineWidth = 7; var ha = (3 + 7 / 60) / 12 * Math.PI * 2 - Math.PI / 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(ha) * 34, cy + Math.sin(ha) * 34); c.stroke();
    c.lineWidth = 4; var ma = 7 / 60 * Math.PI * 2 - Math.PI / 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(ma) * 54, cy + Math.sin(ma) * 54); c.stroke();
    c.strokeStyle = 'rgba(40,40,50,.8)'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - 40, cy - 60); c.lineTo(cx - 10, cy - 6); c.lineTo(cx + 30, cy + 20); c.lineTo(cx + 18, cy + 66); c.stroke(); c.textBaseline = 'alphabetic';
    // height chart
    c.fillStyle = '#c7b98f'; c.fillRect(190, 140, 70, 400); tex(c, 190, 140, 70, 400, .3); c.strokeStyle = '#3a3220'; c.lineWidth = 2;
    for (var m = 0; m < 9; m++) { var yy = 500 - m * 40; c.beginPath(); c.moveTo(190, yy); c.lineTo(190 + (m % 2 ? 30 : 46), yy); c.stroke(); c.fillStyle = '#3a3220'; c.font = '700 13px Georgia,serif'; c.textAlign = 'left'; c.fillText(String(4 + m), 236 + (m % 2 ? -4 : 6) - 6, yy - 3); }
    c.fillStyle = '#b64a6a'; c.beginPath(); c.arc(218, 148, 5, 0, 7); c.fill();
  }

  var DRAW = [drawBed, drawDoor, drawDesk, drawWindow];

  /* ---------------- hotspots (logical coordinates) ---------------- */
  var SPOTS = [
    [{ id: 'pillow', n: 'Pillow', r: [190, 458, 270, 92] }, { id: 'blanket', n: 'Blanket', r: [470, 520, 520, 220] }, { id: 'photo', n: 'Photograph', r: [1160, 170, 150, 190] }, { id: 'lamp', n: 'Lamp', r: [1125, 340, 160, 175] }, { id: 'nightstand', n: 'Nightstand drawer', r: [1100, 612, 230, 130] }],
    [{ id: 'vent', n: 'Floor vent', r: [182, 696, 256, 116] }, { id: 'door', n: 'Door', r: [604, 124, 392, 688] }, { id: 'raincoat', n: 'Raincoat', r: [1150, 250, 130, 300] }],
    [{ id: 'drawings', n: 'Drawings', r: [290, 130, 740, 280] }, { id: 'musicbox', n: 'Music box', r: [756, 470, 240, 130] }, { id: 'drawer', n: 'Desk drawer', r: [298, 650, 304, 120] }, { id: 'chair', n: 'Chair', r: [1200, 320, 180, 540] }],
    [{ id: 'boards', n: 'Boarded window', r: [520, 130, 560, 470] }, { id: 'clock', n: 'Clock', r: [1170, 180, 180, 180] }, { id: 'chart', n: 'Height chart', r: [185, 135, 85, 410] }, { id: 'curtain', n: 'Curtain', r: [400, 100, 150, 520] }]
  ];

  /* ---------------- inventory icons ---------------- */
  function icon(c, id, x, y, s) {
    c.save(); c.translate(x + s / 2, y + s / 2); var u = s / 64; c.scale(u, u); c.lineCap = 'round'; c.lineJoin = 'round';
    if (id === 'hairpin') { c.strokeStyle = '#d8dce6'; c.lineWidth = 4; c.beginPath(); c.moveTo(-22, -18); c.lineTo(18, -18); c.arc(18, -10, 8, -Math.PI / 2, Math.PI / 2); c.lineTo(-18, -2); c.stroke(); }
    if (id === 'windkey') { c.fillStyle = '#e0b84e'; c.beginPath(); c.ellipse(-10, -12, 12, 8, .5, 0, 7); c.ellipse(-10, 4, 12, 8, -.5, 0, 7); c.fill(); c.fillRect(-4, -4, 5, 34); c.fillRect(1, 20, 10, 5); c.fillRect(1, 28, 8, 5); }
    if (id === 'ribbon') { c.strokeStyle = '#c24040'; c.lineWidth = 8; c.beginPath(); c.moveTo(-24, 18); c.bezierCurveTo(-10, -30, 10, 40, 24, -18); c.stroke(); }
    if (id === 'clip' || id === 'band') { c.fillStyle = id === 'clip' ? '#d9d2bd' : '#e8eaf0'; if (id === 'clip') { c.beginPath(); c.moveTo(-22, -24); c.lineTo(22, -26); c.lineTo(18, -8); c.lineTo(24, 10); c.lineTo(10, 26); c.lineTo(-22, 22); c.closePath(); c.fill(); c.fillStyle = '#4a4438'; for (var i = 0; i < 5; i++) c.fillRect(-16, -16 + i * 7, 26 - (i % 2) * 8, 3); } else { c.fillRect(-26, -10, 52, 20); c.strokeStyle = '#8a90a0'; c.lineWidth = 2; c.strokeRect(-26, -10, 52, 20); c.fillStyle = '#3a4258'; c.fillRect(-18, -4, 24, 3); c.fillRect(-18, 3, 14, 3); } }
    if (id === 'coin') { c.fillStyle = '#c9a14a'; c.beginPath(); c.arc(0, 0, 22, 0, 7); c.fill(); c.strokeStyle = '#7a5a1c'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 15, 0, 7); c.stroke(); c.fillStyle = '#7a5a1c'; c.fillRect(-2, -8, 4, 16); }
    if (id === 'tape') { c.strokeStyle = '#d9c9a0'; c.lineWidth = 12; c.beginPath(); c.arc(0, 0, 18, 0, 7); c.stroke(); c.fillStyle = '#2a2230'; c.beginPath(); c.arc(0, 0, 10, 0, 7); c.fill(); }
    if (id === 'sticky') { c.strokeStyle = '#c24040'; c.lineWidth = 8; c.beginPath(); c.moveTo(-24, 18); c.bezierCurveTo(-10, -30, 10, 40, 24, -18); c.stroke(); c.strokeStyle = '#d9c9a0'; c.lineWidth = 11; c.beginPath(); c.moveTo(18, -14); c.lineTo(26, -22); c.stroke(); }
    if (id === 'key') { c.fillStyle = '#e8c868'; c.beginPath(); c.arc(-14, -10, 12, 0, 7); c.fill(); c.fillStyle = '#2a2230'; c.beginPath(); c.arc(-14, -10, 5, 0, 7); c.fill(); c.fillStyle = '#e8c868'; c.save(); c.rotate(.7); c.fillRect(-6, -4, 40, 8); c.fillRect(18, 0, 6, 14); c.fillRect(8, 0, 6, 10); c.restore(); }
    c.restore();
  }

  root.AIAArt = { W: W, H: H, DRAW: DRAW, SPOTS: SPOTS, icon: icon, mk: mk, noise: noise, rad: rad, lin: lin, rr: rr };
})(window);
