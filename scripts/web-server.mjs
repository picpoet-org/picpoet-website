import http from 'node:http';
import { createHmac, randomBytes } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRateLimiter, createSessionStore } from './web-session.mjs';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COOKIE = 'picpoet_web_session';
const MiB = 1024 * 1024;
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

function number(value, fallback, max) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new Error('配置数值超出范围');
  return n;
}
function baseURL(raw, kind) {
  let url;
  try { url = new URL(raw); } catch { throw new Error(`${kind} URL 无效`); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error(`${kind} URL 必须为无凭据、无查询的 HTTP(S) 地址`);
  }
  return url;
}

export function readConfig(env = process.env) {
  const port = number(env.WEB_PORT, 8090, 65535);
  const origin = baseURL(env.WEB_PUBLIC_ORIGIN || `http://127.0.0.1:${port}`, 'WEB_PUBLIC_ORIGIN');
  if (origin.pathname !== '/') throw new Error('WEB_PUBLIC_ORIGIN 只接受 origin');
  if (env.NODE_ENV === 'production' && origin.protocol !== 'https:') throw new Error('生产要求 HTTPS WEB_PUBLIC_ORIGIN');
  const dashboard = baseURL(env.DASHBOARD_API_URL || 'http://127.0.0.1:8080/api/v1', 'DASHBOARD_API_URL');
  if (dashboard.pathname.replace(/\/$/, '') !== '/api/v1') throw new Error('DASHBOARD_API_URL 必须包含完整 /api/v1');
  const picpoet = baseURL(env.PICPOET_API_URL || 'http://127.0.0.1:8081/v1', 'PICPOET_API_URL');
  if (picpoet.pathname === '/') picpoet.pathname = '/v1';
  if (picpoet.pathname.replace(/\/$/, '') !== '/v1') throw new Error('PICPOET_API_URL 接受服务根地址或 /v1');
  return Object.freeze({
    host: env.WEB_HOST || '127.0.0.1', port, publicOrigin: origin.origin,
    secureCookie: origin.protocol === 'https:',
    dashboardApiUrl: dashboard.href.replace(/\/$/, ''), picpoetApiUrl: picpoet.href.replace(/\/$/, ''),
    sessionTtlMs: number(env.WEB_SESSION_TTL_MS, 30 * 60_000, 24 * 60 * 60_000),
    maxSessions: number(env.WEB_MAX_SESSIONS, 1000, 100_000),
    jsonBytes: number(env.WEB_MAX_JSON_BYTES, 64 * 1024, MiB),
    imageBytes: number(env.WEB_MAX_IMAGE_BYTES, 10 * MiB, 25 * MiB),
    upstreamTimeoutMs: number(env.WEB_UPSTREAM_TIMEOUT_MS, 30_000, 120_000),
    bodyTimeoutMs: number(env.WEB_BODY_TIMEOUT_MS, 15_000, 120_000),
    responseBytes: 4 * MiB, maxConcurrent: 64,
    rateWindowMs: 15 * 60_000, loginLimit: 10, accountLimit: 10, maxRateKeys: 10_000,
  });
}
export const config = readConfig();

