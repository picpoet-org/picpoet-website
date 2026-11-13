import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// 单进程持久化会话：磁盘只保存会话 ID 的散列与加密载荷，轮询只更新令牌，不续期。
export function createSessionStore({ now, ttlMs, maxSessions, filename = ':memory:' }) {
  let key;
  if (filename === ':memory:') key = randomBytes(32);
  else {
    mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    const keyFile = `${filename}.key`;
    if (existsSync(filename) && !existsSync(keyFile)) throw new Error('请同时恢复会话数据库及对应 .key 文件');
    try { writeFileSync(keyFile, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    chmodSync(keyFile, 0o600);
    key = readFileSync(keyFile);
  }
  if (key.length !== 32) throw new Error('会话存储密钥须为 32 字节');
  // 先限制权限，再打开数据库；SQLite 日志继承数据库的私有权限。
  if (filename !== ':memory:') {
    writeFileSync(filename, '', { flag: 'a', mode: 0o600 });
    chmodSync(filename, 0o600);
  }
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA busy_timeout = 5000;
    PRAGMA secure_delete = ON;
    CREATE TABLE IF NOT EXISTS web_sessions (
      id_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, payload BLOB NOT NULL
    );`);
  const lookup = db.prepare('SELECT expires_at, payload FROM web_sessions WHERE id_hash = ?');
  const insert = db.prepare('INSERT INTO web_sessions (id_hash, expires_at, payload) VALUES (?, ?, ?)');
  const update = db.prepare('UPDATE web_sessions SET expires_at = ?, payload = ? WHERE id_hash = ?');
  const erase = db.prepare('DELETE FROM web_sessions WHERE id_hash = ?');
  const expired = db.prepare('DELETE FROM web_sessions WHERE expires_at <= ?');
  const count = db.prepare('SELECT COUNT(*) AS total FROM web_sessions');
  const sessions = new Map();
  const digest = id => createHash('sha256').update(id).digest('hex');
  function payload(session) {
    const { user, accessToken, refreshToken, accessExpiresAt, refreshExpiresAt, tokenVersion, credential, claimKey } = session;
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(`${digest(session.id)}:${session.expiresAt}`));
    const bytes = cipher.update(JSON.stringify({ user, accessToken, refreshToken, accessExpiresAt, refreshExpiresAt, tokenVersion, credential, claimKey: claimKey.toString('hex') }));
    return Buffer.concat([nonce, bytes, cipher.final(), cipher.getAuthTag()]);
  }
  function restore(id, row) {
    const bytes = Buffer.from(row.payload);
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(`${digest(id)}:${row.expires_at}`));
    decipher.setAuthTag(bytes.subarray(-16));
    const values = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString('utf8'));
    return { ...values, claimKey: Buffer.from(values.claimKey, 'hex'), id, active: true, expiresAt: row.expires_at, refreshPromise: null };
  }
  function remove(id) {
    if (!id) return;
    const session = sessions.get(id);
    if (session) session.active = false;
    erase.run(digest(id));
    sessions.delete(id);
  }
  function sweep() {
    expired.run(now());
    for (const [id, session] of sessions) {
      if (session.expiresAt <= now()) remove(id);
    }
  }
  sweep();
  return {
    sweep,
    get(id) {
      if (!id) return undefined;
      if (!sessions.has(id)) {
        const row = lookup.get(digest(id));
        if (!row) return undefined;
        if (row.expires_at <= now()) { remove(id); return undefined; }
        try { sessions.set(id, restore(id, row)); }
        catch { remove(id); return undefined; }
      }
      const session = sessions.get(id);
      if (session && session.expiresAt <= now()) remove(id);
      return sessions.get(id);
    },
    create(values) {
      sweep();
      if (count.get().total >= maxSessions) return null;
      const id = randomBytes(32).toString('hex');
      const session = { ...values, id, active: true, expiresAt: now() + ttlMs, refreshPromise: null };
      insert.run(digest(id), session.expiresAt, payload(session));
      sessions.set(id, session);
      return session;
    },
    save(session, renew = false) {
      if (!session.active || sessions.get(session.id) !== session || session.expiresAt <= now()) return false;
      const expiresAt = renew ? now() + ttlMs : session.expiresAt;
      const result = update.run(expiresAt, payload({ ...session, expiresAt }), digest(session.id));
      if (result.changes !== 1) return false;
      session.expiresAt = expiresAt;
      return true;
    },
    remove,
    close() {
      for (const session of sessions.values()) session.active = false;
      sessions.clear();
      db.close();
      key.fill(0);
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
