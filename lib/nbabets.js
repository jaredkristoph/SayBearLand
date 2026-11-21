'use strict';
/* Play-money betting for /nba. Every account gets $1000 of pretend cash. Bets are priced on the server from the same
   lines the page shows, and settled from ESPN final scores. No real money, nothing to cash out. */
const N = require('./nba.js');
const START = 1000, MAX_OPEN = 10, KEEP = 60, STALE_DAYS = 4;
const cents = (v) => Math.round(v * 100) / 100;

function newWallet() { return { balance: START, bets: [], refills: 0, seq: 0 }; }

function gradeLeg(leg, g) { // 'won' | 'lost' | 'push' | null (not finished)
  if (!g) return null;
  if (/POSTPONED|CANCELED|CANCELLED/i.test(g.status || '')) return 'push';
  if (g.state !== 'post') return null;
  if (!Number.isFinite(g.homeScore) || !Number.isFinite(g.awayScore)) return 'push';
  if (leg.type === 'prop') { // a player's stat: needs the box score; a player who did not play voids the leg
    if (!g.box) return null; const row = g.box[leg.playerId]; if (!row || !(row.MIN > 0)) return 'push';
    const v = row[leg.stat]; if (v === leg.line) return 'push'; return (v > leg.line ? 'OVER' : 'UNDER') === leg.pick ? 'won' : 'lost';
  }
  if (leg.type === 'ml') { if (g.homeScore === g.awayScore) return 'push'; return (g.homeScore > g.awayScore ? leg.home : leg.away) === leg.pick ? 'won' : 'lost'; }
  const sum = g.homeScore + g.awayScore; if (sum === leg.line) return 'push';
  return (sum > leg.line ? 'OVER' : 'UNDER') === leg.pick ? 'won' : 'lost';
}
function settleBet(bet, finals, now) { // mutates an open bet when it can be decided; returns true if it changed
  if (bet.status !== 'open') return false;
  bet.legs.forEach((l) => { if (!l.result) { const r = gradeLeg(l, finals[l.gameId]); if (r) l.result = r; } });
  let status = null;
  if (bet.legs.some((l) => l.result === 'lost')) status = 'lost';
  else if (bet.legs.every((l) => l.result)) status = bet.legs.every((l) => l.result === 'push') ? 'void' : 'won';
  else if (now - bet.placedAt > STALE_DAYS * 864e5) status = 'void'; // the game vanished from the feed
  if (!status) return false;
  bet.status = status;
  const dec = bet.legs.reduce((a, l) => a * (l.result === 'push' ? 1 : N.toDecimal(l.odds)), 1);
  bet.payout = status === 'won' ? cents(bet.stake * dec) : status === 'void' ? bet.stake : 0; bet.settledAt = now;
  return true;
}

