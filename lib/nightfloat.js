'use strict';
// Night Float multiplayer: a relay. Each player's casts are generated from a shared seed on every client,
// so the server only forwards boats, casts and catches. Nothing is scored, so there is nothing to cheat.
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const MAX_PLAYERS = 8, LAKE_R = 50, TICK_MS = 120;
const COLORS = [0xff5d5d, 0xffb347, 0xffd166, 0x3ee6c4, 0x7aa2ff, 0xc9b6ff, 0xff7eb6, 0x8ee060];
const num = (v, lo, hi) => { v = Number(v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null; };
const cleanName = (s) => String(s || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16);
const SPECIES = new Set(['glimmerling', 'dawdler', 'skimray', 'ribbonjaw', 'gulper', 'hollowking', 'boot', 'weed', 'snag']);

function createNightfloat(ctx) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
  const rooms = new Map(); // key -> { key, date, players: Map }
  const today = () => (ctx.today ? ctx.today() : new Date().toISOString().slice(0, 10));

  function roomFor(date) {
    for (let n = 1; n < 200; n++) {
      const key = date + '#' + n, r = rooms.get(key);
      if (!r) { const nr = { key, date, players: new Map() }; rooms.set(key, nr); return nr; }
      if (r.players.size < MAX_PLAYERS) return r;
    }
    return null;
  }
  const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
  const bcast = (room, m, except) => { const s = JSON.stringify(m); for (const p of room.players.values()) if (p.ws !== except && p.ws.readyState === 1) p.ws.send(s); };
  const pub = (p) => ({ id: p.id, name: p.name, color: p.color, x: p.x, z: p.z, h: p.h, cast: p.cast });

  function onConnection(ws, user, query) {
    const room = roomFor(today());
    if (!room) return ws.close(1013, 'Full');
    const id = crypto.randomBytes(4).toString('hex');
    const taken = new Set([...room.players.values()].map((p) => p.color));
    const p = {
      id, ws, room, x: 0, z: -40, h: 0, cast: null, at: 0, castAt: 0, catchAt: 0, dirty: false,
      name: cleanName(user ? user.name : query.get('name')) || 'Guest ' + id.slice(0, 3),
      color: user && Number.isInteger(user.color) ? user.color : (COLORS.find((c) => !taken.has(c)) || COLORS[0])
    };
    room.players.set(id, p);
    send(ws, { t: 'init', you: id, room: room.key, seed: room.date, players: [...room.players.values()].map(pub) });
    bcast(room, { t: 'join', p: pub(p) }, ws);

    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw.toString()); } catch { return; }
      const now = Date.now();
      if (m.t === 'pose') {
        const x = num(m.x, -LAKE_R - 12, LAKE_R + 12), z = num(m.z, -LAKE_R - 12, LAKE_R + 12), h = num(m.h, -20, 20);
        if (x == null || z == null || h == null) return;
        p.x = x; p.z = z; p.h = h; p.dirty = true;
      } else if (m.t === 'cast') {
        if (now - p.castAt < 800) return; p.castAt = now;
        const c = m.c || {}, dist = num(c.dist, 4, 20), ang = num(c.ang, -20, 20), seed = num(c.seed, 0, 4294967295), sp = String(c.spot || '').slice(0, 4);
        if (dist == null || ang == null || seed == null || !/^s\d$/.test(sp)) return;
        p.cast = { spot: sp, dist, ang, seed: Math.floor(seed), x: num(c.x, -80, 80), z: num(c.z, -80, 80) };
        bcast(room, { t: 'cast', id, c: p.cast }, ws);
      } else if (m.t === 'reel') {
        p.cast = null; bcast(room, { t: 'reel', id }, ws);
      } else if (m.t === 'catch') {
        if (now - p.catchAt < 1500 || !SPECIES.has(m.what)) return; p.catchAt = now; p.cast = null;
        bcast(room, { t: 'catch', id, what: m.what });
      }
    });
    ws.on('close', () => {
      room.players.delete(id); bcast(room, { t: 'leave', id });
      if (!room.players.size) rooms.delete(room.key);
    });
    ws.on('error', () => {});
  }

  const timer = setInterval(() => {
    for (const room of rooms.values()) {
      const moved = [...room.players.values()].filter((p) => p.dirty);
      if (!moved.length) continue;
      moved.forEach((p) => { p.dirty = false; });
      const s = JSON.stringify({ t: 's', p: moved.map((p) => [p.id, Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100, Math.round(p.h * 100) / 100]) });
      for (const p of room.players.values()) if (p.ws.readyState === 1) p.ws.send(s);
    }
  }, TICK_MS);
  timer.unref();

  function handleUpgrade(server) {
    server.on('upgrade', async (req, socket, head) => {
      try {
        if (!/^\/nfws(\?|$)/.test(req.url)) return;
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); return socket.destroy(); }
        let user = null; try { user = ctx.authenticate ? await ctx.authenticate(req) : null; } catch { user = null; }
        const q = new URL(req.url, 'http://x').searchParams;
        wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, user, q));
      } catch { socket.destroy(); }
    });
  }
  return { handleUpgrade, online: () => [...rooms.values()].reduce((a, r) => a + r.players.size, 0), close: () => { clearInterval(timer); for (const r of rooms.values()) for (const p of r.players.values()) p.ws.terminate(); wss.close(); } };
}
module.exports = { createNightfloat, MAX_PLAYERS };
