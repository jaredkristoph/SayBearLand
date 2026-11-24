'use strict';
const assert = require('assert');
const http = require('http');
const P = require('../lib/nbaprops.js');
const N = require('../lib/nba.js');
const { createApp } = require('../server');
const { memoryStore } = require('../lib/store');
const ok = (n) => console.log(`ok - ${n}`);

// ---- reading ESPN-shaped json ----
const flat = { athletes: [{ id: '100', displayName: 'Jay Tatum', position: { abbreviation: 'SF' }, jersey: '0' }, { id: '101', fullName: 'Al Horford', injuries: [{ status: 'Out' }] }] };
const grouped = { athletes: [{ position: 'guards', items: [{ id: '200', displayName: 'Sam Guard' }] }, { position: 'bigs', items: [{ id: '201', displayName: 'Big Man' }] }] };
assert.equal(P.parseRoster(flat).length, 2); assert.equal(P.parseRoster(flat)[0].pos, 'SF'); assert.equal(P.parseRoster(flat)[1].out, true); assert.equal(P.parseRoster(grouped).length, 2); assert.deepEqual(P.parseRoster(null), []); ok('rosters parse in both shapes, injuries flagged');
const labels = ['MIN', 'FG', 'FG%', '3PT', '3P%', 'FT', 'FT%', 'REB', 'AST', 'BLK', 'STL', 'PF', 'TO', 'PTS'];
const row = (id, min, tp, reb, ast, pts) => ({ eventId: id, stats: [String(min), '5-10', '50', tp, '33', '2-2', '100', String(reb), String(ast), '0', '1', '2', '1', String(pts)] });
const log = (n) => { const ev = [], meta = {}; for (let i = 0; i < n; i++) { const id = 'e' + i; ev.push(row(id, 34, '3-7', 8, 5, i % 2 ? 26 : 18)); meta[id] = { gameDate: '2026-11-' + String(20 - i).padStart(2, '0') + 'T00:00Z', homeAway: i % 2 ? 'home' : 'away', opponent: { abbreviation: 'XXX' } }; } return { labels, events: meta, seasonTypes: [{ displayName: 'Regular Season', categories: [{ type: 'event', events: ev }] }] }; };
let gl = P.parseGamelog(log(12)); assert.equal(gl.length, 12); assert.ok(gl[0].date > gl[1].date); assert.equal(gl[0].TPM, 3); assert.equal(gl[0].REB, 8); ok('game log parses, newest first, threes read from "3-7"');
const withPre = log(6); withPre.seasonTypes.unshift({ displayName: 'Preseason', categories: [{ events: [row('p1', 20, '1-2', 1, 1, 99)] }] }); withPre.seasonTypes[1].categories[0].events.push(row('dnp', 0, '0-0', 0, 0, 0)); assert.equal(P.parseGamelog(withPre).length, 6); assert.deepEqual(P.parseGamelog({}), []); ok('preseason and did-not-play rows are ignored');

// ---- the projection ----
let pr = P.project(gl, true); assert.ok(pr.stats.PTS.proj > 21 && pr.stats.PTS.proj < 23.5); assert.equal(pr.stats.PTS.line % 1, .5); assert.ok(Math.abs(pr.stats.PTS.line - pr.stats.PTS.proj) <= 1);
assert.ok(pr.stats.PTS.low < pr.stats.PTS.proj && pr.stats.PTS.high > pr.stats.PTS.proj); assert.ok(pr.stats.PTS.pOver > .2 && pr.stats.PTS.pOver < .8); ok('projection sits near the average, with a range and a half-point line');
assert.equal(P.project(P.parseGamelog(log(4)), true), null); ok('too few games: no projection');
const lowMin = log(12); lowMin.seasonTypes[0].categories[0].events.forEach((e) => { e.stats[0] = '9'; }); assert.ok(P.project(P.parseGamelog(lowMin), true).warnings.some((w) => /Low minutes/.test(w))); ok('low-minute players get a warning');

