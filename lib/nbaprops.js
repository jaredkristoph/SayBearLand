'use strict';
/* Player props: roster and game-log reading from ESPN, a simple projection for the next game, and the model's own line.
   There are no sportsbook prop lines here: the line is the model's (the projection rounded to a half point), priced -110. */
const N = require('./nba.js');
const TOT = require('./nbatotals.js');
const ROSTER = (id) => 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/' + id + '/roster';
const GAMELOG = (id) => 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/' + id + '/gamelog';
const STATS = ['PTS', 'REB', 'AST', 'TPM'], NAMES = { PTS: 'points', REB: 'rebounds', AST: 'assists', TPM: 'threes' }, SD_FLOOR = { PTS: 3, REB: 1.5, AST: 1.2, TPM: .8 };
const r1 = (v) => Math.round(v * 10) / 10;

function parseRoster(data) {
  const raw = (data && data.athletes) || [], list = [];
  raw.forEach((x) => { if (x && Array.isArray(x.items)) list.push(...x.items); else if (x) list.push(x); });
  return list.filter((a) => a && a.id && (a.displayName || a.fullName)).map((a) => ({ id: String(a.id), name: a.displayName || a.fullName, pos: (a.position && a.position.abbreviation) || '', jersey: a.jersey || '', out: !!(a.injuries || []).some((i) => /out/i.test((i && (i.status || (i.type && i.type.description))) || '')) }));
}
function parseGamelog(data) { // newest first: [{date, home, opp, MIN, PTS, REB, AST, TPM}]
  if (!data) return [];
  const L = data.labels || data.names || [], ix = (n) => L.indexOf(n), meta = data.events || {}, rows = [];
  if (ix('PTS') < 0) return [];
  (data.seasonTypes || []).forEach((st) => {
    if (/pre/i.test(st.displayName || '')) return;
    (st.categories || []).forEach((c) => (c.events || []).forEach((e) => {
      const s = e.stats || [], m = meta[e.eventId] || {}, tp = String(s[ix('3PT')] || ''), pts = N.statNum(s[ix('PTS')]);
      if (pts == null) return;
      rows.push({ date: m.gameDate || '', home: m.homeAway ? m.homeAway === 'home' : null, opp: (m.opponent && m.opponent.abbreviation) || '', MIN: N.statNum(s[ix('MIN')]) || 0, PTS: pts, REB: N.statNum(s[ix('REB')]) || 0, AST: N.statNum(s[ix('AST')]) || 0, TPM: N.statNum(tp.split('-')[0]) || 0 });
    }));
  });
  return rows.filter((g) => g.MIN > 0).sort((a, b) => (a.date < b.date ? 1 : -1));
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
function sd(a) { if (a.length < 3) return 0; const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1)); }

function project(games, isHome) { // null when there are too few games to say anything
  if (!games || games.length < 5) return null;
  const out = { games: games.length, minutes: r1(mean(games.slice(0, 10).map((g) => g.MIN))), stats: {} };
  STATS.forEach((k) => {
    const all = games.map((g) => g[k]), l10 = all.slice(0, 10), split = games.filter((g) => g.home === isHome).map((g) => g[k]);
    const proj = .5 * mean(l10) + .3 * mean(all) + .2 * (split.length >= 4 ? mean(split) : mean(all));
    const spread = Math.max(SD_FLOOR[k], sd(all.slice(0, 15))), line = Math.floor(proj) + .5, pOver = 1 - N.phi((line - proj) / spread);
    out.stats[k] = { name: NAMES[k], proj: r1(proj), low: Math.max(0, r1(proj - spread)), high: r1(proj + spread), sd: r1(spread), line, pOver: Math.round(pOver * 1000) / 1000, last10: r1(mean(l10)), season: r1(mean(all)) };
  });
  out.warnings = [].concat(out.minutes < 15 ? ['Low minutes (' + out.minutes + ' a game): results swing a lot.'] : [], games.length < 10 ? ['Only ' + games.length + ' games on record this season.'] : []);
  return out;
}

function createProps(bot) {
  const { cached, fetchJson } = bot;
  const roster = (teamId) => cached('roster:' + teamId, 6 * 3600e3, async () => parseRoster(await fetchJson(ROSTER(teamId))));
  const gamelog = (id) => cached('log:' + id, 6 * 3600e3, async () => parseGamelog(await fetchJson(GAMELOG(id))));
  async function players(date) {
    const board = await bot.parlay(date), out = [];
    for (let i = 0; i < board.games.length; i += 4) await Promise.all(board.games.slice(i, i + 4).map(async (g) => {
      const [h, a] = await Promise.all([roster(g.home.id).catch(() => []), roster(g.away.id).catch(() => [])]);
      out.push({ gameId: g.gameId, start: g.start, home: g.home, away: g.away, homePlayers: h, awayPlayers: a });
    }));
    return { date: board.date, games: out.sort((x, y) => (x.start < y.start ? -1 : 1)) };
  }
  async function detail(date, gameId, playerId) {
    const board = await bot.parlay(date), g = board.games.find((x) => x.gameId === String(gameId));
    if (!g) { const e = new Error('That game is not on the board.'); e.status = 404; throw e; }
    const [h, a] = await Promise.all([roster(g.home.id), roster(g.away.id)]);
    const ph = h.find((p) => p.id === String(playerId)), pa = a.find((p) => p.id === String(playerId)), p = ph || pa;
    if (!p) { const e = new Error('That player is not on either team.'); e.status = 404; throw e; }
    const log = await gamelog(p.id), isHome = !!ph;
    return { player: p, team: (ph ? g.home : g.away), opponent: (ph ? g.away : g.home), home: isHome, gameId: g.gameId, start: g.start, state: g.state, projection: project(log, isHome), recent: log.slice(0, 10) };
  }
  // Player-model totals for a board's games: rosters and game logs come from ESPN, a few at a time, within a time limit.
  async function gameTotals(board, limitMs) {
    const deadline = Date.now() + (limitMs || 25e3), out = {};
    const games = board.games.filter((g) => g.odds && g.odds.total && g.state === 'pre');
    for (let i = 0; i < games.length; i += 3) {
      if (Date.now() > deadline) break;
      await Promise.all(games.slice(i, i + 3).map(async (g) => {
        try {
          const sides = await Promise.all([g.home, g.away].map(async (t) => {
            const ros = await roster(t.id), logs = [];
            for (let k = 0; k < ros.length; k += 8) await Promise.all(ros.slice(k, k + 8).map(async (pl) => { try { logs.push({ pl, log: await gamelog(pl.id) }); } catch (e) { /* skip */ } }));
            return logs.map(({ pl, log }) => { const inp = TOT.inputs(log, g.start); return inp && { ppm: inp.ppm, mins: inp.mins, avail: pl.out ? 0 : 1 }; }).filter(Boolean);
          }));
          out[g.gameId] = TOT.gameModel(sides[0], sides[1]);
        } catch (e) { /* this game falls back to the team formula */ }
      }));
    }
    return out;
  }
  return { players, detail, rosterOf: roster, logOf: gamelog, gameTotals };
}
module.exports = { createProps, parseRoster, parseGamelog, project, STATS, NAMES };
