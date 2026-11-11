'use strict';
// Realtime world: player presence, chat, and server-driven bots. State lives in memory
// (one Render instance); chat history is also saved to the store.
const { WebSocketServer } = require('ws');
const L = require('../public/layout.js');
const { createBlackjack } = require('./blackjack');

const TICK_MS = 100;
const CHAT_KEEP = 50;
const WB_COLORS = /^#[0-9a-f]{6}$/i;
const WB_MAX_POINTS = 12000; // per whiteboard; oldest strokes drop first

function cleanStroke(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.p) || s.p.length < 1 || s.p.length > 600) return null;
  if (!WB_COLORS.test(s.c || '') || !(s.w >= 1 && s.w <= 40)) return null;
  const p = [];
  for (const pt of s.p) {
    if (!Array.isArray(pt) || pt.length !== 2) return null;
    const x = Math.round(Number(pt[0])), y = Math.round(Number(pt[1]));
    if (!(x >= 0 && x <= 1000 && y >= 0 && y <= 1000)) return null;
    p.push([x, y]);
  }
  return { c: s.c.toLowerCase(), w: Math.round(s.w), p };
}
const r2 = (n) => Math.round(n * 100) / 100;

function createWorld(ctx) {
  // ctx: { authenticate(req) -> user|null, getLayout() -> layout, getBots() -> bots[], store }
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16384 });
  const players = new Map(); // username -> { ws, p }
  const wbCache = new Map(); // board id -> strokes
  const wbIds = () => new Set((lw ? lw.objects : []).filter((o) => o.type === 'whiteboard').map((o) => o.id));
  async function wbLoad(id) { if (!wbCache.has(id)) wbCache.set(id, (await ctx.store.get('wb:' + id)) || []); return wbCache.get(id); }
  async function wbSave(id) { await ctx.store.set('wb:' + id, wbCache.get(id)); }
  let lw = null, botState = [], chat = null, deskSeats = [];
  const DESK_SECS = ctx.deskPaySecs || 10;
  const WHACK_COST = 0.1; // reward per workmate whacked
  const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
  const broadcast = (msg, except) => { const s = JSON.stringify(msg); for (const e of players.values()) if (e.ws !== except && e.ws.readyState === 1) e.ws.send(s); };
  const bj = createBlackjack({
    tables: () => (lw ? lw.objects.filter((o) => o.type === 'blackjack').map((o) => ({ id: o.id, seats: L.bjSeats(o), dealer: L.bjDealer(o) })) : []),
    players, send, broadcast, addCoins: (id, n) => ctx.addCoins(id, n), spendCoins: (id, n) => ctx.spendCoins(id, n),
  });

  const CHAT_TTL = Number(process.env.CHAT_TTL_MS) || 3600000; // each chat message is shown for 1 hour
  async function loadChat() {
    if (!chat) chat = (await ctx.store.get('chat')) || [];
    const cut = Date.now() - CHAT_TTL;
    chat = chat.filter((m) => (m.at || 0) > cut);
    return chat;
  }

  async function reload() {
    lw = L.toWorld(await ctx.getLayout());
    deskSeats = lw.objects.filter((o) => o.type === 'desk').map((o) => L.seatFor(o));
    wbCache.clear(); bj.reset(); broadcast({ t: 'bjreset' });
    const defs = await ctx.getBots();
    botState = defs.map((b) => {
      const po = b.post, fixed = !!(po && Number.isFinite(po.x) && Number.isFinite(po.z));
      const s = fixed ? { x: po.x - lw.ox, z: po.z - lw.oz } : L.randomSpot(lw, 1);
      return { fixed, seat: fixed && po.seat ? 1 : 0, id: 'bot:' + b.id, bot: true, name: b.name, role: b.role, costume: b.costume, color: b.color, speed: b.speed || 1.6, x: s.x, z: s.z, r: fixed && Number.isFinite(po.r) ? po.r : 0, mv: 0, tx: null, tz: null, wait: Math.random() * 2, stuck: 0 };
    });
  }

  const pub = (p) => ({ id: p.id, bot: !!p.bot, name: p.name, role: p.role, costume: p.costume, color: p.color, x: r2(p.x), z: r2(p.z), r: r2(p.r), seat: p.seat ? 1 : 0, mv: p.mv ? 1 : 0 });

  function stepBot(b, dt) {
    if (b.fixed) { b.mv = 0; return; }
    if (b.wait > 0) { b.wait -= dt; b.mv = 0; return; }
    if (b.tx === null) { const s = L.randomSpot(lw, 1); b.tx = s.x; b.tz = s.z; b.stuck = 0; }
    let dx = b.tx - b.x, dz = b.tz - b.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.4 || b.stuck > 0.7) { b.tx = null; b.wait = 1 + Math.random() * 3; b.mv = 0; return; }
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
    // sitting at a desk earns 1 CC every 30 seconds
    for (const e of players.values()) {
      const q = e.p, atDesk = q.seat && deskSeats.some((d) => Math.hypot(q.x - d.x, q.z - d.z) < 0.7);
      if (!atDesk) { e.deskSecs = 0; continue; }
      e.deskSecs = (e.deskSecs || 0) + TICK_MS / 1000;
      if (e.deskSecs >= DESK_SECS) {
        e.deskSecs -= DESK_SECS;
        Promise.resolve(ctx.addCoins && ctx.addCoins(q.id, 1)).then((c) => { if (c != null) { send(e.ws, { t: 'coins', coins: c, earned: 1 }); broadcast({ t: 'coinpop', id: q.id, n: 1 }); } }).catch(() => {});
      }
    }
    for (const e of players.values()) { const w = bj.seated(e.p.id); if (w && !e.p.seat && Date.now() - (e.bjAt || 0) > 2500) bj.leave(e.p.id); }
    broadcast({ t: 'state', p: [...players.values()].map((e) => pub(e.p)), b: botState.map(pub) });
  }, TICK_MS);
  timer.unref();

  async function onConnection(ws, user) {
    if (!lw) await reload();
    const old = players.get(user.username);
    if (old) { old.ws.close(4000, 'Signed in elsewhere'); players.delete(user.username); }
    const en = L.entrance(lw), sp = en || L.spawn(lw), j = (Math.random() - 0.5) * 1.2;
    const p = { id: user.username, name: user.name, role: user.role, costume: user.costume, color: user.color, x: en ? sp.x + en.lx * j : sp.x + (Math.random() - 0.5), z: en ? sp.z + en.lz * j : sp.z + (Math.random() - 0.5), r: en ? en.r : 0, seat: 0, mv: 0 };
    const entry = { ws, p, chatTimes: [] };
    players.set(user.username, entry);
    send(ws, { t: 'init', deskSecs: DESK_SECS, you: p.id, p: [...players.values()].map((e) => pub(e.p)), b: botState.map(pub), chat: await loadChat(), bj: bj.snapshot() });
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
        if (!['bear', 'cat', 'duck', 'robot', 'crown', 'none', 'cap', 'tophat', 'wizard', 'cowboy', 'chef', 'party', 'beanie', 'propeller', 'headphones', 'viking', 'halo'].includes(m.costume) || !Number.isInteger(m.color) || m.color < 0 || m.color > 0xffffff) return;
        if (!(await ctx.canWear(p.id, m.costume, m.color))) return;
        p.costume = m.costume; p.color = m.color;
        broadcast({ t: 'look', id: p.id, costume: p.costume, color: p.color });
      } else if (m.t === 'bj') {
        if (m.a === 'join') entry.bjAt = Date.now();
        bj.handle(entry, m);
      } else if (m.t === 'whack') {
        // Friendly hammer: knocks nearby people (in front of you) back and dizzies them. No damage.
        const now = Date.now();
        if (p.seat || now - (entry.lastWhack || 0) < 600) return;
        entry.lastWhack = now;
        const fx = Math.sin(p.r), fz = Math.cos(p.r), cands = [];
        const consider = (t, isBot) => {
          if (t === p || t.seat || (t.immune || 0) > now) return;
          const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
          if (d > 2.1 || d < 0.01 || (dx * fx + dz * fz) / d < 0.3) return;
          cands.push({ t, isBot, kx: (dx / d) * 2.2, kz: (dz / d) * 2.2 });
        };
        for (const e of players.values()) consider(e.p, false);
        botState.forEach((b) => consider(b, true));
        let todo = cands;
        if (todo.length) { // whacking a workmate earns the whacker 0.1 CC each
          const c = await ctx.addCoins(p.id, Math.round(WHACK_COST * todo.length * 10) / 10);
          if (c != null) send(ws, { t: 'coins', coins: c });
        }
        const hits = [];
        for (const { t, isBot, kx, kz } of todo) {
          t.immune = now + 1200;
          if (isBot) {
            t.wait = 2; t.tx = null; t.mv = 0;
            if (!t.fixed) for (const f of [1, 0.6, 0.3]) { if (!L.blocked(lw, t.x + kx * f, t.z + kz * f)) { t.x += kx * f; t.z += kz * f; break; } }
          }
          hits.push({ id: t.id, x: r2(kx), z: r2(kz) });
        }
        broadcast({ t: 'whack', by: p.id, hits });
        send(ws, { t: 'whack', by: p.id, hits });
      } else if (m.t === 'wb' || m.t === 'wbclear') {
        const id = String(m.id || '');
        if (!wbIds().has(id)) return;
        const now = Date.now();
        entry.wbTimes = (entry.wbTimes || []).filter((t) => now - t < 3000);
        if (entry.wbTimes.length >= 30) return;
        entry.wbTimes.push(now);
        const strokes = await wbLoad(id);
        if (m.t === 'wbclear') { strokes.length = 0; broadcast({ t: 'wbclear', id }); return wbSave(id).catch(() => {}); }
        const st = cleanStroke(m.s);
        if (!st) return;
        strokes.push(st);
        let total = strokes.reduce((n, x) => n + x.p.length, 0);
        while (total > WB_MAX_POINTS && strokes.length > 1) total -= strokes.shift().p.length;
        broadcast({ t: 'wb', id, s: st }, ws);
        wbSave(id).catch(() => {});
      } else if (m.t === 'chat') {
        const text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
        if (!text) return;
        const now = Date.now();
        entry.chatTimes = entry.chatTimes.filter((t) => now - t < 5000);
        if (entry.chatTimes.length >= 5) return send(ws, { t: 'notice', text: 'Slow down a little.' });
        entry.chatTimes.push(now);
        const msg = { name: p.name, role: p.role, text, at: now };
        const list = await loadChat(); list.push(msg); while (list.length > CHAT_KEEP) list.shift(); chat = list;
        ctx.store.set('chat', list).catch(() => {});
        broadcast({ t: 'chat', m: msg });
      }
    });
    ws.on('close', () => {
      if (players.get(user.username) === entry) { bj.leave(user.username); players.delete(user.username); broadcast({ t: 'leave', id: p.id }); }
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
    ready: async () => { if (!lw) await reload(); },
    online: () => players.size,
    whiteboards: async () => { const out = {}; for (const id of wbIds()) out[id] = await wbLoad(id); return out; },
    notify: (username, msg) => { const e = players.get(username); if (e) send(e.ws, msg); },
    refreshClients: () => broadcast({ t: 'reload' }),
    close: () => { clearInterval(timer); for (const e of players.values()) e.ws.terminate(); wss.close(); },
  };
}

module.exports = { createWorld };