// ---- through the API, with betting and settling ----
const T = (i, n, a) => ({ id: String(i), displayName: n, abbreviation: a });
const BOS = T(1, 'Boston', 'BOS'), WAS = T(2, 'Washington', 'WAS'); let phase = 'pre';
const board = () => ({ events: [{ id: 'g1', date: '2026-11-23T00:30Z', status: { type: { state: phase, name: phase === 'post' ? 'STATUS_FINAL' : 'STATUS_SCHEDULED' } }, competitions: [{ competitors: [{ homeAway: 'home', team: BOS, score: '110' }, { homeAway: 'away', team: WAS, score: '100' }], odds: [{ overUnder: 220.5, homeTeamOdds: { moneyLine: -300 }, awayTeamOdds: { moneyLine: 250 } }] }] }] });
const box = { boxscore: { players: [{ statistics: [{ labels, athletes: [{ athlete: { id: '100' }, stats: ['35', '9-18', '50', '4-9', '44', '4-4', '100', '7', '4', '0', '1', '2', '1', '20'] }, { athlete: { id: '101' }, didNotPlay: true, stats: [] }] }] }] } };
const fetchFx = async (u) => {
  if (u.includes('standings')) return { children: [] }; if (/scoreboard/.test(u)) return board();
  if (/teams\/1\/roster/.test(u)) return flat; if (/teams\/2\/roster/.test(u)) return grouped;
  if (/athletes\/(100|101|200|201)\/gamelog/.test(u)) return log(12); if (/summary/.test(u)) return box; throw new Error('unexpected ' + u);
};
(async () => {
  const realNow = Date.now; let skew = Date.parse('2026-11-21T12:00:00Z') - realNow(); Date.now = () => realNow() + skew; const jump = () => { skew += 3600e3; }; // the bot caches lines for a minute: move the clock instead of waiting
  const server = http.createServer(createApp(memoryStore(), { SESSION_SECRET: 's' }, { nbaFetch: fetchFx })); await new Promise((r) => server.listen(0, r)); const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (method, path, body, ck) => { const x = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', cookie: ck || '' }, body: body ? JSON.stringify(body) : undefined }); return { status: x.status, json: await x.json().catch(() => ({})), cookie: (x.headers.get('set-cookie') || '').split(';')[0] }; };
  let x = await api('GET', '/api/nba/props?date=2026-11-22'); assert.equal(x.status, 200); assert.equal(x.json.games[0].homePlayers.length, 2); assert.equal(x.json.games[0].awayPlayers.length, 2); ok('player list per game');
  x = await api('GET', '/api/nba/player?date=2026-11-22&gameId=g1&id=100'); assert.equal(x.status, 200); assert.equal(x.json.opponent.abbr, 'WAS'); assert.equal(x.json.home, true); const L = x.json.projection.stats.PTS.line; assert.equal(x.json.recent.length, 10); ok('player panel: opponent, projection and recent games');
  x = await api('GET', '/api/nba/player?date=2026-11-22&gameId=g1&id=999'); assert.equal(x.status, 404); x = await api('GET', '/api/nba/player?date=2026-11-22&gameId=nope&id=100'); assert.equal(x.status, 404); ok('unknown player or game is a 404');

  const su = await api('POST', '/api/signup', { name: 'Mia', username: 'mia', role: 'Tester' }); const ck = (await api('POST', '/api/login', { username: 'mia', password: su.json.temporaryPassword })).cookie;
  const bet = (leg, stake) => api('POST', '/api/nba/bet', { date: '2026-11-22', stake: stake || 100, legs: [leg] }, ck);
  x = await bet({ gameId: 'g1', type: 'prop', playerId: '100', stat: 'PTS', side: 'UNDER', line: L + 3 }); assert.equal(x.status, 400); assert.ok(/line moved/.test(x.json.error)); ok('a made-up line is refused: only the model line can be bet');
  x = await bet({ gameId: 'g1', type: 'prop', playerId: '100', stat: 'PTS', side: 'SIDEWAYS', line: L }); assert.equal(x.status, 400);
  x = await bet({ gameId: 'g1', type: 'prop', playerId: '555', stat: 'PTS', side: 'OVER', line: L }); assert.equal(x.status, 404 === x.status ? 404 : 400); ok('bad side and unknown player are refused');
  x = await bet({ gameId: 'g1', type: 'prop', playerId: '100', stat: 'PTS', side: 'UNDER', line: L }); assert.equal(x.status, 200, JSON.stringify(x.json)); assert.equal(x.json.balance, 900); assert.equal(x.json.bets[0].legs[0].odds, -110); assert.ok(/Tatum under/.test(x.json.bets[0].legs[0].label)); ok('a prop bet is placed at -110 on the model line');
  x = await api('GET', '/api/nba/wallet', null, ck); assert.equal(x.json.bets[0].status, 'open'); ok('prop stays open until the game ends');
  phase = 'post'; jump(); x = await api('GET', '/api/nba/wallet', null, ck);
  assert.equal(x.json.bets[0].status, 'won'); assert.ok(Math.abs(x.json.balance - (900 + 100 * N.toDecimal(-110))) < .02); ok('20 points is under the line, so the prop wins from the box score');
  phase = 'pre'; jump();
  const L2 = (await api('GET', '/api/nba/player?date=2026-11-22&gameId=g1&id=101')).json.projection.stats.PTS.line; x = await bet({ gameId: 'g1', type: 'prop', playerId: '101', stat: 'PTS', side: 'OVER', line: L2 }, 50); assert.equal(x.status, 200);
  phase = 'post'; jump(); x = await api('GET', '/api/nba/wallet', null, ck); assert.equal(x.json.bets[0].status, 'void'); assert.ok(Math.abs(x.json.balance - (900 + 100 * N.toDecimal(-110))) < .02); ok('a player who did not play voids the bet and refunds the stake');
  Date.now = realNow; server.close(); console.log('all passed');
})().catch((e) => { console.error(e); process.exit(1); });
