// 正向集成：真实预渲染页面 → Vue hydration → 独立 BFF → 本地 HTTP 替身。
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createWebServer, readConfig } from '../scripts/web-server.mjs';
import { locales, pages, pagePath } from '../src/i18n/context.mjs';
import { availableLocales } from '../scripts/check-locales.mjs';
const root = new URL('../', import.meta.url);
const ID = '12345678-1234-4234-8234-123456789abc';
const USER = { id: ID, email: 'poet@example.com', emailVerified: true };
const calls = [],
  errors = [];
let generationId,
  generationReads = 0,
  removed = false,
  order;
const json = (res, body, status = 200) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};
const verse = { title: '山水之间', kind: 'poem', lines: ['山月照清泉', '轻舟入远天'] };
const upstream = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const bytes = Buffer.concat(chunks),
    path = req.url;
  const body = req.headers['content-type']?.includes('application/json')
    ? JSON.parse(bytes.toString() || '{}')
    : null;
  calls.push({ method: req.method, path, body, bytes });
  if (path.endsWith('/auth/login'))
    return json(res, {
      user: USER,
      accessToken: 'private-access',
      refreshToken: 'private-refresh',
      expiresIn: 3600,
      credential: { value: `picpoet-account-${'ab'.repeat(24)}` },
    });
  if (path.endsWith('/auth/register')) return json(res, { user: USER, otpSent: true }, 201);
  if (path.includes('/auth/')) return json(res, { message: 'ok' });
  if (path.endsWith('/balance'))
    return json(res, { free: { remaining: 3 }, paid: { remaining: order?.delivery ? 10 : 0 } });
  if (path.endsWith('/plans'))
    return json(res, [{ id: ID, title: '10次创作', credits: 10, priceMinor: 100, currency: 'CNY' }]);
  if (path.endsWith('/orders') && req.method === 'GET') return json(res, order ? [order] : []);
  if (path.endsWith('/orders') && req.method === 'POST') {
    order = {
      id: ID,
      createdAt: new Date().toISOString(),
      credits: 10,
      amountMinor: 100,
      currency: 'CNY',
      status: 'pending',
      payment: { qrCode: 'https://payments.example/checkout' },
    };
    return json(res, order);
  }
  if (path.endsWith('/details')) {
    order = { ...order, status: 'paid', delivery: { mode: 'auto_redeem', creditsGranted: 10 } };
    return json(res, order);
  }
  if (path.endsWith('/payment')) return json(res, order);
  if (path === '/v1/generations' && req.method === 'POST') {
    generationId = bytes.toString('latin1').match(/name="generationId"\r\n\r\n([^\r]+)/)?.[1];
    assert.ok(generationId);
    return json(res, { id: generationId, status: 'queued' }, 202);
  }
  if (path === `/v1/generations/${generationId}`)
    return json(res, {
      id: generationId,
      status: ++generationReads === 1 ? 'running' : 'succeeded',
      resultAvailableUntil: '2030-01-01T00:00:00Z',
    });
  if (path === `/v1/generations/${generationId}/result`) return json(res, { verse, charged: true });
  if (path.startsWith('/v1/history?'))
    return json(res, {
      items: removed
        ? []
        : [{ id: ID, title: '山水之间', excerpt: '山月照清泉', createdAt: new Date().toISOString() }],
      nextCursor: null,
    });
  if (path === `/v1/history/${ID}` && req.method === 'DELETE') {
    removed = true;
    return json(res, { deleted: true });
  }
  if (path === `/v1/history/${ID}`)
    return json(res, { id: ID, verse, createdAt: '2026-01-01T00:00:00Z', expiresAt: '2030-01-01T00:00:00Z' });
  if (path === `/v1/history/${ID}/image`) {
    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
    res.end(imageBytes);
    return;
  }
  json(res, {}, 404);
});
async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}
const upstreamURL = await listen(upstream);
const cfg = {
  ...readConfig({ DASHBOARD_API_URL: upstreamURL + '/api/v1', PICPOET_API_URL: upstreamURL + '/v1' }),
  loginLimit: 100,
};
const server = createWebServer({ config: cfg });
const base = await listen(server);
cfg.publicOrigin = base;
cfg.publicOrigins = [base];
cfg.publicHosts = [new URL(base).host];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error' || /Hydration.*mismatch/i.test(message.text())) errors.push(message.text());
});
const imageBytes = await page
  .evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#a6bdc2';
    ctx.fillRect(0, 0, 320, 240);
    return Array.from(
      new Uint8Array(
        await (await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg'))).arrayBuffer(),
      ),
    );
  })
  .then((value) => Buffer.from(value));
