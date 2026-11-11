'use strict';
const assert = require('assert');
const http = require('http');
const WebSocket = require('ws');
const { createApp } = require('../server');
const { memoryStore } = require('../lib/store');
const L = require('../public/layout.js');

const ok = (n) => console.log(`ok - ${n}`);
(async () => {
  const app = createApp(memoryStore(), { SESSION_SECRET: 's', ADMIN_USERNAMES: 'boss' });
  const server = http.createServer(app); app.locals.world.handleUpgrade(server);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const api = async (method, path, body, ck) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', cookie: ck || '' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: await r.json().catch(() => ({})), cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
  };
  async function account(username, role) {
    const s = await api('POST', '/api/signup', { name: username, username, role });
    const l = await api('POST', '/api/login', { username, password: s.json.temporaryPassword });
    return l.cookie;
  }
  const boss = await account('boss', 'CCO'), amy = await account('amy', 'Tester'), bob = await account('bob', 'Web Developer');

  // layout
  const d = L.defaultLayout(); assert.ok(L.validate(d).layout); ok('default layout is valid');
  assert.ok(L.validate({ ...d, floor: d.floor.slice(1) }).error); assert.ok(L.validate({ ...d, objects: [{ type: 'ufo', x: 1, z: 1 }] }).error); ok('bad layouts rejected');
  let r = await api('GET', '/api/layout', null, amy); assert.equal(r.json.layout.w, 40); ok('players read the layout');
  r = await api('PUT', '/api/admin/layout', { layout: d }, amy); assert.equal(r.status, 403); ok('players cannot edit the layout');
  assert.ok(L.defaultLayout().w >= 40); ok('default map is large');
  const small = { v: 1, w: 12, h: 8, floor: Array(8).fill('wwwwwwwwwwww'), objects: [{ id: 'a', type: 'desk', x: 3, z: 3, rot: 1 }] };
  r = await api('PUT', '/api/admin/layout', { layout: small }, boss); assert.equal(r.status, 200);
  r = await api('GET', '/api/layout', null, amy); assert.equal(r.json.layout.w, 12); ok('admin changes map size and floor');
  r = await api('POST', '/api/admin/layout/reset', {}, boss); assert.equal(r.json.layout.w, 40);

  // announcements / logo / bots
  r = await api('PUT', '/api/admin/announcements', { items: [{ title: 'Hello', body: 'World', color: 'pink' }, { title: '', body: 'x' }] }, boss);
  assert.equal(r.json.items.length, 1);
  r = await api('GET', '/api/announcements', null, amy); assert.equal(r.json.items[0].title, 'Hello');
  r = await api('PUT', '/api/admin/announcements', { items: [] }, amy); assert.equal(r.status, 403); ok('announcements');
  r = await api('PUT', '/api/admin/logo', { dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }, boss); assert.equal(r.status, 200);
  r = await api('PUT', '/api/admin/logo', { dataUrl: 'data:text/html;base64,PGI+' }, boss); assert.equal(r.status, 400);
  r = await api('GET', '/api/logo', null, amy); assert.ok(r.json.dataUrl.startsWith('data:image/png')); ok('logo accepts images only');
  r = await api('PUT', '/api/admin/bots', { bots: [{ name: 'Rex', role: 'CEO', costume: 'crown', color: 255, speed: 1.2 }, { name: 'Pip', role: 'Designer', costume: 'cat', color: 65280 }] }, boss);
  assert.equal(r.json.bots.length, 2);
  r = await api('PUT', '/api/admin/bots', { bots: [{ name: 'X', role: 'Wizard', costume: 'cat', color: 1 }] }, boss); assert.equal(r.status, 400); ok('bots');
  { const cur = (await api('GET', '/api/layout', null, boss)).json.layout; r = await api('POST', '/api/admin/layouts', { name: 'My office', layout: cur }, boss); assert.equal(r.json.layouts.filter((x) => x.id !== 'prev').length, 1); r = await api('POST', '/api/admin/layouts', { name: 'my office', layout: cur }, boss); assert.equal(r.json.layouts.filter((x) => x.id !== 'prev').length, 1); r = await api('POST', '/api/admin/layouts', { name: 'x', layout: cur }, bob); assert.equal(r.status, 403); const id = (await api('GET', '/api/admin/layouts', null, boss)).json.layouts.find((x) => x.id !== 'prev').id; r = await api('GET', '/api/admin/layouts/' + id, null, boss); assert.equal(r.json.layout.w, cur.w); r = await api('POST', '/api/admin/layouts/delete', { id }, boss); assert.equal(r.json.layouts.filter((x) => x.id !== 'prev').length, 0); ok('saved layouts'); }
  r = await api('PUT', '/api/admin/bots', { bots: [{ name: 'Rex', role: 'CEO', costume: 'crown', color: 255, post: { x: 10, z: 10, r: 1, seat: true } }, { name: 'Pip', role: 'Designer', costume: 'cat', color: 65280 }] }, boss); assert.deepEqual(r.json.bots[0].post, { x: 10, z: 10, r: 1, seat: true }); assert.equal(r.json.bots[1].post, null); ok('bot post saved');

  // mail and coins
  r = await api('GET', '/api/mail', null, amy); assert.equal(r.json.mail.length, 1); assert.equal(r.json.mail[0].attachment.amount, 100); ok('welcome mail with coins');
  const welcome = r.json.mail[0].id;
  r = await api('POST', '/api/mail/claim', { id: welcome }, amy); assert.equal(r.json.user.coins, 100);
  r = await api('POST', '/api/mail/claim', { id: welcome }, amy); assert.equal(r.status, 409);
  r = await api('GET', '/api/me', null, amy); assert.equal(r.json.user.coins, 100); ok('claim works once');
  const both = await Promise.all([api('POST', '/api/mail/claim', { id: (await api('GET', '/api/mail', null, bob)).json.mail[0].id }, bob), api('POST', '/api/mail/claim', { id: (await api('GET', '/api/mail', null, bob)).json.mail[0].id }, bob)]);
  assert.deepEqual(both.map((x) => x.status).sort(), [200, 409]); r = await api('GET', '/api/me', null, bob); assert.equal(r.json.user.coins, 100); ok('double-click cannot duplicate coins');
  r = await api('POST', '/api/mail/send', { to: 'bob', subject: 'cash', attachment: { type: 'coins', amount: 999 } }, amy); assert.equal(r.status, 403); ok('players cannot send coins');
  r = await api('POST', '/api/mail/send', { to: 'bob', subject: 'hi', body: 'hello' }, amy); assert.equal(r.status, 200);
  r = await api('POST', '/api/mail/send', { to: 'bob', subject: 'Bonus', body: 'nice', fromName: 'Boss Bot', attachment: { type: 'coins', amount: 500 } }, boss); assert.equal(r.status, 200);
  r = await api('POST', '/api/mail/send', { to: 'bob', subject: 'Gift', attachment: { type: 'outfit', item: 'costume:robot' } }, boss);
  r = await api('POST', '/api/mail/send', { to: 'bob', subject: 'bad', attachment: { type: 'coins', amount: -5 } }, boss); assert.equal(r.status, 400);
  let inbox = (await api('GET', '/api/mail', null, bob)).json.mail; const gift = inbox.find((m) => m.subject === 'Gift'), bonus = inbox.find((m) => m.subject === 'Bonus');
  assert.equal(bonus.from, 'Boss Bot'); ok('admin sends coins and outfits, even as a bot');
  r = await api('POST', '/api/avatar', { costume: 'robot', color: 0xff5d5d }, bob); assert.equal(r.status, 200); r = await api('POST', '/api/avatar', { costume: 'cat', color: 0x123456 }, bob); assert.equal(r.status, 403); ok('every catalog outfit is unlocked, unknown colours refused');
  await api('POST', '/api/mail/claim', { id: gift.id }, bob); await api('POST', '/api/mail/claim', { id: bonus.id }, bob);
  r = await api('POST', '/api/avatar', { costume: 'robot', color: 0x7aa2ff }, bob); assert.equal(r.status, 200); r = await api('GET', '/api/me', null, bob); assert.equal(r.json.user.coins, 600); ok('claimed coins arrive');
  r = await api('POST', '/api/mail/delete', { id: (await api('GET', '/api/mail', null, bob)).json.mail.find((m) => m.subject === 'hi').id }, bob); assert.equal(r.status, 200);
  r = await api('POST', '/api/mail/send', { to: '*', subject: 'All hands' }, amy); assert.equal(r.status, 403);
  r = await api('POST', '/api/mail/send', { to: '*', subject: 'All hands', body: 'Hi everyone' }, boss); assert.equal(r.json.sent, 3); ok('mail everyone (admin only)');

  // realtime
  const open = (ck) => new Promise((res, rej) => {
    const ws = new WebSocket(base.replace('http', 'ws') + '/ws', { headers: { cookie: ck, origin: base } });
    const msgs = []; ws.on('message', (m) => msgs.push(JSON.parse(m)));
    ws.on('open', () => res({ ws, msgs })); ws.on('error', rej); ws.on('unexpected-response', (q, s) => rej(new Error('HTTP ' + s.statusCode)));
  });
  const wait = (f, ms = 3000) => new Promise((res, rej) => { const t0 = Date.now(); (function p() { const v = f(); if (v) return res(v); if (Date.now() - t0 > ms) return rej(new Error('timeout')); setTimeout(p, 25); })(); });
  await assert.rejects(open(''), /401/); ok('websocket needs login');
  await assert.rejects(new Promise((res, rej) => { const w = new WebSocket(base.replace('http', 'ws') + '/ws', { headers: { cookie: amy, origin: 'http://evil.example' } }); w.on('open', res); w.on('error', rej); w.on('unexpected-response', (q, s) => rej(new Error('HTTP ' + s.statusCode))); }), /403/); ok('foreign origin refused');

  const A = await open(amy), B = await open(bob);
  const init = await wait(() => A.msgs.find((m) => m.t === 'init')); assert.equal(init.you, 'amy'); assert.equal(init.b.length, 2); ok('init with bots');
  await wait(() => A.msgs.find((m) => m.t === 'join' && m.p.id === 'bob')); ok('others see you join');
  const me0 = init.p.find((p) => p.id === 'amy'), x0 = Math.round((me0.x + 0.5) * 100) / 100;
  A.ws.send(JSON.stringify({ t: 'pose', x: x0, z: me0.z, r: 1, mv: 1 }));
  await wait(() => B.msgs.find((m) => m.t === 'state' && m.p.some((p) => p.id === 'amy' && p.x === x0))); ok('positions sync');
  A.ws.send(JSON.stringify({ t: 'pose', x: 500, z: 500, r: 0 }));
  const nx = Math.round((x0 + 0.3) * 100) / 100;
  A.ws.send(JSON.stringify({ t: 'pose', x: nx, z: me0.z, r: 0 }));
  await wait(() => B.msgs.find((m) => m.t === 'state' && m.p.some((p) => p.id === 'amy' && p.x === nx))); ok('teleport and void ignored');
  const b1 = B.msgs.filter((m) => m.t === 'state').pop().b.map((b) => `${b.x},${b.z}`).join('|');
  await wait(() => { const s = B.msgs.filter((m) => m.t === 'state').pop(); return s && s.b.map((b) => `${b.x},${b.z}`).join('|') !== b1; }); ok('bots roam');
  const bobP = B.msgs.filter((m) => m.t === 'state').pop().p.find((p) => p.id === 'bob');
  A.ws.send(JSON.stringify({ t: 'pose', x: nx, z: me0.z, r: Math.atan2(bobP.x - nx, bobP.z - me0.z) }));
  A.ws.send(JSON.stringify({ t: 'whack' }));
  const wk = await wait(() => B.msgs.find((m) => m.t === 'whack'));
  assert.equal(wk.by, 'amy'); ok('whack message broadcast');
  A.ws.send(JSON.stringify({ t: 'chat', text: '  hello   team ' }));
  const c = await wait(() => B.msgs.find((m) => m.t === 'chat')); assert.equal(c.m.text, 'hello team'); assert.equal(c.m.role, 'Tester'); ok('chat broadcast');
  for (let i = 0; i < 8; i++) A.ws.send(JSON.stringify({ t: 'chat', text: 'spam' + i }));
  await wait(() => A.msgs.find((m) => m.t === 'notice')); ok('chat rate limit');
  A.ws.send(JSON.stringify({ t: 'look', costume: 'crown', color: 255 }));
  A.ws.send(JSON.stringify({ t: 'look', costume: 'cat', color: 0xff7eb6 }));
  await wait(() => B.msgs.find((m) => m.t === 'look' && m.costume === 'cat')); ok('outfit change syncs');
  await api('PUT', '/api/admin/announcements', { items: [{ title: 'x' }] }, boss);
  await wait(() => B.msgs.find((m) => m.t === 'reload')); ok('admin changes tell clients to refresh');
  const wbId = (await api('GET', '/api/layout', null, amy)).json.layout.objects.find((o) => o.type === 'whiteboard').id;
  A.ws.send(JSON.stringify({ t: 'wb', id: wbId, s: { c: '#ff0000', w: 4, p: [[10, 10], [500, 600], [1000, 1000]] } }));
  const ws1 = await wait(() => B.msgs.find((m) => m.t === 'wb')); assert.equal(ws1.s.p.length, 3);
  A.ws.send(JSON.stringify({ t: 'wb', id: wbId, s: { c: 'red', w: 4, p: [[1, 1]] } }));
  A.ws.send(JSON.stringify({ t: 'wb', id: wbId, s: { c: '#00ff00', w: 4, p: [[5000, 1]] } }));
  A.ws.send(JSON.stringify({ t: 'wb', id: 'nope', s: { c: '#00ff00', w: 4, p: [[5, 1]] } }));
  await new Promise((r) => setTimeout(r, 300));
  r = await api('GET', '/api/whiteboards', null, bob); assert.equal(r.json.boards[wbId].length, 1); ok('whiteboard strokes sync, persist and are validated');
  A.ws.send(JSON.stringify({ t: 'wbclear', id: wbId })); await wait(() => B.msgs.find((m) => m.t === 'wbclear'));
  r = await api('GET', '/api/whiteboards', null, bob); assert.equal(r.json.boards[wbId].length, 0); ok('whiteboard clear');
  A.ws.close(); await wait(() => B.msgs.find((m) => m.t === 'leave' && m.id === 'amy')); ok('leave broadcast');
  const A2 = await open(bob); await wait(() => B.ws.readyState === 3); ok('second login replaces the first');
  A2.ws.close(); app.locals.world.close(); server.close(); console.log('all passed');
})().catch((e) => { console.error(e); process.exit(1); });
