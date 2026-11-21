'use strict';
const assert = require('assert');
const http = require('http');
const N = require('../lib/nba.js');
const { createApp } = require('../server');
const { memoryStore } = require('../lib/store');
const ok = (n) => console.log(`ok - ${n}`);

// ---- odds maths ----
assert.equal(N.parseAmerican('-220'), -220); assert.equal(N.parseAmerican('+180'), 180); assert.equal(N.parseAmerican('EVEN'), 100); assert.equal(N.parseAmerican('x'), null); assert.equal(N.parseAmerican(null), null); ok('american odds parse');
assert.ok(Math.abs(N.impliedProb(-110) - .5238) < .001 && Math.abs(N.impliedProb(150) - .4) < .001); assert.ok(Math.abs(N.toDecimal(-110) - 1.909) < .001 && N.toDecimal(200) === 3); ok('implied probability and decimal odds');
const dv = N.devig(-200, 170); assert.ok(dv > .6 && dv < .67 && Math.abs(dv + N.devig(170, -200) - 1) < 1e-9); ok('the sportsbook margin is removed');
assert.ok(Math.abs(N.phi(0) - .5) < 1e-6 && N.phi(1.96) > .974 && N.phi(-1.96) < .026); assert.equal(N.toAmerican(.75), -300); assert.equal(N.toAmerican(.4), 150); ok('normal curve and probability to odds');

// ---- fixtures shaped like ESPN ----
const team = (id, n, a) => ({ id: String(id), displayName: n, abbreviation: a });
const ev = (id, home, away, odds, state) => ({ id, date: '2026-11-22T00:00Z', status: { type: { state: state || 'pre' } }, competitions: [{ competitors: [{ homeAway: 'home', team: home }, { homeAway: 'away', team: away }], odds: odds ? [odds] : undefined }] });
const BOS = team(1, 'Boston Celtics', 'BOS'), WAS = team(2, 'Washington Wizards', 'WAS'), DEN = team(3, 'Denver Nuggets', 'DEN'), UTA = team(4, 'Utah Jazz', 'UTA'), MIA = team(5, 'Miami Heat', 'MIA'), CHI = team(6, 'Chicago Bulls', 'CHI');
const board = { events: [
  ev('g1', BOS, WAS, { provider: { name: 'ESPN BET' }, overUnder: 228.5, spread: -13, homeTeamOdds: { moneyLine: -900 }, awayTeamOdds: { moneyLine: 600 } }),
  ev('g2', DEN, UTA, { overUnder: 231, homeTeamOdds: { moneyLine: -400 }, awayTeamOdds: { moneyLine: 320 } }),
  ev('g3', MIA, CHI, { overUnder: 219.5, homeTeamOdds: { moneyLine: -125 }, awayTeamOdds: { moneyLine: 105 } }),
  ev('g4', CHI, MIA, null),
  ev('g5', DEN, BOS, { overUnder: 220, homeTeamOdds: { moneyLine: -110 }, awayTeamOdds: { moneyLine: -110 } }, 'in') ] };
const st = (id, pf, pa) => ({ team: { id }, stats: [{ name: 'avgPointsFor', value: pf }, { name: 'avgPointsAgainst', value: pa }, { name: 'winPercent', value: .5 }] });
const standings = { children: [{ standings: { entries: [st(1, 122, 108), st(2, 108, 124), st(3, 120, 112), st(4, 112, 122), st(5, 113, 112), st(6, 112, 113)] } }] };
const fetchFx = async (url) => (url.includes('standings') ? standings : board);

const slate = N.parseSlate(board); assert.equal(slate.length, 5); assert.equal(slate[0].odds.homeML, -900); assert.equal(slate[0].odds.total, 228.5); assert.equal(slate[3].odds, null); ok('slate and lines are read from ESPN json');
const alt = N.parseOdds({ odds: [{ moneyline: { home: { close: { odds: '-150' } }, away: { close: { odds: '+130' } } }, total: { over: { close: { line: 'o221.5' } } } }] }); assert.equal(alt.homeML, -150); assert.equal(alt.awayML, 130); assert.equal(alt.total, 221.5); ok('the newer ESPN odds layout is read too');
const stats = N.parseTeamStats(standings); assert.equal(stats['1'].pf, 122); assert.equal(Object.keys(stats).length, 6); ok('team scoring is read from standings');

