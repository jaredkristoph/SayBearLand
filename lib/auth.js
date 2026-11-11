'use strict';
const crypto = require('crypto');

const ROLES = ['Tester', 'CCO', 'Web Developer', 'Application Developer'];
const COSTUMES = ['bear', 'cat', 'duck', 'robot', 'crown', 'none', 'cap', 'tophat', 'wizard', 'cowboy', 'chef', 'party', 'beanie', 'propeller', 'headphones', 'viking', 'halo'];
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const PW_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // no look-alikes

function generatePassword(len = 12) {
  let s = '';
  for (let i = 0; i < len; i++) s += PW_CHARS[crypto.randomInt(PW_CHARS.length)];
  return s.replace(/(.{4})(?=.)/g, '$1-');
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(pw, stored) {
  const [alg, saltHex, hashHex] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function sign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verify(token, secret) {
  if (typeof token !== 'string') return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const good = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

module.exports = { ROLES, COSTUMES, USERNAME_RE, generatePassword, hashPassword, verifyPassword, sign, verify };
