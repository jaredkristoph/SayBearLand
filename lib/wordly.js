'use strict';
// Wordly PVP: two players in a room race to solve the same secret word. The server owns the word and the
// feedback, so nobody can cheat. The opponent only ever receives the tile colours of your guesses, never the letters.
const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const WORDS = require('./wordly-words.json');

const ANSWERS = WORDS.answers, VALID = new Set(WORDS.valid), ROWS = 6, LEN = 5;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const cleanName = (s) => String(s || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 14);

// 0 = absent (grey), 1 = present (yellow), 2 = correct (green). Repeated letters are counted the usual way.
function score(guess, secret) {
  const res = Array(LEN).fill(0), left = {};
  for (let i = 0; i < LEN; i++) { if (guess[i] === secret[i]) res[i] = 2; else left[secret[i]] = (left[secret[i]] || 0) + 1; }
  for (let i = 0; i < LEN; i++) if (res[i] === 0 && left[guess[i]] > 0) { res[i] = 1; left[guess[i]]--; }
  return res.join('');
}

function createWordly(ctx = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  const rooms = new Map();
  const pick = ctx.pick || ((room) => { let w; do { w = ANSWERS[crypto.randomInt(ANSWERS.length)]; } while (w === room.last && ANSWERS.length > 1); return w; });
  const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
  const bcast = (room, m) => { for (const p of room.players) send(p.ws, m); };
  const newCode = () => { for (let n = 0; n < 200; n++) { let c = ''; for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]; if (!rooms.has(c)) return c; } return null; };
  const roomInfo = (room) => ({ t: 'room', code: room.code, state: room.state, round: room.round, players: room.players.map((p) => ({ id: p.id, name: p.name, wins: p.wins, rematch: p.rematch })) });
  const push = (room) => bcast(room, roomInfo(room));

  function startRound(room) {
    room.round++; room.state = 'play'; room.secret = pick(room); room.last = room.secret;
    for (const p of room.players) { p.rows = []; p.done = false; p.rematch = false; }
    push(room); bcast(room, { t: 'start', round: room.round });
  }
  function finish(room, winner, reason) {
    room.state = 'over'; if (winner) winner.wins++;
    for (const p of room.players) p.rematch = false;
    bcast(room, { t: 'over', winner: winner ? winner.id : null, word: room.secret, reason });
    push(room);
  }

  function onGuess(room, p, w) {
    if (room.state !== 'play' || p.done) return;
    const now = Date.now(); p.hits = (p.hits || []).filter((t) => now - t < 10000); if (p.hits.length >= 20) return; p.hits.push(now);
    w = String(w || '').toLowerCase();
    if (!/^[a-z]{5}$/.test(w)) return send(p.ws, { t: 'bad', w, why: 'Not enough letters' });
    if (!VALID.has(w)) return send(p.ws, { t: 'bad', w, why: 'Not in word list' });
    const pat = score(w, room.secret), row = p.rows.length; p.rows.push({ w, pat });
    for (const q of room.players) send(q.ws, q === p ? { t: 'fb', id: p.id, row, pat, word: w } : { t: 'fb', id: p.id, row, pat });
    if (w === room.secret) return finish(room, p, 'solved');
    if (p.rows.length >= ROWS) { p.done = true; if (room.players.every((q) => q.done)) finish(room, null, 'out'); else bcast(room, { t: 'out', id: p.id }); }
  }

  function leave(p) {
    const room = p.room; if (!room) return; p.room = null;
    room.players = room.players.filter((q) => q !== p);
    if (!room.players.length) { rooms.delete(room.code); return; }
    if (room.state === 'play') finish(room, room.players[0], 'left'); else { room.state = 'lobby'; push(room); }
    bcast(room, { t: 'left', id: p.id });
  }

  function onConnection(ws) {
    const p = { id: crypto.randomBytes(3).toString('hex'), ws, room: null, name: 'Player', wins: 0, rows: [], done: false, rematch: false };
    send(ws, { t: 'hello', you: p.id });
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; } if (!m || typeof m.t !== 'string') return;
      if (m.t === 'create' || m.t === 'join') {
        if (p.room) return;
        p.name = cleanName(m.name) || 'Player';
        if (m.t === 'create') {
          if (rooms.size > 2000) return send(ws, { t: 'err', msg: 'Too many rooms right now' });
          const code = newCode(); if (!code) return send(ws, { t: 'err', msg: 'Try again' });
          const room = { code, players: [p], state: 'lobby', round: 0, secret: null, last: null, at: Date.now() }; rooms.set(code, room); p.room = room; p.wins = 0; push(room);
        } else {
          const room = rooms.get(String(m.code || '').toUpperCase().trim());
          if (!room) return send(ws, { t: 'err', msg: 'No room with that code' });
          if (room.players.length >= 2) return send(ws, { t: 'err', msg: 'That room is full' });
          if (room.players[0].name === p.name) p.name = p.name.slice(0, 12) + ' 2';
          p.wins = 0; p.room = room; room.players.push(p); push(room); startRound(room);
        }
      } else if (m.t === 'guess') { if (p.room) onGuess(p.room, p, m.w); }
      else if (m.t === 'rematch') {
        const room = p.room; if (!room || room.state !== 'over' || room.players.length < 2) return;
        p.rematch = true; if (room.players.every((q) => q.rematch)) startRound(room); else push(room);
      } else if (m.t === 'leave') leave(p);
    });
    ws.on('close', () => leave(p)); ws.on('error', () => {});
  }

  function handleUpgrade(server) {
    server.on('upgrade', (req, socket, head) => {
      try {
        if (!/^\/wlws(\?|$)/.test(req.url)) return;
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); return socket.destroy(); }
        wss.handleUpgrade(req, socket, head, onConnection);
      } catch { socket.destroy(); }
    });
  }
  return { handleUpgrade, rooms: () => rooms.size, close: () => { for (const r of rooms.values()) for (const p of r.players) p.ws.terminate(); wss.close(); } };
}
module.exports = { createWordly, score };
