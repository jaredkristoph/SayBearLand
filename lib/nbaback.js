'use strict';
/* Backtest for the parlay model, one sport or several mixed together. Replays past days one at a time. Team scoring
   numbers use ONLY games finished before each day (no peeking at the future); odds are the lines ESPN kept for that
   game. Every leg and parlay is graded against the real final score. With several sports, the day's games from all of
   them go into one pool and parlays are built across it, exactly like the "All sports" tab. */
const N = require('./nba.js');
const { gradeLeg } = require('./nbabets.js');
const WARM_DAYS = 21, MIN_GP = 5, MAX_DAYS = 31, MAX_LINE_FETCHES = 400, BUDGET_MS = 70e3;

const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const rng = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
const r3 = (v) => Math.round(v * 1000) / 1000;

function newTally() { return { n: 0, won: 0, lost: 0, push: 0, predSum: 0 }; }
function addTo(t, res, prob) { if (res === 'push') { t.push++; return; } t.n++; t.predSum += prob; if (res === 'won') t.won++; else t.lost++; }
function summarize(t) { return { bets: t.n, hits: t.won, hitRate: t.n ? r3(t.won / t.n) : null, predicted: t.n ? r3(t.predSum / t.n) : null, pushes: t.push }; }

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

  const feed = (k, g) => { // a finished game adds to each team's running scoring totals
    if (g.state !== 'post' || !Number.isFinite(g.homeScore) || !Number.isFinite(g.awayScore)) return;
    [[g.home, g.homeScore, g.awayScore], [g.away, g.awayScore, g.homeScore]].forEach(([t, f, a]) => { const x = S[k].tot[t.id] || (S[k].tot[t.id] = { f: 0, a: 0, gp: 0 }); x.f += f; x.a += a; x.gp++; });
  };
  keys.forEach((k) => warm.forEach((d) => S[k].slates[d].forEach((g) => feed(k, g)))); // days before the range seed the team numbers
  const byGrade = {}, parl = {}, daily = []; let gamesSeen = 0, withLines = 0;
  for (const d of days) {
    const pool = [], byId = {};
    keys.forEach((k) => {
      const st = S[k], stats = {}; Object.keys(st.tot).forEach((id) => { const x = st.tot[id]; if (x.gp >= MIN_GP) stats[id] = { pf: x.f / x.gp, pa: x.a / x.gp }; });
      const finished = st.slates[d].filter((g) => g.state === 'post' && Number.isFinite(g.homeScore) && Number.isFinite(g.awayScore)); st.games += finished.length; gamesSeen += finished.length;
      finished.forEach((g) => { byId[g.id] = g; });
      const rated = finished.filter((g) => g.odds && (g.odds.total || (g.odds.homeML && g.odds.awayML))).map((g) => N.rateGame(g, stats, st.cfg)); st.withLines += rated.length; withLines += rated.length;
      rated.forEach((r) => { r.legs.forEach((l) => { const g = byId[l.gameId], res = gradeLeg({ type: l.type, pick: l.pick, home: g.home.abbr, away: g.away.abbr, line: g.odds.total }, g); if (!res) return; addTo(st.tally[l.type], res, l.prob); addTo(byGrade[l.grade] || (byGrade[l.grade] = newTally()), res, l.prob); }); pool.push(r); });
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
  return { from, to, days: days.length, type: N.TYPES[opt.type] ? opt.type : 'all', sports: keys, mixed: keys.length > 1, games: gamesSeen, gamesWithLines: withLines, lineSources: src, partial: pending > 0, pendingLines: pending,
    legs, bySport, byGrade: Object.keys(byGrade).sort().map((g) => Object.assign({ grade: g }, summarize(byGrade[g]))), parlays, daily,
    notes: [].concat(pending > 0 ? ['Still collecting lines for ' + pending + ' games (limited per run to keep this quick). Run it again in a minute: lines already collected are remembered.'] : [],
      withLines === 0 && gamesSeen ? ['ESPN did not return stored lines for any of these games, so nothing could be graded. Try more recent dates.'] : [],
      opt.type === 'total' ? ['Over/under only: parlays use just the over/under leg of each game. Totals are the hardest bet to beat, so expect hit rates close to the sportsbook price.'] : [],
      keys.length > 1 ? ['Mixed parlays: each day the games of every selected sport go into one pool and parlays are built across it, one leg per game.'] : [],
      ['These are the final (closing) lines, which are sharper than the lines you could bet earlier in the day.', 'Team numbers use only games played before each day. Games with no stored line are skipped.', 'ROI is profit per $1 staked on one ticket per day per parlay type at the stored sportsbook prices.', 'A short sample proves little: a few weeks of parlays can swing far from the long-run result.']) };
}
function mergeSum(list) { const b = list.reduce((a, x) => a + x.bets, 0), h = list.reduce((a, x) => a + x.hits, 0), pr = list.reduce((a, x) => a + (x.predicted || 0) * x.bets, 0); return { bets: b, hits: h, hitRate: b ? r3(h / b) : null, predicted: b ? r3(pr / b) : null, pushes: list.reduce((a, x) => a + x.pushes, 0) }; }
module.exports = { backtest, addDays };
