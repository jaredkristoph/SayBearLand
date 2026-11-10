'use strict';
const assert = require('assert');
const { createApp } = require('../server');
const { memoryStore } = require('../lib/store');

(async () => {
  const app = createApp(memoryStore(), { SESSION_SECRET: 'test-secret', ADMIN_USERNAMES: 'boss' });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (method, path, body, ck = cookie) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', cookie: ck }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie');
    if (sc && ck === cookie) cookie = sc.split(';')[0];
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };
  const t = (name, ok) => console.log(`ok - ${name}`);

  let r = await call('POST', '/api/signup', { name: 'Alex', username: 'Alex_1', role: 'Tester' });
  assert.equal(r.status, 201); const pw = r.json.temporaryPassword;
  assert.match(pw, /^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/); t('signup returns random password');

  r = await call('POST', '/api/signup', { name: 'Alex', username: 'alex_1', role: 'Tester' });
  assert.equal(r.status, 409); t('duplicate username rejected');
  r = await call('POST', '/api/signup', { name: 'X', username: 'bad name', role: 'Tester' });
  assert.equal(r.status, 400); t('bad username rejected');
  r = await call('POST', '/api/signup', { name: 'X', username: 'okname', role: 'Hacker' });
  assert.equal(r.status, 400); t('unknown role rejected');
  r = await call('POST', '/api/signup', {}, '');
  assert.equal(r.status, 400);

  r = await call('GET', '/api/me'); assert.equal(r.status, 401); t('me requires login');
  r = await call('POST', '/api/login', { username: 'alex_1', password: 'wrong' }); assert.equal(r.status, 401);
  r = await call('POST', '/api/login', { username: 'alex_1', password: pw });
  assert.equal(r.status, 200); assert.equal(r.json.user.mustChangePassword, true);
  assert.ok(!JSON.stringify(r.json).includes('passwordHash')); t('login works, forces change, hides hash');

  r = await call('GET', '/api/me'); assert.equal(r.status, 200); assert.equal(r.json.user.role, 'Tester');
  r = await call('POST', '/api/change-password', { oldPassword: 'nope', newPassword: 'newpassword1' }); assert.equal(r.status, 401);
  r = await call('POST', '/api/change-password', { oldPassword: pw, newPassword: 'short' }); assert.equal(r.status, 400);
  r = await call('POST', '/api/change-password', { oldPassword: pw, newPassword: 'newpassword1' });
  assert.equal(r.status, 200); assert.equal(r.json.user.mustChangePassword, false); t('password change');
  r = await call('POST', '/api/login', { username: 'alex_1', password: pw }, ''); assert.equal(r.status, 401); t('old password stops working');

  r = await call('POST', '/api/avatar', { costume: 'cat', color: 0xff7eb6 }); assert.equal(r.status, 200);
  r = await call('POST', '/api/avatar', { costume: 'dragon', color: 1 }); assert.equal(r.status, 400); t('avatar saved and validated');

  r = await call('GET', '/api/admin/users'); assert.equal(r.status, 403); t('non-admin blocked');
  const tampered = cookie.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'));
  r = await call('GET', '/api/me', null, tampered); assert.equal(r.status, 401); t('tampered cookie rejected');

  const form = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=a&password=b' });
  assert.equal(form.status, 415); t('non-JSON post rejected (CSRF)');

  // admin flow
  const alexCookie = cookie; cookie = '';
  r = await call('POST', '/api/signup', { name: 'Boss', username: 'boss', role: 'CCO' });
  const bossPw = r.json.temporaryPassword;
  await call('POST', '/api/login', { username: 'boss', password: bossPw });
  r = await call('GET', '/api/admin/users'); assert.equal(r.status, 200); assert.equal(r.json.users.length, 2);
  r = await call('POST', '/api/admin/reset-password', { username: 'alex_1' });
  assert.equal(r.status, 200);
  r = await call('POST', '/api/login', { username: 'alex_1', password: r.json.temporaryPassword }, '');
  assert.equal(r.status, 200); assert.equal(r.json.user.mustChangePassword, true); t('admin lists users and resets password');

  // rate limit
  let last; for (let i = 0; i < 10; i++) last = await call('POST', '/api/login', { username: 'ghost', password: 'x' }, '');
  assert.equal(last.status, 429); t('login rate limit');

  const h = await (await fetch(base + '/healthz')).json(); assert.equal(h.ok, true);
  const page = await fetch(base + '/'); assert.equal(page.status, 200);
  const office = await fetch(base + '/office'); assert.equal(office.status, 200); t('static pages served');
  server.close(); console.log('all passed');
})().catch((e) => { console.error(e); process.exit(1); });
