'use strict';
/* Backtest for the parlay model, one sport or several mixed together. Replays past days one at a time. Team scoring
   numbers use ONLY games finished before each day (no peeking at the future); odds are the lines ESPN kept for that
   game. Every leg and parlay is graded against the real final score. With several sports, the day's games from all of
   them go into one pool and parlays are built across it, exactly like the "All sports" tab. */
const N = require('./nba.js');
const TOT = require('./nbatotals.js');
const { gradeLeg } = require('./nbabets.js');
const WARM_DAYS = 21, MIN_GP = 5, MAX_DAYS = 62, MAX_LINE_FETCHES = 400, BUDGET_MS = 70e3;

const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const rng = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
const r3 = (v) => Math.round(v * 1000) / 1000;

function newTally() { return { n: 0, won: 0, lost: 0, push: 0, predSum: 0 }; }
function addTo(t, res, prob) { if (res === 'push') { t.push++; return; } t.n++; t.predSum += prob; if (res === 'won') t.won++; else t.lost++; }
function wilson(h, n) { if (!n) return [null, null]; const z = 1.96, p = h / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, w = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [r3(Math.max(0, c - w)), r3(Math.min(1, c + w))]; }
function summarize(t, straight) { const [lo, hi] = wilson(t.won, t.n); return { bets: t.n, hits: t.won, hitRate: t.n ? r3(t.won / t.n) : null, lo, hi, predicted: t.n ? r3(t.predSum / t.n) : null, pushes: t.push, roi: straight && t.n ? r3((t.won * (100 / 110) - t.lost) / t.n) : undefined }; }

async function inChunks(items, size, fn, stop) { for (let i = 0; i < items.length; i += size) { if (stop && stop()) return items.length - i; await Promise.all(items.slice(i, i + size).map(fn)); } return 0; }