// ---- rating ----
const r1 = N.rateGame(slate[0], stats); const ml = r1.legs.find((l) => l.type === 'ml'), tot = r1.legs.find((l) => l.type === 'total');
assert.equal(ml.pick, 'BOS'); assert.ok(ml.prob > .85 && ml.grade === 'A'); assert.equal(tot.odds, -110); assert.ok(tot.prob >= .5 && tot.prob < .75); ok('a huge favourite is rated a strong moneyline, a total stays modest');
const r4 = N.rateGame(slate[3], stats); assert.equal(r4.legs.length, 1); assert.ok(r4.legs[0].estimatedOdds && /no line/.test(r4.legs[0].source)); ok('a game without a line is rated from team numbers and flagged');
const r5 = N.rateGame(slate[0], {}); assert.ok(r5.legs.find((l) => l.type === 'ml').prob > .8 && r5.model === null); ok('works with market only when team stats are missing');

// ---- parlays ----
const rated = slate.filter((g) => g.state === 'pre').map((g) => N.rateGame(g, stats));
const ps = N.buildParlays(rated, 3); assert.ok(ps.length >= 2); const safe = ps.find((p) => p.id === 'safest');
assert.equal(safe.legs.length, 3); assert.equal(new Set(safe.legs.map((l) => l.gameId)).size, 3); assert.ok(safe.legs[0].prob >= safe.legs[2].prob); ok('safest parlay: most likely legs, one per game');
const prod = safe.legs.reduce((a, l) => a * l.prob, 1); assert.ok(Math.abs(safe.prob - prod) < .001); assert.ok(safe.decimal > 1 && safe.hitOneIn >= 1); ok('parlay probability is the product of its legs');
const c = N.combine([{ prob: .5, odds: 100 }, { prob: .5, odds: 100 }]); assert.equal(c.decimal, 4); assert.equal(c.american, 300); assert.equal(c.ev, 0); ok('payout maths: two even-money legs pay 3 to 1');

(async () => {
  let calls = 0; const bot = N.createBot(async (u) => { calls++; return fetchFx(u); });
  let out = await bot.parlay('2026-11-22', 3); assert.equal(out.games.length, 4); assert.ok(out.parlays.length >= 2); assert.ok(out.notes.some((n) => /parlay only hits/.test(n))); ok('bot builds tomorrow\'s games (live games are skipped)');
  const n0 = calls; await bot.parlay('2026-11-22', 4); assert.equal(calls, n0); ok('lines are cached');
  const dead = N.createBot(async () => { throw new Error('down'); }); await assert.rejects(() => dead.parlay('2026-11-22')); ok('a dead feed rejects');
  const noStats = N.createBot(async (u) => { if (u.includes('standings')) throw new Error('x'); return board; }); out = await noStats.parlay('2026-11-22'); assert.ok(out.notes.some((n) => /unavailable/.test(n)) && out.parlays.length); ok('missing standings degrade gracefully');
  assert.ok(N.validDate('2026-11-22') && !N.validDate('tomorrow') && /^\d{4}-\d{2}-\d{2}$/.test(N.easternDate(1))); ok('dates');

  const app = createApp(memoryStore(), { SESSION_SECRET: 's' }, { nbaFetch: fetchFx });
  const server = http.createServer(app); await new Promise((r) => server.listen(0, r)); const base = `http://127.0.0.1:${server.address().port}`;
  let x = await fetch(base + '/api/nba/parlay?date=2026-11-22&legs=3'); const j = await x.json(); assert.equal(x.status, 200); assert.ok(j.parlays.length && j.games.length); ok('API returns parlays');
  x = await fetch(base + '/api/nba/parlay?date=nonsense&legs=99'); assert.equal(x.status, 200); ok('bad query values fall back to defaults');
  const bad = createApp(memoryStore(), { SESSION_SECRET: 's' }, { nbaFetch: async () => { throw new Error('boom'); } }); const s2 = http.createServer(bad); await new Promise((r) => s2.listen(0, r));
  x = await fetch(`http://127.0.0.1:${s2.address().port}/api/nba/parlay`); assert.equal(x.status, 502); ok('feed failure is a clean 502'); s2.close();
  x = await fetch(base + '/nba/'); assert.equal(x.status, 200); assert.ok((await x.text()).includes('NBA')); ok('page served');
  server.close(); console.log('all passed');
})().catch((e) => { console.error(e); process.exit(1); });
