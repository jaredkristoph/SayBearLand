'use strict';
const assert = require('assert'), http = require('http'), WebSocket = require('ws');
const { createWordly, score } = require('../lib/wordly');
const ok = (m) => console.log('ok - ' + m);
const wait = (f, ms = 3000) => new Promise((res, rej) => { const t0 = Date.now(); const i = setInterval(() => { const v = f(); if (v) { clearInterval(i); res(v); } else if (Date.now() - t0 > ms) { clearInterval(i); rej(new Error('timeout')); } }, 10); });
const W = require('../lib/wordly-words.json');

// scoring, including repeated letters
assert.equal(score('crane', 'crane'), '22222'); assert.equal(score('light', 'wordy'), '00000'); assert.equal(score('rogue', 'wordy'), '12000');
assert.equal(score('speed', 'abide'), '00101'); assert.equal(score('allay', 'legal'), '01120'); assert.equal(score('geese', 'erase'), '01022');
assert.ok(W.answers.length > 2000 && W.answers.every((w) => /^[a-z]{5}$/.test(w)) && W.answers.every((w) => W.valid.includes(w)));
ok('feedback handles repeated letters, word lists are sane');

(async () => {
  const words = ['crane', 'tiger', 'flame', 'ghost']; let n = 0;
  const wl = createWordly({ pick: () => words[n++ % words.length] });
  const srv = http.createServer(); wl.handleUpgrade(srv); await new Promise((r) => srv.listen(0, r));
  const url = 'ws://127.0.0.1:' + srv.address().port + '/wlws';
  const open = () => new Promise((res) => { const ws = new WebSocket(url); const st = { ws, msgs: [], send: (o) => ws.send(JSON.stringify(o)), last: (t) => st.msgs.filter((m) => m.t === t).pop() }; ws.on('message', (d) => st.msgs.push(JSON.parse(d))); ws.on('open', () => res(st)); });
  const A = await open(), B = await open();
  await wait(() => A.last('hello') && B.last('hello'));
  A.send({ t: 'join', code: 'ZZZZ', name: 'x' }); await wait(() => A.last('err')); assert.match(A.last('err').msg, /No room/);
  A.send({ t: 'create', name: 'Ann' }); const r = await wait(() => A.last('room')); assert.equal(r.players.length, 1); assert.match(r.code, /^[A-Z]{4}$/); assert.equal(r.state, 'lobby');
  ok('create a room and get a code');
  B.send({ t: 'join', code: r.code.toLowerCase(), name: 'Bo' });
  await wait(() => A.last('start') && B.last('start'));
  assert.equal(A.last('room').players.length, 2); assert.equal(B.last('room').state, 'play');
  const C = await open(); await wait(() => C.last('hello')); C.send({ t: 'join', code: r.code, name: 'Cy' }); await wait(() => C.last('err')); assert.match(C.last('err').msg, /full/);
  ok('a second player joins by code and the round starts; a third is refused');
  const idA = A.last('hello').you, idB = B.last('hello').you;
  A.send({ t: 'guess', w: 'abc' }); await wait(() => A.last('bad')); assert.equal(A.last('bad').why, 'Not enough letters');
  A.send({ t: 'guess', w: 'qzxqz' }); await wait(() => A.msgs.filter((m) => m.t === 'bad').length === 2); assert.equal(A.last('bad').why, 'Not in word list');
  A.send({ t: 'guess', w: 'stare' });
  const fa = await wait(() => A.last('fb')), fb = await wait(() => B.last('fb'));
  assert.equal(fa.pat, score('stare', 'crane')); assert.equal(fa.word, 'stare');
  assert.equal(fb.pat, fa.pat); assert.equal(fb.id, idA); assert.ok(!('word' in fb), 'the opponent must not see the letters');
  assert.ok(!JSON.stringify(B.msgs).includes('stare'), 'letters never reach the opponent');
  ok('the opponent sees only the colours of a guess, never the letters');
  B.send({ t: 'guess', w: 'crane' });
  const ov = await wait(() => A.last('over')); assert.equal(ov.winner, idB); assert.equal(ov.word, 'crane'); assert.equal(ov.reason, 'solved');
  assert.equal(B.last('room').players.find((p) => p.id === idB).wins, 1);
  A.send({ t: 'guess', w: 'crane' }); await new Promise((x) => setTimeout(x, 100)); assert.equal(A.msgs.filter((m) => m.t === 'fb' && m.id === idA).length, 1, 'no guesses after the round ends');
  ok('first to solve wins and the word is revealed');
  A.send({ t: 'rematch' }); await wait(() => A.last('room').players.find((p) => p.id === idA).rematch);
  assert.equal(B.last('room').players.find((p) => p.id === idA).rematch, true); assert.equal(A.msgs.filter((m) => m.t === 'start').length, 1);
  B.send({ t: 'rematch' }); await wait(() => A.msgs.filter((m) => m.t === 'start').length === 2);
  assert.equal(A.last('room').state, 'play'); assert.equal(A.last('room').round, 2);
  ok('rematch starts a new word once both agree');
  // both run out of tries: a draw
  for (let i = 0; i < 6; i++) { A.send({ t: 'guess', w: 'light' }); B.send({ t: 'guess', w: 'light' }); }
  const dr = await wait(() => A.last('over') && A.last('over').reason === 'out' && A.last('over')); assert.equal(dr.winner, null); assert.equal(dr.word, 'tiger');
  ok('six misses each is a draw');
  B.send({ t: 'rematch' }); A.send({ t: 'rematch' }); await wait(() => A.msgs.filter((m) => m.t === 'start').length === 3);
  B.ws.close(); const lv = await wait(() => A.last('over') && A.last('over').reason === 'left' && A.last('over')); assert.equal(lv.winner, idA);
  assert.equal(A.last('room').players.length, 1);
  ok('leaving mid-round hands the win to the other player');
  A.ws.close(); await wait(() => wl.rooms() === 0); ok('empty rooms are removed');
  wl.close(); srv.close(); console.log('all passed'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
