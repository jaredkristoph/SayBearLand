'use strict';
process.env.BJ_SPEED = '30';
const assert = require('assert');
const L = require('../public/layout.js');
const { createBlackjack, total, isBj } = require('../lib/blackjack.js');

const ok = (m) => console.log('ok - ' + m);
const wait = (f, ms = 4000) => new Promise((res, rej) => { const t0 = Date.now(); const i = setInterval(() => { const v = f(); if (v) { clearInterval(i); res(v); } else if (Date.now() - t0 > ms) { clearInterval(i); rej(new Error('timeout')); } }, 10); });

(async () => {
  assert.equal(total([0, 12]), 21); assert.equal(total([0, 0, 8]), 21); assert.equal(total([9, 10, 5]), 26); assert.ok(isBj([0, 9])); assert.ok(!isBj([0, 5, 5]));
  ok('hand totals');

  const lw = L.toWorld({ v: 1, w: 20, h: 14, floor: Array(14).fill('c'.repeat(20)), objects: [{ id: 't1', type: 'blackjack', x: 10, z: 7, rot: 0 }] });
  const tbl = lw.objects[0], seats = L.bjSeats(tbl);
  const bal = { amy: 50, bob: 3, cat: 0 };
  const msgs = [], inbox = {};
  const mk = (id) => ({ ws: { readyState: 1, id }, p: { id, name: id, x: seats[0].x, z: seats[0].z } });
  const players = new Map(['amy', 'bob', 'cat'].map((id) => [id, mk(id)]));
  players.get('bob').p.x = seats[1].x; players.get('bob').p.z = seats[1].z; players.get('cat').p.x = seats[2].x; players.get('cat').p.z = seats[2].z;
  const bj = createBlackjack({
    tables: () => [{ id: 't1', seats, dealer: L.bjDealer(tbl) }], players,
    send: (ws, m) => { (inbox[ws.id] = inbox[ws.id] || []).push(m); }, broadcast: (m) => msgs.push(m),
    addCoins: async (id, n) => { bal[id] = Math.round((bal[id] + n) * 10) / 10; return bal[id]; },
    spendCoins: async (id, n) => { if (bal[id] < n) return null; bal[id] = Math.round((bal[id] - n) * 10) / 10; return bal[id]; },
  });
  const last = () => msgs.filter((m) => m.t === 'bj').pop().s;

  bj.handle(players.get('amy'), { a: 'join', id: 't1', i: 0 }); bj.handle(players.get('bob'), { a: 'join', id: 't1', i: 1 });
  bj.handle(players.get('cat'), { a: 'join', id: 't1', i: 0 });
  assert.equal(last().s[0].id, 'amy'); assert.equal(last().s[0].name, 'amy'); ok('players join, a taken seat is refused');
  bj.handle(players.get('cat'), { a: 'join', id: 't1', i: 2 }); assert.equal(last().s[2].id, 'cat');
  assert.equal(last().ph, 'bet');
  bj.handle(players.get('amy'), { a: 'bet', n: 0.5 }); await new Promise((r) => setTimeout(r, 50)); assert.equal(bal.amy, 50); ok('fractional bets refused');
  bj.handle(players.get('amy'), { a: 'bet', n: 10 }); bj.handle(players.get('bob'), { a: 'bet', n: 10 }); bj.handle(players.get('cat'), { a: 'bet', n: 1 });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(bal.amy, 40); assert.equal(bal.bob, 3); assert.equal(bal.cat, 0); assert.equal(last().s[1].bet, 0); ok('bets are taken from coins; too-high bet refused');
  bj.handle(players.get('bob'), { a: 'bet', n: 3 }); await new Promise((r) => setTimeout(r, 60)); assert.equal(bal.bob, 0);
  await wait(() => last().ph === 'play' || last().ph === 'result'); ok('round deals once everyone has bet');
  const dealt = msgs.filter((m) => m.t === 'bj' && m.s.ph === 'deal').pop().s;
  assert.equal(dealt.d.length, 2); assert.equal(dealt.d[1], -1); assert.equal(dealt.s[0].h.length, 2); ok('dealer hole card is hidden');
  for (let g = 0; g < 40 && last().ph !== 'result'; g++) {
    const s = last();
    if (s.ph === 'play' && s.turn >= 0) bj.handle(players.get(['amy', 'bob', 'cat'][s.turn]), { a: s.s[s.turn].tot < 15 ? 'hit' : 'stand' });
    await new Promise((r) => setTimeout(r, 40));
  }
  const res = await wait(() => { const s = last(); return s.ph === 'result' && s; });
  assert.equal(res.d.length >= 2, true); assert.notEqual(res.d[1], -1);
  await new Promise((r) => setTimeout(r, 60));
  const sum = bal.amy + bal.bob + bal.cat;
  let expect = 50 + 3 + 1 * 0; // total coins before; bets return per result
  res.s.forEach((q) => { if (q) { /* pay is returned in cents of the bet */ } });
  const paid = res.s.filter(Boolean).reduce((n, q) => n + q.pay, 0), bets = res.s.filter(Boolean).reduce((n, q) => n + q.bet, 0);
  assert.ok(Math.abs(sum - (50 + 3 - bets + paid)) < 1e-6, 'coins conserved: ' + sum); ok('settled: winners paid, coins conserved');
  await wait(() => last().ph === 'bet'); assert.equal(last().s[0].bet, 0); ok('table resets for the next hand');
  bj.handle(players.get('amy'), { a: 'bet', n: 5 }); await new Promise((r) => setTimeout(r, 50)); const b0 = bal.amy;
  bj.leave('amy'); await new Promise((r) => setTimeout(r, 50)); assert.equal(bal.amy, b0 + 5); assert.equal(last().s[0], null); ok('leaving before the deal refunds the bet');
  bj.reset();

  // ---- split: a stacked shoe gives the player 8+8, dealer 10+7 ----
  const bal2 = { amy: 50 }, msgs2 = [], ib2 = {};
  const amy2 = { ws: { readyState: 1, id: 'amy' }, p: { id: 'amy', name: 'amy', x: seats[0].x, z: seats[0].z } };
  const order = [7, 9, 20, 6, 2, 12]; // p1, dealer up, p2, dealer hole, split hand 1 card, split hand 2 card
  const bj2 = createBlackjack({
    tables: () => [{ id: 't1', seats, dealer: L.bjDealer(tbl) }], players: new Map([['amy', amy2]]),
    send: (ws, m) => { (ib2[ws.id] = ib2[ws.id] || []).push(m); }, broadcast: (m) => msgs2.push(m),
    addCoins: async (id, n) => { bal2[id] = Math.round((bal2[id] + n) * 10) / 10; return bal2[id]; },
    spendCoins: async (id, n) => { if (bal2[id] < n) return null; bal2[id] = Math.round((bal2[id] - n) * 10) / 10; return bal2[id]; },
    newShoe: () => Array(40).fill(11).concat(order.slice().reverse()),
  });
  const last2 = () => msgs2.filter((m) => m.t === 'bj').pop().s;
  bj2.handle(amy2, { a: 'join', id: 't1', i: 0 }); bj2.handle(amy2, { a: 'bet', n: 10 });
  await wait(() => last2().ph === 'play' && last2().turn === 0);
  assert.deepEqual(last2().s[0].h, [7, 20]); bj2.handle(amy2, { a: 'split' });
  await wait(() => last2().s[0].sp);
  let v = last2().s[0]; assert.deepEqual(v.h, [7, 2]); assert.deepEqual(v.sp.h, [20, 12]); assert.equal(bal2.amy, 30); assert.equal(last2().sub, 0);
  ok('split makes two hands, each with the original bet');
  bj2.handle(amy2, { a: 'stand' }); await wait(() => last2().sub === 1); bj2.handle(amy2, { a: 'stand' });
  const r2 = await wait(() => { const q = last2(); return q.ph === 'result' && q; });
  assert.equal(r2.s[0].res, 'lose'); assert.equal(r2.s[0].sp.res, 'win');
  await new Promise((r) => setTimeout(r, 60)); assert.equal(bal2.amy, 50 - 20 + 20); ok('each split hand is settled on its own (11 loses, 18 beats 17)');
  bj2.reset();
  console.log('all passed');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