async function backtest(bots, from, to, only, opt) {
  opt = opt || {};
  const map = typeof bots.parlay === 'function' ? { [bots.sport || 'nba']: bots } : bots;
  const keys = (only && only.length ? only : Object.keys(map)).filter((k) => map[k]);
  if (!keys.length) throw Object.assign(new Error('Pick at least one sport.'), { status: 400 });
  if (!N.validDate(from) || !N.validDate(to) || from > to) throw Object.assign(new Error('Pick a valid date range.'), { status: 400 });
  const days = rng(from, to); if (days.length > MAX_DAYS) throw Object.assign(new Error('Pick at most ' + MAX_DAYS + ' days.'), { status: 400 });
  const deadline = Date.now() + (opt.budgetMs || BUDGET_MS), late = () => Date.now() > deadline;
  const warm = rng(addDays(from, -WARM_DAYS), addDays(from, -1)), all = warm.concat(days);
  const S = {}; keys.forEach((k) => { S[k] = { bot: map[k], cfg: map[k].cfg || N.SPORTS[k] || N.SPORTS.nba, slates: {}, tot: {}, tally: { ml: newTally(), total: newTally() }, games: 0, withLines: 0 }; });
  await Promise.all(keys.map((k) => inChunks(all, 5, async (d) => { S[k].slates[d] = await S[k].bot.day(d).catch(() => []); }))); // 5 days at a time per sport, gentle on ESPN

  // ESPN's scoreboard drops the lines of finished games: fetch each missing one from the per-game odds feed, in order of
  // sport, with a request budget and a time limit. Lines already fetched are remembered, so a second run carries on.
  const src = { scoreboard: 0, perGame: 0, none: 0 }, todo = []; let fresh = 0;
  keys.forEach((k) => days.forEach((d) => S[k].slates[d].forEach((g) => { if (g.state !== 'post') return; if (g.odds) src.scoreboard++; else todo.push({ k, g }); })));
  const queue = todo.filter((x) => { if (S[x.k].bot.knowsOdds && S[x.k].bot.knowsOdds(x.g.id)) return true; return fresh++ < MAX_LINE_FETCHES; });
  const skippedForBudget = todo.length - queue.length;
  let pending = await inChunks(queue, 6, async ({ k, g }) => { try { const o = await S[k].bot.oddsFor(g.id); if (o) { g.odds = o; src.perGame++; } else src.none++; } catch (e) { src.none++; } }, late);
  pending += skippedForBudget;

  // Player model for NBA totals: needs every roster and game log. Fetched a few at a time within the time limit;
  // what is already cached is free, so a second run picks up where this one stopped.
  const usePlayers = opt.model === 'player' && opt.props && S.nba, PM = { rosters: {}, logs: {}, byBucket: [[0, 2], [2, 4], [4, 6], [6, 1e9]].map(([lo, hi]) => ({ lo, hi, t: newTally() })), pl: newTally(), tm: newTally(), early: newTally(), late: newTally(), games: 0, missing: 0, pendingLogs: 0 };
  if (usePlayers) {
    const teams = new Map(); days.forEach((d) => S.nba.slates[d].forEach((g) => { if (g.state === 'post' && g.odds && g.odds.total) { teams.set(g.home.id, 1); teams.set(g.away.id, 1); } }));
    await inChunks([...teams.keys()], 6, async (id) => { try { PM.rosters[id] = await opt.props.rosterOf(id); } catch (e) { /* skip */ } }, late);
    const pls = new Map(); Object.keys(PM.rosters).forEach((id) => PM.rosters[id].forEach((p) => pls.set(p.id, 1)));
    PM.pendingLogs = await inChunks([...pls.keys()], 8, async (id) => { try { PM.logs[id] = await opt.props.logOf(id); } catch (e) { /* skip */ } }, late);
  }
  const playerLeg = (r, g) => { // the player model's over/under leg for one finished game, using only data from before it started
    const side = (team, opp) => (PM.rosters[team.id] || []).map((pl) => {
      const log = PM.logs[pl.id], inp = log && TOT.inputs(log, g.start); if (!inp) return null;
      const played = log.some((row) => row.opp === opp.abbr && Math.abs(Date.parse(row.date) - Date.parse(g.start)) < 30 * 3600e3); // who actually suited up that night
      return { ppm: inp.ppm, mins: inp.mins, avail: played ? 1 : 0 };
    }).filter(Boolean);
    const m = TOT.gameModel(side(g.home, g.away), side(g.away, g.home)); return m ? TOT.totalLeg(r, m, g.odds.total) : null;
  };
  const feed = (k, g) => { // a finished game adds to each team's running scoring totals
    if (g.state !== 'post' || !Number.isFinite(g.homeScore) || !Number.isFinite(g.awayScore)) return;
    [[g.home, g.homeScore, g.awayScore], [g.away, g.awayScore, g.homeScore]].forEach(([t, f, a]) => { const x = S[k].tot[t.id] || (S[k].tot[t.id] = { f: 0, a: 0, gp: 0 }); x.f += f; x.a += a; x.gp++; });
  };
  keys.forEach((k) => warm.forEach((d) => S[k].slates[d].forEach((g) => feed(k, g)))); // days before the range seed the team numbers
  const byGrade = {}, parl = {}, daily = []; let gamesSeen = 0, withLines = 0;
  for (let di = 0; di < days.length; di++) {
    const d = days[di], pool = [], byId = {};
    keys.forEach((k) => {
      const st = S[k], stats = {}; Object.keys(st.tot).forEach((id) => { const x = st.tot[id]; if (x.gp >= MIN_GP) stats[id] = { pf: x.f / x.gp, pa: x.a / x.gp }; });
      const finished = st.slates[d].filter((g) => g.state === 'post' && Number.isFinite(g.homeScore) && Number.isFinite(g.awayScore)); st.games += finished.length; gamesSeen += finished.length;
      finished.forEach((g) => { byId[g.id] = g; });
      const rated = finished.filter((g) => g.odds && (g.odds.total || (g.odds.homeML && g.odds.awayML))).map((g) => N.rateGame(g, stats, st.cfg)); st.withLines += rated.length; withLines += rated.length;
      rated.forEach((r) => { r.legs.forEach((l) => { const g = byId[l.gameId], res = gradeLeg({ type: l.type, pick: l.pick, home: g.home.abbr, away: g.away.abbr, line: g.odds.total }, g); if (!res) return; addTo(st.tally[l.type], res, l.prob); addTo(byGrade[l.grade] || (byGrade[l.grade] = newTally()), res, l.prob); });
        if (usePlayers && k === 'nba' && r.odds.total) { // grade the player model on the same game, and use its leg in the parlays
          const g = byId[r.gameId], team = r.legs.find((l) => l.type === 'total'), pl = playerLeg(r, g);
          if (!pl) PM.missing++; else { const rp = gradeLeg({ type: 'total', pick: pl.pick, line: g.odds.total }, g), rt = team && gradeLeg({ type: 'total', pick: team.pick, line: g.odds.total }, g);
            if (rp && rp !== 'push') { PM.games++; addTo(PM.pl, rp, pl.prob); if (Math.abs(pl.diff) >= 6) addTo(di < days.length / 2 ? PM.early : PM.late, rp, pl.prob); if (rt) addTo(PM.tm, rt, team.prob); const b = PM.byBucket.find((x) => Math.abs(pl.diff) >= x.lo && Math.abs(pl.diff) < x.hi); if (b) addTo(b.t, rp, pl.prob); }
            r.legs = r.legs.filter((l) => l.type !== 'total').concat(Math.abs(pl.diff) >= (opt.minGap || 0) ? [pl] : []); } }
        pool.push(r); });
    });
    const graded = (l) => { const g = byId[l.gameId]; return gradeLeg({ type: l.type, pick: l.pick, home: g.home.abbr, away: g.away.abbr, line: g.odds.total }, g); };
    const dayRow = { date: d, games: pool.length, parlays: [] };
    N.buildParlays(pool, 3, opt.type).forEach((p) => {
      const rs = p.legs.map(graded), lost = rs.includes('lost'), won = !lost && rs.includes('won'); if (!lost && !won) return;
      const dec = p.legs.reduce((a, l, i) => a * (rs[i] === 'push' ? 1 : N.toDecimal(l.odds)), 1), profit = won ? dec - 1 : -1;
      const t = parl[p.id] || (parl[p.id] = { n: 0, won: 0, profit: 0, predSum: 0, mixed: 0 }); t.n++; t.predSum += p.prob; if (won) t.won++; t.profit += profit; if (new Set(p.legs.map((l) => l.sport)).size > 1) t.mixed++;
      dayRow.parlays.push({ id: p.id, legs: p.legs.length, sports: [...new Set(p.legs.map((l) => l.sport))], hit: won, profit: r3(profit) });
    });
    daily.push(dayRow);
    keys.forEach((k) => S[k].slates[d].forEach((g) => feed(k, g))); // today's finals feed tomorrow's numbers
  }
  const parlays = Object.keys(parl).map((id) => { const t = parl[id]; return { id, tickets: t.n, hits: t.won, hitRate: r3(t.won / t.n), predicted: r3(t.predSum / t.n), roi: r3(t.profit / t.n), mixedTickets: t.mixed }; });
  const bySport = keys.map((k) => ({ sport: k, label: S[k].cfg.label, games: S[k].games, gamesWithLines: S[k].withLines, moneyline: summarize(S[k].tally.ml), total: summarize(S[k].tally.total) }));
  const legs = { moneyline: mergeSum(bySport.map((x) => x.moneyline)), total: mergeSum(bySport.map((x) => x.total)) };
  const playerModel = usePlayers ? { games: PM.games, missing: PM.missing, pendingLogs: PM.pendingLogs, overall: summarize(PM.pl, true), teamFormula: summarize(PM.tm, true), halves: { first: summarize(PM.early, true), second: summarize(PM.late, true) }, minGap: opt.minGap || 0,
    buckets: PM.byBucket.map((b) => Object.assign({ label: b.hi > 1e8 ? b.lo + '+ points' : b.lo + '–' + b.hi + ' points' }, summarize(b.t, true))) } : undefined;
  return { playerModel, model: usePlayers ? 'player' : 'team', from, to, days: days.length, type: N.TYPES[opt.type] ? opt.type : 'all', sports: keys, mixed: keys.length > 1, games: gamesSeen, gamesWithLines: withLines, lineSources: src, partial: pending > 0 || (usePlayers && PM.pendingLogs > 0), pendingLines: pending,
    legs, bySport, byGrade: Object.keys(byGrade).sort().map((g) => Object.assign({ grade: g }, summarize(byGrade[g]))), parlays, daily,
    notes: [].concat(usePlayers && PM.pendingLogs > 0 ? ['Still loading player game logs (' + PM.pendingLogs + ' left). Run it again in a minute: logs already loaded are remembered.'] : [], usePlayers ? ['Player model: each team\'s points = points per minute x expected minutes of the players who actually suited up that night (known at tip-off), using only games before it. Rosters are today\'s, so players traded mid-season are only counted for the team they played for that night.'] : [], pending > 0 ? ['Still collecting lines for ' + pending + ' games (limited per run to keep this quick). Run it again in a minute: lines already collected are remembered.'] : [],
      withLines === 0 && gamesSeen ? ['ESPN did not return stored lines for any of these games, so nothing could be graded. Try more recent dates.'] : [],
      opt.type === 'total' ? ['Over/under only: parlays use just the over/under leg of each game. Totals are the hardest bet to beat, so expect hit rates close to the sportsbook price.'] : [],
      keys.length > 1 ? ['Mixed parlays: each day the games of every selected sport go into one pool and parlays are built across it, one leg per game.'] : [],
      ['These are the final (closing) lines, which are sharper than the lines you could bet earlier in the day.', 'Team numbers use only games played before each day. Games with no stored line are skipped.', 'ROI is profit per $1 staked on one ticket per day per parlay type at the stored sportsbook prices.', 'A short sample proves little: a few weeks of parlays can swing far from the long-run result.']) };
}
function mergeSum(list) { const b = list.reduce((a, x) => a + x.bets, 0), h = list.reduce((a, x) => a + x.hits, 0), pr = list.reduce((a, x) => a + (x.predicted || 0) * x.bets, 0); return { bets: b, hits: h, hitRate: b ? r3(h / b) : null, predicted: b ? r3(pr / b) : null, pushes: list.reduce((a, x) => a + x.pushes, 0) }; }
module.exports = { backtest, addDays, wilson, summarize };
