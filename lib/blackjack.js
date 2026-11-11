'use strict';
// Live blackjack tables. One state machine per blackjack object in the layout.
// Up to 4 players per table, an AI dealer (stands on all 17s), blackjack pays 3:2.
// Players can hit, stand, double down and split a pair once (two hands).
// Bets are taken from the player's coins when placed and paid back through ctx.addCoins.

const MIN_BET = 1, MAX_BET = 100;
const SPEED = Number(process.env.BJ_SPEED) || 1; // tests run the timers faster
const T = { bet: 15000 / SPEED, betAllIn: 2500 / SPEED, turn: 15000 / SPEED, deal: 1700 / SPEED, draw: 950 / SPEED, result: 6000 / SPEED };

const cardVal = (c) => { const r = c % 13; return r === 0 ? 11 : r >= 9 ? 10 : r + 1; };
function total(hand) {
  let t = 0, aces = 0;
  for (const c of hand) { t += cardVal(c); if (c % 13 === 0) aces++; }
  while (t > 21 && aces > 0) { t -= 10; aces--; }
  return t;
}
const isBj = (h) => h.length === 2 && total(h) === 21;
const canSplitHand = (h) => h.length === 2 && Math.min(cardVal(h[0]), 10) === Math.min(cardVal(h[1]), 10);

