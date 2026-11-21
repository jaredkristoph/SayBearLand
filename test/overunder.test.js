'use strict';
const assert = require('assert');
const http = require('http');
const N = require('../lib/nba.js');
const BT = require('../lib/nbaback.js');
const { createApp } = require('../server');
const { memoryStore } = require('../lib/store');
const ok = (n) => console.log(`ok - ${n}`);
const T = (i, n, a) => ({ id: String(i), displayName: n, abbreviation: a });
const BOS = T(1, 'Boston', 'BOS'), WAS = T(2, 'Washington', 'WAS'), KC = T(10, 'Kansas City', 'KC'), LV = T(11, 'Las Vegas', 'LV'), DEN = T(3, 'Denver', 'DEN'), UTA = T(4, 'Utah', 'UTA');
const ev = (id, h, a, hs, as, o, st) => ({ id, date: '2026-11-23T00:30Z', status: { type: { state: st || 'pre', name: st === 'post' ? 'STATUS_FINAL' : 'STATUS_SCHEDULED' } }, competitions: [{ competitors: [{ homeAway: 'home', team: h, score: String(hs || 0) }, { homeAway: 'away', team: a, score: String(as || 0) }], odds: [o] }] });
const o1 = { overUnder: 220.5, homeTeamOdds: { moneyLine: -900 }, awayTeamOdds: { moneyLine: 600 } }, o2 = { overUnder: 231, homeTeamOdds: { moneyLine: -400 }, awayTeamOdds: { moneyLine: 320 } }, o3 = { overUnder: 219.5, homeTeamOdds: { moneyLine: -125 }, awayTeamOdds: { moneyLine: 105 } };
const stats = { 1: { pf: 122, pa: 108 }, 2: { pf: 108, pa: 124 }, 3: { pf: 120, pa: 112 }, 4: { pf: 112, pa: 122 } };
const mk = (id, h, a, o) => N.parseSlate({ events: [ev(id, h, a, 0, 0, o)] })[0];
const rated = [N.rateGame(mk('g1', BOS, WAS, o1), stats), N.rateGame(mk('g2', DEN, UTA, o2), stats), N.rateGame(mk('g3', T(5, 'Miami', 'MIA'), T(6, 'Chicago', 'CHI'), o3), stats)];

let ps = N.buildParlays(rated, 3, 'total'); assert.ok(ps.length >= 1); assert.ok(ps.every((p) => p.legs.every((l) => l.type === 'total'))); assert.ok(ps.find((p) => p.id === 'safest').blurb.startsWith('Over/unders only')); ok('over/under only: every leg of every parlay is a total');
ps = N.buildParlays(rated, 3, 'ml'); assert.ok(ps.every((p) => p.legs.every((l) => l.type === 'ml'))); ok('moneyline only works too');
ps = N.buildParlays(rated, 3); assert.ok(ps.find((p) => p.id === 'safest').legs.some((l) => l.type === 'ml')); assert.deepEqual(N.buildParlays(rated, 3, 'nonsense').map((p) => p.id), ps.map((p) => p.id)); ok('everything is the default, and a junk type falls back to it');
const sa = N.buildParlays(rated, 3, 'total').find((p) => p.id === 'safest'); assert.equal(sa.legs.length, 3); assert.equal(new Set(sa.legs.map((l) => l.gameId)).size, 3); assert.ok(sa.legs.every((l) => l.odds === -110)); ok('totals parlays keep one leg per game, priced at -110');

// backtest, over/under only: the day's totals are graded and the parlay is built from totals alone
const g = (id, h, a, hs, as) => ({ id, date: '2026-11-10T00:30Z', status: { type: { state: 'post', name: 'STATUS_FINAL' } }, competitions: [{ competitors: [{ homeAway: 'home', team: h, score: String(hs) }, { homeAway: 'away', team: a, score: String(as) }] }] });
const lines = { a1: o1, a2: o2, a3: o3 };
const fetchFx = async (u) => { const m = /events\/(\w+)\/competitions/.exec(u); if (m) return { items: [lines[m[1]]] }; if (u.includes('standings')) return { children: [] }; return /dates=20261110/.test(u) ? { events: [g('a1', BOS, WAS, 125, 100), g('a2', DEN, UTA, 110, 90), g('a3', T(5, 'Miami', 'MIA'), T(6, 'Chicago', 'CHI'), 110, 115)] } : { events: [] }; };
(async () => {
  const bot = N.createBot(fetchFx);
  let r = await BT.backtest(bot, '2026-11-10', '2026-11-10', ['nba'], { type: 'total' });
  assert.equal(r.type, 'total'); const sf = r.parlays.find((p) => p.id === 'safest'); assert.ok(sf); assert.ok(r.daily[0].parlays.length >= 1); assert.ok(r.notes.some((n) => /Over\/under only/.test(n))); ok('backtest over/under only: parlays and notes reflect the mode');
  // totals on the fake day: 225 (>220.5 over), 200 (<231 under), 225 (>219.5 over). The model leans OVER when it has no team data, so it hits 2 of 3
  assert.equal(r.legs.total.bets, 3); ok('all three totals are graded');
  const all = await BT.backtest(bot, '2026-11-10', '2026-11-10', ['nba']); assert.equal(all.type, 'all'); ok('default backtest is unchanged');
  const server = http.createServer(createApp(memoryStore(), { SESSION_SECRET: 's' }, { nbaFetch: async (u) => (/scoreboard/.test(u) ? { events: [ev('g1', BOS, WAS, 0, 0, o1), ev('g2', DEN, UTA, 0, 0, o2)] } : { children: [] }) })); await new Promise((r2) => server.listen(0, r2)); const base = `http://127.0.0.1:${server.address().port}`;
  let x = await (await fetch(base + '/api/sports/nba/parlay?date=2026-11-23&type=total')).json(); assert.equal(x.type, 'total'); assert.ok(x.parlays.length && x.parlays.every((p) => p.legs.every((l) => l.type === 'total'))); ok('API: one sport, over/under only');
  x = await (await fetch(base + '/api/all/parlay?date=2026-11-23&type=total')).json(); assert.equal(x.type, 'total'); assert.ok(x.parlays.every((p) => p.legs.every((l) => l.type === 'total'))); ok('API: all sports, over/under only');
  x = await (await fetch(base + '/api/nba/backtest?from=2026-11-10&to=2026-11-10&type=total')).json(); assert.equal(x.type, 'total'); ok('API: backtest over/under only');
  server.close(); console.log('all passed');
})().catch((e) => { console.error(e); process.exit(1); });
