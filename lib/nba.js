/* NBA parlay bot: pulls the slate and the betting lines from ESPN's public JSON, rates every moneyline and
   over/under, and builds parlays from the most likely legs (one leg per game, so legs are not correlated).
   Pure maths are exported for the tests. Nothing here can promise wins: the aim is to pick the legs the market
   and the team numbers agree on most. */
/* One row per sport. homeEdge/marginSd/totalSd are in that sport's own scoring units (points, goals).
   ppg is the sane range of average points scored per team: a standings number outside it is ignored, so a
   misread stat can never skew a pick (that team then falls back to the market alone).
   Game ids of every sport but the NBA get a prefix, so ids from different sports can never collide in one parlay. */
const SPORTS = {
  nba: { key: 'nba', label: 'NBA', path: 'basketball/nba', homeEdge: 2.5, marginSd: 12, totalSd: 17, ppg: [85, 140], prefix: '' },
  nfl: { key: 'nfl', label: 'NFL', path: 'football/nfl', homeEdge: 2, marginSd: 13.5, totalSd: 10, ppg: [10, 40], prefix: 'nfl-' },
  nhl: { key: 'nhl', label: 'NHL', path: 'hockey/nhl', homeEdge: .2, marginSd: 2.3, totalSd: 2.4, ppg: [1.5, 5], prefix: 'nhl-' },
  ncaaf: { key: 'ncaaf', label: 'College Football', path: 'football/college-football', homeEdge: 2.5, marginSd: 16, totalSd: 12, ppg: [10, 60], prefix: 'ncaaf-' },
  ncaab: { key: 'ncaab', label: 'College Basketball', path: 'basketball/mens-college-basketball', homeEdge: 3.5, marginSd: 11, totalSd: 16, ppg: [55, 95], prefix: 'ncaab-' },
};
const API = 'https://site.api.espn.com/apis/';