function createBlackjack(ctx) {
  // ctx: { tables() -> [{id, seats:[{x,z}], dealer}], players: Map, send, broadcast, addCoins, spendCoins, newShoe? }
  const tables = new Map();
  const where = new Map(); // username -> { table, i }
  const now = () => Date.now();

  function getTable(id) {
    let t = tables.get(id);
    if (!t) { t = { id, seats: [null, null, null, null], dealer: [], phase: 'idle', until: 0, turn: -1, sub: 0, shoe: [], timer: null, revealed: false }; tables.set(id, t); }
    return t;
  }
  const defs = () => new Map(ctx.tables().map((d) => [d.id, d]));
  function newShoe() {
    if (ctx.newShoe) return ctx.newShoe();
    const s = []; for (let d = 0; d < 4; d++) for (let c = 0; c < 52; c++) s.push(c);
    for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; }
    return s;
  }
  const draw = (t) => { if (t.shoe.length < 20) t.shoe = newShoe(); return t.shoe.pop(); };
  const H = (q, sub) => (sub === 1 && q.sp ? q.sp : q); // the hand being played: the seat itself or its split hand

  const hv = (h) => ({ h: h.hand, bet: h.bet, st: h.st, res: h.res || null, pay: h.pay || 0, tot: h.hand.length ? total(h.hand) : 0 });
  function view(t) {
    const hide = t.phase === 'deal' || t.phase === 'play';
    return {
      id: t.id, ph: t.phase, left: Math.max(0, t.until - now()), turn: t.turn, sub: t.sub,
      d: hide && t.dealer.length ? [t.dealer[0], -1].slice(0, t.dealer.length) : t.dealer,
      dt: hide ? null : (t.dealer.length ? total(t.dealer) : null),
      s: t.seats.map((q) => q && Object.assign({ id: q.id, name: q.name }, hv(q), { sp: q.sp ? hv(q.sp) : null })),
    };
  }
  const emit = (t) => ctx.broadcast({ t: 'bj', s: view(t) });
  const sit = (t) => t.seats.some(Boolean);
  function schedule(t, ms, fn) { clearTimeout(t.timer); t.until = now() + ms; t.timer = setTimeout(() => { fn(t); }, ms); t.timer.unref && t.timer.unref(); }
  const tell = (id, text) => { const e = ctx.players.get(id); if (e) ctx.send(e.ws, { t: 'notice', text }); };
  const sendCoins = (id, c) => { const e = ctx.players.get(id); if (e && c != null) ctx.send(e.ws, { t: 'coins', coins: c }); };

  function resetRound(t) {
    t.dealer = []; t.turn = -1; t.sub = 0; t.revealed = false;
    t.seats.forEach((q) => { if (q) { q.hand = []; q.bet = 0; q.st = 'wait'; q.res = null; q.pay = 0; q.busy = false; q.sp = null; } });
    if (!sit(t)) { t.phase = 'idle'; clearTimeout(t.timer); t.until = 0; return emit(t); }
    t.phase = 'bet';
    schedule(t, T.bet, betDeadline);
    emit(t);
  }
  function betDeadline(t) {
    if (!sit(t)) return resetRound(t);
    if (t.seats.some((q) => q && q.bet > 0)) return deal(t);
    schedule(t, T.bet, betDeadline); emit(t); // nobody bet yet: keep the table open
  }

  function deal(t) {
    t.phase = 'deal'; t.dealer = []; t.turn = -1; t.sub = 0;
    t.seats.forEach((q) => { if (q) { q.hand = []; q.res = null; q.pay = 0; q.sp = null; q.st = q.bet > 0 ? 'play' : 'wait'; } });
    for (let r = 0; r < 2; r++) { t.seats.forEach((q) => { if (q && q.st === 'play') q.hand.push(draw(t)); }); t.dealer.push(draw(t)); }
    emit(t);
    schedule(t, T.deal, afterDeal);
  }
  function afterDeal(t) {
    t.phase = 'play';
    t.seats.forEach((q) => { if (q && q.st === 'play' && isBj(q.hand)) q.st = 'bj'; });
    if (isBj(t.dealer)) return finish(t);
    t.turn = -1; t.sub = 0; nextTurn(t);
  }
  // Called when the current hand is finished: moves on to the player's split hand, the next player, or the dealer.
  function nextTurn(t) {
    const cur = t.turn >= 0 ? t.seats[t.turn] : null;
    if (cur && cur.sp && t.sub === 0 && cur.sp.st === 'play') { t.sub = 1; return armTurn(t); }
    t.sub = 0;
    let i = t.turn + 1;
    while (i < 4 && !(t.seats[i] && t.seats[i].st === 'play')) i++;
    if (i >= 4) { t.turn = -1; return dealerPlay(t); }
    t.turn = i; armTurn(t);
  }
  function armTurn(t) {
    const i = t.turn, sub = t.sub, q = t.seats[i];
    schedule(t, T.turn, () => {
      if (t.seats[i] !== q || t.turn !== i || t.sub !== sub) return;
      const h = H(q, sub); if (h.st === 'play') { h.st = 'stand'; nextTurn(t); }
    });
    emit(t);
  }
  function dealerPlay(t) {
    t.phase = 'dealer'; t.revealed = true; emit(t);
    const need = t.seats.some((q) => q && (q.st === 'stand' || (q.sp && q.sp.st === 'stand')));
    const step = () => {
      if (need && total(t.dealer) < 17) { t.dealer.push(draw(t)); emit(t); schedule(t, T.draw, step); }
      else finish(t);
    };
    schedule(t, T.draw, step);
  }
  function settle(h, dt, dbj) {
    const pt = total(h.hand);
    if (h.st === 'bust' || pt > 21) { h.res = 'lose'; h.pay = 0; }
    else if (h.st === 'bj') { if (dbj) { h.res = 'push'; h.pay = h.bet; } else { h.res = 'bj'; h.pay = h.bet * 2.5; } }
    else if (dbj) { h.res = 'lose'; h.pay = 0; }
    else if (dt > 21 || pt > dt) { h.res = 'win'; h.pay = h.bet * 2; }
    else if (pt === dt) { h.res = 'push'; h.pay = h.bet; }
    else { h.res = 'lose'; h.pay = 0; }
  }
  function finish(t) {
    t.phase = 'result'; t.revealed = true; t.turn = -1; t.sub = 0;
    const dt = total(t.dealer), dbj = isBj(t.dealer), pays = [];
    t.seats.forEach((q) => {
      if (!q || q.bet <= 0) return;
      let pay = 0, best = null;
      [q, q.sp].forEach((h) => { if (!h) return; settle(h, dt, dbj); pay += h.pay; if (h.res === 'win' || h.res === 'bj') best = 'win'; });
      if (pay > 0) pays.push([q.id, Math.round(pay * 10) / 10, best]);
    });
    emit(t);
    pays.forEach(([id, pay, res]) => {
      Promise.resolve(ctx.addCoins(id, pay)).then((c) => { sendCoins(id, c); if (res === 'win') ctx.broadcast({ t: 'coinpop', id, n: 1 }); }).catch(() => {});
    });
    schedule(t, T.result, resetRound);
  }

  function leave(id) {
    const w = where.get(id); if (!w) return;
    where.delete(id);
    const t = w.table, q = t.seats[w.i];
    t.seats[w.i] = null;
    if (q && q.bet > 0 && t.phase === 'bet') Promise.resolve(ctx.addCoins(id, q.bet)).then((c) => sendCoins(id, c)).catch(() => {}); // left before the deal: bet comes back
    if (!sit(t)) { t.dealer = []; t.turn = -1; return resetRound(t); }
    if (t.phase === 'play' && t.turn === w.i) { t.sub = 1; return nextTurn(t); }
    if (t.phase === 'play' && !t.seats.some((s) => s && (s.st === 'play' || (s.sp && s.sp.st === 'play')))) return dealerPlay(t);
    emit(t);
  }

  function join(entry, tid, i) {
    const id = entry.p.id, d = defs().get(tid);
    if (!d || !Number.isInteger(i) || i < 0 || i > 3) return false;
    const t = getTable(tid);
    if (where.has(id)) leave(id);
    if (t.seats[i]) { tell(id, 'That seat is taken.'); return false; }
    const sp = d.seats[i];
    if (Math.hypot(entry.p.x - sp.x, entry.p.z - sp.z) > 3.5) return false;
    t.seats[i] = { id, name: entry.p.name, bet: 0, hand: [], st: 'wait', busy: false, sp: null };
    where.set(id, { table: t, i });
    if (t.phase === 'idle') resetRound(t); else emit(t);
    return true;
  }

  async function bet(id, n) {
    const w = where.get(id); if (!w) return;
    const t = w.table, q = t.seats[w.i];
    if (!q || t.phase !== 'bet' || q.busy) return;
    n = Number(n);
    if (!Number.isInteger(n) || n < 0 || n > MAX_BET) return tell(id, 'Bets are ' + MIN_BET + ' to ' + MAX_BET + ' CC.');
    const delta = n - q.bet; if (delta === 0) return;
    q.busy = true;
    try {
      const c = delta > 0 ? await ctx.spendCoins(id, delta) : await ctx.addCoins(id, -delta);
      if (c == null) return tell(id, 'Not enough coins for that bet.');
      sendCoins(id, c);
      if (t.phase !== 'bet' || t.seats[w.i] !== q) { await ctx.addCoins(id, delta).then((c2) => sendCoins(id, c2)); return; } // round moved on, give it back
      q.bet = n; q.st = n > 0 ? 'bet' : 'wait';
      const seated = t.seats.filter(Boolean);
      if (seated.length && seated.every((s) => s.bet > 0) && t.until - now() > T.betAllIn) schedule(t, T.betAllIn, betDeadline);
      emit(t);
    } finally { q.busy = false; }
  }

  async function act(id, a) {
    const w = where.get(id); if (!w) return;
    const t = w.table, q = t.seats[w.i];
    if (!q || t.phase !== 'play' || t.turn !== w.i || q.busy) return;
    const sub = t.sub, h = H(q, sub);
    if (h.st !== 'play') return;
    const still = () => t.phase === 'play' && t.turn === w.i && t.sub === sub && t.seats[w.i] === q;
    if (a === 'hit') {
      h.hand.push(draw(t));
      const tt = total(h.hand);
      if (tt > 21) { h.st = 'bust'; return nextTurn(t); }
      if (tt === 21) { h.st = 'stand'; return nextTurn(t); }
      armTurn(t);
    } else if (a === 'stand') {
      h.st = 'stand'; nextTurn(t);
    } else if (a === 'double') {
      if (h.hand.length !== 2) return tell(id, 'You can only double on your first two cards.');
      q.busy = true;
      try {
        const c = await ctx.spendCoins(id, h.bet);
        if (c == null) return tell(id, 'Not enough coins to double.');
        sendCoins(id, c);
        if (!still()) { await ctx.addCoins(id, h.bet).then((c2) => sendCoins(id, c2)); return; }
        h.bet *= 2; h.hand.push(draw(t)); h.st = total(h.hand) > 21 ? 'bust' : 'stand';
      } finally { q.busy = false; }
      nextTurn(t);
    } else if (a === 'split') {
      if (sub !== 0 || q.sp || !canSplitHand(q.hand)) return tell(id, 'You can only split a pair on your first move.');
      q.busy = true;
      try {
        const c = await ctx.spendCoins(id, q.bet);
        if (c == null) return tell(id, 'Not enough coins to split.');
        sendCoins(id, c);
        if (!still()) { await ctx.addCoins(id, q.bet).then((c2) => sendCoins(id, c2)); return; }
        const second = q.hand.pop();
        q.sp = { hand: [second], bet: q.bet, st: 'play', res: null, pay: 0 };
        q.hand.push(draw(t)); q.sp.hand.push(draw(t));
        if (total(q.hand) === 21) q.st = 'stand';
        if (total(q.sp.hand) === 21) q.sp.st = 'stand';
      } finally { q.busy = false; }
      if (q.st !== 'play') return nextTurn(t);
      armTurn(t);
    }
  }

  function handle(entry, m) {
    const id = entry.p.id;
    if (m.a === 'join') return join(entry, String(m.id || ''), m.i | 0);
    if (m.a === 'leave') return leave(id);
    if (m.a === 'bet') return bet(id, m.n);
    if (m.a === 'hit' || m.a === 'stand' || m.a === 'double' || m.a === 'split') return act(id, m.a);
  }
  function snapshot() { return [...tables.values()].filter((t) => t.phase !== 'idle' || sit(t)).map(view); }
  function reset() { for (const t of tables.values()) clearTimeout(t.timer); tables.clear(); where.clear(); }

  return { handle, leave, snapshot, reset, seated: (id) => where.get(id) || null };
}

module.exports = { createBlackjack, total, isBj, canSplitHand, MIN_BET, MAX_BET };
