'use strict';
const assert = require('assert');
const http = require('http');
const N = require('../lib/nba.js');
const B = require('../lib/nbabets.js');
const { createApp } = require('../server');
const { memoryStore } = require('../lib/store');
const ok = (n) => console.log(`ok - ${n}`);

// ---- grading ----
const fin = (h, a, state, status) => ({ state: state || 'post', status: status || '', homeScore: h, awayScore: a });
const ml = { type: 'ml', pick: 'BOS', home: 'BOS', away: 'WAS' }, ov = { type: 'total', pick: 'OVER', line: 220.5 }, un = { type: 'total', pick: 'UNDER', line: 220 };
assert.equal(B.gradeLeg(ml, fin(110, 100)), 'won'); assert.equal(B.gradeLeg(ml, fin(100, 110)), 'lost'); assert.equal(B.gradeLeg(ml, fin(50, 40, 'in')), null); assert.equal(B.gradeLeg(ml, undefined), null); ok('moneyline grading, unfinished games stay open');
assert.equal(B.gradeLeg(ov, fin(111, 110)), 'won'); assert.equal(B.gradeLeg(ov, fin(100, 100)), 'lost'); assert.equal(B.gradeLeg(un, fin(110, 110)), 'push'); assert.equal(B.gradeLeg(ml, fin(0, 0, 'post', 'STATUS_POSTPONED')), 'push'); ok('totals grade, exact line and postponed games push');
const bet = (legs, stake) => ({ status: 'open', stake: stake || 10, placedAt: 0, legs: legs.map((l) => Object.assign({ odds: 100 }, l)) });
let b = bet([Object.assign({ gameId: 'a' }, ml), Object.assign({ gameId: 'b' }, ov)]); assert.equal(B.settleBet(b, { a: fin(100, 90) }, 1), false); assert.equal(b.status, 'open'); ok('a parlay waits for every leg');
assert.equal(B.settleBet(b, { a: fin(100, 90), b: fin(111, 110) }, 1), true); assert.equal(b.status, 'won'); assert.equal(b.payout, 40); ok('two even-money winners pay 4x the stake');
b = bet([Object.assign({ gameId: 'a' }, ml), Object.assign({ gameId: 'b' }, ov)]); B.settleBet(b, { a: fin(90, 100) }, 1); assert.equal(b.status, 'lost'); assert.equal(b.payout, 0); ok('one lost leg loses the parlay at once');
b = bet([Object.assign({ gameId: 'a' }, un)]); B.settleBet(b, { a: fin(110, 110) }, 1); assert.equal(b.status, 'void'); assert.equal(b.payout, 10); ok('all pushes refund the stake');
b = bet([Object.assign({ gameId: 'a' }, ml)]); b.placedAt = 0; assert.equal(B.settleBet(b, {}, 5 * 864e5), true); assert.equal(b.status, 'void'); ok('a bet on a game that never shows up is refunded after a few days');

// ---- through the API with a fake clock and fake ESPN ----
const T = (i, n, a) => ({ id: String(i), displayName: n, abbreviation: a });
const BOS = T(1, 'Boston Celtics', 'BOS'), WAS = T(2, 'Washington Wizards', 'WAS'), DEN = T(3, 'Denver Nuggets', 'DEN'), UTA = T(4, 'Utah Jazz', 'UTA');
let phase = 'pre'; const START_AT = Date.parse('2026-11-23T00:30Z');
const ev = (id, h, a, o, hs, as) => ({ id, date: '2026-11-23T00:30Z', status: { type: { state: phase, name: phase === 'post' ? 'STATUS_FINAL' : 'STATUS_SCHEDULED' } }, competitions: [{ competitors: [{ homeAway: 'home', team: h, score: String(hs || 0) }, { homeAway: 'away', team: a, score: String(as || 0) }], odds: o ? [o] : undefined }] });
const board = () => ({ events: [
  ev('g1', BOS, WAS, { overUnder: 220.5, homeTeamOdds: { moneyLine: -900 }, awayTeamOdds: { moneyLine: 600 } }, 120, 100),
  ev('g2', DEN, UTA, { overUnder: 231, homeTeamOdds: { moneyLine: -400 }, awayTeamOdds: { moneyLine: 320 } }, 110, 115),
  ev('g3', WAS, DEN, null, 0, 0)] });
const fetchFx = async (u) => (u.includes('standings') ? { children: [] } : board());

