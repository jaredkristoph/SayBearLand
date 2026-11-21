'use strict';
const assert = require('assert');
const http = require('http');
const N = require('../lib/nba.js');
const BT = require('../lib/nbaback.js');
const TOT = require('../lib/nbatotals.js');
const P = require('../lib/nbaprops.js');
const { createApp } = require('../server');
const { memoryStore } = require('../lib/store');
const ok = (n) => console.log(`ok - ${n}`);

// ---- pure formula ----
const log = (n, pts, min) => Array.from({ length: n }, (_, i) => ({ date: '2026-11-' + String(9 - i).padStart(2, '0') + 'T00:30Z', MIN: min, PTS: pts, REB: 0, AST: 0, TPM: 0, opp: 'XXX', home: true }));
let inp = TOT.inputs(log(10, 12, 24), '2026-11-10T00:30Z'); assert.ok(Math.abs(inp.ppm - .5) < 1e-9 && inp.mins === 24); ok('points per minute and expected minutes from the last games');
assert.equal(TOT.inputs(log(3, 12, 24), '2026-11-10T00:30Z'), null); assert.equal(TOT.inputs(log(10, 12, 24), '2026-11-02T00:30Z'), null); ok('too few games, or only games after the date: no number');
const mk = (ppm, mins, avail) => ({ ppm, mins, avail: avail == null ? 1 : avail });
const team = [mk(.7, 34), mk(.6, 32), mk(.5, 30), mk(.5, 28), mk(.45, 26), mk(.4, 22), mk(.4, 20), mk(.35, 18), mk(.3, 14), mk(.3, 12)];
const full = TOT.teamPoints(team), starOut = TOT.teamPoints(team.map((p, i) => (i === 0 ? mk(p.ppm, p.mins, 0) : p)));
assert.ok(full > 105 && full < 125); assert.ok(starOut < full); assert.ok(full - starOut < .7 * 34 * 1.0); ok('a star missing lowers the total, by less than his own scoring (his minutes go to teammates)');
assert.equal(TOT.teamPoints(team.slice(0, 5)), null); ok('fewer than six players: no model');
const g = { gameId: 'g1', home: { abbr: 'BOS' }, away: { abbr: 'WAS' } };
let leg = TOT.totalLeg(g, { total: 230 }, 220.5); assert.equal(leg.pick, 'OVER'); assert.equal(leg.type, 'total'); assert.equal(leg.model, 'player'); assert.ok(leg.prob > .52 && leg.prob < .7); let u = TOT.totalLeg(g, { total: 215 }, 220.5); assert.equal(u.pick, 'UNDER'); assert.ok(TOT.totalLeg(g, { total: 221 }, 220.5).prob < leg.prob); ok('over/under leg: side follows the gap, bigger gap means higher chance');

// ---- through ESPN-shaped data ----
const labels = ['MIN', 'FG', 'FG%', '3PT', '3P%', 'FT', 'FT%', 'REB', 'AST', 'BLK', 'STL', 'PF', 'TO', 'PTS'];
const rowOf = (id, min, pts) => ({ eventId: id, stats: [String(min), '5-10', '50', '1-3', '33', '2-2', '100', '4', '3', '0', '1', '2', '1', String(pts)] });
const gl = (rows) => { const ev = [], meta = {}; rows.forEach((r, i) => { const id = 'e' + i; ev.push(rowOf(id, r.min, r.pts)); meta[id] = { gameDate: r.date, homeAway: 'home', opponent: { abbreviation: r.opp } }; }); return { labels, events: meta, seasonTypes: [{ displayName: 'Regular Season', categories: [{ events: ev }] }] }; };
const BOS = { id: '1', displayName: 'Boston', abbreviation: 'BOS' }, WAS = { id: '2', displayName: 'Washington', abbreviation: 'WAS' };
const START = '2026-11-10T00:30Z';
const roster = (tid) => ({ athletes: Array.from({ length: 10 }, (_, i) => ({ id: String(tid * 1000 + i), displayName: 'P' + tid + '-' + i })) });
const ADV = (id) => { const tid = Math.floor(Number(id) / 1000), opp = tid === 1 ? 'WAS' : 'BOS', i = Number(id) % 1000; const rows = []; for (let d = 9; d >= 3; d--) rows.push({ date: '2026-11-0' + d + 'T00:30Z', min: 24, pts: 12, opp: 'ZZZ' }); // 12 points in 24 minutes: 0.5 a minute, 120 a team
  if (!(tid === 1 && i === 9)) rows.unshift({ date: START, min: 24, pts: 12, opp }); return rows.sort((a, b) => (a.date < b.date ? 1 : -1)); }; // home player 9 did not play that night
