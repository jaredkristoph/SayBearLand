'use strict';
// Storage adapter. Uses Upstash Redis when credentials exist, otherwise an in-memory
// map so the app runs locally and in tests with no setup. Every key gets KEY_PREFIX.
const PREFIX = process.env.KEY_PREFIX || 'saybearland:';

function memoryStore() {
  const data = new Map();
  const expires = new Map();
  const alive = (k) => {
    const t = expires.get(k);
    if (t && t < Date.now()) { data.delete(k); expires.delete(k); }
    return data.has(k);
  };
  return {
    kind: 'memory',
    async get(k) { return alive(k) ? data.get(k) : null; },
    async set(k, v, opts) {
      if (opts && opts.nx && alive(k)) return null;
      data.set(k, v);
      if (opts && opts.ex) expires.set(k, Date.now() + opts.ex * 1000); else expires.delete(k);
      return 'OK';
    },
    async del(k) { data.delete(k); expires.delete(k); },
    async incr(k) { const n = (alive(k) ? Number(data.get(k)) : 0) + 1; data.set(k, n); return n; },
    async expire(k, s) { expires.set(k, Date.now() + s * 1000); },
    async sadd(k, m) { const s = alive(k) ? data.get(k) : new Set(); s.add(m); data.set(k, s); },
    async smembers(k) { return alive(k) ? [...data.get(k)] : []; },
  };
}

function upstashStore(url, token) {
  const { Redis } = require('@upstash/redis');
  const r = new Redis({ url, token, automaticDeserialization: true });
  return {
    kind: 'upstash',
    get: (k) => r.get(k),
    set: (k, v, o) => r.set(k, v, o ? { ex: o.ex, nx: o.nx } : undefined),
    del: (k) => r.del(k),
    incr: (k) => r.incr(k),
    expire: (k, s) => r.expire(k, s),
    sadd: (k, m) => r.sadd(k, m),
    smembers: (k) => r.smembers(k),
  };
}

function createStore() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const raw = url && token ? upstashStore(url, token) : memoryStore();
  const p = (k) => PREFIX + k;
  return {
    kind: raw.kind,
    get: (k) => raw.get(p(k)),
    set: (k, v, o) => raw.set(p(k), v, o),
    del: (k) => raw.del(p(k)),
    incr: (k) => raw.incr(p(k)),
    expire: (k, s) => raw.expire(p(k), s),
    sadd: (k, m) => raw.sadd(p(k), m),
    smembers: (k) => raw.smembers(p(k)),
  };
}

module.exports = { createStore, memoryStore };
