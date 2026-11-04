import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createWebServer, readConfig } from '../scripts/web-server.mjs';

const ID = '12345678-1234-4234-8234-123456789abc';
const OTHER = '12345678-1234-4234-8234-123456789abd';
const USER = { id: ID, email: 'poet@example.com', emailVerified: true };
const ACCESS = 'access-secret-never-in-browser';
const REFRESH = 'refresh-secret-never-in-browser';
const CREDENTIAL = `picpoet-account-${'ab'.repeat(24)}`;
const loginPayload = (extra = {}) => ({ user: USER, accessToken: ACCESS, refreshToken: REFRESH, expiresIn: 3600, credential: { value: CREDENTIAL }, ...extra });
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Set-Cookie': 'upstream_secret=do-not-forward' }); res.end(JSON.stringify(body)); };
async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`; }
async function close(server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

async function fixture(t, options = {}) {
  const calls = [];
  let handler = options.handler;
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    const call = { method: req.method, url: req.url, headers: req.headers, bytes, body: req.headers['content-type']?.startsWith('application/json') ? JSON.parse(bytes.toString() || '{}') : undefined };
    calls.push(call);
    if (handler && await handler(call, res)) return;
    if (call.url === '/api/v1/picpoet/auth/login') return json(res, 200, loginPayload());
    if (call.url === '/api/v1/picpoet/auth/register') return json(res, 201, { user: USER, otpSent: true });
    if (call.url === '/api/v1/picpoet/auth/verify-email') return json(res, 200, { message: 'email verified' });
    if (call.url === '/api/v1/picpoet/auth/resend-otp') return json(res, 202, { message: 'if eligible, an email will be sent' });
    if (call.url === '/api/v1/picpoet/auth/refresh') return json(res, 200, { accessToken: 'access-new', refreshToken: 'refresh-new', expiresIn: 3600 });
    if (call.url === '/api/v1/picpoet/auth/logout') return json(res, 200, { message: 'logged out' });
    if (call.url === '/api/v1/picpoet/credentials/rotate') return json(res, 200, { value: CREDENTIAL });
    if (call.url === '/api/v1/picpoet/balance') return json(res, 200, { free: { remaining: 3 }, paid: { remaining: 20 } });
    if (call.url === '/api/v1/picpoet/plans') return json(res, 200, [{ id: ID, priceMinor: 100, credits: 10 }]);
    if (call.url === '/api/v1/picpoet/orders' && call.method === 'GET') return json(res, 200, [{ id: ID, status: 'pending' }]);
    if (call.url.startsWith('/api/v1/picpoet/orders')) return json(res, 200, { id: ID, status: 'pending', payment: { paymentUrl: 'https://payments.example/checkout' } });
    if (call.url === '/v1/generations') return json(res, 202, { id: ID, status: 'queued' });
    if (call.url === `/v1/generations/${ID}`) return json(res, 200, { id: ID, status: 'succeeded' });
    if (call.url === `/v1/generations/${ID}/result`) return json(res, 200, { id: ID, poem: ['山月照清泉'], text: '山月照清泉', charged: true });
    json(res, 404, {});
  });
  const upstreamURL = await listen(upstream);
  const dir = await mkdtemp(path.join(tmpdir(), 'picpoet-web-test-'));
  await mkdir(path.join(dir, 'public'));
  await writeFile(path.join(dir, 'public', 'index.html'), '<!doctype html><h1>Picpoet</h1>');
  await writeFile(path.join(dir, 'private.txt'), 'private-data');
  await symlink(path.join(dir, 'private.txt'), path.join(dir, 'public', 'escape.txt'));
  await writeFile(path.join(dir, 'public', 'app.js'), 'console.log("public");');
  await writeFile(path.join(dir, 'public', '.secret.txt'), 'private-data');
  let clock = 1_800_000_000_000;
  const cfg = { ...readConfig({ DASHBOARD_API_URL: `${upstreamURL}/api/v1`, PICPOET_API_URL: upstreamURL }), ...options.config };
  const server = createWebServer({ config: cfg, now: () => clock, publicDirectory: path.join(dir, 'public'), ...(options.fetch ? { fetch: options.fetch } : {}) });
  const base = await listen(server);
  cfg.publicOrigin = base;
  cfg.publicOrigins = [base];
  cfg.publicHosts = [new URL(base).host];
  t.after(async () => { await close(server); await close(upstream); await rm(dir, { recursive: true, force: true }); });
  let cookie = '';
  async function request(url, { method = 'GET', body, headers = {}, authenticated = true, origin = base, raw = false, updateCookie = true } = {}) {
    const response = await fetch(base + url, {
      method, headers: { ...(method !== 'GET' && origin !== null ? { Origin: origin } : {}), ...(authenticated && cookie ? { Cookie: cookie } : {}), ...(body !== undefined && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body), redirect: 'manual',
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie && updateCookie) cookie = setCookie.split(';')[0];
    const text = await response.text();
    return { status: response.status, headers: response.headers, text, data: text && response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : null };
  }
  return { request, calls, cfg, base, server, setHandler: value => { handler = value; }, advance: ms => { clock += ms; }, cookie: () => cookie,
    login: () => request('/web-api/login', { method: 'POST', body: { email: USER.email, password: 'password123' } }) };
}
function upload(imageBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) {
  const boundary = '----PicpoetBoundary42';
  const bytes = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="generationId"\r\n\r\n${ID}\r\n--${boundary}\r\nContent-Disposition: form-data; name="poem"\r\n\r\njueju\r\n--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\n`),
    imageBytes, Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { method: 'POST', body: bytes, raw: true, headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` } };
}
function noSecrets(response) {
  for (const value of [ACCESS, REFRESH, CREDENTIAL, 'upstream_secret']) assert.ok(!`${response.text}\n${JSON.stringify([...response.headers])}`.includes(value));
}

test('历史分页、详情、删除仅用登录业务凭证，保留 JSON 脱敏与精确白名单', async t => {
  const f = await fixture(t, { handler(call, res) {
    if (!call.url.startsWith('/v1/history')) return;
    json(res, 200, call.method === 'DELETE' ? { deleted: true } : { items: [{ id: ID, title: ACCESS, credential: CREDENTIAL }], nextCursor: 'abc.def', password: REFRESH });
    return true;
  } });
  for (const [url, method] of [['/history', 'GET'], [`/history/${ID}`, 'GET'], [`/history/${ID}/image`, 'GET'], [`/history/${ID}`, 'DELETE']]) {
    assert.equal((await f.request(`/web-api${url}`, { method })).status, 401);
  }
  assert.equal(f.calls.length, 0);
  await f.login();
  const page = await f.request('/web-api/history?limit=20&cursor=abc.def', { headers: { Authorization: 'Bearer forged', 'X-Service-Token': 'forged' } });
  assert.equal(page.status, 200); noSecrets(page);
  assert.equal(f.calls.at(-1).url, '/v1/history?limit=20&cursor=abc.def');
  assert.equal(f.calls.at(-1).headers.authorization, `Bearer ${CREDENTIAL}`);
  assert.equal(f.calls.at(-1).headers.cookie, undefined);
  assert.equal(f.calls.at(-1).headers['x-service-token'], undefined);
  noSecrets(await f.request(`/web-api/history/${ID}`));
  assert.deepEqual((await f.request(`/web-api/history/${ID}`, { method: 'DELETE' })).data, { deleted: true });
  assert.equal(f.calls.at(-1).method, 'DELETE'); assert.equal(f.calls.at(-1).bytes.length, 0);
  const count = f.calls.length;
  for (const query of ['limit=0', 'limit=101', 'limit=-1', 'limit=1.5', 'limit=1&limit=2', 'cursor=a.b&cursor=c.d', 'cursor=' + 'a'.repeat(513), 'cursor=%ZZ', 'cursor=a%0Ab', 'limit=1&cursor=a.b&url=evil', 'url=evil']) {
    assert.equal((await f.request(`/web-api/history?${query}`)).status, 400, query);
  }
  for (const url of [`/history/${ID}?limit=1`, `/history/${ID}/image?cursor=a.b`, '/balance?limit=20', '/plans?']) assert.equal((await f.request('/web-api' + url)).status, 400);
  assert.equal((await f.request(`/web-api/history/${ID}`, { method: 'DELETE', body: { subjectId: OTHER } })).status, 400);
  assert.equal((await f.request(`/web-api/history/${ID}`, { method: 'DELETE', origin: 'https://evil.example' })).status, 403);
  assert.equal((await f.request('/web-api/history', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  for (const [url, method] of [['/history', 'DELETE'], ['/history', 'POST'], [`/history/${ID}/image`, 'DELETE'], [`/history/${ID}/other`, 'GET'], ['/history/not-uuid', 'GET'], [`/history/${ID}/`, 'GET']]) assert.equal((await f.request('/web-api' + url, { method })).status, 404);
  assert.equal(f.calls.length, count);
});

test('历史 JPEG 二进制独立上限、无重定向、超时与隐私头隔离', async t => {
  let mode = 'ok';
  const f = await fixture(t, { config: { historyImageTimeoutMs: 50 }, handler(call, res) {
    if (!call.url.endsWith('/image')) return;
    if (mode === 'timeout') return true;
    if (mode === 'redirect') { res.writeHead(302, { Location: '/secret-target' }); res.end(); return true; }
    if (mode === '404' || mode === '503') { json(res, Number(mode), { message: CREDENTIAL }); return true; }
    if (mode === 'declared-large') { res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': 2 * 1024 * 1024 + 1 }); res.end(); return true; }
    res.writeHead(200, { 'Content-Type': mode === 'mime' ? 'image/png' : 'image/jpeg', 'Set-Cookie': 'upstream_secret=yes', Authorization: ACCESS, ETag: REFRESH, 'Content-Disposition': `attachment; filename="${CREDENTIAL}"` });
    res.write(Buffer.from(mode === 'fake-jpeg' ? [0x3c, 0x68, 0x31] : [0xff, 0xd8, 0xff]));
    res.end(Buffer.alloc((mode === 'large' ? 2 * 1024 * 1024 + 1 : mode === 'boundary' ? 2 * 1024 * 1024 : 8) - 3)); return true;
  } });
  await f.login();
  for (const [value, expected] of [['ok', 200], ['boundary', 200], ['redirect', 502], ['mime', 502], ['fake-jpeg', 502], ['large', 502], ['declared-large', 502], ['timeout', 504], ['404', 404], ['503', 503]]) {
    mode = value;
    const response = await f.request(`/web-api/history/${ID}/image`);
    assert.equal(response.status, expected, value); noSecrets(response);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    for (const header of ['etag', 'authorization', 'content-disposition', 'set-cookie']) assert.equal(response.headers.get(header), null);
    if (expected === 200) assert.equal(response.headers.get('content-type'), 'image/jpeg');
  }
  assert.ok(!f.calls.some(call => call.url === '/secret-target'));
  assert.ok(f.calls.filter(call => call.url.endsWith('/image')).every(call => call.headers.authorization === `Bearer ${CREDENTIAL}` && call.headers.cookie === undefined));
});

test('历史在途图片退出后不可返回旧账户内容', async t => {
  let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, { async handler(call, res) {
    if (call.url.endsWith('/image')) { entered(); await gate; res.writeHead(200, { 'Content-Type': 'image/jpeg' }); res.end(Buffer.from([0xff, 0xd8, 0xff])); return true; }
  } });
  await f.login();
  const pending = f.request(`/web-api/history/${ID}/image`, { updateCookie: false });
  await ready; await f.request('/web-api/logout', { method: 'POST' }); release();
  assert.equal((await pending).status, 401);
});

test('配置默认 loopback、URL 无凭据、生产 HTTPS，导入不启动监听', () => {
  const cfg = readConfig({});
  assert.equal(cfg.host, '127.0.0.1');
  assert.equal(cfg.port, 18090);
  assert.equal(cfg.publicOrigin, 'http://127.0.0.1:18090');
  assert.deepEqual(cfg.publicOrigins, ['http://127.0.0.1:18090']);
  assert.deepEqual(cfg.publicHosts, ['127.0.0.1:18090']);
  assert.equal(cfg.dashboardApiUrl, 'http://127.0.0.1:8080/api/v1');
  assert.equal(cfg.picpoetApiUrl, 'http://127.0.0.1:8081/v1');
  assert.equal(readConfig({ PICPOET_API_URL: 'http://127.0.0.1:9000' }).picpoetApiUrl, 'http://127.0.0.1:9000/v1');
  const multi = readConfig({
    WEB_PUBLIC_ORIGINS: 'http://127.0.0.1:18090, http://192.168.31.7:18090, http://127.0.0.1:18090',
  });
  assert.deepEqual(multi.publicOrigins, ['http://127.0.0.1:18090', 'http://192.168.31.7:18090']);
  assert.deepEqual(multi.publicHosts, ['127.0.0.1:18090', '192.168.31.7:18090']);
  assert.equal(multi.secureCookie, false);
  for (const env of [
    { NODE_ENV: 'production' }, { WEB_PUBLIC_ORIGIN: 'https://site.example/path' },
    { WEB_PUBLIC_ORIGINS: 'https://site.example, http://127.0.0.1:18090', NODE_ENV: 'production' },
    { DASHBOARD_API_URL: 'http://user:secret@localhost/api/v1' }, { PICPOET_API_URL: 'file:///tmp/api' },
    { DASHBOARD_API_URL: 'http://localhost' }, { PICPOET_API_URL: 'http://localhost/v1?secret=a' },
    { WEB_PUBLIC_ORIGIN: 'http://user:password@localhost' }, { WEB_PORT: '0' }, { WEB_MAX_IMAGE_BYTES: '-1' },
  ]) assert.throws(() => readConfig(env));
  assert.equal(readConfig({ NODE_ENV: 'production', WEB_PUBLIC_ORIGIN: 'https://site.example' }).secureCookie, true);
  const server = createWebServer({ config: cfg });
  assert.equal(server.listening, false);
  server.emit('close');
});

test('注册/OTP → 登录 → 余额 → 原样 multipart 生成 → 购买 → 退出完整契约', async t => {
  const f = await fixture(t);
  assert.deepEqual((await f.request('/web-api/session')).data, { authenticated: false });
  assert.equal((await f.request('/web-api/plans')).status, 200);
  assert.equal(f.calls.at(-1).headers.authorization, undefined);
  const register = await f.request('/web-api/register', { method: 'POST', body: { email: USER.email, password: 'password123', invitationCode: 'invite' } });
  assert.equal(register.status, 201);
  assert.deepEqual(register.data, { user: USER, otpSent: true });
  assert.equal((await f.request('/web-api/verify-email', { method: 'POST', body: { email: USER.email, otp: '123456' } })).status, 200);
  assert.equal((await f.request('/web-api/resend-otp', { method: 'POST', body: { email: USER.email, purpose: 'register' } })).status, 202);
  const login = await f.login();
  assert.deepEqual(login.data, { user: USER });
  assert.match(login.headers.get('set-cookie'), /^picpoet_web_session=[a-f0-9]{64}; HttpOnly; SameSite=Strict; Path=\/; Max-Age=1800$/);
  assert.equal(login.headers.get('cache-control'), 'no-store');
  noSecrets(login);
  assert.deepEqual((await f.request('/web-api/session')).data, { authenticated: true, user: USER });
  const balance = await f.request('/web-api/balance', { headers: { Authorization: 'Bearer browser-forged', 'X-Service-Token': 'browser-forged' } });
  assert.equal(balance.data.paid.remaining, 20);
  assert.equal(f.calls.at(-1).headers.authorization, `Bearer ${ACCESS}`);
  assert.equal(f.calls.at(-1).headers['x-service-token'], undefined);
  assert.equal(f.calls.at(-1).headers.cookie, undefined);
  const form = upload();
  assert.equal((await f.request('/web-api/generations', form)).status, 202);
  assert.deepEqual(f.calls.at(-1).bytes, form.body);
  assert.equal(f.calls.at(-1).headers['content-type'], form.headers['Content-Type']);
  assert.equal(f.calls.at(-1).headers.authorization, `Bearer ${CREDENTIAL}`);
  assert.equal((await f.request(`/web-api/generations/${ID}`)).data.status, 'succeeded');
  assert.deepEqual((await f.request(`/web-api/generations/${ID}/result`)).data.poem, ['山月照清泉']);
  const orderBody = { planId: ID, requestId: OTHER, payMethod: 'alipay_qrcode' };
  const order = await f.request('/web-api/orders', { method: 'POST', body: orderBody });
  assert.equal(order.data.payment.paymentUrl, 'https://payments.example/checkout');
  noSecrets(order);
  const claim = f.calls.at(-1).body.claimToken;
  assert.equal(f.calls.at(-1).body.payMethod, 'alipay_qrcode');
  assert.match(claim, /^[a-f0-9]{64}$/);
  assert.equal(f.calls.at(-1).body.deliveryMode, 'auto_redeem');
  assert.equal(f.calls.at(-1).headers.authorization, `Bearer ${ACCESS}`);
  await f.request('/web-api/orders', { method: 'POST', body: orderBody });
  assert.equal(f.calls.at(-1).body.claimToken, claim);
  assert.equal((await f.request('/web-api/orders')).status, 200);
  for (const suffix of ['details', 'payment']) {
    assert.equal((await f.request(`/web-api/orders/${ID}/${suffix}`, { method: 'POST' })).status, 200);
    assert.deepEqual(f.calls.at(-1).body, {});
    assert.equal(f.calls.at(-1).headers.authorization, `Bearer ${ACCESS}`);
  }
  const priorCookie = f.cookie();
  assert.equal((await f.request('/web-api/logout', { method: 'POST' })).status, 200);
  assert.deepEqual(f.calls.at(-1).body, { refreshToken: REFRESH });
  assert.equal(f.calls.at(-1).headers.authorization, undefined);
  assert.deepEqual((await f.request('/web-api/session', { headers: { Cookie: priorCookie } })).data, { authenticated: false });
  assert.equal((await f.request('/web-api/balance')).status, 401);
  assert.deepEqual(f.calls.map(call => `${call.method} ${call.url}`), [
    'GET /api/v1/picpoet/plans', 'POST /api/v1/picpoet/auth/register', 'POST /api/v1/picpoet/auth/verify-email', 'POST /api/v1/picpoet/auth/resend-otp',
    'POST /api/v1/picpoet/auth/login', 'GET /api/v1/picpoet/balance', 'POST /v1/generations', `GET /v1/generations/${ID}`, `GET /v1/generations/${ID}/result`,
    'POST /api/v1/picpoet/orders', 'POST /api/v1/picpoet/orders', 'GET /api/v1/picpoet/orders', `POST /api/v1/picpoet/orders/${ID}/details`, `POST /api/v1/picpoet/orders/${ID}/payment`, 'POST /api/v1/picpoet/auth/logout',
  ]);
});

test('已有客户端凭证时仅新增网页版凭证，cookie 每次登录重新随机化', async t => {
  const f = await fixture(t, { config: { secureCookie: true }, handler(call, res) {
    if (call.url.endsWith('/auth/login')) { json(res, 200, loginPayload({ credential: { created: false, prefix: 'picpoet-account-' }, user: { ...USER, passwordHash: 'hidden' } })); return true; }
  } });
  const first = await f.login();
  assert.match(first.headers.get('set-cookie'), /; Secure$/);
  assert.equal(first.headers.get('strict-transport-security'), 'max-age=31536000');
  assert.deepEqual(first.data, { user: USER });
  const rotate = f.calls.find(call => call.url.endsWith('/credentials/rotate'));
  assert.equal(rotate.method, 'POST');
  assert.deepEqual(rotate.body, { revokeOthers: false });
  assert.equal(rotate.headers.authorization, `Bearer ${ACCESS}`);
  const old = f.cookie();
  await f.login();
  assert.notEqual(f.cookie(), old);
  assert.equal((await f.request('/web-api/session', { headers: { Cookie: old } })).data.authenticated, false);
});

test('JWT 过期时并发请求仅一次 refresh，业务凭证生成不使用 JWT', async t => {
  const f = await fixture(t, { handler(call, res) {
    if (call.url.endsWith('/auth/login')) { json(res, 200, loginPayload({ expiresIn: 1 })); return true; }
  } });
  await f.login();
  const replies = await Promise.all(Array.from({ length: 8 }, () => f.request('/web-api/balance')));
  assert.ok(replies.every(reply => reply.status === 200));
  assert.equal(f.calls.filter(call => call.url.endsWith('/auth/refresh')).length, 1);
  assert.ok(f.calls.filter(call => call.url.endsWith('/balance')).every(call => call.headers.authorization === 'Bearer access-new'));
  await f.request('/web-api/generations', upload());
  assert.equal(f.calls.at(-1).headers.authorization, `Bearer ${CREDENTIAL}`);
  await f.request('/web-api/logout', { method: 'POST' });
  assert.deepEqual(f.calls.at(-1).body, { refreshToken: 'refresh-new' });
});

test('旧 JWT 多个 401 仅刷新一次，各请求最多重试一次', async t => {
  const f = await fixture(t, { handler(call, res) {
    if (call.url.endsWith('/balance') && call.headers.authorization === `Bearer ${ACCESS}`) { json(res, 401, { message: ACCESS }); return true; }
  } });
  await f.login();
  const replies = await Promise.all(Array.from({ length: 6 }, () => f.request('/web-api/balance')));
  assert.ok(replies.every(reply => reply.status === 200));
  assert.equal(f.calls.filter(call => call.url.endsWith('/auth/refresh')).length, 1);
  assert.ok(f.calls.filter(call => call.url.endsWith('/balance')).length <= 12);
});

test('refresh 失败清除服务端 session 与 cookie；不重试生成操作', async t => {
  const f = await fixture(t, { handler(call, res) {
    if (call.url.endsWith('/balance') || call.url.endsWith('/auth/refresh')) { json(res, 401, { accessToken: ACCESS, message: REFRESH }); return true; }
  } });
  await f.login();
  const old = f.cookie();
  const response = await f.request('/web-api/balance');
  assert.equal(response.status, 401);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  noSecrets(response);
  assert.equal((await f.request('/web-api/session', { headers: { Cookie: old } })).data.authenticated, false);
  const count = f.calls.length;
  assert.equal((await f.request('/web-api/generations', upload())).status, 401);
  assert.equal(f.calls.length, count);
});

test('同秒签出相同 JWT 的刷新仍串行化，迟到的旧 401 不触发第二次刷新', async t => {
  let refreshDone;
  const refreshed = new Promise(resolve => { refreshDone = resolve; });
  let initialCalls = 0;
  let refreshCount = 0;
  const f = await fixture(t, { async handler(call, res) {
    if (call.url.endsWith('/balance')) {
      initialCalls++;
      if (initialCalls === 1) { json(res, 401, {}); return true; }
      if (initialCalls === 2) { await refreshed; json(res, 401, {}); return true; }
    }
    if (call.url.endsWith('/auth/refresh')) {
      refreshCount++;
      json(res, 200, { accessToken: ACCESS, refreshToken: 'refresh-new', expiresIn: 3600 });
      refreshDone();
      return true;
    }
  } });
  await f.login();
  const responses = await Promise.all([f.request('/web-api/balance'), f.request('/web-api/balance')]);
  assert.ok(responses.every(response => response.status === 200));
  assert.equal(refreshCount, 1);
});

test('refresh 后 JWT 仍被拒绝与业务凭证失效均注销会话', async t => {
  const f = await fixture(t, { handler(call, res) {
    if (call.url.endsWith('/balance')) { json(res, 401, {}); return true; }
  } });
  await f.login();
  assert.equal((await f.request('/web-api/balance')).status, 401);
  assert.equal(f.calls.filter(call => call.url.endsWith('/auth/refresh')).length, 1);
  assert.equal(f.calls.filter(call => call.url.endsWith('/balance')).length, 2);
  assert.equal((await f.request('/web-api/session')).data.authenticated, false);
  await f.login();
  f.setHandler((call, res) => { if (call.url === '/v1/generations') { json(res, 401, {}); return true; } });
  assert.equal((await f.request('/web-api/generations', upload())).status, 401);
  assert.equal((await f.request('/web-api/session')).data.authenticated, false);
  assert.equal(f.calls.filter(call => call.url.endsWith('/auth/refresh')).length, 1);
});

test('rotate 失败不创建 session，并尽力退出已签发的账户登录', async t => {
  const f = await fixture(t, { handler(call, res) {
    if (call.url.endsWith('/auth/login')) { json(res, 200, loginPayload({ credential: { prefix: 'picpoet-account-' } })); return true; }
    if (call.url.endsWith('/credentials/rotate')) { json(res, 503, { message: CREDENTIAL }); return true; }
  } });
  const login = await f.login();
  assert.equal(login.status, 503);
  noSecrets(login);
  assert.equal(login.headers.get('set-cookie'), null);
  assert.equal((await f.request('/web-api/session')).data.authenticated, false);
  assert.equal(f.calls.at(-1).url, '/api/v1/picpoet/auth/logout');
  assert.deepEqual(f.calls.at(-1).body, { refreshToken: REFRESH });
});

test('logout 与在途 refresh 竞争不会复活会话，并撤销最新 refresh', async t => {
  let release;
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, { async handler(call, res) {
    if (call.url.endsWith('/balance') && call.headers.authorization === `Bearer ${ACCESS}`) { json(res, 401, {}); return true; }
    if (call.url.endsWith('/auth/refresh')) { entered(); await gate; json(res, 200, { accessToken: 'access-new', refreshToken: 'refresh-new', expiresIn: 3600 }); return true; }
  } });
  await f.login();
  const old = f.cookie();
  const balance = f.request('/web-api/balance', { updateCookie: false });
  await ready;
  // 请求退出后用 session 查询作为屏障，确认本地会话已移除再释放刷新响应。
  const logout = f.request('/web-api/logout', { method: 'POST', updateCookie: false });
  let removed = false;
  for (let i = 0; i < 20; i++) {
    if (!(await f.request('/web-api/session', { updateCookie: false })).data.authenticated) { removed = true; break; }
  }
  release();
  assert.equal(removed, true);
  assert.equal((await balance).status, 401);
  assert.equal((await logout).status, 200);
  assert.deepEqual(f.calls.at(-1).body, { refreshToken: 'refresh-new' });
  assert.equal((await f.request('/web-api/session', { headers: { Cookie: old } })).data.authenticated, false);
});

test('Origin/Host、方法、路径白名单与未登录保护，攻击不触达上游', async t => {
  const f = await fixture(t);
  for (const url of ['/web-api/balance', '/web-api/orders', `/web-api/generations/${ID}`, `/web-api/generations/${ID}/result`]) assert.equal((await f.request(url)).status, 401);
  for (const url of ['/web-api/orders', '/web-api/generations', `/web-api/orders/${ID}/details`, `/web-api/orders/${ID}/payment`]) assert.equal((await f.request(url, { method: 'POST' })).status, 401);
  for (const origin of [null, 'null', 'https://evil.example', `${f.base}.evil.example`]) assert.equal((await f.request('/web-api/login', { method: 'POST', origin })).status, 403);
  assert.equal((await f.request('/web-api/plans', { headers: { Origin: 'https://evil.example' } })).status, 403);
  // Node fetch 会重写 Host；使用原始 HTTP 客户端验证 DNS rebinding 边界。
  assert.equal((await rawRequest(f.base, '/web-api/plans', { headers: { Host: 'evil.example' } })).status, 403);
  assert.equal((await f.request('/web-api/session', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  for (const [method, url] of [['GET', '/web-api/login'], ['GET', `/web-api/orders/${ID}/payment`], ['POST', '/web-api/plans'], ['POST', '/web-api/refresh'], ['POST', '/web-api/credentials/rotate'], ['GET', '/web-api/generations/not-a-uuid'], ['DELETE', `/web-api/generations/${ID}`], ['OPTIONS', '/web-api/login']]) {
    const response = await f.request(url, { method });
    assert.equal(response.status, 404, `${method} ${url}`);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  assert.equal((await f.request('/web-api/plans?url=https://evil.example')).status, 400);
  assert.equal(f.calls.length, 0);
});

test('WEB_PUBLIC_ORIGINS 同时接受本机与局域网 Host/Origin', async t => {
  const origins = ['http://127.0.0.1:18090', 'http://192.168.31.7:18090'];
  const f = await fixture(t);
  // 夹具默认把 Origin 绑到随机监听口；此处恢复联调多 Origin 白名单。
  f.cfg.publicOrigin = origins[0];
  f.cfg.publicOrigins = origins;
  f.cfg.publicHosts = origins.map(origin => new URL(origin).host);
  for (const origin of origins) {
    const host = new URL(origin).host;
    assert.equal((await rawRequest(f.base, '/web-api/plans', { headers: { Host: host } })).status, 200);
    assert.equal((await rawRequest(f.base, '/web-api/login', {
      method: 'POST',
      headers: { Host: host, Origin: origin, 'Content-Type': 'application/json' },
      chunks: [Buffer.from(JSON.stringify({ email: USER.email, password: 'password123' }))],
    })).status, 200);
  }
  assert.equal((await rawRequest(f.base, '/web-api/plans', { headers: { Host: 'evil.example' } })).status, 403);
  assert.equal((await rawRequest(f.base, '/web-api/login', {
    method: 'POST',
    headers: { Host: '127.0.0.1:18090', Origin: 'https://evil.example', 'Content-Type': 'application/json' },
    chunks: [Buffer.from(JSON.stringify({ email: USER.email, password: 'password123' }))],
  })).status, 403);
});

test('body 与图片独立大小限制、multipart boundary 和字段校验', async t => {
  const f = await fixture(t, { config: { jsonBytes: 512, imageBytes: 16 } });
  await f.login();
  const count = f.calls.length;
  assert.equal((await f.request('/web-api/login', { method: 'POST', body: { email: USER.email, password: 'x'.repeat(600) } })).status, 413);
  assert.equal((await f.request('/web-api/login', { method: 'POST', body: '{bad json', raw: true, headers: { 'Content-Type': 'application/json' } })).status, 400);
  assert.equal((await f.request('/web-api/login', { method: 'POST', body: 'hello', raw: true, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await f.request('/web-api/login', { method: 'POST', body: {}, headers: { 'Content-Encoding': 'gzip' } })).status, 415);
  assert.equal((await f.request('/web-api/generations', upload(Buffer.alloc(17)))).status, 413);
  const missingBoundary = upload(); missingBoundary.headers['Content-Type'] = 'multipart/form-data';
  assert.equal((await f.request('/web-api/generations', missingBoundary)).status, 415);
  const mismatch = upload(); mismatch.headers['Content-Type'] = 'multipart/form-data; boundary=wrong';
  assert.equal((await f.request('/web-api/generations', mismatch)).status, 400);
  const forbidden = upload(); forbidden.body = Buffer.from(forbidden.body.toString('latin1').replace('name="poem"', 'name="apiKey"'), 'latin1');
  assert.equal((await f.request('/web-api/generations', forbidden)).status, 400);
  assert.equal((await f.request(`/web-api/orders/${ID}/details`, { method: 'POST', body: { claimToken: 'a'.repeat(64) } })).status, 400);
  assert.equal((await f.request('/web-api/orders', { method: 'POST', body: { planId: ID, requestId: OTHER, payMethod: 'alipay_page', deliveryMode: 'code_only' } })).status, 400);
  assert.equal(f.calls.length, count);
});

test('固定 TTL、Map 容量和 IP/账户限速均有界', async t => {
  const f = await fixture(t, { config: { sessionTtlMs: 1000, maxSessions: 1, loginLimit: 2, accountLimit: 1, rateWindowMs: 2000 } });
  await f.login();
  const old = f.cookie();
  assert.equal((await f.login()).status, 503);
  assert.equal((await f.login()).status, 429);
  assert.equal((await f.request('/web-api/register', { method: 'POST', body: { email: USER.email, password: 'password123' } })).status, 201);
  assert.equal((await f.request('/web-api/resend-otp', { method: 'POST', body: { email: USER.email, purpose: 'register' } })).status, 429);
  f.advance(1001);
  assert.equal((await f.request('/web-api/session', { headers: { Cookie: old } })).data.authenticated, false);
  f.advance(1000);
  assert.equal((await f.login()).status, 200);
});

test('上游错误、重定向和敏感内容不透传；失败 logout 仍清本地会话', async t => {
  const f = await fixture(t);
  await f.login();
  for (const status of [400, 403, 409, 429, 500, 503]) {
    f.setHandler((call, res) => { if (call.url.endsWith('/balance')) { json(res, status, { message: `${ACCESS} ${REFRESH}`, credential: CREDENTIAL }); return true; } });
    const response = await f.request('/web-api/balance');
    assert.equal(response.status, status);
    noSecrets(response);
  }
  f.setHandler((call, res) => { if (call.url.endsWith('/balance')) { res.writeHead(302, { Location: '/api/v1/picpoet/auth/login' }); res.end(); return true; } });
  assert.equal((await f.request('/web-api/balance')).status, 502);
  assert.equal(f.calls.at(-1).url, '/api/v1/picpoet/balance');
  f.setHandler((call, res) => { if (call.url.endsWith('/balance')) { json(res, 200, { free: { remaining: 2 }, accessToken: ACCESS, nested: { credential: CREDENTIAL, message: REFRESH } }); return true; } });
  noSecrets(await f.request('/web-api/balance'));
  f.setHandler((call, res) => { if (call.url.endsWith('/auth/logout')) { json(res, 503, {}); return true; } });
  const old = f.cookie();
  const logout = await f.request('/web-api/logout', { method: 'POST' });
  assert.equal(logout.status, 503);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await f.request('/web-api/session', { headers: { Cookie: old } })).data.authenticated, false);
});

test('上游超时、非 JSON 和超大响应映射安全失败', async t => {
  const f = await fixture(t, { config: { upstreamTimeoutMs: 40, responseBytes: 128 }, handler(call, res) {
    if (call.url.endsWith('/plans')) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('['); return true; }
  } });
  assert.equal((await f.request('/web-api/plans')).status, 504);
  f.setHandler((call, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<h1>private error</h1>'); return true; });
  assert.equal((await f.request('/web-api/plans')).status, 502);
  f.setHandler((call, res) => { json(res, 200, { content: 'a'.repeat(200) }); return true; });
  assert.equal((await f.request('/web-api/plans')).status, 502);
});

function rawRequest(base, url, { method = 'GET', headers = {}, chunks = [], end = true } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(base + '/', { method, path: url, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => { req.destroy(); resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }); });
    });
    req.on('error', reject);
    for (const chunk of chunks) req.write(chunk);
    if (end) req.end(); else req.flushHeaders();
  });
}

test('慢请求与 chunked 上传限制不依赖 Content-Length', async t => {
  const f = await fixture(t, { config: { bodyTimeoutMs: 80, jsonBytes: 128 } });
  const headers = { Origin: f.base, 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' };
  const slow = await rawRequest(f.base, '/web-api/login', { method: 'POST', headers, chunks: ['{'], end: false });
  assert.equal(slow.status, 408);
  const huge = await rawRequest(f.base, '/web-api/login', { method: 'POST', headers, chunks: ['x'.repeat(129)] });
  assert.equal(huge.status, 413);
  assert.equal(f.calls.length, 0);
});

test('静态目录只读 public，阻断编码 traversal / dotfile / 符号链接逃逸，CSP 支持自有资源', async t => {
  const f = await fixture(t);
  const page = await f.request('/');
  assert.equal(page.status, 200);
  assert.match(page.text, /Picpoet/);
  const csp = page.headers.get('content-security-policy');
  for (const directive of ["script-src 'self'", "font-src 'self'", "img-src 'self' blob:", "form-action 'self'", "frame-ancestors 'none'"]) assert.ok(csp.includes(directive));
  assert.ok(!csp.includes('unsafe-inline'));
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(page.headers.get('cross-origin-opener-policy'), 'same-origin');
  assert.equal(page.headers.get('access-control-allow-origin'), null);
  assert.equal((await f.request('/', { headers: { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate' } })).status, 200);
  assert.equal((await f.request('/app.js', { method: 'HEAD' })).text, '');
  for (const url of ['/../private.txt', '/%2e%2e/private.txt', '/%2e%2e%2fprivate.txt', '/%252e%252e/private.txt', '/escape.txt', '/.secret.txt', '/scripts/web-server.mjs', '/%5c..%5cprivate.txt', '//evil.example/', '/%00', '/%zz']) {
    const response = await rawRequest(f.base, url);
    assert.ok([400, 404].includes(response.status), `${url}: ${response.status}`);
    assert.ok(!response.text.includes('private-data'));
  }
  assert.equal((await f.request('/', { method: 'POST', body: {} })).status, 405);
  assert.equal(f.calls.length, 0);
});
