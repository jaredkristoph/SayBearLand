(function (root) {
  'use strict';
  var W = 320, H = 180, GROUND = 140;
  var FONT = { '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001001010010', '8': '111101111101111', '9': '111101111001111', '-': '000000111000000' };
  function rect(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); }
  function text(c, str, x, y, col, sh) {
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      var g = FONT[str[i]]; if (!g) continue;
      for (var k = 0; k < 15; k++) if (g[k] === '1') {
        var px = x + i * 4 + (k % 3), py = y + Math.floor(k / 3);
        if (sh) rect(c, px + 1, py + 1, 1, 1, '#000');
        rect(c, px, py, 1, 1, col);
      }
    }
  }
  var bg = null;
  function buildBg() {
    var o = document.createElement('canvas'); o.width = W; o.height = H + 24; var c = o.getContext('2d');
    var sky = ['#2a1b4d', '#3a2160', '#4d2a6e', '#6b3279', '#8c3d79', '#b04c6f', '#d3646a', '#ee8a6a', '#f6b07a'];
    for (var i = 0; i < sky.length; i++) rect(c, 0, i * 13, W, 14, sky[i]);
    rect(c, 0, 117, W, 40, '#f6b07a');
    // sun
    for (var r = 22; r > 0; r -= 2) { var w = Math.round(Math.sqrt(22 * 22 - (22 - r) * (22 - r))); rect(c, 214 - w, 98 - r + 4 - 0, w * 2, 2, r > 14 ? '#ffd58a' : '#ffe9b0'); }
    rect(c, 0, 108, W, 12, '#f6b07a');
    // far mountains
    for (var x = 0; x < W; x += 2) { var h = 22 + Math.sin(x * 0.045) * 10 + Math.sin(x * 0.13 + 1) * 5; rect(c, x, 120 - h + 10, 2, h + 10, '#5a3a6e'); }
    for (var x2 = 0; x2 < W; x2 += 2) { var h2 = 14 + Math.sin(x2 * 0.07 + 2) * 8 + Math.sin(x2 * 0.2) * 3; rect(c, x2, 132 - h2 + 8, 2, h2 + 12, '#3d2756'); }
    // ruins
    [[18, 30], [60, 22], [150, 36], [288, 28], [262, 18]].forEach(function (p) {
      rect(c, p[0], 140 - p[1], 8, p[1], '#2b1d3f'); rect(c, p[0] - 2, 140 - p[1] - 3, 12, 3, '#2b1d3f'); rect(c, p[0] + 2, 140 - p[1] + 6, 1, 4, '#3d2756');
    });
    rect(c, 0, GROUND, W, H + 24 - GROUND, '#241830');
    rect(c, 0, GROUND, W, 2, '#4a6a3c'); rect(c, 0, GROUND + 2, W, 2, '#35502d');
    for (var gx = 3; gx < W; gx += 9) { rect(c, gx, GROUND - 2, 1, 2, '#4a6a3c'); rect(c, gx + 3, GROUND - 3, 1, 3, '#5d8049'); }
    for (var s = 0; s < 40; s++) { var sx = (s * 53) % W, sy = (s * 29) % 70; rect(c, sx, sy, 1, 1, 'rgba(255,255,255,.55)'); }
    return o;
  }
  function drawBg(c, t) {
    if (!bg) bg = buildBg();
    c.drawImage(bg, 0, 0);
    for (var i = 0; i < 4; i++) {
      var x = ((i * 97 + t * (3 + i)) % (W + 60)) - 40, y = 14 + i * 13;
      rect(c, x, y, 26, 3, 'rgba(255,200,170,.35)'); rect(c, x + 5, y - 2, 14, 2, 'rgba(255,200,170,.35)');
    }
  }
  function line(c, x0, y0, x1, y1, th, col) {
    var n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2));
    for (var i = 0; i <= n; i++) { var u = i / n; rect(c, x0 + (x1 - x0) * u - th / 2, y0 + (y1 - y0) * u - th / 2, th, th, col); }
  }
  var P = { st1: '#7b7f8c', st2: '#5a5e6b', st3: '#3b3e49', st4: '#262830', moss: '#5d8049', eye: '#ffb347', eyeHot: '#ff3b3b', white: '#ffffff' };
  // pose: {raise 0..1, slam 0..1, stomp -1..1, stagger bool, hurt 0..1, dead 0..1, rage 0..1, t}
  function drawBoss(c, x, p) {
    var flash = p.hurt > 0.2, t = p.t;
    function col(k) { return flash ? '#fff' : P[k]; }
    var y = GROUND, bob = Math.round(Math.sin(t * 2.4) * 1), sq = p.dead || 0;
    c.save();
    if (sq) { c.globalAlpha = Math.max(0.0, 1 - sq * 0.9); c.translate(0, y * sq * 0.45); c.scale(1, 1 - sq * 0.45); }
    var lean = p.stagger ? Math.round(Math.sin(t * 9) * 2) : 0;
    var tilt = p.stagger ? 4 : 0;
    var yy = y + bob - Math.round(Math.max(0, p.stomp || 0) * 3);
    // legs
    rect(c, x - 16, yy - 30, 14, 30, col('st3')); rect(c, x + 3, yy - 30 + (p.stomp < 0 ? -3 : 0), 14, 30, col('st3'));
    rect(c, x - 18, yy - 6, 18, 6, col('st4')); rect(c, x + 2, yy - 6, 18, 6, col('st4'));
    // torso
    rect(c, x - 22 + lean, yy - 74, 44, 46, col('st2')); rect(c, x - 20 + lean, yy - 72, 40, 42, col('st1'));
    rect(c, x - 14 + lean, yy - 60, 28, 3, col('st3')); rect(c, x - 10 + lean, yy - 50, 20, 3, col('st3')); rect(c, x - 4 + lean, yy - 66, 2, 10, col('st3'));
    for (var m = 0; m < 6; m++) rect(c, x - 20 + m * 7 + lean, yy - 72 + (m % 2) * 2, 4, 2, col('moss'));
    // rune core
    rect(c, x - 3 + lean, yy - 48, 6, 6, p.rage > 0.5 ? P.eyeHot : P.eye); rect(c, x - 1 + lean, yy - 46, 2, 2, '#fff2c4');
    // head
    var hx = x - 11 + lean + tilt, hy = yy - 94 + (p.stagger ? 6 : 0);
    rect(c, hx, hy, 22, 20, col('st2')); rect(c, hx + 2, hy + 2, 18, 16, col('st1')); rect(c, hx, hy + 4, 22, 3, col('st4'));
    rect(c, hx + 3, hy + 8, 5, 3, p.stagger ? '#222' : (p.rage > 0.5 ? P.eyeHot : P.eye)); rect(c, hx + 14, hy + 8, 5, 3, p.stagger ? '#222' : (p.rage > 0.5 ? P.eyeHot : P.eye));
    rect(c, hx + 5, hy + 14, 12, 2, col('st4')); rect(c, hx + 7, hy + 14, 2, 2, col('st1')); rect(c, hx + 13, hy + 14, 2, 2, col('st1'));
    rect(c, hx + 2, hy - 3, 4, 3, col('moss')); rect(c, hx + 12, hy - 2, 7, 2, col('moss'));
    rect(c, hx - 3, hy + 2, 3, 6, col('st3')); rect(c, hx + 22, hy + 2, 3, 6, col('st3'));
    // shoulders
    rect(c, x - 34 + lean, yy - 80, 16, 16, col('st2')); rect(c, x - 32 + lean, yy - 78, 12, 12, col('st1'));
    rect(c, x + 18 + lean, yy - 80, 16, 16, col('st2')); rect(c, x + 20 + lean, yy - 78, 12, 12, col('st1'));
    // arms (left arm faces squad)
    var r = p.raise || 0, sl = p.slam || 0;
    var fx = x - 40 + (-14 * sl) + r * 8, fy = yy - 36 - r * 60 + sl * (r * 60 + 30);
    if (sl > 0) { fy = yy - 36 - (1 - sl) * 54 * (p.raise || 0) + sl * 34 - 6 * sl; fx = x - 44 - 12 * sl; }
    line(c, x - 28 + lean, yy - 72, fx, fy, 9, col('st2')); line(c, x - 28 + lean, yy - 72, fx, fy, 5, col('st1'));
    rect(c, fx - 9, fy - 9, 18, 18, col('st3')); rect(c, fx - 7, fy - 7, 14, 14, col('st2')); rect(c, fx - 4, fy - 4, 4, 3, col('st1'));
    var r2 = p.raise2 == null ? r * 0.8 : p.raise2;
    var gx = x + 40 - r2 * 6, gy = yy - 36 - r2 * 54 + sl * (r2 * 54 + 30) * 0.8;
    line(c, x + 28 + lean, yy - 72, gx, gy, 9, col('st2')); line(c, x + 28 + lean, yy - 72, gx, gy, 5, col('st1'));
    rect(c, gx - 9, gy - 9, 18, 18, col('st3')); rect(c, gx - 7, gy - 7, 14, 14, col('st2'));
    if (p.stagger) for (var s = 0; s < 3; s++) { var a = t * 5 + s * 2.1; rect(c, hx + 11 + Math.cos(a) * 16, hy - 8 + Math.sin(a) * 4, 3, 3, '#ffe36a'); rect(c, hx + 12 + Math.cos(a) * 16, hy - 9 + Math.sin(a) * 4, 1, 1, '#fff'); }
    c.restore();
  }
  var TUNIC = ['#e0553b', '#3b8fe0', '#e0b83b', '#4fbf6a', '#b04fe0'];
  // anim: idle|attack|shield|stumble ; pulse 0..1 (drum hit), hurt 0..1
  function drawWarrior(c, x, i, a) {
    var t = a.t, y = GROUND;
    var bob = a.anim === 'stumble' ? 0 : Math.round(Math.abs(Math.sin(t * 6.2832 / 1.2 * 1 + i * 0.7)) * 1);
    var lunge = a.anim === 'attack' ? Math.round(a.pulse * 10) : 0;
    var back = Math.round((a.hurt || 0) * 8);
    var px = Math.round(x + lunge - back + (a.anim === 'stumble' ? -2 : 0));
    var py = y - 12 - bob + (a.anim === 'stumble' ? 3 : 0) - (a.anim === 'attack' && a.pulse > 0.5 ? 2 : 0);
    var flash = (a.hurt || 0) > 0.3;
    var tun = flash ? '#fff' : TUNIC[i % 5];
    rect(c, px + 1, y - 4, 2, 4, '#241830'); rect(c, px + 5, y - 4 + (a.pulse > 0.5 ? -1 : 0), 2, 4, '#241830');
    rect(c, px, py + 5, 8, 7, tun); rect(c, px + 1, py + 6, 6, 2, 'rgba(255,255,255,.25)');
    rect(c, px, py - 1, 8, 7, '#f1ead8'); rect(c, px + 1, py + 1, 2, 2, '#1a1220'); rect(c, px + 5, py + 1, 2, 2, '#1a1220');
    rect(c, px + 2, py + 4, 4, 1, '#c9b79a');
    rect(c, px + 3, py - 4 - (i % 3), 2, 3 + (i % 3), tun);
    if (a.anim === 'attack') { var ext = 6 + Math.round(a.pulse * 10); rect(c, px + 6, py + 6, ext, 1, '#cfd6e0'); rect(c, px + 6 + ext, py + 5, 3, 3, '#fff'); rect(c, px + 5, py + 6, 3, 1, '#7a5a3a'); }
    else rect(c, px - 2, py - 6, 1, 20, '#7a5a3a'), rect(c, px - 3, py - 9, 3, 3, '#cfd6e0');
    if (a.anim === 'shield') {
      var up = Math.min(1, a.shieldT == null ? 1 : a.shieldT);
      rect(c, px + 7, py - 1, 6, 14, '#1f5f6a'); rect(c, px + 8, py, 4, 12, '#3fb6c4'); rect(c, px + 9, py + 3, 2, 6, '#e8fbff');
      if (a.pulse > 0.4) rect(c, px + 13, py + 2, 2, 8, 'rgba(255,255,255,.7)');
    }
  }
  function drawParticles(c, ps) {
    for (var i = 0; i < ps.length; i++) { var p = ps[i]; var a = Math.max(0, p.life / p.max); c.globalAlpha = Math.min(1, a * 1.5); rect(c, p.x, p.y, p.s, p.s, p.col); }
    c.globalAlpha = 1;
  }
  root.RitmicArt = { W: W, H: H, GROUND: GROUND, drawBg: drawBg, drawBoss: drawBoss, drawWarrior: drawWarrior, drawParticles: drawParticles, text: text, rect: rect };
})(window);
