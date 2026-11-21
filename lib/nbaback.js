'use strict';
/* Backtest for the /nba model. Replays past days one at a time. Team scoring numbers use ONLY games finished before
   each day (no peeking at the future); odds are the lines ESPN kept for that game. Then every leg and parlay is graded
   against the real final score. */
const N = require('./nba.js');
const { gradeLeg } = require('./nbabets.js');
const WARM_DAYS = 21, MIN_GP = 5, MAX_DAYS = 31;

const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const rng = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
const r3 = (v) => Math.round(v * 1000) / 1000;

function newTally() { return { n: 0, won: 0, lost: 0, push: 0, predSum: 0 }; }
function addTo(t, res, prob) { if (res === 'push') { t.push++; return; } t.n++; t.predSum += prob; if (res === 'won') t.won++; else t.lost++; }
function summarize(t) { return { bets: t.n, hits: t.won, hitRate: t.n ? r3(t.won / t.n) : null, predicted: t.n ? r3(t.predSum / t.n) : null, pushes: t.push }; }

async function backtest(bot, from, to) {
  if (!N.validDate(from) || !N.validDate(to) || from > to) throw Object.assign(new Error('Pick a valid date range.'), { status: 400 });
  const days = rng(from, to); if (days.length > MAX_DAYS) throw Object.assign(new Error('Pick at most ' + MAX_DAYS + ' days.'), { status: 400 });
  const warm = rng(addDays(from, -WARM_DAYS), addDays(from, -1)), all = warm.concat(days), slates = {};
  for (let i = 0; i < all.length; i += 5) await Promise.all(all.slice(i, i + 5).map(async (d) => { slates[d] = await bot.day(d).catch(() => []); })); // 5 at a time, gentle on ESPN
  const tot = {}; // running team totals
  const feed = (g) => { if (g.state !== 'post' || !Number.isFinite(g.homeScore) || !Number.isFinite(g.awayScore)) return; [[g.home, g.homeScore, g.awayScore], [g.away, g.awayScore, g.homeScore]].forEach(([t, f, a]) => { const x = tot[t.id] || (tot[t.id] = { f: 0, a: 0, gp: 0 }); x.f += f; x.a += a; x.gp++; }); };
  warm.forEach((d) => slates[d].forEach(feed));
  const byType = { ml: newTally(), total: newTally() }, byGrade = {}, parl = {}, daily = []; let gamesSeen = 0, withLines = 0;
  for (const d of days) {
    const stats = {}; Object.keys(tot).forEach((id) => { const x = tot[id]; if (x.gp >= MIN_GP) stats[id] = { pf: x.f / x.gp, pa: x.a / x.gp }; });
    const finished = slates[d].filter((g) => g.state === 'post' && Number.isFinite(g.homeScore)), byId = {}; finished.forEach((g) => { byId[g.id] = g; });
    gamesSeen += finished.length;
    const rated = finished.filter((g) => g.odds && (g.odds.total || (g.odds.homeML && g.odds.awayML))).map((g) => N.rateGame(g, stats)); withLines += rated.length;
    const graded = (l) => { const g = byId[l.gameId], o = g.odds; return gradeLeg({ type: l.type, pick: l.pick, home: g.home.abbr, away: g.away.abbr, line: o.total }, g); };
    rated.forEach((r) => r.legs.forEach((l) => { const res = graded(l); if (!res) return; addTo(byType[l.type], res, l.prob); addTo(byGrade[l.grade] || (byGrade[l.grade] = newTally()), res, l.prob); }));
    const dayRow = { date: d, games: rated.length, parlays: [] };
    N.buildParlays(rated, 3).forEach((p) => {
      const rs = p.legs.map(graded), lost = rs.includes('lost'), won = !lost && rs.includes('won'); if (!lost && !won) return;
      const dec = p.legs.reduce((a, l, i) => a * (rs[i] === 'push' ? 1 : N.toDecimal(l.odds)), 1), profit = won ? dec - 1 : -1;
      const t = parl[p.id] || (parl[p.id] = { n: 0, won: 0, profit: 0, predSum: 0 }); t.n++; t.predSum += p.prob; if (won) t.won++; t.profit += profit;
      dayRow.parlays.push({ id: p.id, legs: p.legs.length, hit: won, profit: r3(profit) });
    });
    daily.push(dayRow); slates[d].forEach(feed); // today's finals feed tomorrow's numbers
  }
  const parlays = Object.keys(parl).map((id) => { const t = parl[id]; return { id, tickets: t.n, hits: t.won, hitRate: r3(t.won / t.n), predicted: r3(t.predSum / t.n), roi: r3(t.profit / t.n) }; });
  return { from, to, days: days.length, games: gamesSeen, gamesWithLines: withLines, legs: { moneyline: summarize(byType.ml), total: summarize(byType.total) },
    byGrade: Object.keys(byGrade).sort().map((g) => Object.assign({ grade: g }, summarize(byGrade[g]))), parlays, daily,
    notes: ['Team numbers use only games played before each day. Lines are the ones ESPN kept for the game; games with no stored line are skipped.', 'ROI is profit per $1 staked on one ticket per day per parlay type at the stored sportsbook prices.', 'A short sample proves little: a few weeks of parlays can swing far from the long-run result.'] };
}
module.exports = { backtest, addDays };
