'use strict';
const assert = require('assert');
const http = require('http');
const N = require('../lib/nba.js');
const BT = require('../lib/nbaback.js');
const { createApp } = require('../server');
const { memoryStore } = require('../lib/store');
const ok = (n) => console.log(`ok - ${n}`);
const T = (i, n, a) => ({ id: String(i), displayName: n, abbreviation: a });
const g = (id, h, a, hs, as, o) => ({ id, date: '2026-11-10T00:30Z', status: { type: { state: 'post', name: 'STATUS_FINAL' } }, competitions: [{ competitors: [{ homeAway: 'home', team: h, score: String(hs) }, { homeAway: 'away', team: a, score: String(as) }], odds: o ? [o] : undefined }] });
const BOS = T(1, 'Boston', 'BOS'), WAS = T(2, 'Washington', 'WAS'), KC = T(10, 'Kansas City', 'KC'), LV = T(11, 'Las Vegas', 'LV');
// scoreboard gives no lines (like ESPN does for finished games); the per-game odds feed has them
const lines = { 'b1': { items: [{ overUnder: 220.5, homeTeamOdds: { moneyLine: -900 }, awayTeamOdds: { moneyLine: 600 } }] }, 'k1': { items: [{ overUnder: 44.5, homeTeamOdds: { moneyLine: -400 }, awayTeamOdds: { moneyLine: 320 } }] },
  'b2': { items: [{ overUnder: 220.5, homeTeamOdds: { moneyLine: -900 }, awayTeamOdds: { moneyLine: 600 } }] }, 'k2': { items: [{ overUnder: 44.5, homeTeamOdds: { moneyLine: -400 }, awayTeamOdds: { moneyLine: 320 } }] } };
const day = { nba: { '20261110': [g('b1', BOS, WAS, 120, 100)], '20261111': [g('b2', BOS, WAS, 100, 110)] }, nfl: { '20261110': [g('k1', KC, LV, 27, 17)], '20261111': [g('k2', KC, LV, 30, 10)] } }; // day 1 both favourites win; day 2 BOS loses, KC wins
const calls = []; const fetchFx = async (u) => {
  calls.push(u); const m = /events\/(\w+)\/competitions/.exec(u); if (m) return lines[m[1].replace('nfl-', '')];
  const sp = u.includes('/nfl/') ? 'nfl' : 'nba'; if (u.includes('standings')) return { children: [] };
  const d = /dates=(\d{8})/.exec(u); return { events: day[sp][d[1]] || [] };
};
(async () => {
  const bots = { nba: N.createBot(fetchFx, undefined, 'nba'), nfl: N.createBot(fetchFx, undefined, 'nfl') };
  let r = await BT.backtest(bots, '2026-11-10', '2026-11-11', ['nba', 'nfl']);
  assert.equal(r.mixed, true); assert.deepEqual(r.sports, ['nba', 'nfl']); assert.equal(r.games, 4); assert.equal(r.gamesWithLines, 4); assert.equal(r.lineSources.perGame, 4); ok('two sports replayed together, lines found per game');
  const safest = r.parlays.find((p) => p.id === 'safest'); assert.equal(safest.tickets, 2); assert.equal(safest.mixedTickets, 2); assert.equal(safest.hits, 1); ok('each day builds one mixed NBA + NFL parlay; day 1 wins, day 2 loses');
  const d1 = N.toDecimal(-900) * N.toDecimal(-400) - 1; assert.ok(Math.abs(safest.roi - Math.round(((d1 - 1) / 2) * 1000) / 1000) < .002); ok('ROI uses both legs\' prices');
  assert.equal(r.bySport.length, 2); assert.equal(r.bySport[0].moneyline.bets, 2); assert.equal(r.bySport[1].moneyline.hits, 2); assert.equal(r.legs.moneyline.bets, 4); ok('per-sport hit rates add up to the combined row');
  assert.ok(r.daily[0].parlays[0].sports.length === 2); ok('daily detail says which sports were in each ticket');
  const only = await BT.backtest(bots, '2026-11-10', '2026-11-11', ['nfl']); assert.equal(only.mixed, false); assert.equal(only.games, 2); ok('one sport alone is not "mixed"');
  await assert.rejects(() => BT.backtest(bots, '2026-11-10', '2026-11-11', ['curling'])); ok('unknown sport refused');
  const slow = { nba: N.createBot(fetchFx, undefined, 'nba'), nfl: N.createBot(fetchFx, undefined, 'nfl') }; r = await BT.backtest(slow, '2026-11-10', '2026-11-11', ['nba', 'nfl'], { budgetMs: -1 });
  assert.equal(r.partial, true); assert.ok(r.pendingLines > 0); assert.ok(r.notes.some((n) => /Still collecting/.test(n))); ok('out of time: the result says it is partial and how many lines are still pending');
  r = await BT.backtest(slow, '2026-11-10', '2026-11-11', ['nba', 'nfl']); assert.equal(r.partial, false); assert.equal(r.gamesWithLines, 4); ok('running again finishes the job');
  const server = http.createServer(createApp(memoryStore(), { SESSION_SECRET: 's' }, { nbaFetch: fetchFx })); await new Promise((r2) => server.listen(0, r2)); const base = `http://127.0.0.1:${server.address().port}`;
  let x = await fetch(base + '/api/nba/backtest?from=2026-11-10&to=2026-11-11&sports=all'); let j = await x.json(); assert.equal(x.status, 200); assert.equal(j.sports.length, 5); assert.equal(j.mixed, true); ok('API: sports=all');
  x = await fetch(base + '/api/nba/backtest?from=2026-11-10&to=2026-11-11&sports=nfl'); j = await x.json(); assert.deepEqual(j.sports, ['nfl']); x = await fetch(base + '/api/nba/backtest?from=2026-11-10&to=2026-11-11'); j = await x.json(); assert.deepEqual(j.sports, ['nba']); ok('API: one sport, and NBA by default');
  server.close(); console.log('all passed');
})().catch((e) => { console.error(e); process.exit(1); });
