/* Lanternroad scene: HD-2D look. Pixel sprites are lit billboards on a 3D road; one real point
   light (the lantern) plus bloom, tilt-shift blur, fog and particles in a small post pass. */
(function (root) {
  'use strict';
  var T = THREE, LR = root.LR, ART = root.ART, LRS = {};
  var PX = .065, UPL = 36, TILE = 4.16, LOOP = 70;
  var R, cvs, fx, fxc, W = 1, H = 1, XS = 1, mode = 'road';
  var rt, postScene, postCam, postMat;
  var cam, sc, camp, ccam, texCache = new Map(), geoCache = {};
  var dist = 0, lastLeague = null, tNow = 0;
  var S_ = null, fl = [], shake = 0, flash = 0, fade = 0, fadeTarget = 0;

  function tex(cv, smooth) {
    var k = cv; if (texCache.has(k)) return texCache.get(k);
    var t = new T.CanvasTexture(cv); t.magFilter = smooth ? T.LinearFilter : T.NearestFilter; t.minFilter = smooth ? T.LinearFilter : T.NearestFilter; t.generateMipmaps = false; t.encoding = T.sRGBEncoding;
    texCache.set(k, t); return t;
  }
  function geo(w, h) { var k = w.toFixed(3) + 'x' + h.toFixed(3); if (!geoCache[k]) { var g = new T.PlaneGeometry(w, h); g.translate(0, h / 2, 0); geoCache[k] = g; } return geoCache[k]; }
  function sprite(cv, mul, lit) {
    var w = cv.width * PX * (mul || 1), h = cv.height * PX * (mul || 1);
    var M = lit === false ? T.MeshBasicMaterial : T.MeshLambertMaterial;
    var m = new M({ map: tex(cv), transparent: true, alphaTest: .45, side: T.DoubleSide });
    var mesh = new T.Mesh(geo(w, h), m); mesh.userData.w = w; mesh.userData.h = h; return mesh;
  }
  var shGeo, shMat;
  function shadow(w) {
    if (!shGeo) { shGeo = new T.CircleGeometry(1, 16); shGeo.rotateX(-Math.PI / 2); shMat = new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .38, depthWrite: false }); }
    var m = new T.Mesh(shGeo, shMat); m.scale.set(w * .38, 1, .42); m.position.y = .015; m.renderOrder = -1; return m;
  }
  function radial(size, stops) { var c = document.createElement('canvas'); c.width = c.height = size; var x = c.getContext('2d'), g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); stops.forEach(function (s) { g.addColorStop(s[0], s[1]); }); x.fillStyle = g; x.fillRect(0, 0, size, size); return c; }

  /* ---------------- init ---------------- */
  LRS.init = function (canvas, fxCanvas) {
    try {
      cvs = canvas; fx = fxCanvas; fxc = fx.getContext('2d');
      R = new T.WebGLRenderer({ canvas: cvs, antialias: false, alpha: false, powerPreference: 'high-performance' });
      R.outputEncoding = T.sRGBEncoding; R.setClearColor(0x101020, 1);
    } catch (e) { return false; }
    cam = new T.PerspectiveCamera(34, 1.6, .5, 300);
    sc = new T.Scene(); buildRoad();
    postScene = new T.Scene(); postCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    postMat = new T.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, px: { value: new T.Vector2(1, 1) }, uBloom: { value: 1 }, uBlur: { value: 1 }, uFocus: { value: .5 }, uVig: { value: 1.1 }, uFlash: { value: 0 }, uNight: { value: 0 }, uFade: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
      fragmentShader: [
        'uniform sampler2D tDiffuse; uniform vec2 px; uniform float uBloom,uBlur,uFocus,uVig,uFlash,uNight,uFade; varying vec2 vUv;',
        'vec3 S(vec2 u){ return texture2D(tDiffuse,u).rgb; }',
        'void main(){',
        '  float d=abs(vUv.y-uFocus); float amt=smoothstep(.16,.52,d)*uBlur;',
        '  vec3 c=S(vUv);',
        '  if(amt>.03){ vec3 a=c; for(int i=0;i<8;i++){ float fi=float(i)+1.; float r=sqrt(fi/8.)*amt*5.5; a+=S(vUv+vec2(cos(fi*2.39996),sin(fi*2.39996))*r*px); } c=a/9.; }',
        '  vec3 b=vec3(0.);',
        '  for(int i=0;i<12;i++){ float fi=float(i)+1.; float r=2.+fi*1.9; vec3 t=S(vUv+vec2(cos(fi*2.4),sin(fi*2.4))*r*px); b+=max(t-vec3(.5),vec3(0.))*(1.-fi/14.); }',
        '  c+=b*uBloom*.22;',
        '  c=mix(c,vec3(dot(c,vec3(.3,.59,.11))),-.12);',
        '  c+=vec3(1.,.95,.8)*uFlash*.35;',
        '  vec2 q=vUv-.5; c*=1.-dot(q,q)*uVig;',
        '  c=pow(max(c,vec3(0.)),vec3(1./2.2));',
        '  c=mix(c,vec3(0.),uFade);',
        '  gl_FragColor=vec4(c,1.);',
        '}'].join('\n'),
      depthTest: false, depthWrite: false
    });
    var quad = new T.Mesh(new T.PlaneGeometry(2, 2), postMat); quad.frustumCulled = false; postScene.add(quad);
    return true;
  };
  LRS.resize = function (w, h) {
    W = Math.max(2, w); H = Math.max(2, h);
    var dpr = Math.min(window.devicePixelRatio || 1, 1.75), cap = 1.5e6 / (W * H); dpr = Math.min(dpr, Math.sqrt(Math.max(.5, cap)));
    R.setPixelRatio(dpr); R.setSize(W, H, false);
    fx.width = Math.round(W * Math.min(2, window.devicePixelRatio || 1)); fx.height = Math.round(H * Math.min(2, window.devicePixelRatio || 1));
    var pw = Math.round(W * dpr), ph = Math.round(H * dpr);
    if (rt) rt.dispose();
    rt = new T.WebGLRenderTarget(pw, ph, { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, depthBuffer: true, stencilBuffer: false });
    postMat.uniforms.px.value.set(1 / pw, 1 / ph); postMat.uniforms.tDiffuse.value = rt.texture;
    var asp = W / H; XS = Math.max(.6, Math.min(1, asp / 1.5));
    cam.aspect = asp; camDist = Math.max(13, 13 * XS / (2 * Math.tan(17 * Math.PI / 360) * asp));
    cam.updateProjectionMatrix(); if (ccam) { ccam.aspect = asp; ccam.updateProjectionMatrix(); }
  };
  var camDist = 15;

  /* ---------------- road scene ---------------- */
  var ground, road, farL, midL, skyM, skyCv, skyTex, starPts, sunM, moonM, clouds = [], lamp, hemi, sun, glowM, ringM;
  var props = [], stones = [], gateL, gateR, wagon, wagonSh, heroObj = {}, foeObj = {}, curBiome = null, lastFight = null;
  var fall, fallV, floatP, floatV, fallKind = null, floatKind = null;

  function buildRoad() {
    sc.fog = new T.Fog(0x202040, 24, 80);
    hemi = new T.HemisphereLight(0xfff0d0, 0x302848, .9); sc.add(hemi);
    sun = new T.DirectionalLight(0xfff2d8, .7); sun.position.set(-6, 10, 12); sc.add(sun);
    lamp = new T.PointLight(0xff9a50, 2.2, 14, 1.2); sc.add(lamp);
    var gm = new T.PlaneGeometry(170, 62); gm.rotateX(-Math.PI / 2);
    ground = new T.Mesh(gm, new T.MeshLambertMaterial({ color: 0xffffff })); ground.position.set(0, 0, -8); sc.add(ground);
    var rg = new T.PlaneGeometry(170, 5.6); rg.rotateX(-Math.PI / 2);
    road = new T.Mesh(rg, new T.MeshLambertMaterial({ color: 0xffffff })); road.position.set(0, .01, 0); sc.add(road);
    farL = new T.Mesh(new T.PlaneGeometry(240, 24), new T.MeshBasicMaterial({ transparent: true, alphaTest: .3, fog: false })); farL.position.set(0, 3.4, -42); sc.add(farL);
    midL = new T.Mesh(new T.PlaneGeometry(130, 12.5), new T.MeshBasicMaterial({ transparent: true, alphaTest: .3, fog: false })); midL.position.set(0, 6, -20); sc.add(midL);
    skyCv = document.createElement('canvas'); skyCv.width = 2; skyCv.height = 128; skyTex = new T.CanvasTexture(skyCv); skyTex.encoding = T.sRGBEncoding;
    skyM = new T.Mesh(new T.PlaneGeometry(420, 200), new T.MeshBasicMaterial({ map: skyTex, fog: false, depthWrite: false })); skyM.position.set(0, 52, -90); skyM.renderOrder = -10; sc.add(skyM);
    var sp = [], r = LR.seeded(7); for (var i = 0; i < 160; i++) sp.push((r() - .5) * 300, 8 + r() * 80, -88);
    var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(sp, 3));
    starPts = new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false })); starPts.renderOrder = -9; sc.add(starPts);
    sunM = new T.Mesh(new T.PlaneGeometry(26, 26), new T.MeshBasicMaterial({ map: tex(radial(64, [[0, 'rgba(255,250,220,1)'], [.25, 'rgba(255,240,180,.95)'], [.5, 'rgba(255,200,120,.25)'], [1, 'rgba(255,200,120,0)']]), true), transparent: true, fog: false, depthWrite: false })); sunM.renderOrder = -8; sc.add(sunM);
    moonM = new T.Mesh(new T.PlaneGeometry(14, 14), new T.MeshBasicMaterial({ map: tex(radial(64, [[0, 'rgba(240,244,255,1)'], [.4, 'rgba(220,230,255,.95)'], [.55, 'rgba(160,180,255,.3)'], [1, 'rgba(160,180,255,0)']]), true), transparent: true, fog: false, depthWrite: false })); moonM.renderOrder = -8; sc.add(moonM);
    for (i = 0; i < 6; i++) { var c = sprite(ART.cloud(), 1.7 + i % 3 * .5, false); c.material.fog = false; c.material.opacity = .8; c.position.set(-60 + i * 24, 22 + (i % 3) * 5, -70); c.userData.sp = .3 + i % 3 * .2; c.renderOrder = -7; sc.add(c); clouds.push(c); }
    wagon = sprite(ART.wagon(), 1); sc.add(wagon); wagonSh = shadow(4.4); sc.add(wagonSh);
    glowM = new T.Mesh(new T.PlaneGeometry(7, 7), new T.MeshBasicMaterial({ map: tex(radial(128, [[0, 'rgba(255,255,255,.9)'], [.2, 'rgba(255,255,255,.4)'], [.6, 'rgba(255,255,255,.08)'], [1, 'rgba(255,255,255,0)']]), true), transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
    glowM.renderOrder = 10; sc.add(glowM);
    ringM = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: tex(radial(128, [[0, 'rgba(255,255,255,0)'], [.7, 'rgba(255,255,255,0)'], [.86, 'rgba(255,255,255,.9)'], [.93, 'rgba(255,255,255,.25)'], [1, 'rgba(255,255,255,0)']]), true), transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 }));
    ringM.renderOrder = 11; sc.add(ringM);
    for (i = 0; i < 4; i++) { var st = sprite(ART.stone(), 1.15); sc.add(st); var ss = shadow(1.6); sc.add(ss); stones.push({ m: st, s: ss }); }
    gateL = sprite(ART.prop('tree', 'ruins', 3), 1.25); gateR = sprite(ART.prop('tree', 'ruins', 4), 1.25); sc.add(gateL); sc.add(gateR);
    var fg = new T.BufferGeometry(); fg.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(210 * 3), 3));
    fall = new T.Points(fg, new T.PointsMaterial({ color: 0xbfd8ff, size: .12, transparent: true, opacity: .8, depthWrite: false })); fall.frustumCulled = false; sc.add(fall); fallV = new Float32Array(210 * 2);
    var lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(90 * 3), 3));
    floatP = new T.Points(lg, new T.PointsMaterial({ color: 0xffee88, size: .5, map: tex(ART.spark(), true), transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 1 })); floatP.frustumCulled = false; sc.add(floatP); floatV = new Float32Array(90 * 3);
  }

  function setBiome(id) {
    curBiome = id; var c = ART.biomeCol(id);
    function rep(tx, rx, ry) { tx.wrapS = tx.wrapT = T.RepeatWrapping; tx.repeat.set(rx, ry); }
    var gt = tex(ART.ground(id)); rep(gt, 170 / TILE, 62 / TILE); ground.material.map = gt; ground.material.needsUpdate = true;
    var rtx = tex(ART.road(id)); rep(rtx, 170 / TILE, 5.6 / TILE); road.material.map = rtx; road.material.needsUpdate = true;
    var ft = tex(ART.far(id)); rep(ft, 240 / 33, 1); farL.material.map = ft; farL.material.needsUpdate = true;
    var mt = tex(ART.mid(id)); rep(mt, 130 / 25.6, 1); midL.material.map = mt; midL.material.needsUpdate = true;
    props.forEach(function (p) { sc.remove(p.m); sc.remove(p.s); });
    props = []; var r = LR.seeded(hash(id));
    function add(kind, n, zmin, zmax, mul) {
      for (var i = 0; i < n; i++) {
        var m = sprite(ART.prop(kind, id, i % 3), mul || 1), z = zmin + r() * (zmax - zmin), s = shadow(m.userData.w); sc.add(m); sc.add(s);
        props.push({ m: m, s: s, x0: r() * LOOP, z: z, kind: kind });
      }
    }
    add('tree', 16, -11, -4.1, 1.05); add('tree', 6, -17, -12, 1.3); add('small', 18, -9, -3.6, 1); add('small', 10, 3.5, 6.2, 1);
    props.forEach(function (p) { if (p.kind === 'small') p.m.scale.set(1, 1, 1); });
    // pick fall/float flavour
    var cfg = { meadow: ['', 'firefly'], pine: ['', 'dust'], marsh: ['rain', 'firefly'], pass: ['snow', ''], ruins: ['', 'dust'], ash: ['', 'ember'] }[id] || ['', ''];
    fallKind = cfg[0]; floatKind = cfg[1]; initParticles();
    var fc = { rain: 0x9fc4ff, snow: 0xffffff }[fallKind]; if (fc) { fall.material.color.setHex(fc); fall.material.size = fallKind === 'snow' ? .16 : .09; }
    var lc = { firefly: 0xd8ff6a, ember: 0xff8a30, dust: 0xe8d8b8 }[floatKind]; if (lc) floatP.material.color.setHex(lc);
    skyKey = -1;
  }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function initParticles() {
    var p = fall.geometry.attributes.position.array, i, n = p.length / 3;
    for (i = 0; i < n; i++) { p[i * 3] = (Math.random() - .5) * 40; p[i * 3 + 1] = Math.random() * 14; p[i * 3 + 2] = -8 + Math.random() * 20; fallV[i * 2] = fallKind === 'rain' ? 16 + Math.random() * 6 : 1.2 + Math.random() * 1.2; fallV[i * 2 + 1] = Math.random() * 6.28; }
    fall.geometry.attributes.position.needsUpdate = true;
    var q = floatP.geometry.attributes.position.array; n = q.length / 3;
    for (i = 0; i < n; i++) { q[i * 3] = (Math.random() - .5) * 32; q[i * 3 + 1] = .4 + Math.random() * 4; q[i * 3 + 2] = -7 + Math.random() * 14; floatV[i * 3] = Math.random() * 6.28; floatV[i * 3 + 1] = .3 + Math.random() * .8; floatV[i * 3 + 2] = Math.random() * 6.28; }
    floatP.geometry.attributes.position.needsUpdate = true;
  }
  function stepParticles(dt, speed, night, day) {
    fall.visible = !!fallKind && (fallKind !== 'rain' || true); fall.material.opacity = fallKind === 'snow' ? .85 : .5 * (.5 + .5 * day);
    if (fall.visible) {
      var p = fall.geometry.attributes.position.array, n = p.length / 3;
      for (var i = 0; i < n; i++) {
        var vy = fallV[i * 2]; p[i * 3 + 1] -= vy * dt; p[i * 3] -= speed * dt * .9 + (fallKind === 'snow' ? Math.sin(tNow + fallV[i * 2 + 1]) * dt * .6 : -2.4 * dt * (fallKind === 'rain' ? 1 : 0));
        if (p[i * 3 + 1] < 0) { p[i * 3 + 1] = 12 + Math.random() * 3; p[i * 3] = (Math.random() - .5) * 40; }
        if (p[i * 3] < -20) p[i * 3] += 40; if (p[i * 3] > 20) p[i * 3] -= 40;
      }
      fall.geometry.attributes.position.needsUpdate = true;
    }
    floatP.visible = !!floatKind;
    if (floatP.visible) {
      var on = floatKind === 'firefly' ? night : floatKind === 'ember' ? 1 : .6; floatP.material.opacity = Math.min(1, on * (floatKind === 'dust' ? .4 : 1));
      floatP.material.size = floatKind === 'dust' ? .35 : floatKind === 'ember' ? .42 : .55;
      var q = floatP.geometry.attributes.position.array, m = q.length / 3;
      for (var j = 0; j < m; j++) {
        floatV[j * 3] += dt * floatV[j * 3 + 1]; var ph = floatV[j * 3], ph2 = floatV[j * 3 + 2];
        q[j * 3] += Math.cos(ph) * dt * .5 - speed * dt * .55; q[j * 3 + 1] += (floatKind === 'ember' ? .7 * dt : Math.sin(ph + ph2) * dt * .35); q[j * 3 + 2] += Math.sin(ph) * dt * .3;
        if (q[j * 3 + 1] > 7) q[j * 3 + 1] = .3; if (q[j * 3 + 1] < .2) q[j * 3 + 1] = 4;
        if (q[j * 3] < -18) q[j * 3] += 36; if (q[j * 3] > 18) q[j * 3] -= 36;
      }
      floatP.geometry.attributes.position.needsUpdate = true;
    }
  }

  /* ---------------- sky and light ---------------- */
  var skyKey = -1, cNight = new T.Color(0x0a0e2a), cNightH = new T.Color(0x1d2050), cWarm = new T.Color(0xff8a4a), tmpA = new T.Color(), tmpB = new T.Color();
  function dayness(t) { return t < .08 ? .35 + .65 * t / .08 : t < .48 ? 1 : t < .62 ? 1 - .95 * (t - .48) / .14 : t < .9 ? .05 : .05 + .30 * (t - .9) / .1; }
  function warmth(t) { var a = Math.max(0, 1 - Math.abs(t - .56) / .09), b = Math.max(0, 1 - Math.abs(t - .96) / .07) + Math.max(0, 1 - t / .04); return Math.min(1, a + b * .8); }
  function updateSky(S, day, warm) {
    var key = Math.round(S.tod * 260) + (S.beaten % 6) * 1000; if (key === skyKey) return; skyKey = key;
    var b = ART.biomeCol(curBiome), top = tmpA.setHex(b.sky[0]).lerp(cNight, 1 - day), hor = tmpB.setHex(b.sky[1]).lerp(cNightH, 1 - day);
    hor.lerp(cWarm, warm * .55); top.lerp(cWarm, warm * .15);
    var x = skyCv.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#' + top.getHexString()); g.addColorStop(.55, '#' + top.clone().lerp(hor, .55).getHexString()); g.addColorStop(1, '#' + hor.getHexString());
    x.fillStyle = g; x.fillRect(0, 0, 2, 128); skyTex.needsUpdate = true;
    sc.fog.color.copy(hor).multiplyScalar(.85); R.setClearColor(hor, 1);
    var t = S.tod; var f = t < .55 ? t / .55 : -1;
    sunM.visible = f >= 0 && day > .2; if (f >= 0) { sunM.position.set(-48 + 96 * f, 4 + 30 * Math.sin(Math.PI * f), -86); sunM.material.opacity = Math.min(1, day * 1.3); }
    var g2 = t >= .5 ? (t - .5) / .5 : (t + .5) / .5 - 1; moonM.visible = day < .8; moonM.position.set(-48 + 96 * Math.max(0, Math.min(1, g2)), 6 + 28 * Math.sin(Math.PI * Math.max(0, Math.min(1, g2))), -86);
    moonM.material.opacity = Math.min(1, (1 - day) * 1.3); starPts.material.opacity = Math.max(0, (.6 - day) * 1.4);
  }
  var FL = { red: 0xff7a3c, blue: 0x5aa8ff, green: 0x6aff8a, white: 0xfff0d8 };
  var lampCol = new T.Color(0xff9a50);
  function lampPos(out) { out.set(wagon.position.x + 1.55, 2.85, wagon.position.z + .6); return out; }
  var tmpV = new T.Vector3();

  /* ---------------- units ---------------- */
  function biomeId(S) { return LR.biome(S).id; }
  var HP_ = [[-1.0, -1.4], [-1.9, 1.2], [-3.7, -1.1], [-4.6, 1.15]], FP_ = [[3.3, -1.4], [4.2, 1.2], [6.0, -1.1], [6.9, 1.15]];
  function heroPos(slot) { return { x: HP_[slot][0] * XS, z: HP_[slot][1] }; }
  function foePos(slot, boss) { return boss ? { x: 5.4 * XS, z: 0 } : { x: FP_[slot][0] * XS, z: FP_[slot][1] }; }
  function mkUnit(cv, mul, key, side) {
    var m = sprite(cv, mul), s = shadow(m.userData.w); sc.add(m); sc.add(s);
    return { m: m, s: s, key: key, side: side, x: 0, z: 0, tx: 0, tz: 0, lunge: 0, lx: 0, flash: 0, dead: 0, vis: 1, bob: Math.random() * 6, w: m.userData.w, h: m.userData.h, hp: 1, name: '', boss: false, cast: 0 };
  }
  function killUnit(u) { sc.remove(u.m); sc.remove(u.s); u.m.material.dispose(); }
  function syncUnits(S, dt, walking) {
    // heroes
    var seen = {};
    for (var s = 0; s < 4; s++) {
      var id = S.party[s]; if (!id) continue; seen[id] = 1;
      var u = heroObj[id]; if (!u) { u = heroObj[id] = mkUnit(ART.hero(id), 1.05, '', 0); u.x = u.tx = heroPos(s).x; u.z = u.tz = heroPos(s).z; }
      u.slot = s; u.key = '0:' + s; var p = heroPos(s); u.tx = p.x; u.tz = p.z; u.id = id;
    }
    Object.keys(heroObj).forEach(function (id) { if (!seen[id]) { killUnit(heroObj[id]); delete heroObj[id]; } });
    // foes
    if (S.fight !== lastFight) {
      if (lastFight) Object.keys(foeObj).forEach(function (k) { foeObj[k].leaving = 1; });
      if (S.fight) {
        S.fight.foes.forEach(function (f) {
          var bi = LR.biome(S), idx = Math.max(0, bi.mon.map(function (x) { return x[0]; }).indexOf(f.name));
          var u = mkUnit(ART.mon(f.arch, bi.id, idx, f.boss), f.boss ? 1.1 : 1.05, f.key, 1), p = foePos(f.slot, f.boss);
          u.x = p.x + 16; u.z = p.z; u.tx = p.x; u.tz = p.z; u.boss = f.boss; u.name = f.name; u.vis = 1; foeObj['n' + Math.random()] = u; u.fid = f.key; u.unit = f;
        });
      }
      lastFight = S.fight;
    }
    Object.keys(foeObj).forEach(function (k) {
      var u = foeObj[k]; if (u.leaving) { u.vis -= dt * 2.2; if (u.vis <= 0) { killUnit(u); delete foeObj[k]; } }
    });
    return;
  }
  function allUnits() { var a = []; Object.keys(heroObj).forEach(function (k) { a.push(heroObj[k]); }); Object.keys(foeObj).forEach(function (k) { a.push(foeObj[k]); }); return a; }
  function findUnit(key) {
    var k, u; for (k in heroObj) { u = heroObj[k]; if (u.key === key) return u; }
    for (k in foeObj) { u = foeObj[k]; if (u.key === key && !u.leaving) return u; } return null;
  }
  function animUnits(S, dt, walking) {
    var F = S.fight;
    allUnits().forEach(function (u) {
      var live = u.unit ? u.unit.alive : (F ? (function () { var h = F.heroes.filter(function (x) { return x.key === u.key; })[0]; return h ? h.alive : true; })() : true);
      if (u.unit) u.hp = u.unit.hp / u.unit.max;
      else if (F) { var hh = F.heroes.filter(function (x) { return x.key === u.key; })[0]; u.hp = hh ? hh.hp / hh.max : 1; u.alive = hh ? hh.alive : true; }
      else { u.hp = S.heroes[u.id] ? S.heroes[u.id].hp : 1; u.alive = true; }
      if (u.unit) u.alive = u.unit.alive;
      u.x += (u.tx - u.x) * Math.min(1, dt * (u.side ? 3.2 : 4)); u.z += (u.tz - u.z) * Math.min(1, dt * 4);
      u.lunge = Math.max(0, u.lunge - dt * 4.2); u.flash = Math.max(0, u.flash - dt * 5); u.cast = Math.max(0, u.cast - dt);
      var dir = u.side ? -1 : 1, lx = Math.sin(u.lunge * Math.PI) * 1.3 * dir;
      var bob = 0, sx = 1, sy = 1;
      if (walking && !u.side) bob = Math.abs(Math.sin(tNow * 8 + u.bob)) * .1; else { sy = 1 + Math.sin(tNow * 2.2 + u.bob) * .018; }
      if (u.side && !u.alive) { u.dead = Math.min(1, u.dead + dt * 1.5); } else if (!u.alive && !u.side) { u.dead = Math.min(1, u.dead + dt * 2); } else u.dead = Math.max(0, u.dead - dt * 3);
      var m = u.m; m.position.set(u.x + lx, bob, u.z);
      m.scale.set(sx, sy * (1 - u.dead * .0), 1); m.rotation.z = u.side ? u.dead * .9 : -u.dead * 1.2;
      var vis = u.vis * (u.side ? 1 - u.dead * .85 : 1 - u.dead * .35);
      m.material.opacity = vis; m.material.transparent = true; m.material.alphaTest = vis < .95 ? .02 : .45;
      var f = u.flash; m.material.emissive.setRGB(f * .9, f * .5, f * .45);
      if (u.cast > 0) m.material.emissive.setRGB(.35 * u.cast, .3 * u.cast, .1 * u.cast);
      u.s.position.set(u.x + lx, .015, u.z); u.s.scale.set(u.w * .38 * (1 - bob * 2), 1, .42);
      u.s.visible = vis > .3;
    });
  }

  /* ---------------- events ---------------- */
  function head(u) { return { x: u.m.position.x, y: u.h * 1.02, z: u.m.position.z }; }
  function floater(u, txt, col, size, big) {
    if (!u) return; var h = head(u); fl.push({ x: h.x + (Math.random() - .5) * .6, y: h.y, z: h.z, t: 0, life: big ? 1.4 : .95, txt: txt, col: col, size: size || 18 });
  }
  LRS.floatText = function (txt, col, size) { fl.push({ x: -1.5, y: 3.6, z: 0, t: 0, life: 1.6, txt: txt, col: col, size: size || 20 }); };
  LRS.event = function (e, S) {
    if (e.e === 'hit') {
      var a = findUnit(e.s), t = findUnit(e.t); if (a) a.lunge = 1; if (t) { t.flash = 1; floater(t, String(e.d), t.side ? (e.c ? '#ffe45a' : e.sk ? '#ffb04a' : '#ffffff') : '#ff6a6a', e.c ? 26 : e.sk ? 22 : 17); }
    } else if (e.e === 'heal') { var h = findUnit(e.t); floater(h, '+' + e.d, '#7aff9a', 18); }
    else if (e.e === 'cast') { var c = findUnit(e.s); if (c) { c.cast = .8; floater(c, e.n, '#9fe8ff', 15, true); } }
    else if (e.e === 'win') { flash = Math.max(flash, .08); }
    else if (e.e === 'wipe') { fadeTarget = 1; setTimeout(function () { fadeTarget = 0; }, 1500); }
    else if (e.e === 'guardian') { flash = .5; }
  };
  LRS.flare = function () { flash = .6; ringT = 1; };
  var ringT = 0;

  /* ---------------- per-frame ---------------- */
  var tmpP = new T.Vector3();
  function roadFrame(S, dt, walking, speedLeaguesPerSec) {
    var b = biomeId(S); if (b !== curBiome) setBiome(b);
    if (lastLeague === null) lastLeague = S.league;
    var dl = S.league - lastLeague; lastLeague = S.league; if (Math.abs(dl) > 2) dl = 0; dist += dl * UPL;
    var day = dayness(S.tod), night = 1 - day, warm = warmth(S.tod);
    updateSky(S, day, warm);
    // camera
    var sh = shake > 0 ? (Math.random() - .5) * shake : 0; shake = Math.max(0, shake - dt * 2);
    cam.position.set(.6 + sh, 3.9 + camDist * .12, camDist); cam.lookAt(.8, 1.35, 0);
    // layers & ground
    function scroll(tx, rep, v, w) { tx.offset.x = (dist * v) / (w / rep); }
    var gt = ground.material.map, rt_ = road.material.map; if (gt) gt.offset.x = dist / TILE; if (rt_) rt_.offset.x = dist / TILE;
    if (farL.material.map) farL.material.map.offset.x = dist * .02 / 33; if (midL.material.map) midL.material.map.offset.x = dist * .12 / 25.6;
    var fcol0 = tmpA, tintD = null, nightTint = new T.Color(.28, .3, .5), mix = Math.pow(night, .8);
    var layerTint = new T.Color(1, 1, 1).lerp(nightTint, mix); farL.material.color.copy(layerTint).lerp(new T.Color(1, .78, .66), warm * .5); midL.material.color.copy(layerTint).multiplyScalar(.85).lerp(fcol0.copy(sc.fog.color), .22);
    var fcol = sc.fog.color; farL.material.color.lerp(fcol, .35);
    clouds.forEach(function (c) { c.position.x += c.userData.sp * dt; if (c.position.x > 100) c.position.x = -100; c.material.opacity = (.35 + .6 * day) * (curBiome === 'ash' ? .35 : 1); c.material.color.setRGB(1, 1, 1).lerp(nightTint, mix); });
    // lights
    hemi.intensity = .3 + .85 * day; hemi.color.setRGB(1, .96, .85).lerp(new T.Color(.32, .38, .75), 1 - day); hemi.groundColor.setRGB(.2, .17, .25);
    sun.intensity = .75 * day; sun.color.setRGB(1, .93, .8).lerp(new T.Color(1, .6, .4), warm * .6);
    // lantern
    var br = S.bright, fc = FL[S.flame] || FL.red, tgt = tmpB.setHex(fc), flick = 1 + Math.sin(tNow * 9) * .04 + Math.sin(tNow * 23.7) * .03 + Math.sin(tNow * 3.1) * .05;
    var fl_ = S.flare && S.flare.t > 0 ? 1 + .8 * Math.min(1, S.flare.t) : 1;
    lampCol.lerp(tgt, Math.min(1, dt * 4)); lamp.color.copy(lampCol);
    lamp.intensity = (.55 + br * .75) * flick * fl_ * (1 + .4 * night); lamp.distance = (7 + br * 3.4) * Math.sqrt(fl_);
    // wagon
    var wp = -7.4 * XS; wagon.position.set(wp, .35 + (walking ? Math.abs(Math.sin(tNow * 5)) * .04 : 0), -.2); wagonSh.position.set(wp, .015, -.2);
    lampPos(lamp.position);
    var ps = lamp.position; glowM.position.set(ps.x, ps.y, ps.z + .3); glowM.quaternion.copy(cam.quaternion);
    var gs = (.45 + br * .35) * flick * fl_ * (.55 + .6 * night); glowM.scale.set(gs, gs, 1); glowM.material.color.copy(lampCol); glowM.material.opacity = Math.min(1, .35 + night * .6) * (br > 0 ? 1 : .3);
    if (ringT > 0) { ringT = Math.max(0, ringT - dt * 1.4); var rs = 3 + (1 - ringT) * 26; ringM.scale.set(rs, rs, 1); ringM.position.set(ps.x, ps.y, ps.z + .4); ringM.quaternion.copy(cam.quaternion); ringM.material.opacity = ringT; ringM.material.color.copy(lampCol); } else ringM.material.opacity = 0;
    // props
    for (var i = 0; i < props.length; i++) {
      var p = props[i], x = (((p.x0 - dist) % LOOP) + LOOP) % LOOP - 30;
      p.m.position.set(x, 0, p.z); p.s.position.set(x, .015, p.z); p.s.scale.set(p.m.userData.w * .36, 1, .42);
    }
    // waystones
    var k0 = Math.floor(S.league / 10) - 1;
    for (i = 0; i < stones.length; i++) {
      var k = k0 + i, x2 = (k * 10 - S.league) * UPL + .4 * XS, st = stones[i]; st.m.position.set(x2, 0, -2.9); st.s.position.set(x2, .015, -2.9); st.m.visible = st.s.visible = k >= 1;
    }
    var gx = (S.gate - S.league) * UPL + 9 * XS; gateL.position.set(gx, 0, -3.2); gateR.position.set(gx + .3, 0, 3.2); gateL.visible = gateR.visible = gx < 45;
    // units and particles
    syncUnits(S, dt, walking); animUnits(S, dt, walking);
    stepParticles(dt, walking ? UPL * LR_SPEED : 0, night, day);
    postMat.uniforms.uNight.value = night;
    return night;
  }
  var LR_SPEED = .09;

  /* ---------------- camp scene ---------------- */
  var campBuilt = false, campFire, campFireLight, campLamp, campHeroes = [], campFlies, campFliesV, campStars;
  function buildCamp() {
    camp = new T.Scene(); camp.fog = new T.Fog(0x141632, 16, 55);
    ccam = new T.PerspectiveCamera(36, W / H, .5, 200);
    var hm = new T.HemisphereLight(0x7a88d8, 0x2a2030, .75); camp.add(hm);
    var moon = new T.DirectionalLight(0x9fb0ff, .45); moon.position.set(-6, 12, 8); camp.add(moon);
    campFireLight = new T.PointLight(0xff9040, 2.0, 15, 1.4); campFireLight.position.set(0, 1.0, 1.4); camp.add(campFireLight);
    campLamp = new T.PointLight(0xff9a50, 1.5, 9, 1.4); campLamp.position.set(5.6, 3.2, -1.6); camp.add(campLamp);
    var sk = document.createElement('canvas'); sk.width = 2; sk.height = 128; var x = sk.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#070a1f'); g.addColorStop(.6, '#1b1e4a'); g.addColorStop(1, '#3a2a58'); x.fillStyle = g; x.fillRect(0, 0, 2, 128);
    var skm = new T.Mesh(new T.PlaneGeometry(300, 150), new T.MeshBasicMaterial({ map: tex(sk, true), fog: false, depthWrite: false })); skm.position.set(0, 40, -70); skm.renderOrder = -10; camp.add(skm);
    var sp = [], r = LR.seeded(21); for (var i = 0; i < 140; i++) sp.push((r() - .5) * 220, 6 + r() * 60, -68);
    var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(sp, 3)); campStars = new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: false, fog: false, depthWrite: false })); camp.add(campStars);
    var moonm = new T.Mesh(new T.PlaneGeometry(12, 12), new T.MeshBasicMaterial({ map: tex(radial(64, [[0, 'rgba(240,244,255,1)'], [.4, 'rgba(220,230,255,.95)'], [.55, 'rgba(160,180,255,.3)'], [1, 'rgba(160,180,255,0)']]), true), transparent: true, fog: false, depthWrite: false })); moonm.position.set(-24, 30, -66); camp.add(moonm);
    campGround = new T.Mesh(new T.CircleGeometry(30, 40).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ color: 0xffffff })); camp.add(campGround);
    var tent = sprite(ART.tent(), 1.5); tent.position.set(-7, 0, -4.2); camp.add(tent); var ts = shadow(4); ts.position.set(-7, .015, -4.2); camp.add(ts);
    var wg = sprite(ART.wagon(), 1.15); wg.position.set(7.4, 0, -3.4); camp.add(wg); var ws = shadow(4.8); ws.position.set(7.4, .015, -3.4); camp.add(ws);
    campFire = sprite(ART.fire(0), 1.6, false); campFire.position.set(0, 0, .2); camp.add(campFire);
    var fs = shadow(2.2); fs.position.set(0, .015, .2); camp.add(fs);
    for (i = 0; i < 6; i++) { var a = Math.PI * (.12 + i * .15) + Math.PI, lg = sprite(ART.log(), 1.2); lg.position.set(Math.cos(a) * 3.6, 0, Math.sin(a) * -1 * 3.2 * -1 + 0); campHeroes.push({ log: lg, a: a }); }
    var cf = new T.BufferGeometry(); cf.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(50 * 3), 3));
    campFlies = new T.Points(cf, new T.PointsMaterial({ color: 0xffd86a, size: .45, map: tex(ART.spark(), true), transparent: true, blending: T.AdditiveBlending, depthWrite: false })); campFlies.frustumCulled = false; camp.add(campFlies); campFliesV = new Float32Array(50 * 3);
    var q = cf.attributes.position.array; for (i = 0; i < 50; i++) { q[i * 3] = (Math.random() - .5) * 18; q[i * 3 + 1] = .5 + Math.random() * 5; q[i * 3 + 2] = (Math.random() - .5) * 12 - 1; campFliesV[i * 3] = Math.random() * 6; campFliesV[i * 3 + 1] = .4 + Math.random(); campFliesV[i * 3 + 2] = Math.random() * 6; }
    campBuilt = true; campSeat = [];
  }
  var campGround, campSeat = [], campSeatKey = '', campLampCol = new T.Color(0xff9a50);
  function campSync(S) {
    var key = Object.keys(S.heroes).join() + '|' + curBiome; if (key === campSeatKey) return; campSeatKey = key;
    var gt = tex(ART.ground(biomeId(S))); gt.wrapS = gt.wrapT = T.RepeatWrapping; gt.repeat.set(60 / TILE, 60 / TILE); campGround.material.map = gt; campGround.material.color.setRGB(.8, .8, .95); campGround.material.needsUpdate = true;
    campSeat.forEach(function (c) { camp.remove(c.m); camp.remove(c.s); camp.remove(c.l); camp.remove(c.sh); });
    campSeat = []; var ids = LR.HERO_ORDER.filter(function (id) { return S.heroes[id]; }), n = ids.length;
    ids.forEach(function (id, i) {
      var a = Math.PI * (.9 + (i + .5) / n * 1.2) * 1 + 0, ang = Math.PI + (i + .5) / n * Math.PI; // arc in front/side of fire
      var th = Math.PI * (.12 + .76 * ((i + .5) / n)); var x = Math.cos(Math.PI - th) * 3.4, z = -Math.sin(th) * 1.8 + 2.2;
      x = -4.4 + 8.8 * ((i + .5) / n); z = -1.6 + Math.pow((x / 4.4), 2) * -.8; // shallow arc behind the fire
      var m = sprite(ART.hero(id), 1.5), sh = shadow(2.2); m.position.set(x, .42, z); sh.position.set(x, .015, z);
      var lg = sprite(ART.log(), 1.25); lg.position.set(x, 0, z + .5);
      camp.add(m); camp.add(sh); camp.add(lg); campSeat.push({ m: m, s: sh, l: lg, sh: sh, id: id, x: x, ph: Math.random() * 6 });
    });
  }
  function campFrame(S, dt) {
    if (!campBuilt) buildCamp(); campSync(S);
    var f = Math.floor(tNow * 8) % 4; if (campFire.userData.f !== f) { campFire.userData.f = f; campFire.material.map = tex(ART.fire(f)); }
    campFireLight.intensity = 1.9 + Math.sin(tNow * 11) * .22 + Math.sin(tNow * 27) * .16;
    var fc = FL[S.flame] || FL.red; campLampCol.lerp(tmpB.setHex(fc), Math.min(1, dt * 4)); campLamp.color.copy(campLampCol); campLamp.intensity = .5 + S.bright * .6;
    if (campDX) ccam.setViewOffset(W, H, campDX, 0, W, H); else ccam.clearViewOffset();
    var ang = Math.sin(tNow * .12) * .12; var cd = 16 * Math.max(1, 1.15 / ccam.aspect); ccam.position.set(Math.sin(ang) * cd, 4.6 + (cd - 16) * .1, Math.cos(ang) * cd + 1.2); ccam.lookAt(0, ccam.aspect < 1.2 ? 2.5 : 1.3, -.4);
    campSeat.forEach(function (c) { c.m.position.y = .38 + Math.sin(tNow * 1.6 + c.ph) * .02; c.m.lookAt && 0; });
    var q = campFlies.geometry.attributes.position.array;
    for (var i = 0; i < 50; i++) { campFliesV[i * 3] += dt * campFliesV[i * 3 + 1]; var ph = campFliesV[i * 3]; q[i * 3] += Math.cos(ph) * dt * .6; q[i * 3 + 1] += Math.sin(ph * 1.3 + campFliesV[i * 3 + 2]) * dt * .4; q[i * 3 + 2] += Math.sin(ph) * dt * .4; if (q[i * 3 + 1] < .3) q[i * 3 + 1] = 3; if (q[i * 3 + 1] > 7) q[i * 3 + 1] = 1; }
    campFlies.geometry.attributes.position.needsUpdate = true;
  }

  /* ---------------- render ---------------- */
  var campDX = 0;
  LRS.setMode = function (m) { mode = m; };
  LRS.setCampShift = function (dx) { campDX = dx; };
  LRS.render = function (S, dt, walking) {
    tNow += dt; S_ = S; var scn, cm;
    if (mode === 'camp') { campFrame(S, dt); scn = camp; cm = ccam; postMat.uniforms.uFocus.value = .52; postMat.uniforms.uBlur.value = .45; postMat.uniforms.uBloom.value = 1.1; }
    else { roadFrame(S, dt, walking); scn = sc; cm = cam; postMat.uniforms.uFocus.value = .5; postMat.uniforms.uBlur.value = 1; postMat.uniforms.uBloom.value = 1; }
    flash = Math.max(0, flash - dt * 1.2); fade += (fadeTarget - fade) * Math.min(1, dt * 5);
    postMat.uniforms.uFlash.value = flash; postMat.uniforms.uFade.value = fade;
    R.setRenderTarget(rt); R.render(scn, cm); R.setRenderTarget(null); R.render(postScene, postCam);
    drawFx(S, dt, cm);
  };
  function drawFx(S, dt, cm) {
    var sx = fx.width / W, sy = fx.height / H; fxc.setTransform(1, 0, 0, 1, 0, 0); fxc.clearRect(0, 0, fx.width, fx.height); fxc.setTransform(sx, 0, 0, sy, 0, 0);
    function proj(x, y, z) { tmpP.set(x, y, z).project(cm); return [(tmpP.x * .5 + .5) * W, (-tmpP.y * .5 + .5) * H, tmpP.z]; }
    fxc.textAlign = 'center'; fxc.lineJoin = 'round';
    if (mode === 'road') {
      allUnits().forEach(function (u) {
        if (!u.alive && u.dead > .5) return; if (u.vis < .5) return;
        var p = proj(u.m.position.x, u.h * 1.0 + .1, u.m.position.z), wpx = u.side ? (u.boss ? 120 : 44) : 40;
        var s = Math.min(1.2, Math.max(.55, W / 900)); wpx *= s; var y = p[1] - 4;
        if (u.side || u.hp < .999) {
          fxc.fillStyle = 'rgba(10,6,20,.85)'; fxc.fillRect(p[0] - wpx / 2 - 1, y - 1, wpx + 2, 7 * s + 2);
          fxc.fillStyle = u.side ? '#d64545' : (u.hp < .3 ? '#e0b030' : '#58c872'); fxc.fillRect(p[0] - wpx / 2, y, wpx * Math.max(0, Math.min(1, u.hp)), 7 * s);
        }
        if (u.boss) { fxc.font = '700 ' + Math.round(13 * s + 2) + 'px "Pixelify Sans", ui-monospace, monospace'; fxc.strokeStyle = '#120a1e'; fxc.lineWidth = 4; fxc.fillStyle = '#ffd98a'; fxc.strokeText(u.name, p[0], y - 6); fxc.fillText(u.name, p[0], y - 6); }
      });
    }
    for (var i = fl.length - 1; i >= 0; i--) {
      var f = fl[i]; f.t += dt; if (f.t > f.life) { fl.splice(i, 1); continue; }
      var p2 = proj(f.x, f.y + f.t * 1.4, f.z), a = 1 - Math.pow(f.t / f.life, 2.5), sz = f.size * Math.min(1.3, Math.max(.8, W / 800));
      fxc.globalAlpha = a; fxc.font = '700 ' + Math.round(sz) + 'px "Pixelify Sans", ui-monospace, monospace'; fxc.strokeStyle = '#120a1e'; fxc.lineWidth = 4; fxc.fillStyle = f.col; fxc.strokeText(f.txt, p2[0], p2[1]); fxc.fillText(f.txt, p2[0], p2[1]); fxc.globalAlpha = 1;
    }
  }
  LRS.debug = function () { return { dist: dist, props: props.length, units: allUnits().length }; };
  root.LRS = LRS;
})(window);