/* ---------- odds maths ---------- */
function parseAmerican(v) {
  if (v == null) return null;
  const s = String(v).trim().toUpperCase();
  if (s === 'EVEN' || s === 'EV' || s === 'PK') return 100;
  const n = Number(s.replace('+', ''));
  return Number.isFinite(n) && Math.abs(n) >= 100 ? n : null;
}
const impliedProb = (a) => (a < 0 ? -a / (-a + 100) : 100 / (a + 100));
const toDecimal = (a) => (a < 0 ? 1 + 100 / -a : 1 + a / 100);
function toAmerican(p) { p = Math.min(.995, Math.max(.005, p)); return p >= .5 ? -Math.round(100 * p / (1 - p)) : Math.round(100 * (1 - p) / p); }
function devig(a, b) { const x = impliedProb(a), y = impliedProb(b); return x / (x + y); }
function phi(z) { // standard normal CDF
  const t = 1 / (1 + .2316419 * Math.abs(z)), d = .3989423 * Math.exp(-z * z / 2);
  const p = d * t * (.3193815 + t * (-.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
const grade = (p) => (p >= .72 ? 'A' : p >= .62 ? 'B' : p >= .55 ? 'C' : 'D');
const round = (v, n = 3) => Math.round(v * 10 ** n) / 10 ** n;

/* ---------- reading ESPN ---------- */
function parseOdds(comp) {
  const o = comp && comp.odds && comp.odds[0]; if (!o) return null;
  const mlOf = (side) => {
    const t = o[side + 'TeamOdds']; let v = t && (t.moneyLine != null ? t.moneyLine : t.moneyline);
    if (v == null && o.moneyline && o.moneyline[side]) { const m = o.moneyline[side]; v = (m.close && m.close.odds) || (m.open && m.open.odds); }
    return parseAmerican(v);
  };
  let total = Number(o.overUnder); if (!Number.isFinite(total) && o.total && o.total.over && o.total.over.close) total = Number(String(o.total.over.close.line || '').replace(/[^0-9.]/g, ''));
  let spread = Number(o.spread); if (!Number.isFinite(spread)) spread = null;
  const out = { provider: (o.provider && o.provider.name) || 'ESPN', homeML: mlOf('home'), awayML: mlOf('away'), total: Number.isFinite(total) && total > 1 ? total : null, spread };
  return out.homeML || out.awayML || out.total ? out : null;
}
function parseTeamStats(data, cfg) {
  cfg = cfg || SPORTS.nba;
  const map = {}, entries = [];
  const walk = (n) => { if (!n) return; if (n.standings && n.standings.entries) entries.push(...n.standings.entries); (n.children || []).forEach(walk); };
  walk(data);
  entries.forEach((e) => {
    const s = {}; (e.stats || []).forEach((x) => { s[x.name] = x.value; });
    const gp = s.gamesPlayed || ((s.wins || 0) + (s.losses || 0)) || 0;
    const pf = s.avgPointsFor || (gp && s.pointsFor ? s.pointsFor / gp : null), pa = s.avgPointsAgainst || (gp && s.pointsAgainst ? s.pointsAgainst / gp : null);
    if (e.team && pf && pa && pf >= cfg.ppg[0] && pf <= cfg.ppg[1] && pa >= cfg.ppg[0] && pa <= cfg.ppg[1]) map[String(e.team.id)] = { pf, pa, winPct: s.winPercent != null ? s.winPercent : null, gp };
  });
  return map;
}
function parseSlate(data, prefix) {
  prefix = prefix || '';
  return ((data && data.events) || []).map((ev) => {
    const c = ev.competitions && ev.competitions[0]; if (!c) return null;
    const home = c.competitors.find((x) => x.homeAway === 'home'), away = c.competitors.find((x) => x.homeAway === 'away'); if (!home || !away) return null;
    const t = (x) => ({ id: String(x.team.id), name: x.team.displayName, abbr: x.team.abbreviation });
    return { id: prefix + String(ev.id), start: ev.date, state: (ev.status && ev.status.type && ev.status.type.state) || 'pre', status: (ev.status && ev.status.type && ev.status.type.name) || '', homeScore: Number(home.score), awayScore: Number(away.score), home: t(home), away: t(away), odds: parseOdds(c) };
  }).filter(Boolean);
}

function statNum(v) { const n = parseFloat(String(v == null ? '' : v)); return Number.isFinite(n) ? n : null; }
function N_parseBox(data) { // { playerId: {MIN, PTS, REB, AST, TPM} } or null when ESPN has no box score
  const out = {}; let any = false;
  (((data && data.boxscore) || {}).players || []).forEach((t) => (t.statistics || []).forEach((blk) => {
    const L = blk.labels || blk.names || [], ix = (n) => L.indexOf(n);
    (blk.athletes || []).forEach((a) => {
      if (!a.athlete) return; const st = a.stats || [], tp = String(st[ix('3PT')] || ''), m = statNum(st[ix('MIN')]);
      out[String(a.athlete.id)] = { MIN: a.didNotPlay ? 0 : (m || 0), PTS: statNum(st[ix('PTS')]) || 0, REB: statNum(st[ix('REB')]) || 0, AST: statNum(st[ix('AST')]) || 0, TPM: statNum(tp.split('-')[0]) || 0 }; any = true;
    });
  }));
  return any ? out : null;
}

/* ---------- the model ---------- */
function teamModel(home, away, cfg) {
  cfg = cfg || SPORTS.nba; // team strength only: expected margin, win chance, expected total
  if (!home || !away) return null;
  const margin = (home.pf - home.pa) - (away.pf - away.pa) + cfg.homeEdge;
  return { margin, homeWin: phi(margin / cfg.marginSd), total: (home.pf + away.pa) / 2 + (away.pf + home.pa) / 2 };
}
function rateGame(g, stats, cfg) {
  cfg = cfg || SPORTS.nba;
  const m = teamModel(stats[g.home.id], stats[g.away.id], cfg), o = g.odds, legs = [];
  // moneyline: lean mostly on the de-vigged market, nudged by the team numbers
  let pHome = null, source = '';
  const market = o && o.homeML && o.awayML ? devig(o.homeML, o.awayML) : null;
  if (market != null && m) { pHome = .7 * market + .3 * m.homeWin; source = 'market + team ratings'; }
  else if (market != null) { pHome = market; source = 'market'; } else if (m) { pHome = m.homeWin; source = 'team ratings only (no line yet)'; }
  if (pHome != null) {
    const homePick = pHome >= .5, p = homePick ? pHome : 1 - pHome, team = homePick ? g.home : g.away;
    let ml = o && (homePick ? o.homeML : o.awayML); const fair = ml == null; if (fair) ml = toAmerican(p);
    legs.push({ gameId: g.id, type: 'ml', label: team.name + ' to win', pick: team.abbr, vs: (homePick ? g.away : g.home).name, prob: round(p), odds: ml, edge: fair ? 0 : round(p - impliedProb(ml)), estimatedOdds: fair, source, grade: grade(p) });
  }
  if (o && o.total) { // total: shrink the team-based number heavily toward the line, the market is sharp here
    const exp = m ? m.total : o.total, blended = .65 * o.total + .35 * exp, pOver = phi((blended - o.total) / cfg.totalSd);
    const over = pOver >= .5, p = over ? pOver : 1 - pOver;
    legs.push({ gameId: g.id, type: 'total', label: (over ? 'Over ' : 'Under ') + o.total, pick: over ? 'OVER' : 'UNDER', vs: g.away.abbr + ' @ ' + g.home.abbr, prob: round(p), odds: -110, edge: round(p - impliedProb(-110)), estimatedOdds: true, source: m ? 'team scoring vs line ' + o.total + ' (model ' + round(exp, 1) + ')' : 'line only', grade: grade(p) });
  }
  legs.forEach((l) => { l.sport = cfg.key; });
  return { gameId: g.id, sport: cfg.key, sportLabel: cfg.label, home: g.home, away: g.away, start: g.start, state: g.state, odds: o, model: m ? { homeWin: round(m.homeWin), margin: round(m.margin, 1), total: round(m.total, 1) } : null, legs };
}

function combine(legs) {
  const prob = legs.reduce((a, l) => a * l.prob, 1), dec = legs.reduce((a, l) => a * toDecimal(l.odds), 1);
  return { legs, prob: round(prob), decimal: round(dec, 2), american: Math.round(dec >= 2 ? (dec - 1) * 100 : -100 / (dec - 1)), ev: round(prob * dec - 1), hitOneIn: round(1 / Math.max(prob, 1e-6), 1) };
}
function buildParlays(rated, want) {
  // one leg per game: whichever of the game's legs is most likely
  const best = rated.map((r) => r.legs.slice().sort((a, b) => b.prob - a.prob)[0]).filter(Boolean);
  const byProb = best.slice().sort((a, b) => b.prob - a.prob), byEdge = best.filter((l) => l.prob >= .52 && l.edge > 0).sort((a, b) => b.edge - a.edge);
  const n = Math.max(2, Math.min(6, want || 3)), out = [];
  const add = (id, name, blurb, legs) => { if (legs.length >= 2) out.push(Object.assign({ id, name, blurb }, combine(legs))); };
  add('safest', 'Safest', 'The ' + n + ' most likely legs on the board.', byProb.slice(0, n));
  add('balanced', 'Balanced', 'Four most likely legs for a bigger payout.', byProb.slice(0, Math.min(4, Math.max(n, 4))));
  add('value', 'Value', 'Legs where our number beats the sportsbook price the most.', byEdge.slice(0, n));
  add('longshot', 'Longshot', 'Six legs, the full slate of favourites.', byProb.slice(0, 6));
  return out.filter((p, i, a) => a.findIndex((q) => q.legs.map((l) => l.gameId + l.type).join() === p.legs.map((l) => l.gameId + l.type).join()) === i);
}

/* Several sports at once: every sport's games go into one pool, so a parlay can mix NBA, NFL, NHL and college legs. */
function mergeBoards(boards, want) {
  const games = [].concat(...boards.map((b) => b.games)).sort((a, b) => (a.start < b.start ? -1 : 1));
  return { games, parlays: buildParlays(games, want) };
}

/* ---------- dates, fetching, caching ---------- */
function easternDate(offsetDays) { // YYYY-MM-DD in US Eastern, the NBA's calendar
  const d = new Date(Date.now() + (offsetDays || 0) * 864e5);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

function createBot(fetchJson, now, sport) {
  const cfg = SPORTS[sport || 'nba'], SCOREBOARD = API + 'site/v2/sports/' + cfg.path + '/scoreboard', STANDINGS = API + 'v2/sports/' + cfg.path + '/standings';
  const SUMMARY = API + 'site/v2/sports/' + cfg.path + '/summary', CORE = 'https://sports.core.api.espn.com/v2/sports/' + cfg.path.replace('/', '/leagues/') + '/events/';
  const slateOf = async (d) => parseSlate(await fetchJson(SCOREBOARD + '?dates=' + d.replace(/-/g, '')), cfg.prefix);
  now = now || (() => Date.now()); const cache = new Map();
  fetchJson = fetchJson || (async (url) => { const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 SayBearLand' }, signal: AbortSignal.timeout(9000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  async function cached(key, ttl, fn) { const c = cache.get(key); if (c && now() - c.t < ttl) return c.v; const v = await fn(); cache.set(key, { t: now(), v }); return v; }
  async function parlay(date, legsWanted) {
    date = validDate(date) ? date : easternDate(1);
    const slate = await cached('slate:' + date, 10 * 60e3, async () => slateOf(date));
    let stats = {}, statsOk = true;
    try { stats = await cached('stats:' + cfg.key, 60 * 60e3, async () => parseTeamStats(await fetchJson(STANDINGS), cfg)); } catch (e) { statsOk = false; }
    const games = slate.filter((g) => g.state === 'pre'), rated = games.map((g) => rateGame(g, stats, cfg));
    const lines = rated.filter((r) => r.odds).length;
    return {
      date, sport: cfg.key, sportLabel: cfg.label, generatedAt: new Date(now()).toISOString(), games: rated, parlays: buildParlays(rated, legsWanted),
      notes: [].concat(!slate.length ? ['No ' + cfg.label + ' games on this date.'] : [], slate.length && !games.length ? ['All of these games have already started.'] : [],
        games.length && !lines ? ['The sportsbooks have not posted lines for this date yet, so legs use team ratings only and the odds are estimates. Check again closer to tip-off.'] : [],
        !statsOk ? ['Team stats were unavailable, so picks lean on the market alone.'] : [],
        ['Odds come from ESPN (DraftKings/ESPN BET). A parlay only hits if every leg hits: even the safest slips lose most weeks. Bet only what you can lose.'])
    };
  }
  // final scores for settling bets: a short cache so a game that just ended is picked up within a minute
  async function results(date) {
    const slate = await cached('res:' + date, 60e3, async () => slateOf(date));
    const m = {}; slate.forEach((g) => { m[g.id] = g; }); return m;
  }
  async function day(date) { // one past or present day, cached long: finished days never change
    const old = date < easternDate(0);
    return cached('day:' + date, old ? 12 * 3600e3 : 120e3, async () => slateOf(date));
  }
  async function box(gameId) { // player box score of a finished game, for settling props
    return cached('box:' + gameId, 10 * 60e3, async () => N_parseBox(await fetchJson(SUMMARY + '?event=' + encodeURIComponent(String(gameId).replace(cfg.prefix, '')))));
  }
  async function oddsFor(gameId) { // the lines ESPN kept for a finished game (the scoreboard drops them once the game is over)
    return cached('core:' + gameId, 12 * 3600e3, async () => {
      const d = await fetchJson(CORE + encodeURIComponent(String(gameId).replace(cfg.prefix, '')) + '/competitions/' + encodeURIComponent(String(gameId).replace(cfg.prefix, '')) + '/odds');
      const items = (d && d.items) || []; let best = null;
      for (const it of items) { const o = parseOdds({ odds: [it] }); if (o && (!best || (o.homeML && o.awayML && o.total && !(best.homeML && best.awayML && best.total)))) best = o; }
      return best;
    });
  }
  return { sport: cfg.key, cfg, parlay, results, day, box, oddsFor, fetchJson, cached };
}

module.exports = { SPORTS, mergeBoards, N_parseBox, statNum, createBot, parseOdds, parseTeamStats, parseSlate, parseAmerican, impliedProb, toDecimal, toAmerican, devig, phi, teamModel, rateGame, buildParlays, combine, easternDate, validDate };