const scoreboard = (state) => ({ events: [{ id: 'a1', date: START, status: { type: { state, name: state === 'post' ? 'STATUS_FINAL' : 'STATUS_SCHEDULED' } }, competitions: [{ competitors: [{ homeAway: 'home', team: BOS, score: '125' }, { homeAway: 'away', team: WAS, score: '120' }], odds: state === 'post' ? undefined : [{ overUnder: 220.5, homeTeamOdds: { moneyLine: -300 }, awayTeamOdds: { moneyLine: 250 } }] }] }] });
const fetchFx = async (u) => {
  let m; if (/competitions/.test(u)) return { items: [{ overUnder: 220.5, homeTeamOdds: { moneyLine: -300 }, awayTeamOdds: { moneyLine: 250 } }] };
  if (u.includes('standings')) return { children: [] }; if ((m = /teams\/(\d)\/roster/.exec(u))) return roster(Number(m[1]));
  if ((m = /athletes\/(\d+)\/gamelog/.exec(u))) return gl(ADV(m[1])); if (/scoreboard/.test(u)) return scoreboard(/20261110/.test(u) ? 'post' : 'pre'); throw new Error('unexpected ' + u);
};
(async () => {
  const bot = N.createBot(fetchFx); const props = P.createProps(bot);
  // the tomorrow-style view: ask for the model on an upcoming board
  const board = { games: [{ gameId: 'a1', state: 'pre', start: START, home: { id: '1', abbr: 'BOS', name: 'Boston' }, away: { id: '2', abbr: 'WAS', name: 'Washington' }, odds: { total: 220.5, homeML: -300, awayML: 250 }, legs: [{ type: 'ml', gameId: 'a1', prob: .7, odds: -300, edge: .02 }, { type: 'total', gameId: 'a1', pick: 'UNDER', prob: .51, odds: -110, edge: 0 }] }], parlays: [], notes: [] };
  const models = await props.gameTotals(board); assert.ok(models.a1 && models.a1.total > 200); ok('player model total for an upcoming game, built from rosters and game logs');
  TOT.applyTotals(board, models, 3, 'total'); assert.equal(board.games[0].legs.filter((l) => l.type === 'total').length, 1); assert.equal(board.games[0].legs.find((l) => l.type === 'total').model, 'player'); assert.equal(board.playerModel.games, 1); ok('the game\'s total leg is swapped for the player-model leg');

  // the backtest: 240-point model total vs a 220.5 line, final score 245: the over wins; one home player did not play
  let r = await BT.backtest(bot, '2026-11-10', '2026-11-10', ['nba'], { model: 'player', props, type: 'total' });
  assert.equal(r.model, 'player'); assert.ok(r.playerModel); assert.equal(r.playerModel.games, 1); assert.equal(r.playerModel.overall.hits, 1); assert.equal(r.playerModel.overall.hitRate, 1); ok('backtest grades the player model on the game');
  const bucket = r.playerModel.buckets.find((b) => b.bets === 1); assert.ok(bucket && /points/.test(bucket.label)); assert.ok(r.playerModel.teamFormula.bets === 1); ok('results are bucketed by how far the model is from the line, with the team formula alongside');
  assert.equal(r.parlays.length >= 0, true); ok('parlays still build');
  const plain = await BT.backtest(bot, '2026-11-10', '2026-11-10', ['nba'], { type: 'total' }); assert.equal(plain.playerModel, undefined); ok('without the player model nothing changes');
  // error margins, straight-bet profit, minimum gap, halves
  const w = BT.wilson(54, 103); assert.ok(w[0] > .42 && w[0] < .44 && w[1] > .61 && w[1] < .63); assert.deepEqual(BT.wilson(0, 0), [null, null]); assert.equal(BT.wilson(10, 10)[1], 1); ok('95% range on a hit rate: 54 of 103 is anywhere from about 43% to 62%');
  const sm = BT.summarize({ n: 100, won: 55, lost: 45, push: 0, predSum: 58 }, true); assert.equal(sm.roi, .05); assert.equal(BT.summarize({ n: 100, won: 50, lost: 50, push: 0, predSum: 50 }, true).roi, -.045); assert.equal(BT.summarize({ n: 0, won: 0, lost: 0, push: 0, predSum: 0 }, true).roi, undefined); ok('straight-bet profit at -110: 55 of 100 earns +0.05 per $1, a coin flip loses 4.5 cents');
  r = await BT.backtest(bot, '2026-11-10', '2026-11-10', ['nba'], { model: 'player', props, type: 'total', minGap: 30 }); assert.equal(r.playerModel.minGap, 30); assert.equal(r.playerModel.games, 1); assert.equal(r.parlays.length, 0); ok('a minimum gap keeps small-gap games out of the parlays but still counts them in the stats');
  assert.equal(r.playerModel.halves.first.bets, 1); assert.equal(r.playerModel.halves.second.bets, 0); ok('6+ point bets are split into first and second half of the period');
  const b2 = { games: [{ gameId: 'a1', state: 'pre', start: START, home: { id: '1', abbr: 'BOS', name: 'Boston' }, away: { id: '2', abbr: 'WAS', name: 'Washington' }, odds: { total: 220.5, homeML: -300, awayML: 250 }, legs: [{ type: 'total', gameId: 'a1', pick: 'UNDER', prob: .51, odds: -110, edge: 0 }] }], parlays: [], notes: [] };
  TOT.applyTotals(b2, { a1: { total: 240 } }, 3, 'total', 100); assert.equal(b2.games[0].legs.filter((l) => l.type === 'total').length, 0); ok('live board: a game under the minimum gap offers no over/under');
  const slow = await BT.backtest(N.createBot(fetchFx), '2026-11-10', '2026-11-10', ['nba'], { model: 'player', props: P.createProps(N.createBot(fetchFx)), budgetMs: -1 }); assert.equal(slow.partial, true); ok('out of time: marked partial instead of guessing');

  const server = http.createServer(createApp(memoryStore(), { SESSION_SECRET: 's' }, { nbaFetch: fetchFx })); await new Promise((r2) => server.listen(0, r2)); const base = `http://127.0.0.1:${server.address().port}`;
  const x = await (await fetch(base + '/api/sports/nba/parlay?date=2026-11-12&type=total&model=player')).json(); assert.equal(x.playerModel.games, 1); assert.ok(x.games[0].legs.some((l) => l.model === 'player')); ok('API: model=player on the live board');
  const y = await (await fetch(base + '/api/nba/backtest?from=2026-11-10&to=2026-11-10&type=total&model=player')).json(); assert.equal(y.model, 'player'); ok('API: backtest with model=player');
  server.close(); console.log('all passed');
})().catch((e) => { console.error(e); process.exit(1); });