function createBets(store, bots, nowFn, props) {
  const botMap = typeof bots.parlay === 'function' ? { nba: bots } : bots; // one bot per sport; a lone bot is the NBA
  const botFor = (id) => Object.values(botMap).find((b) => b.cfg && b.cfg.prefix && String(id).startsWith(b.cfg.prefix)) || botMap.nba;
  const now = nowFn || (() => Date.now()), chains = new Map();
  const key = (u) => 'nba:wallet:' + u;
  const lock = (u, fn) => { const run = (chains.get(u) || Promise.resolve()).then(fn, fn); chains.set(u, run.catch(() => {})); return run; }; // one request at a time per player
  async function load(u) { const w = await store.get(key(u)); return w && typeof w.balance === 'number' ? w : newWallet(); }
  async function settleAll(w) {
    const open = w.bets.filter((b) => b.status === 'open'); if (!open.length) return false;
    const want = new Map(), finals = {}; // one scoreboard per sport and date
    open.forEach((b) => b.legs.forEach((l) => { const bt = botFor(l.gameId); want.set(bt.sport + '|' + b.date, [bt, b.date]); }));
    for (const [bt, d] of want.values()) { try { Object.assign(finals, await bt.results(d)); } catch (e) { /* feed down: try again next time */ } }
    for (const b of open) for (const l of b.legs) { // props need the box score once the game is over
      const f = finals[l.gameId]; if (l.type === 'prop' && !l.result && f && f.state === 'post' && !f.box) { try { f.box = await botFor(l.gameId).box(l.gameId); } catch (e) { /* try again next time */ } }
    }
    let changed = false;
    open.forEach((b) => { if (settleBet(b, finals, now())) { changed = true; w.balance = cents(w.balance + b.payout); } });
    return changed;
  }
  const view = (w) => ({ balance: w.balance, start: START, refills: w.refills, open: w.bets.filter((b) => b.status === 'open').length, bets: w.bets.slice().reverse() });

  const wallet = (u) => lock(u, async () => { const w = await load(u); if (await settleAll(w)) await store.set(key(u), w); else if (!(await store.get(key(u)))) await store.set(key(u), w); return view(w); });

  const place = (u, date, picks, stake) => lock(u, async () => {
    const err = (m) => { const e = new Error(m); e.status = 400; return e; };
    if (!N.validDate(date)) throw err('Pick a valid date.');
    stake = Number(stake); if (!Number.isFinite(stake) || stake < 1) throw err('The smallest bet is $1.'); stake = cents(stake);
    if (!Array.isArray(picks) || picks.length < 1 || picks.length > 6) throw err('Pick between 1 and 6 legs.');
    if (new Set(picks.map((p) => p && p.gameId)).size !== picks.length) throw err('Only one leg per game.');
    const w = await load(u); await settleAll(w);
    if (stake > w.balance) throw err('Not enough play money. You have $' + w.balance.toFixed(2) + '.');
    if (w.bets.filter((b) => b.status === 'open').length >= MAX_OPEN) throw err('You can have ' + MAX_OPEN + ' open bets at a time.');
    const boards = {}, legs = [];
    const boardFor = async (id) => { const b = botFor(id); return boards[b.sport] || (boards[b.sport] = await b.parlay(date)); };
    for (const p of picks) { // price every leg from the server's own numbers, never the browser's
      const board = await boardFor(p && p.gameId);
      const r = board.games.find((g) => g.gameId === String(p && p.gameId)); if (!r) throw err('That game is not on the board.');
      if (r.state !== 'pre' || Date.parse(r.start) <= now()) throw err(r.away.abbr + ' @ ' + r.home.abbr + ' has already started.');
      if (p.type === 'prop') {
        if (!props || botFor(r.gameId).sport !== 'nba') throw err('Player props are only available for the NBA.');
        const side = String(p.side || p.pick || '').toUpperCase(), stat = String(p.stat || '').toUpperCase(); if (side !== 'OVER' && side !== 'UNDER') throw err('That pick is not available.');
        const d = await props.detail(date, r.gameId, p.playerId), pr = d.projection && d.projection.stats[stat]; if (!pr) throw err('Not enough games on record for that player.');
        if (Number(p.line) !== pr.line) throw err('The line moved to ' + pr.line + '. Reopen the player to refresh.');
        legs.push({ gameId: r.gameId, type: 'prop', pick: side, stat, playerId: String(p.playerId), player: d.player.name, line: pr.line, odds: -110, label: d.player.name + ' ' + (side === 'OVER' ? 'over ' : 'under ') + pr.line + ' ' + pr.name, vs: r.away.abbr + ' @ ' + r.home.abbr, home: r.home.abbr, away: r.away.abbr }); continue;
      }
      const o = r.odds || {}, pk = String(p.pick || '').toUpperCase(); let leg = null;
      if (p.type === 'ml' && (pk === r.home.abbr || pk === r.away.abbr)) { const home = pk === r.home.abbr, odds = home ? o.homeML : o.awayML; if (!odds) throw err('No sportsbook line yet for ' + r.away.abbr + ' @ ' + r.home.abbr + '. Bets open when the line is posted.'); leg = { type: 'ml', pick: pk, label: (home ? r.home : r.away).name + ' to win', vs: (home ? r.away : r.home).name, odds }; }
      else if (p.type === 'total' && (pk === 'OVER' || pk === 'UNDER') && o.total) leg = { type: 'total', pick: pk, label: (pk === 'OVER' ? 'Over ' : 'Under ') + o.total, vs: r.away.abbr + ' @ ' + r.home.abbr, odds: -110, line: o.total };
      if (!leg) throw err('That pick is not available.');
      legs.push(Object.assign({ gameId: r.gameId, home: r.home.abbr, away: r.away.abbr }, leg));
    }
    legs.forEach((l) => { l.sport = botFor(l.gameId).sport; });
    const dec = legs.reduce((a, l) => a * N.toDecimal(l.odds), 1);
    w.balance = cents(w.balance - stake); w.seq++;
    w.bets.push({ id: w.seq, date, placedAt: now(), stake, decimal: Math.round(dec * 100) / 100, toWin: cents(stake * dec - stake), legs, status: 'open', payout: 0 });
    if (w.bets.length > KEEP) { const i = w.bets.findIndex((b) => b.status !== 'open'); if (i >= 0) w.bets.splice(i, 1); }
    await store.set(key(u), w); return view(w);
  });

  const refill = (u) => lock(u, async () => {
    const w = await load(u); await settleAll(w);
    if (w.balance >= 1 || w.bets.some((b) => b.status === 'open')) { const e = new Error('You can refill when you are broke with no open bets.'); e.status = 400; throw e; }
    w.balance = START; w.refills++; await store.set(key(u), w); return view(w);
  });

  async function board() { // richest players first
    const names = await store.smembers('users'), rows = [];
    for (const n of names) { const w = await store.get(key(n)); if (w && typeof w.balance === 'number') rows.push({ username: n, balance: w.balance, won: w.bets.filter((b) => b.status === 'won').length, lost: w.bets.filter((b) => b.status === 'lost').length, refills: w.refills }); }
    return rows.sort((a, b) => b.balance - a.balance).slice(0, 10);
  }
  return { wallet, place, refill, board };
}
module.exports = { createBets, gradeLeg, settleBet, newWallet, START };
