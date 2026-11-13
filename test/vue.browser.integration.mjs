// 正向集成：真实预渲染页面 → Vue hydration → 独立 BFF → 本地 HTTP 替身。
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import jsQR from 'jsqr';
import { createWebServer, readConfig } from '../scripts/web-server.mjs';
import { locales, pages, pagePath } from '../src/i18n/context.mjs';
import { availableLocales } from '../scripts/check-locales.mjs';
const root = new URL('../', import.meta.url);
const ID = '12345678-1234-4234-8234-123456789abc';
const USER = { id: ID, email: 'poet@example.com', emailVerified: true };
const PHONE_USER = {
  id: ID,
  email: '',
  phone: '13812345678',
  emailVerified: false,
  authMethod: 'phone',
  status: 'active',
};
const INVITATION_CODE = 'inv_' + 'a1'.repeat(16);
const INVITATION_URL = `https://picpoet.jqknono.com/${ID}/invite_code=${INVITATION_CODE}`;
const calls = [],
  errors = [];
let generationId,
  phoneLocked = false,
  generationComplete = false,
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
  if (path.endsWith('/auth/login') && body?.phone && phoneLocked)
    return json(res, { code: 'ACCOUNT_LOCKED' }, 423);
  if (path.endsWith('/auth/login'))
    return json(res, {
      user: body?.phone ? PHONE_USER : USER,
      accessToken: 'private-access',
      refreshToken: 'private-refresh',
      expiresIn: 3600,
      refreshExpiresIn: 30 * 24 * 3600,
      credential: { value: `picpoet-account-${'ab'.repeat(24)}` },
    });
  if (path.endsWith('/auth/register'))
    return json(res, { user: body?.phone ? PHONE_USER : USER, otpSent: !body?.phone }, 201);
  if (path.endsWith('/auth/refresh'))
    return json(res, {
      accessToken: 'private-access-new',
      refreshToken: 'private-refresh-new',
      expiresIn: 3600,
      refreshExpiresIn: 30 * 24 * 3600,
    });
  if (path.includes('/auth/')) return json(res, { message: 'ok' });
  if (path.endsWith('/balance'))
    return json(res, {
      free: { remaining: 3 },
      paid: { remaining: (order?.delivery ? 10 : 0) + 6 },
      referral: { invitationCode: INVITATION_CODE, totalGrantedCredits: 6, registrationRewardPerInvite: 3 },
    });
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
      status: generationComplete ? 'succeeded' : 'running',
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
const sessionDir = await mkdtemp(path.join(tmpdir(), 'picpoet-browser-session-'));
let serverNow = Date.now();
const cfg = {
  ...readConfig({ DASHBOARD_API_URL: upstreamURL + '/api/v1', PICPOET_API_URL: upstreamURL + '/v1' }),
  loginLimit: 100,
  sessionFile: path.join(sessionDir, 'sessions.sqlite'),
};
let server = createWebServer({ config: cfg, now: () => serverNow });
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
await context.grantPermissions(['clipboard-read', 'clipboard-write']);
async function decodeImageQR(selector) {
  const pixels = await page.locator(selector).evaluate(async (image) => {
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    return {
      width: canvas.width,
      height: canvas.height,
      bytes: Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data),
    };
  });
  return jsQR(new Uint8ClampedArray(pixels.bytes), pixels.width, pixels.height)?.data;
}
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
    for (const width of [375, 768, 900, 992, 993, 1024, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      let baseline;
      for (const headerPage of ['index', 'works', 'create', 'downloads']) {
        await page.goto(base + pagePath(headerPage, locale.id));
        await page.waitForFunction(() => document.documentElement.dataset.hydrated === 'true');
        const header = await page.locator('.site-header').boundingBox();
        if (!baseline) baseline = header;
        for (const key of ['x', 'width', 'height']) {
          assert.ok(Math.abs(header[key] - baseline[key]) < 1, `${headerPage}/${width} 页眉 ${key} 一致`);
        }
        const toggle = page.locator('.menu-toggle');
        if (await toggle.isVisible()) {
          assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
          await toggle.focus();
          await toggle.press('Enter');
          assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        }
        assert.equal(await page.locator('header nav a').count(), 5);
        const current = page.locator('header nav a[aria-current="page"]');
        assert.equal(await current.getAttribute('href'), pagePath(headerPage, locale.id));
        for (const link of await page.locator('header nav a').all()) assert.ok(await link.isVisible());
        const navLayout = await page.locator('header nav a').evaluateAll((links) =>
          links.map((link) => {
            const box = link.getBoundingClientRect();
            const content = link.querySelector('.nav-item-content').getBoundingClientRect();
            const icon = link.querySelector('.nav-icon').getBoundingClientRect();
            const label = link.querySelector('.nav-label').getBoundingClientRect();
            const style = getComputedStyle(link);
            return {
              centeredX: Math.abs(content.x + content.width / 2 - box.x - box.width / 2),
              centeredY: Math.abs(content.y + content.height / 2 - box.y - box.height / 2),
              aligned: Math.abs(icon.y + icon.height / 2 - label.y - label.height / 2),
              height: box.height,
              underline: style.textDecorationLine,
              border: style.borderTopColor,
              current: link.getAttribute('aria-current') === 'page',
            };
          }),
        );
        for (const item of navLayout) {
          assert.ok(item.centeredX < 1 && item.centeredY < 1, `${headerPage}/${width} 图文整体居中`);
          assert.ok(item.aligned < 1, `${headerPage}/${width} 图标与文字行框对齐`);
          assert.ok(item.height >= 44, `${headerPage}/${width} 导航点击区域足够`);
          assert.equal(item.underline, 'none');
        }
        assert.notEqual(
          navLayout.find((item) => item.current).border,
          navLayout.find((item) => !item.current).border,
        );
        const beforeHover = await current.boundingBox();
        await current.hover();
        assert.deepEqual(await current.boundingBox(), beforeHover, '选中与悬停状态保持导航尺寸');
        await page.keyboard.press('Tab');
        await current.focus();
        assert.ok(
          await current.evaluate((link) => getComputedStyle(link).outlineStyle !== 'none'),
          '键盘焦点轮廓可见',
        );
        assert.ok(await page.locator('#site-language').isVisible());
        if (!(await toggle.isVisible())) {
          const geometry = await page.locator('.site-header').evaluate((element) => {
            const boxes = [...element.querySelectorAll('.brand, nav a, select')].map((node) =>
              node.getBoundingClientRect(),
            );
            return boxes.map((box) => box.y + box.height / 2);
          });
          assert.ok(Math.max(...geometry) - Math.min(...geometry) < 1, '品牌、导航、语言框垂直居中');
        } else {
          await page.locator('header nav a').first().focus();
          await page.keyboard.press('Escape');
          assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
          assert.ok(await toggle.evaluate((element) => element === document.activeElement));
        }
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `${locale.id}/${width} 无横向溢出`,
        );
      }
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(base + new URL(INVITATION_URL).pathname);
  await page.locator('#mode-register[aria-pressed=true]').waitFor();
  assert.equal(await page.locator('#invitation').inputValue(), INVITATION_CODE);
  await page.locator('#identity').fill(USER.email);
  await page.locator('#password').fill('integration-password');
  await page.locator('#auth-submit').click();
  await page.locator('#otp').waitFor({ state: 'visible' });
  assert.equal(
    calls.find((call) => call.path.endsWith('/auth/register')).body.invitationCode,
    INVITATION_CODE,
  );
  await page.locator('#otp').fill('123456');
  await page.locator('#verify-form button[type=submit]').click();
  await page.locator('#mode-login[aria-pressed=true]').waitFor();
  await page.locator('#password').fill('integration-password');
  await page.locator('#auth-submit').click();
  await page.waitForURL('**/create.html');
  await page.waitForFunction(() => !document.querySelector('#image').matches(':disabled'));
  assert.equal(await page.locator('#generation-status').textContent(), '');
  assert.equal(await page.locator('#login-gate').isVisible(), false);
  assert.equal(await page.locator('#app-metadata-tip').count(), 0);
  await page
    .locator('#image')
    .setInputFiles({ name: 'private-source.jpg', mimeType: 'image/jpeg', buffer: imageBytes });
  await page.locator('#generate:not([disabled])').waitFor();
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const alignment = await page.locator('#generate').evaluate((button) => {
      const box = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      const range = document.createRange();
      range.selectNodeContents(button);
      const text = range.getBoundingClientRect();
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const metrics = context.measureText(button.textContent.trim());
      const inkCenterY =
        text.top +
        metrics.fontBoundingBoxAscent -
        (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
      return {
        horizontalOffset: Math.abs(text.left + text.width / 2 - box.left - box.width / 2),
        verticalOffset: Math.abs(inkCenterY - box.top - box.height / 2),
        fontSize: Number.parseFloat(style.fontSize),
        height: box.height,
      };
    });
    assert.ok(alignment.horizontalOffset < 1, `${width} 生成按钮水平居中`);
    assert.ok(alignment.verticalOffset <= alignment.fontSize * 0.1, `${width} 中文字形视觉居中`);
    assert.ok(alignment.height >= 44, `${width} 保留按钮点击区域`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.install();
  await page.locator('#generate').click();
  const waiting = page.locator('#waiting-poems');
  const activePoem = waiting.locator('.waiting-poem.is-current');
  await waiting.waitFor({ state: 'visible' });
  assert.equal(
    await page
      .locator('#generate')
      .textContent()
      .then((text) => text.trim()),
    '生成诗词',
  );
  assert.equal(await page.locator('#generate').getAttribute('aria-busy'), 'true');
  assert.equal(await page.locator('#stop-poll').isVisible(), false);
  assert.equal(await waiting.locator('.waiting-poems-control').isVisible(), false);
  assert.equal(await activePoem.getAttribute('aria-hidden'), 'false');
  assert.equal(
    await page
      .locator('#generation-status')
      .evaluate((element) => getComputedStyle(element, '::before').animationName),
    'none',
  );
  assert.equal(await activePoem.evaluate((element) => getComputedStyle(element).transitionDuration), '0s');
  const stillPoem = await activePoem.textContent();
  await page.clock.fastForward(9000);
  assert.equal(await activePoem.textContent(), stillPoem, '减少动态效果时保持当前诗句');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.mouse.move(0, 0);
  await page.waitForFunction(() =>
    getComputedStyle(document.querySelector('.waiting-poem')).transitionDuration.includes('0.45s'),
  );
  const beforePoem = await activePoem.textContent();
  const beforeStage = await waiting.boundingBox();
  assert.equal(
    await page
      .locator('#generation-status')
      .evaluate((element) => getComputedStyle(element, '::before').animationName),
    'writing-breath',
  );
  await page.clock.fastForward(3100);
  await page.waitForFunction(
    (previous) => document.querySelector('.waiting-poem.is-current').textContent !== previous,
    beforePoem,
  );
  await page.waitForFunction(
    () => Number(getComputedStyle(document.querySelector('.waiting-poem.is-current')).opacity) > 0.99,
  );
  const afterStage = await waiting.boundingBox();
  assert.ok(Math.abs(beforeStage.height - afterStage.height) < 1, '诗句轮换时等待卡片高度稳定');
  assert.ok(Math.abs(beforeStage.y - afterStage.y) < 1, '诗句轮换时等待卡片位置稳定');

  await waiting.hover();
  const hoverPoem = await activePoem.textContent();
  await page.clock.fastForward(9000);
  assert.equal(await activePoem.textContent(), hoverPoem, '悬停阅读时自动轮换暂停');
  await page.mouse.move(0, 0);
  const control = waiting.locator('.waiting-poems-control');
  await page.keyboard.press('Tab');
  await control.focus();
  assert.ok(
    await control.evaluate(
      (button) => button.matches(':focus-visible') && button.getBoundingClientRect().height >= 44,
    ),
  );
  const focusedPoem = await activePoem.textContent();
  await page.clock.fastForward(9000);
  assert.equal(await activePoem.textContent(), focusedPoem, '键盘聚焦时停留当前诗句');
  await control.press('Enter');
  assert.equal(await control.getAttribute('aria-pressed'), 'true');
  await page.locator('#task-details summary').focus();
  await page.clock.fastForward(9000);
  assert.equal(await activePoem.textContent(), focusedPoem, '手动暂停后移开焦点仍保持诗句');
  await control.focus();
  await control.press('Enter');
  await page.locator('#task-details summary').focus();
  await page.clock.fastForward(9000);
  await page.waitForFunction(
    (previous) => document.querySelector('.waiting-poem.is-current').textContent !== previous,
    focusedPoem,
  );
  await page.waitForFunction(
    () => Number(getComputedStyle(document.querySelector('.waiting-poem.is-current')).opacity) > 0.99,
  );

  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await mkdir(new URL('.build/', root), { recursive: true });
    await waiting.screenshot({ path: new URL(`.build/waiting-poems-${width}.png`, root).pathname });
  }
  await page.locator('#task-details summary').click();
  await page.locator('#stop-poll').click();
  await page.locator('#resume-generation').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#generation-status').textContent(), '已暂停自动更新，创作仍在继续。');
  assert.equal(await waiting.isVisible(), false);
  await page.locator('#resume-generation').click();
  await waiting.waitFor({ state: 'visible' });
  assert.match(await activePoem.textContent(), /行到水穷处/);
  assert.equal(
    calls.filter((call) => call.method === 'POST' && call.path === '/v1/generations').length,
    1,
    '继续进度只查询原创作',
  );
  await page.locator('#task-details summary').click();
  generationComplete = true;
  await page.clock.fastForward(3500);
  await page.locator('#download-card').waitFor({ state: 'visible', timeout: 20000 });
  assert.equal(await waiting.isVisible(), false);
  assert.equal(await page.locator('#resume-generation').isVisible(), false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('#poem-title').textContent(), verse.title);
  assert.equal(await page.locator('#poem-body').textContent(), verse.lines.join('\n'));
  assert.equal(await page.locator('#redraw-card').count(), 0);
  assert.ok(await page.locator('#poem-accessible').evaluate((node) => node.classList.contains('sr-only')));
  await page.locator('#copy-poem').click();
  await page.locator('#copy-status').filter({ hasText: '诗词已拷贝' }).waitFor();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    [verse.title, ...verse.lines].join('\n'),
  );
  assert.equal(await decodeImageQR('#poem-card'), INVITATION_URL);
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 1100 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page
      .locator('.result-panel')
      .screenshot({ path: new URL(`.build/invitation-result-${width}.png`, root).pathname });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  const metadataTip = page.locator('#app-metadata-tip');
  assert.equal(
    await page.locator('#app-metadata-title').evaluate((node) => getComputedStyle(node).fontWeight),
    '400',
  );
  assert.ok(await metadataTip.isVisible());
  assert.match(await metadataTip.textContent(), /图赋 App，可将诗词和标签（tags）写入图片元数据/);
  assert.equal(await metadataTip.locator('a').first().getAttribute('href'), '/downloads.html');
  assert.equal(await metadataTip.locator('a').last().getAttribute('href'), '/docs.html#app-save');
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
  assert.equal(await decodeImageQR('#history-card'), INVITATION_URL);
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
  await page.locator('#referral-credits').filter({ hasText: '累计获赠 6 次' }).waitFor();
  assert.equal(await page.locator('#invitation-link').getAttribute('href'), INVITATION_URL);
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

  // 手机号注册保留邀请、六位纯数字密码、确认输入与无短信告知，邮箱主路径继续单独回归。
  await page.goto(base + new URL(INVITATION_URL).pathname);
  await page.locator('#mode-register[aria-pressed=true]').waitFor();
  await page.locator('#identity').fill('+8613812345678');
  assert.equal(await page.locator('#phone-notice').count(), 0);
  await page.locator('#password').focus();
  assert.match(await page.locator('#phone-notice').textContent(), /忘记密码无法找回/);
  await page.locator('#identity').focus();
  assert.equal(await page.locator('#phone-notice').count(), 0);
  await page.locator('#identity').fill(USER.email);
  await page.locator('#password').focus();
  assert.equal(await page.locator('#phone-notice').count(), 0);
  await page.locator('#identity').fill('+8613812345678');
  assert.equal(await page.locator('#verify-panel').isVisible(), false);
  await page.locator('#password').fill('123456');
  await page.locator('#confirm-password').fill('123456');
  await page.locator('#toggle-password').click();
  assert.equal(await page.locator('#password').getAttribute('type'), 'text');
  assert.equal(await page.locator('#confirm-password').getAttribute('type'), 'text');
  await page.locator('#toggle-password').click();
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page
      .locator('.login-layout')
      .screenshot({ path: new URL(`.build/phone-register-${width}.png`, root).pathname });
  }
  const otpCalls = () => calls.filter((call) => /verify-email|resend-otp/.test(call.path)).length;
  const beforePhoneOTP = otpCalls();
  await page.locator('#auth-submit').click();
  await page.locator('#auth-status').filter({ hasText: '注册成功，无需短信验证' }).waitFor();
  const phoneRegister = calls.filter((call) => call.path.endsWith('/auth/register')).at(-1);
  assert.deepEqual(phoneRegister.body, {
    phone: PHONE_USER.phone,
    password: '123456',
    confirmPassword: '123456',
    invitationCode: INVITATION_CODE,
  });
  assert.equal(await page.locator('#password').inputValue(), '');
  assert.equal(await page.locator('#confirm-password').count(), 0);
  assert.equal(otpCalls(), beforePhoneOTP);
  phoneLocked = true;
  // 浏览器 HTTP 错误属于预期锁定反馈，不计入页面运行错误；恢复后继续真实页面流程。
  const lockConsoleStart = errors.length;
  await page.locator('#password').fill('123456');
  await page.locator('#auth-submit').click();
  await page.locator('#auth-status').filter({ hasText: '账号已锁定' }).waitFor();
  assert.ok(errors.slice(lockConsoleStart).every((message) => /423/.test(message)));
  errors.splice(lockConsoleStart);
  phoneLocked = false;
  await page.locator('#auth-submit').click();
  await page.waitForURL('**/create.html');
  await page.waitForFunction(() => !document.querySelector('#image').matches(':disabled'));
  assert.equal(await page.locator('#login-gate').isVisible(), false);
  await page.goto(base + '/account.html');
  await page.locator('#account-name').filter({ hasText: PHONE_USER.phone }).waitFor();
  assert.match(await page.locator('#account-verification').textContent(), /未核验归属/);
  await page.locator('#referral-credits').filter({ hasText: '累计获赠 6 次' }).waitFor();
  // 登录 Cookie 为持久七天，公开页回访也续期；跨越首次到期并重启 BFF 后仍可进入账户。
  const sessionCookie = (await context.cookies(base)).find((item) => item.name === 'picpoet_web_session');
  assert.ok(sessionCookie.httpOnly);
  assert.equal(sessionCookie.sameSite, 'Strict');
  assert.ok(sessionCookie.expires > Date.now() / 1000 + 7 * 24 * 3600 - 60);
  for (const publicPage of ['index', 'docs', 'pricing', 'downloads']) {
    serverNow += 6 * 24 * 3600_000;
    const renewed = page.waitForResponse((response) => response.url() === base + '/web-api/session');
    await page.goto(`${base}/${publicPage}.html`);
    const response = await renewed;
    assert.equal(response.status(), 200);
    assert.equal((await response.json()).authenticated, true);
    assert.match(await response.headerValue('set-cookie'), /Max-Age=604800/);
  }
  const port = server.address().port;
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  server = createWebServer({ config: cfg, now: () => serverNow });
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  serverNow += 6 * 24 * 3600_000;
  await page.goto(base + '/account.html');
  await page.locator('#account-name').filter({ hasText: PHONE_USER.phone }).waitFor();
  await page.locator('#referral-credits').filter({ hasText: '累计获赠 6 次' }).waitFor();
  const visitsBeforeFocus = calls.filter((call) => call.path.endsWith('/auth/refresh')).length;
  serverNow += 24 * 3600_000;
  await page.clock.fastForward(61_000);
  const focused = page.waitForResponse((response) => response.url() === base + '/web-api/session');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  assert.equal((await (await focused).json()).authenticated, true);
  assert.equal(calls.filter((call) => call.path.endsWith('/auth/refresh')).length, visitsBeforeFocus + 1);
  assert.equal(
    (await context.cookies(base)).find((item) => item.name === 'picpoet_web_session').value,
    sessionCookie.value,
  );
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  await page.locator('#logout').click();
  await page.locator('#login-gate').waitFor({ state: 'visible' });
  assert.deepEqual(errors, []);
  console.log(
    `Vue 浏览器正向验收通过：${ids.length} 种语言 × 8 页、七种宽度及四类页眉一致性、三秒轮播与持续进度动画/减少动态效果、暂停继续、邀请链接注册、拷贝诗词、创作与历史 PNG 二维码解码、累计获赠展示、购买到账、手机号注册登录、七天访问续期/公开页/前台恢复/BFF重启、退出与兼容路径。`,
  );
} finally {
  await browser.close();
  for (const item of [server, upstream]) {
    item.closeAllConnections();
    await new Promise((resolve) => item.close(resolve));
  }
  await rm(sessionDir, { recursive: true, force: true });
}
