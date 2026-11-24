'use strict';
const assert = require('assert');
const http = require('http');
const N = require('../lib/nba.js');
const { createApp } = require('../server');
const { memoryStore } = require('../lib/store');
const ok = (n) => console.log(`ok - ${n}`);

assert.deepEqual(Object.keys(N.SPORTS), ['nba', 'nfl', 'nhl', 'ncaaf', 'ncaab']); assert.ok(Object.values(N.SPORTS).every((c) => c.label && c.path && c.marginSd > 0 && c.totalSd > 0)); ok('five sports are configured');
const T = (i, n, a) => ({ id: String(i), displayName: n, abbreviation: a });
const ev = (id, h, a, o, state, hs, as) => ({ id, date: '2026-11-23T18:00Z', status: { type: { state: state || 'pre', name: state === 'post' ? 'STATUS_FINAL' : 'STATUS_SCHEDULED' } }, competitions: [{ competitors: [{ homeAway: 'home', team: h, score: String(hs || 0) }, { homeAway: 'away', team: a, score: String(as || 0) }], odds: [o] }] });
assert.equal(N.parseSlate({ events: [ev('401', T(1, 'A', 'A'), T(2, 'B', 'B'), {})] }, 'nfl-')[0].id, 'nfl-401'); assert.equal(N.parseSlate({ events: [ev('401', T(1, 'A', 'A'), T(2, 'B', 'B'), {})] })[0].id, '401'); ok('game ids are prefixed for every sport but the NBA, so they cannot collide');
const nbaScale = { children: [{ standings: { entries: [{ team: { id: '1' }, stats: [{ name: 'avgPointsFor', value: 118 }, { name: 'avgPointsAgainst', value: 110 }] }] } }] };
assert.ok(N.parseTeamStats(nbaScale, N.SPORTS.nba)['1']); assert.deepEqual(N.parseTeamStats(nbaScale, N.SPORTS.nfl), {}); assert.deepEqual(N.parseTeamStats(nbaScale, N.SPORTS.nhl), {}); ok('a standings number outside the sport\'s sane range is ignored (market alone is used)');
const g = { id: 'nhl-1', home: { id: '1', name: 'Home', abbr: 'HOM' }, away: { id: '2', name: 'Away', abbr: 'AWY' }, start: '', state: 'pre', odds: { homeML: -150, awayML: 130, total: 6 } };
const r = N.rateGame(g, { 1: { pf: 3.4, pa: 2.6 }, 2: { pf: 2.7, pa: 3.3 } }, N.SPORTS.nhl); assert.equal(r.sport, 'nhl'); const ml = r.legs.find((l) => l.type === 'ml'); assert.equal(ml.pick, 'HOM'); assert.ok(ml.prob > .55 && ml.prob < .8 && ml.sport === 'nhl'); ok('hockey is rated in goals, not basketball points');

// ---- a fake ESPN for all the sports ----
let phase = 'pre'; const failing = new Set();
const SLATE = {
  'basketball/nba': [ev('g1', T(1, 'Boston Celtics', 'BOS'), T(2, 'Washington Wizards', 'WAS'), { overUnder: 220.5, homeTeamOdds: { moneyLine: -300 }, awayTeamOdds: { moneyLine: 250 } }, phase, 110, 100)],
  'football/nfl': [ev('401', T(10, 'Kansas City Chiefs', 'KC'), T(11, 'Las Vegas Raiders', 'LV'), { overUnder: 44.5, homeTeamOdds: { moneyLine: -400 }, awayTeamOdds: { moneyLine: 320 } }, phase, 27, 17)],
  'hockey/nhl': [ev('501', T(20, 'Colorado Avalanche', 'COL'), T(21, 'San Jose Sharks', 'SJS'), { overUnder: 6, homeTeamOdds: { moneyLine: -250 }, awayTeamOdds: { moneyLine: 210 } }, phase, 4, 3)],
  'football/college-football': [ev('601', T(30, 'Ohio State', 'OSU'), T(31, 'Rutgers', 'RUT'), { overUnder: 50.5, homeTeamOdds: { moneyLine: -900 }, awayTeamOdds: { moneyLine: 600 } }, phase, 35, 10)],
  'basketball/mens-college-basketball': [ev('701', T(40, 'Duke', 'DUKE'), T(41, 'Elon', 'ELON'), { overUnder: 150.5, homeTeamOdds: { moneyLine: -1200 }, awayTeamOdds: { moneyLine: 800 } }, phase, 90, 60)],
};
const fetchFx = async (u) => { const k = Object.keys(SLATE).sort((a, b) => b.length - a.length).find((p) => u.includes('/' + p + '/')); if (!k) throw new Error('unexpected ' + u); if (failing.has(k)) throw new Error('down'); if (u.includes('standings')) return { children: [] }; if (/scoreboard/.test(u)) return { events: SLATE[k] }; throw new Error('unexpected ' + u); };

