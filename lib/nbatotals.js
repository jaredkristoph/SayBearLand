'use strict';
/* A player-based formula for NBA over/unders. Instead of the team's scoring average, it builds each team's expected
   points from its players: points per minute x expected minutes, for whoever is actually available, with the 240 team
   minutes shared among them (so when a star is out, his minutes and shots go to teammates instead of vanishing).
   It is graded in the backtest next to the plain team-scoring formula, on the same games. */
const N = require('./nba.js');
const WEIGHT = .5, MODEL_SD = 17, ROTATION = 10, r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;

function inputs(log, beforeISO) { // a player's recent rate and minutes, from games played before beforeISO
  const rows = (log || []).filter((g) => g.date && g.date < beforeISO).slice(0, 10);
  if (rows.length < 4) return null;
  const mins = rows.reduce((a, g) => a + g.MIN, 0), pts = rows.reduce((a, g) => a + g.PTS, 0);
  return mins > 0 ? { ppm: pts / mins, mins: mins / rows.length, games: rows.length } : null;
}
function teamPoints(players) { // players: [{ppm, mins, avail}] -> expected points, or null when the data is too thin
  const rot = players.filter((p) => p && p.avail > 0).sort((a, b) => b.mins * b.avail - a.mins * a.avail).slice(0, ROTATION);
  if (rot.length < 6) return null;
  const tot = rot.reduce((a, p) => a + p.mins * p.avail, 0), f = Math.max(.85, Math.min(1.35, 240 / tot));
  return rot.reduce((a, p) => a + p.ppm * p.mins * p.avail * f, 0);
}
function gameModel(home, away) { const h = teamPoints(home), a = teamPoints(away); return h == null || a == null ? null : { home: r1(h), away: r1(a), total: r1(h + a) }; }

function totalLeg(game, model, line) { // an over/under leg from the player model's total
  const diff = model.total - line, over = diff >= 0, p = N.phi(WEIGHT * Math.abs(diff) / MODEL_SD);
  return { gameId: game.gameId || game.id, sport: 'nba', type: 'total', label: (over ? 'Over ' : 'Under ') + line, pick: over ? 'OVER' : 'UNDER', vs: game.away.abbr + ' @ ' + game.home.abbr, prob: r3(p), odds: -110, edge: r3(p - N.impliedProb(-110)), estimatedOdds: true, source: 'player model ' + model.total + ' vs line ' + line + ' (' + (diff >= 0 ? '+' : '') + r1(diff) + ')', grade: N.grade ? N.grade(p) : (p >= .72 ? 'A' : p >= .62 ? 'B' : p >= .55 ? 'C' : 'D'), diff: r1(diff), model: 'player' };
}
function applyTotals(board, models, want, type) { // swap each game's total leg for the player-model one, then rebuild the parlays
  let used = 0;
  board.games.forEach((g) => { const m = models[g.gameId]; if (!m || !g.odds || !g.odds.total) return; g.legs = g.legs.filter((l) => l.type !== 'total').concat([totalLeg(g, m, g.odds.total)]); g.playerModel = m; used++; });
  board.parlays = N.buildParlays(board.games, want, type); board.playerModel = { games: used };
  if (used < board.games.filter((g) => g.odds && g.odds.total).length) board.notes = (board.notes || []).concat(['Player model: used for ' + used + ' games. The rest fell back to the team formula (not enough player data).']);
  return board;
}
module.exports = { WEIGHT, MODEL_SD, inputs, teamPoints, gameModel, totalLeg, applyTotals };