class WebError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (status, code, message) => { throw new WebError(status, code, message); };
const bad = () => fail(400, 'BAD_REQUEST', '请求参数无效');
const unauthorized = () => fail(401, 'UNAUTHENTICATED', '请重新登录');
function userView(user) {
  if (!user || typeof user.id !== 'string' || typeof user.email !== 'string') fail(502, 'UPSTREAM_ERROR', '账户服务响应无效');
  return Object.fromEntries(['id', 'email', 'username', 'avatarUrl', 'status', 'emailVerified', 'role', 'createdAt', 'updatedAt']
    .filter(key => ['string', 'boolean'].includes(typeof user[key]) || user[key] === null).map(key => [key, user[key]]));
}
function safeJSON(value, secrets = []) {
  // 成功载荷保持业务结构；认证字段和已知秘密在任意嵌套层均不交付浏览器。
  return JSON.stringify(value, (key, item) => {
    if (/^(access_?token|refresh_?token|credential|credentials|authorization|password|passwordHash|claimToken|claimHash)$/i.test(key)) return undefined;
    if (typeof item === 'string') for (const secret of secrets) {
      if (secret && item.includes(secret)) item = item.split(secret).join('[redacted]');
    }
    return item;
  });
}
function send(res, status, value, secrets) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(safeJSON(value, secrets));
}
function sessionId(req) {
  const matches = (req.headers.cookie || '').split(';').map(v => v.trim()).filter(v => v.startsWith(`${COOKIE}=`));
  if (matches.length !== 1) return undefined;
  const id = matches[0].slice(COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(id) ? id : undefined;
}
function setCookie(res, cfg, id = '') {
  res.setHeader('Set-Cookie', `${COOKIE}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${id ? Math.floor(cfg.sessionTtlMs / 1000) : 0}${cfg.secureCookie ? '; Secure' : ''}`);
}
function readBody(req, max, timeoutMs) {
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') fail(415, 'UNSUPPORTED_MEDIA_TYPE', '不支持压缩请求体');
  if (Number(req.headers['content-length']) > max) fail(413, 'BODY_TOO_LARGE', '请求体过大');
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const timer = setTimeout(() => done(new WebError(408, 'REQUEST_TIMEOUT', '请求体读取超时')), timeoutMs);
    function done(error) {
      clearTimeout(timer);
      req.off('data', data); req.off('end', end); req.off('error', errorHandler); req.off('aborted', aborted);
      if (error) { req.resume(); reject(error); } else resolve(Buffer.concat(chunks, size));
    }
    function data(chunk) {
      size += chunk.length;
      if (size > max) done(new WebError(413, 'BODY_TOO_LARGE', '请求体过大'));
      else chunks.push(chunk);
    }
    const end = () => done();
    const errorHandler = () => done(new WebError(400, 'BAD_REQUEST', '请求体读取失败'));
    const aborted = errorHandler;
    req.on('data', data); req.on('end', end); req.on('error', errorHandler); req.on('aborted', aborted);
  });
}
async function jsonBody(req, cfg) {
  const bytes = await readBody(req, cfg.jsonBytes, cfg.bodyTimeoutMs);
  if (!bytes.length) return {};
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) fail(415, 'UNSUPPORTED_MEDIA_TYPE', '需要 JSON 请求体');
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { bad(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) bad();
  return value;
}
function fields(body, required, optional = []) {
  if (Object.keys(body).some(key => ![...required, ...optional].includes(key))) bad();
  for (const key of required) if (typeof body[key] !== 'string' || !body[key] || body[key].length > 1024) bad();
  for (const key of optional) if (body[key] !== undefined && (typeof body[key] !== 'string' || body[key].length > 1024)) bad();
  return body;
}
async function multipart(req, cfg) {
  const contentType = req.headers['content-type'] || '';
  if (!/^multipart\/form-data\s*;\s*boundary=(?:"[0-9A-Za-z'()+_,.\/:=? -]{1,70}"|[0-9A-Za-z'()+_,.\/:=?-]{1,70})$/i.test(contentType)) {
    fail(415, 'UNSUPPORTED_MEDIA_TYPE', '需要带 boundary 的 multipart/form-data');
  }
  const body = await readBody(req, cfg.imageBytes + cfg.jsonBytes, cfg.bodyTimeoutMs);
  let form;
  try { form = await new Response(body, { headers: { 'Content-Type': contentType } }).formData(); } catch { bad(); }
  const allowed = new Set(['image', 'generationId', 'language', 'poemLanguage', 'poem', 'poemMeter', 'rhymeStandard', 'ci', 'suggest', 'authorPersona', 'authorCharacter', 'metadataConfig']);
  let textBytes = 0;
  for (const key of new Set(form.keys())) {
    if (!allowed.has(key) || form.getAll(key).length !== 1) bad();
    const value = form.get(key);
    if (key !== 'image') {
      if (typeof value !== 'string') bad();
      textBytes += Buffer.byteLength(value);
    }
  }
  const image = form.get('image');
  if (!image || typeof image === 'string' || !image.size || !['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(image.type)) bad();
  if (image.size > cfg.imageBytes || textBytes > cfg.jsonBytes) fail(413, 'BODY_TOO_LARGE', '图片或字段过大');
  if (!UUID.test(form.get('generationId') || '')) bad();
  // 校验后仍转发原始字节与原始 boundary，不重新编码上传。
  return { body, contentType };
}

const fixedRoutes = new Map([
  ['GET /session', 'session'], ['POST /login', 'login'], ['POST /logout', 'logout'],
  ['POST /register', 'register'], ['POST /verify-email', 'verify-email'], ['POST /resend-otp', 'resend-otp'],
  ['GET /balance', 'balance'], ['GET /plans', 'plans'], ['GET /orders', 'orders'],
  ['POST /orders', 'create-order'], ['POST /generations', 'create-generation'],
]);
function routeFor(method, pathname) {
  const fixed = fixedRoutes.get(`${method} ${pathname}`);
  if (fixed) return { kind: fixed };
  const parts = pathname.split('/');
  if (!UUID.test(parts[2] || '')) return null;
  if (method === 'POST' && parts[1] === 'orders' && parts.length === 4 && ['details', 'payment'].includes(parts[3])) return { kind: 'order', suffix: pathname };
  if (method === 'GET' && parts[1] === 'generations' && (parts.length === 3 || (parts.length === 4 && parts[3] === 'result'))) return { kind: 'generation', suffix: pathname };
  return null;
}

/** 返回未监听的 http.Server。测试可注入 fetch、now、配置和静态目录；无 .env、无共享服务 token。 */
export function createWebServer({ config: cfg = config, fetch: fetchImpl = globalThis.fetch, now = Date.now, publicDirectory = publicDir } = {}) {
  const sessions = createSessionStore({ now, ttlMs: cfg.sessionTtlMs, maxSessions: cfg.maxSessions });
  const limiter = createRateLimiter({ now, windowMs: cfg.rateWindowMs, maxKeys: cfg.maxRateKeys });
  const cleanup = setInterval(() => { sessions.sweep(); limiter.sweep(); }, Math.min(cfg.sessionTtlMs, 60_000));
  cleanup.unref();
  let concurrent = 0;

  async function upstream(base, suffix, method, body, token, contentType = 'application/json') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.upstreamTimeoutMs);
    try {
      const response = await fetchImpl(base + suffix, {
        method, redirect: 'error', signal: controller.signal,
        headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': contentType } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
      });
      if (response.status >= 400) {
        await response.body?.cancel();
        return { status: response.status, data: null };
      }
      if (response.status < 200 || response.status >= 300 || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) {
        await response.body?.cancel();
        fail(502, 'UPSTREAM_ERROR', '上游响应无效');
      }
      const chunks = [];
      let size = 0;
      if (response.body) for await (const chunk of response.body) {
        size += chunk.length;
        if (size > cfg.responseBytes) { controller.abort(); fail(502, 'UPSTREAM_ERROR', '上游响应过大'); }
        chunks.push(Buffer.from(chunk));
      }
      let data;
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(502, 'UPSTREAM_ERROR', '上游响应无效'); }
      return { status: response.status, data };
    } catch (error) {
      if (error instanceof WebError) throw error;
      fail(controller.signal.aborted ? 504 : 502, 'UPSTREAM_ERROR', controller.signal.aborted ? '上游请求超时' : '上游服务不可用');
    } finally { clearTimeout(timer); }
  }
  function accepted(result) {
    if (result.status >= 400) {
      const status = result.status;
      fail(status, 'UPSTREAM_REJECTED', status === 401 ? '登录信息无效' : status === 403 ? '操作未获授权，请检查邮箱验证或账户状态' : status === 429 ? '操作频繁，请稍后重试' : '上游未完成请求，请检查输入或稍后重试');
    }
    return result;
  }
  function live(session) {
    if (!session?.active || session.expiresAt <= now()) { if (session) sessions.remove(session.id); unauthorized(); }
  }
  function tokens(session, data) {
    if (!data || typeof data.accessToken !== 'string' || !data.accessToken || typeof data.refreshToken !== 'string' || !data.refreshToken || !Number.isFinite(data.expiresIn) || data.expiresIn <= 0) {
      fail(502, 'UPSTREAM_ERROR', '账户服务响应无效');
    }
    session.accessToken = data.accessToken;
    session.refreshToken = data.refreshToken;
    session.accessExpiresAt = now() + data.expiresIn * 1000;
    session.tokenVersion = (session.tokenVersion || 0) + 1;
  }
  async function refresh(session) {
    live(session);
    if (!session.refreshPromise) {
      session.refreshPromise = (async () => {
        try {
          const result = accepted(await upstream(cfg.dashboardApiUrl, '/picpoet/auth/refresh', 'POST', { refreshToken: session.refreshToken }));
          tokens(session, result.data);
          live(session);
        } catch {
          sessions.remove(session.id);
          unauthorized();
        }
      })().finally(() => { session.refreshPromise = null; });
    }
    await session.refreshPromise;
  }
  async function jwt(session, suffix, method, body) {
    live(session);
    if (session.refreshPromise || session.accessExpiresAt <= now() + 5000) await refresh(session);
    live(session);
    const used = session.accessToken;
    const version = session.tokenVersion;
    let result = await upstream(cfg.dashboardApiUrl, `/picpoet${suffix}`, method, body, used);
    if (result.status === 401) {
      // 已使用旧 JWT 的并发请求复用当前刷新结果，避免再次消费 refresh token。
      if (session.tokenVersion === version) await refresh(session);
      live(session);
      result = await upstream(cfg.dashboardApiUrl, `/picpoet${suffix}`, method, body, session.accessToken);
      if (result.status === 401) { sessions.remove(session.id); unauthorized(); }
    }
    live(session);
    return accepted(result);
  }
  async function logoutUpstream(session) {
    if (session.refreshPromise) await session.refreshPromise.catch(() => {});
    if (session.refreshToken) accepted(await upstream(cfg.dashboardApiUrl, '/picpoet/auth/logout', 'POST', { refreshToken: session.refreshToken }));
  }
  async function api(req, res, pathname) {
    const route = routeFor(req.method, pathname);
    if (!route) fail(404, 'NOT_FOUND', '接口不存在');
    const id = sessionId(req);
    let session = sessions.get(id);
    if (id && !session) setCookie(res, cfg);
    const { kind } = route;
    if (kind === 'session') { send(res, 200, session ? { authenticated: true, user: session.user } : { authenticated: false }); return; }
    const anonymous = ['login', 'register', 'verify-email', 'resend-otp', 'plans', 'logout'].includes(kind);
    if (!anonymous && !session) unauthorized();
    let result;
    if (['login', 'register', 'verify-email', 'resend-otp'].includes(kind)) {
      const group = kind === 'login' ? 'login' : 'account';
      const limit = group === 'login' ? cfg.loginLimit : cfg.accountLimit;
      // 不信任 X-Forwarded-For；反向代理部署另行配置边缘限速。
      if (!limiter.take(`${group}:ip`, req.socket.remoteAddress || 'unknown', limit)) fail(429, 'RATE_LIMITED', '操作频繁，请稍后重试');
      const body = await jsonBody(req, cfg);
      fields(body, ['email', kind === 'verify-email' ? 'otp' : kind === 'resend-otp' ? 'purpose' : 'password'], kind === 'register' ? ['invitationCode'] : []);
      body.email = body.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || body.email.length > 254) bad();
      if (kind === 'register' && body.password.length < 8) bad();
      if (kind === 'resend-otp' && !['register', 'verify_email', 'reset_password'].includes(body.purpose)) bad();
      if (!limiter.take(`${group}:email`, body.email, limit)) fail(429, 'RATE_LIMITED', '操作频繁，请稍后重试');
      result = accepted(await upstream(cfg.dashboardApiUrl, `/picpoet/auth/${kind}`, 'POST', body));
      if (kind === 'login') {
        const pending = { active: true, expiresAt: now() + cfg.sessionTtlMs };
        try {
          tokens(pending, result.data);
          pending.user = userView(result.data.user);
          pending.credential = result.data.credential?.value;
          if (!pending.credential) pending.credential = (await jwt(pending, '/credentials/rotate', 'POST', { revokeOthers: false })).data?.value;
          if (typeof pending.credential !== 'string' || !/^picpoet-account-[a-f0-9]+$/.test(pending.credential)) fail(502, 'UPSTREAM_ERROR', '业务凭证响应无效');
          const created = sessions.create({ ...pending, claimKey: randomBytes(32) });
          if (!created) fail(503, 'SESSION_CAPACITY', '会话容量已满，请稍后重试');
          if (session) { sessions.remove(session.id); await logoutUpstream(session).catch(() => {}); }
          session = created;
          setCookie(res, cfg, session.id);
          result = { status: 200, data: { user: session.user } };
        } catch (error) {
          await logoutUpstream(pending).catch(() => {});
          throw error;
        }
      } else if (kind === 'register') result.data = { user: userView(result.data?.user), otpSent: result.data?.otpSent === true };
    } else if (kind === 'logout') {
      fields(await jsonBody(req, cfg), []);
      setCookie(res, cfg);
      if (session) { sessions.remove(session.id); await logoutUpstream(session); }
      result = { status: 200, data: { authenticated: false } };
    } else if (kind === 'plans') {
      result = accepted(await upstream(cfg.dashboardApiUrl, '/picpoet/plans', 'GET'));
    } else if (kind === 'balance' || kind === 'orders') {
      result = await jwt(session, `/${kind}`, 'GET');
    } else if (kind === 'create-order') {
      const body = fields(await jsonBody(req, cfg), ['planId', 'requestId', 'payMethod'], ['deliveryMode']);
      if (!UUID.test(body.planId) || !UUID.test(body.requestId) || !['alipay_page', 'alipay_wap', 'alipay_qrcode', 'alipay_app'].includes(body.payMethod) || (body.deliveryMode && body.deliveryMode !== 'auto_redeem')) bad();
      body.requestId = body.requestId.toLowerCase();
      body.deliveryMode = 'auto_redeem';
      // 同会话 + requestId 重试稳定；无需在 Map 中无限累积每张订单的秘密。
      body.claimToken = createHmac('sha256', session.claimKey).update(body.requestId).digest('hex');
      result = await jwt(session, '/orders', 'POST', body);
    } else if (kind === 'order') {
      fields(await jsonBody(req, cfg), []);
      result = await jwt(session, route.suffix, 'POST', {});
    } else {
      live(session);
      const upload = kind === 'create-generation' ? await multipart(req, cfg) : {};
      live(session);
      result = await upstream(cfg.picpoetApiUrl, kind === 'create-generation' ? '/generations' : route.suffix, req.method, upload.body, session.credential, upload.contentType);
      if (result.status === 401) { sessions.remove(session.id); unauthorized(); }
      live(session);
      accepted(result);
    }
    send(res, result.status, result.data, session ? [session.accessToken, session.refreshToken, session.credential] : []);
  }

  async function staticFile(req, res, pathname) {
    if (!['GET', 'HEAD'].includes(req.method)) fail(405, 'METHOD_NOT_ALLOWED', '仅支持 GET/HEAD');
    const root = await realpath(publicDirectory);
    const requested = path.resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
    const inside = file => file.startsWith(root + path.sep);
    if (!inside(requested)) fail(404, 'NOT_FOUND', '文件不存在');
    let file;
    try { file = await realpath(requested); } catch { fail(404, 'NOT_FOUND', '文件不存在'); }
    if (!inside(file)) fail(404, 'NOT_FOUND', '文件不存在');
    const info = await stat(file);
    if (!info.isFile()) fail(404, 'NOT_FOUND', '文件不存在');
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
    if (!types[path.extname(file)]) fail(404, 'NOT_FOUND', '文件不存在');
    res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Content-Length': info.size });
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (cfg.secureCookie) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    concurrent++;
    try {
      if (concurrent > cfg.maxConcurrent) fail(503, 'BUSY', '服务繁忙');
      if (req.headers.host !== new URL(cfg.publicOrigin).host) fail(403, 'HOST_REJECTED', '请求主机无效');
      if ((!['GET', 'HEAD'].includes(req.method) || req.headers.origin) && req.headers.origin !== cfg.publicOrigin) fail(403, 'ORIGIN_REJECTED', '请求来源无效');
      let pathname;
      try { pathname = decodeURIComponent((req.url || '').split('?')[0]); } catch { bad(); }
      if (!pathname.startsWith('/') || pathname.startsWith('//') || /[\\\x00-\x1f\x7f]/.test(pathname) || pathname.split('/').some(p => p.startsWith('.'))) fail(404, 'NOT_FOUND', '路径不存在');
      if (pathname === '/web-api' || pathname.startsWith('/web-api/')) {
        // 官网允许来自搜索引擎和外站的普通导航；仅业务接口拒绝跨站读取。
        if (req.headers['sec-fetch-site'] === 'cross-site') fail(403, 'ORIGIN_REJECTED', '请求来源无效');
        if (req.url.includes('?')) bad();
        await api(req, res, pathname.slice('/web-api'.length));
      } else await staticFile(req, res, pathname);
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      if (error.status === 401) setCookie(res, cfg);
      if (req.method !== 'GET' && !req.complete) { res.setHeader('Connection', 'close'); req.resume(); }
      send(res, error instanceof WebError ? error.status : 500, { code: error instanceof WebError ? error.code : 'INTERNAL_ERROR', message: error instanceof WebError ? error.message : '服务暂不可用' });
    } finally { concurrent--; }
  });
  server.requestTimeout = cfg.bodyTimeoutMs;
  server.headersTimeout = Math.min(cfg.bodyTimeoutMs, 10_000);
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 60;
  server.on('close', () => { clearInterval(cleanup); sessions.clear(); limiter.clear(); });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createWebServer();
  server.listen(config.port, config.host, () => console.log(`Picpoet Web: ${config.publicOrigin}`));
}