(async () => {
  const realNow = Date.now; let skew = Date.parse('2026-11-21T12:00:00Z') - realNow(); Date.now = () => realNow() + skew; const jump = () => { skew += 3600e3; };
  const server = http.createServer(createApp(memoryStore(), { SESSION_SECRET: 's' }, { nbaFetch: fetchFx })); await new Promise((r2) => server.listen(0, r2)); const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (method, path, body, ck) => { const x = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', cookie: ck || '' }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, json: await x.json().catch(() => ({})), cookie: (x.headers.get('set-cookie') || '').split(';')[0] }; };
  let x = await api('GET', '/api/sports'); assert.equal(x.json.sports.length, 5); ok('sports list');
  x = await api('GET', '/api/sports/nfl/parlay?date=2026-11-23'); assert.equal(x.status, 200); assert.equal(x.json.games[0].gameId, 'nfl-401'); assert.equal(x.json.games[0].sport, 'nfl'); assert.equal(x.json.sportLabel, 'NFL'); ok('one sport at a time');
  x = await api('GET', '/api/sports/curling/parlay'); assert.equal(x.status, 404); ok('unknown sport is a 404');
  x = await api('GET', '/api/all/parlay?date=2026-11-23&legs=4'); assert.equal(x.status, 200); assert.equal(x.json.games.length, 5); const sp = new Set(x.json.parlays.find((p) => p.id === 'safest').legs.map((l) => l.sport)); assert.ok(sp.size >= 3); assert.equal(new Set(x.json.games.map((q) => q.gameId)).size, 5); ok('all sports in one pool: a single parlay mixes sports, one leg per game');
  x = await api('GET', '/api/all/parlay?date=2026-11-23&sports=nba,nhl'); assert.equal(x.json.games.length, 2); ok('pick which sports to include');
  failing.add('hockey/nhl'); jump(); x = await api('GET', '/api/all/parlay?date=2026-11-23'); assert.equal(x.status, 200); assert.equal(x.json.games.length, 4); assert.ok(x.json.notes.some((n) => /NHL could not be loaded/.test(n))); failing.clear(); jump(); ok('one sport being down does not break the rest');

  const su = await api('POST', '/api/signup', { name: 'Mia', username: 'mia', role: 'Tester' }); const ck = (await api('POST', '/api/login', { username: 'mia', password: su.json.temporaryPassword })).cookie;
  const legs = [{ gameId: 'g1', type: 'ml', pick: 'BOS' }, { gameId: 'nfl-401', type: 'ml', pick: 'KC' }, { gameId: 'nhl-501', type: 'total', pick: 'OVER' }];
  x = await api('POST', '/api/nba/bet', { date: '2026-11-23', stake: 100, legs }, ck); assert.equal(x.status, 200, JSON.stringify(x.json)); assert.deepEqual(x.json.bets[0].legs.map((l) => l.sport), ['nba', 'nfl', 'nhl']); assert.equal(x.json.balance, 900); ok('one bet slip across NBA + NFL + NHL, priced by the server');
  const dec = N.toDecimal(-300) * N.toDecimal(-400) * N.toDecimal(-110);
  x = await api('POST', '/api/nba/bet', { date: '2026-11-23', stake: 5, legs: [{ gameId: 'nfl-401', type: 'prop', playerId: '1', stat: 'PTS', side: 'OVER', line: 20.5 }] }, ck); assert.equal(x.status, 400); assert.ok(/NBA/.test(x.json.error)); ok('player props stay NBA only');
  x = await api('POST', '/api/nba/bet', { date: '2026-11-23', stake: 5, legs: [{ gameId: 'nfl-999', type: 'ml', pick: 'KC' }] }, ck); assert.equal(x.status, 400); ok('a game that is not on that sport\'s board is refused');
  phase = 'post'; Object.keys(SLATE).forEach((k) => { /* rebuild finals */ }); SLATE['basketball/nba'] = [ev('g1', T(1, 'Boston Celtics', 'BOS'), T(2, 'Washington Wizards', 'WAS'), { overUnder: 220.5, homeTeamOdds: { moneyLine: -300 }, awayTeamOdds: { moneyLine: 250 } }, 'post', 110, 100)];
  SLATE['football/nfl'] = [ev('401', T(10, 'Kansas City Chiefs', 'KC'), T(11, 'Las Vegas Raiders', 'LV'), { overUnder: 44.5, homeTeamOdds: { moneyLine: -400 }, awayTeamOdds: { moneyLine: 320 } }, 'post', 27, 17)];
  SLATE['hockey/nhl'] = [ev('501', T(20, 'Colorado Avalanche', 'COL'), T(21, 'San Jose Sharks', 'SJS'), { overUnder: 6, homeTeamOdds: { moneyLine: -250 }, awayTeamOdds: { moneyLine: 210 } }, 'post', 4, 3)];
  jump(); x = await api('GET', '/api/nba/wallet', null, ck); assert.equal(x.json.bets[0].status, 'won'); assert.ok(Math.abs(x.json.balance - (900 + 100 * dec)) < .05); ok('every sport settles from its own final scores: 3 winners pay the product of the prices');
  Date.now = realNow; server.close(); console.log('all passed');
})().catch((e) => { console.error(e); process.exit(1); });
