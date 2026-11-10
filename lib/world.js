'use strict';
// Realtime world: player presence, chat, and server-driven bots. State lives in memory
// (one Render instance); chat history is also saved to the store.
const { WebSocketServer } = require('ws');
const L = require('../public/layout.js');

const TICK_MS = 100;
const CHAT_KEEP = 50;
const r2 = (n) => Math.round(n * 100) / 100;

function createWorld(ctx) {
  // ctx: { authenticate(req) -> user|null, getLayout() -> layout, getBots() -> bots[], store }
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
  const players = new Map(); // username -> { ws, p }
  let lw = null, botState = [], chat = null;

  async function loadChat() { if (!chat) chat = (await ctx.store.get('chat')) || []; return chat; }

  async function reload() {
    lw = L.toWorld(await ctx.getLayout());
    const defs = await ctx.getBots();
    botState = defs.map((b) => {
      const s = L.randomSpot(lw);
      return { id: 'bot:' + b.id, bot: true, name: b.name, role: b.role, costume: b.costume, color: b.color, speed: b.speed || 1.6, x: s.x, z: s.z, r: 0, mv: 0, tx: null, tz: null, wait: Math.random() * 2, stuck: 0 };
    });
  }

  const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
  const broadcast = (msg, except) => { const s = JSON.stringify(msg); for (const e of players.values()) if (e.ws !== except && e.ws.readyState === 1) e.ws.send(s); };
  const pub = (p) => ({ id: p.id, bot: !!p.bot, name: p.name, role: p.role, costume: p.costume, color: p.color, x: r2(p.x), z: r2(p.z), r: r2(p.r), seat: p.seat ? 1 : 0, mv: p.mv ? 1 : 0 });

  function stepBot(b, dt) {
    if (b.wait > 0) { b.wait -= dt; b.mv = 0; return; }
    if (b.tx === null) { const s = L.randomSpot(lw); b.tx = s.x; b.tz = s.z; b.stuck = 0; }
    let dx = b.tx - b.x, dz = b.tz - b.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.4 || b.stuck > 2) { b.tx = null; b.wait = 1 + Math.random() * 3; b.mv = 0; return; }
    dx /= d; dz /= d;
    const nx = b.x + dx * b.speed * dt, nz = b.z + dz * b.speed * dt;
    let moved = false;
    if (!L.blocked(lw, nx, nz)) { b.x = nx; b.z = nz; moved = true; }
    else if (!L.blocked(lw, nx, b.z)) { b.x = nx; moved = true; }
    else if (!L.blocked(lw, b.x, nz)) { b.z = nz; moved = true; }
    b.stuck = moved ? 0 : b.stuck + dt;
    b.mv = moved ? 1 : 0;
    const cur = b.r, ang = Math.atan2(dx, dz), diff = Math.atan2(Math.sin(ang - cur), Math.cos(ang - cur));
    b.r = cur + diff * Math.min(1, dt * 8);
  }

  const timer = setInterval(() => {
    if (!lw || players.size === 0) return;
    botState.forEach((b) => stepBot(b, TICK_MS / 1000));
    broadcast({ t: 'state', p: [...players.values()].map((e) => pub(e.p)), b: botState.map(pub) });
  }, TICK_MS);
  timer.unref();

  async function onConnection(ws, user) {
    if (!lw) await reload();
    const old = players.get(user.username);
    if (old) { old.ws.close(4000, 'Signed in elsewhere'); players.delete(user.username); }
    const sp = L.spawn(lw);
    const p = { id: user.username, name: user.name, role: user.role, costume: user.costume, color: user.color, x: sp.x + (Math.random() - 0.5), z: sp.z + (Math.random() - 0.5), r: 0, seat: 0, mv: 0 };
    const entry = { ws, p, chatTimes: [] };
    players.set(user.username, entry);
    send(ws, { t: 'init', you: p.id, p: [...players.values()].map((e) => pub(e.p)), b: botState.map(pub), chat: await loadChat() });
    broadcast({ t: 'join', p: pub(p) }, ws);

    ws.on('message', async (raw) => {
      let m; try { m = JSON.parse(raw.toString()); } catch { return; }
      if (m.t === 'pose') {
        const x = Number(m.x), z = Number(m.z), r = Number(m.r);
        if (![x, z, r].every(Number.isFinite)) return;
        if (L.floorAt(lw, x, z) === ' ') return; // never stand on the void
        // ignore teleports: at most ~10 units per second since last update
        if (Math.hypot(x - p.x, z - p.z) > 6) return;
        p.x = x; p.z = z; p.r = r; p.seat = m.seat ? 1 : 0; p.mv = m.mv ? 1 : 0;
      } else if (m.t === 'look') {
        if (!['bear', 'cat', 'duck', 'robot', 'crown', 'none'].includes(m.costume) || !Number.isInteger(m.color) || m.color < 0 || m.color > 0xffffff) return;
        if (!(await ctx.canWear(p.id, m.costume, m.color))) return;
        p.costume = m.costume; p.color = m.color;
        broadcast({ t: 'look', id: p.id, costume: p.costume, color: p.color });
      } else if (m.t === 'chat') {
        const text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
        if (!text) return;
        const now = Date.now();
        entry.chatTimes = entry.chatTimes.filter((t) => now - t < 5000);
        if (entry.chatTimes.length >= 5) return send(ws, { t: 'notice', text: 'Slow down a little.' });
        entry.chatTimes.push(now);
        const msg = { name: p.name, role: p.role, text, at: now };
        const list = await loadChat(); list.push(msg); while (list.length > CHAT_KEEP) list.shift();
        ctx.store.set('chat', list).catch(() => {});
        broadcast({ t: 'chat', m: msg });
      }
    });
    ws.on('close', () => {
      if (players.get(user.username) === entry) { players.delete(user.username); broadcast({ t: 'leave', id: p.id }); }
    });
    ws.on('error', () => {});
  }

  function handleUpgrade(server) {
    server.on('upgrade', async (req, socket, head) => {
      try {
        if (!req.url.startsWith('/ws')) return socket.destroy();
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); return socket.destroy(); }
        const user = await ctx.authenticate(req);
        if (!user) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); return socket.destroy(); }
        wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, user));
      } catch { socket.destroy(); }
    });
  }

  return {
    handleUpgrade, reload,
    online: () => players.size,
    notify: (username, msg) => { const e = players.get(username); if (e) send(e.ws, msg); },
    refreshClients: () => broadcast({ t: 'reload' }),
    close: () => { clearInterval(timer); for (const e of players.values()) e.ws.terminate(); wss.close(); },
  };
}

module.exports = { createWorld };