(async () => {
  const app = createApp(memoryStore(), { SESSION_SECRET: 's' }, { nbaFetch: fetchFx });
  const server = http.createServer(app); await new Promise((r) => server.listen(0, r)); const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (method, path, body, ck) => { const x = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', cookie: ck || '' }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, json: await x.json().catch(() => ({})), cookie: (x.headers.get('set-cookie') || '').split(';')[0] }; };
  const mk = async (u) => { const su = await api('POST', '/api/signup', { name: u, username: u, role: 'Tester' }); return (await api('POST', '/api/login', { username: u, password: su.json.temporaryPassword })).cookie; };
  const ck = await mk('mia'), D = '2099-01-01';
  assert.equal((await api('GET', '/api/nba/wallet')).status, 401); ok('wallet needs an account');
  let x = await api('GET', '/api/nba/wallet', null, ck); assert.equal(x.json.balance, 1000); assert.equal(x.json.bets.length, 0); ok('a new account starts with $1000 of play money');

  // the fake slate is dated 2026-11-23 and "starts" in the past relative to 2099? use a real future date by moving the clock instead
  const realNow = Date.now; Date.now = () => START_AT - 3600e3;
  x = await api('POST', '/api/nba/bet', { date: '2026-11-23', stake: 50, legs: [{ gameId: 'g1', type: 'ml', pick: 'BOS' }, { gameId: 'g2', type: 'total', pick: 'OVER' }] }, ck);
  assert.equal(x.status, 200, JSON.stringify(x.json)); assert.equal(x.json.balance, 950); assert.equal(x.json.bets[0].status, 'open'); assert.ok(x.json.bets[0].legs[0].odds === -900); ok('a parlay is priced by the server and the stake leaves the wallet');
  x = await api('POST', '/api/nba/bet', { date: '2026-11-23', stake: 5000, legs: [{ gameId: 'g1', type: 'ml', pick: 'BOS' }] }, ck); assert.equal(x.status, 400); ok('cannot bet more than you have');
  x = await api('POST', '/api/nba/bet', { date: '2026-11-23', stake: 5, legs: [{ gameId: 'g1', type: 'ml', pick: 'BOS' }, { gameId: 'g1', type: 'total', pick: 'OVER' }] }, ck); assert.equal(x.status, 400); ok('one leg per game');
  x = await api('POST', '/api/nba/bet', { date: '2026-11-23', stake: 5, legs: [{ gameId: 'g3', type: 'ml', pick: 'DEN' }] }, ck); assert.equal(x.status, 400); assert.ok(/line/.test(x.json.error)); ok('no betting on games without a posted line');
  x = await api('POST', '/api/nba/bet', { date: '2026-11-23', stake: 5, legs: [{ gameId: 'g1', type: 'ml', pick: 'ZZZ' }] }, ck); assert.equal(x.status, 400); ok('made-up picks are refused');
  x = await api('POST', '/api/nba/bet', { date: '2026-11-23', stake: -5, legs: [{ gameId: 'g1', type: 'ml', pick: 'BOS' }] }, ck); assert.equal(x.status, 400); ok('negative stakes are refused');
  Date.now = () => START_AT + 60e3; x = await api('POST', '/api/nba/bet', { date: '2026-11-23', stake: 5, legs: [{ gameId: 'g1', type: 'ml', pick: 'BOS' }] }, ck); assert.equal(x.status, 400); assert.ok(/started/.test(x.json.error)); ok('no betting after tip-off');
  x = await api('GET', '/api/nba/wallet', null, ck); assert.equal(x.json.bets[0].status, 'open'); ok('the bet stays open until the games end');

  phase = 'post'; Date.now = () => START_AT + 4 * 3600e3; await new Promise((r) => setTimeout(r, 5)); // finals: BOS wins 120-100 (total 220 < 220.5? g2 total is 225 < 231)
  x = await api('GET', '/api/nba/wallet', null, ck); assert.equal(x.json.bets[0].status, 'lost'); assert.equal(x.json.balance, 950); ok('over 231 misses (225 points), so the parlay loses');
  x = await api('POST', '/api/nba/refill', null, ck); assert.equal(x.status, 400); ok('no refill while you still have money');

  const ck2 = await mk('zed'); Date.now = () => START_AT - 3600e3; phase = 'pre';
  x = await api('POST', '/api/nba/bet', { date: '2026-11-23', stake: 1000, legs: [{ gameId: 'g2', type: 'ml', pick: 'UTA' }] }, ck2); assert.equal(x.status, 200); assert.equal(x.json.balance, 0);
  x = await api('POST', '/api/nba/refill', null, ck2); assert.equal(x.status, 400); ok('no refill with an open bet');
  phase = 'post'; Date.now = () => START_AT + 4 * 3600e3; x = await api('GET', '/api/nba/wallet', null, ck2); assert.equal(x.json.bets[0].status, 'won'); assert.equal(x.json.balance, 4200); ok('UTA at +320 wins and pays $4,200 back on $1,000');
  const ck3 = await mk('bro'); Date.now = () => START_AT - 3600e3; phase = 'pre'; await api('POST', '/api/nba/bet', { date: '2026-11-23', stake: 1000, legs: [{ gameId: 'g1', type: 'ml', pick: 'WAS' }] }, ck3);
  phase = 'post'; Date.now = () => START_AT + 4 * 3600e3; x = await api('GET', '/api/nba/wallet', null, ck3); assert.equal(x.json.balance, 0); x = await api('POST', '/api/nba/refill', null, ck3); assert.equal(x.status, 200); assert.equal(x.json.balance, 1000); assert.equal(x.json.refills, 1); ok('broke with nothing open: refill back to $1000');
  x = await api('GET', '/api/nba/board', null, ck); assert.equal(x.json.players[0].username, 'zed'); ok('leaderboard puts the richest first');
  // two bets at once cannot overspend
  Date.now = () => START_AT - 3600e3; phase = 'pre'; const ck4 = await mk('dup');
  const both = await Promise.all([1, 2].map(() => api('POST', '/api/nba/bet', { date: '2026-11-23', stake: 800, legs: [{ gameId: 'g2', type: 'ml', pick: 'DEN' }] }, ck4)));
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 400]); ok('two simultaneous bets cannot overspend the wallet');
  Date.now = realNow; server.close(); console.log('all passed');
})().catch((e) => { console.error(e); process.exit(1); });
