'use strict';
const assert = require('assert');
const http = require('http');
const N = require('../lib/nba.js');
const BT = require('../lib/nbaback.js');
const { createApp } = require('../server');
const { memoryStore } = require('../lib/store');
const ok = (n) => console.log(`ok - ${n}`);

const T = (i, n, a) => ({ id: String(i), displayName: n, abbreviation: a });
const BOS = T(1, 'Boston', 'BOS'), WAS = T(2, 'Washington', 'WAS'), DEN = T(3, 'Denver', 'DEN'), UTA = T(4, 'Utah', 'UTA');
const g = (id, h, a, hs, as, o) => ({ id, date: '2026-11-10T00:30Z', status: { type: { state: 'post', name: 'STATUS_FINAL' } }, competitions: [{ competitors: [{ homeAway: 'home', team: h, score: String(hs) }, { homeAway: 'away', team: a, score: String(as) }], odds: o ? [o] : undefined }] });
const lines = { g1: { overUnder: 220.5, homeTeamOdds: { moneyLine: -900 }, awayTeamOdds: { moneyLine: 600 } }, g2: { overUnder: 231, homeTeamOdds: { moneyLine: -400 }, awayTeamOdds: { moneyLine: 320 } } };
const days = {
  '20261110': { events: [g('a1', BOS, WAS, 120, 100, lines.g1), g('a2', DEN, UTA, 110, 115, lines.g2)] }, // favourites go 1 for 2: parlay loses
  '20261111': { events: [g('b1', BOS, WAS, 118, 100, lines.g1), g('b2', DEN, UTA, 120, 101, lines.g2), g('b3', DEN, WAS, 100, 90, null)] }, // both favourites win; b3 has no line
};
const fetchFx = async (u) => { const m = /dates=(\d{8})/.exec(u); return (m && days[m[1]]) || { events: [] }; };

(async () => {
  assert.equal(BT.addDays('2026-11-30', 1), '2026-12-01'); assert.equal(BT.addDays('2026-03-01', -1), '2026-02-28'); ok('date maths');
  const bot = N.createBot(fetchFx);
  let r = await BT.backtest(bot, '2026-11-10', '2026-11-10');
  assert.equal(r.games, 2); assert.equal(r.gamesWithLines, 2); const s = r.parlays.find((p) => p.id === 'safest');
  assert.equal(s.tickets, 1); assert.equal(s.hits, 0); assert.equal(s.roi, -1); ok('one favourite loses, so the day\'s parlay loses and costs the stake');
  assert.equal(r.legs.moneyline.bets, 2); assert.equal(r.legs.moneyline.hits, 1); ok('moneyline legs are graded against the real scores');
  r = await BT.backtest(bot, '2026-11-10', '2026-11-11'); assert.equal(r.games, 5); assert.equal(r.gamesWithLines, 4); ok('games with no stored line are skipped');
  const s2 = r.parlays.find((p) => p.id === 'safest'); assert.equal(s2.tickets, 2); assert.equal(s2.hits, 1);
  const win = N.toDecimal(-900) * N.toDecimal(-400) - 1; assert.ok(Math.abs(s2.roi - Math.round(((win - 1) / 2) * 1000) / 1000) < .002); ok('ROI = average profit per ticket at the stored prices');
  const total = r.byGrade.reduce((a, x) => a + x.bets + x.pushes, 0), legs = r.legs.moneyline.bets + r.legs.total.bets + r.legs.moneyline.pushes + r.legs.total.pushes; assert.equal(total, legs); ok('grade tallies add up to the legs');
  // no look-ahead: day 1 numbers must not include day 1 scores
  const seen = []; const spy = N.createBot(fetchFx); const orig = N.rateGame; N.rateGame = (gm, st) => { seen.push(Object.keys(st).length); return orig(gm, st); };
  await BT.backtest(spy, '2026-11-10', '2026-11-11'); N.rateGame = orig; assert.ok(seen.every((n) => n === 0)); ok('team numbers never use the day being tested (too few earlier games, so market only)');
  await assert.rejects(() => BT.backtest(bot, '2026-11-10', '2026-12-31')); await assert.rejects(() => BT.backtest(bot, 'x', '2026-11-10')); await assert.rejects(() => BT.backtest(bot, '2026-11-12', '2026-11-10')); ok('bad or huge ranges are refused');

  // ESPN drops lines from finished games on the scoreboard: they come from the per-game odds feed instead
  const bare = (id, h, a, hs, as) => g(id, h, a, hs, as, null);
  const days2 = { '20261112': { events: [bare('c1', BOS, WAS, 120, 100), bare('c2', DEN, UTA, 110, 115)] } };
  const core = { c1: { items: [{ provider: { name: 'ESPN BET' }, overUnder: 220.5, homeTeamOdds: { moneyLine: -900 }, awayTeamOdds: { moneyLine: 600 } }] }, c2: { items: [{ overUnder: 231, moneyline: { home: { close: { odds: '-400' } }, away: { close: { odds: '+320' } } } }] } };
  const calls2 = []; const bot2 = N.createBot(async (u) => { calls2.push(u); const m = /events\/(\w+)\/competitions/.exec(u); if (m) return core[m[1]]; const d2 = /dates=(\d{8})/.exec(u); return days2[d2[1]] || { events: [] }; });
  r = await BT.backtest(bot2, '2026-11-12', '2026-11-12'); assert.equal(r.gamesWithLines, 2); assert.equal(r.lineSources.perGame, 2); assert.equal(r.lineSources.scoreboard, 0); assert.equal(r.legs.moneyline.bets, 2); ok('lines are fetched per game when the scoreboard has dropped them');
  const dead = N.createBot(async (u) => { if (/competitions/.test(u)) throw new Error('nope'); const d2 = /dates=(\d{8})/.exec(u); return days2[d2[1]] || { events: [] }; });
  r = await BT.backtest(dead, '2026-11-12', '2026-11-12'); assert.equal(r.gamesWithLines, 0); assert.equal(r.lineSources.none, 2); assert.ok(r.notes.some((n) => /did not return stored lines/.test(n))); ok('with no lines anywhere the result says so instead of showing nothing');
  const server = http.createServer(createApp(memoryStore(), { SESSION_SECRET: 's' }, { nbaFetch: fetchFx })); await new Promise((r2) => server.listen(0, r2)); const base = `http://127.0.0.1:${server.address().port}`;
  let x = await fetch(base + '/api/nba/backtest?from=2026-11-10&to=2026-11-11'); const j = await x.json(); assert.equal(x.status, 200); assert.equal(j.days, 2); assert.ok(j.parlays.length); ok('backtest API');
  x = await fetch(base + '/api/nba/backtest?from=2026-01-01&to=2026-12-31'); assert.equal(x.status, 400); ok('API refuses a huge range');
  server.close(); console.log('all passed');
})().catch((e) => { console.error(e); process.exit(1); });