try {
  const ids = process.argv.includes('--zh-only')
    ? ['zh-cn']
    : process.argv.includes('--all-locales')
      ? locales.map((item) => item.id)
      : await availableLocales();
  for (const locale of locales.filter((item) => ids.includes(item.id))) {
    for (const name of pages) {
      await page.goto(base + pagePath(name, locale.id));
      await page.waitForFunction(() => document.documentElement.dataset.hydrated === 'true');
      assert.equal(await page.locator('html').getAttribute('lang'), locale.tag);
      assert.equal(
        await page.locator('.brand span').textContent(),
        locale.id === 'zh-cn' ? '图赋' : 'PicPoet',
      );
    }
    for (const width of [375, 768, 900, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base + pagePath('index', locale.id));
      await page.waitForFunction(() => document.documentElement.dataset.hydrated === 'true');
      if (await page.locator('.menu-toggle').isVisible()) await page.locator('.menu-toggle').click();
      assert.equal(await page.locator('header nav a').count(), 5);
      assert.ok(await page.locator('#site-language').isVisible());
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `${locale.id}/${width} 无横向溢出`,
      );
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(base + '/login.html?returnTo=create.html');
  await page.locator('#mode-register').click();
  await page.locator('#email').fill(USER.email);
  await page.locator('#password').fill('integration-password');
  await page.locator('#auth-submit').click();
  await page.locator('#otp').waitFor({ state: 'visible' });
  await page.locator('#otp').fill('123456');
  await page.locator('#verify-form button[type=submit]').click();
  await page.locator('#mode-login[aria-pressed=true]').waitFor();
  await page.locator('#password').fill('integration-password');
  await page.locator('#auth-submit').click();
  await page.waitForURL('**/create.html');
  await page
    .locator('#image')
    .setInputFiles({ name: 'private-source.jpg', mimeType: 'image/jpeg', buffer: imageBytes });
  await page.locator('#generate:not([disabled])').waitFor();
  await page.locator('#generate').click();
  await page.locator('#download-card').waitFor({ state: 'visible', timeout: 20000 });
  assert.equal(await page.locator('#poem-title').textContent(), verse.title);
  assert.equal(await page.locator('#poem-body').textContent(), verse.lines.join('\n'));
  assert.equal(await page.locator('#poem-card').evaluate((element) => element.naturalWidth), 1080);
  const downloadReady = page.waitForEvent('download');
  await page.locator('#download-card').click();
  const download = await downloadReady;
  const stream = await download.createReadStream();
  const pngChunks = [];
  for await (const chunk of stream) pngChunks.push(chunk);
  assert.equal(Buffer.concat(pngChunks).subarray(1, 4).toString(), 'PNG');
  await page.goto(base + '/works.html');
  await page.locator('.history-image-toggle').click();
  await page.locator('#history-body').filter({ hasText: verse.lines[0] }).waitFor();
  await page.locator('#history-render').click();
  await page.locator('#history-download').waitFor({ state: 'visible' });
  await page.locator('#history-delete').click();
  await page.locator('#history-delete-cancel').click();
  assert.ok(await page.locator('#history-detail').isVisible());
  await page.locator('#history-delete').click();
  await page.locator('#history-delete-confirm').click();
  await page
    .locator('#history-list')
    .filter({ has: page.locator('article') })
    .waitFor({ state: 'hidden' });
  await page.goto(base + '/account.html');
  await page.locator('[data-plan-id]').click();
  await page.locator('.payment-qr').waitFor({ state: 'visible' });
  await page.locator('.order-status').filter({ hasText: '已到账 10 次' }).waitFor({ timeout: 15000 });
  assert.equal(calls.filter((call) => call.method === 'POST' && call.path.endsWith('/orders')).length, 1);
  assert.ok(
    !calls.find((call) => call.path === '/v1/generations').bytes.includes(Buffer.from('private-source.jpg')),
  );
  assert.ok(
    calls
      .find((call) => call.path === '/v1/generations')
      .bytes.includes(Buffer.from('name="poemLanguage"\r\n\r\nzh')),
  );
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  await page.locator('#logout').click();
  await page.locator('#login-gate').waitFor({ state: 'visible' });
  await page.goto(base + '/downloads.html');
  await page.locator('#download-status').filter({ hasText: '正在读取' }).waitFor({ state: 'hidden' });
  assert.equal(await page.locator('[data-platform]').count(), 6);
  await page.goto(base + '/pages/downloads.html');
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === 'true');
  await mkdir(new URL('.build/', root), { recursive: true });
  await page.screenshot({ path: new URL('.build/vue-downloads.png', root).pathname, fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    `Vue 浏览器正向验收通过：${ids.length} 种语言 × 8 页、四种宽度、注册验证登录、创作 PNG、历史导出删除、购买到账、退出与兼容路径。`,
  );
} finally {
  await browser.close();
  for (const item of [server, upstream]) {
    item.closeAllConnections();
    await new Promise((resolve) => item.close(resolve));
  }
}
