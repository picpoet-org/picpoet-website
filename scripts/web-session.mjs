import { createHash, randomBytes } from 'node:crypto';

// 固定绝对寿命，不因轮询续期；Map 和限流表均有硬上限。
export function createSessionStore({ now, ttlMs, maxSessions }) {
  const sessions = new Map();
  function remove(id) {
    const session = sessions.get(id);
    if (session) session.active = false;
    sessions.delete(id);
  }
  function sweep() {
    for (const [id, session] of sessions) {
      if (session.expiresAt <= now()) remove(id);
    }
  }
  return {
    sweep,
    get(id) {
      const session = sessions.get(id);
      if (session && session.expiresAt <= now()) remove(id);
      return sessions.get(id);
    },
    create(values) {
      sweep();
      if (sessions.size >= maxSessions) return null;
      const id = randomBytes(32).toString('hex');
      const session = { ...values, id, active: true, expiresAt: now() + ttlMs, refreshPromise: null };
      sessions.set(id, session);
      return session;
    },
    remove,
    clear() {
      for (const id of sessions.keys()) remove(id);
    },
  };
}

export function createRateLimiter({ now, windowMs, maxKeys }) {
  const buckets = new Map();
  function sweep() {
    for (const [key, bucket] of buckets) {
      if (bucket.until <= now()) buckets.delete(key);
    }
  }
  return {
    sweep,
    clear: () => buckets.clear(),
    // 邮箱/IP 仅作为散列索引驻留内存，不记录到日志。
    take(scope, identity, limit) {
      sweep();
      const key = createHash('sha256').update(`${scope}\0${identity}`).digest('hex');
      let bucket = buckets.get(key);
      if (!bucket) {
        if (buckets.size >= maxKeys) return false;
        bucket = { until: now() + windowMs, count: 0 };
        buckets.set(key, bucket);
      }
      return ++bucket.count <= limit;
    },
  };
}
