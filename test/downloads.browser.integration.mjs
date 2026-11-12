// 从 website/ 执行：node test/downloads.browser.integration.mjs
// 使用 Node.js 22+ 与本机 Chrome；先启动已有 public 预览服务。
// 可设置 BASE_URL、CHROME_BIN、BROWSER_REPORT_DIR，报告目录用于保存截图与 JSON。
// 通过 CDP 管道与鼠标输入验证真实页面，测试清单仅在浏览器请求层注入。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { formatSize } from '../shared/releases.mjs';
import { androidVersionCode } from '../scripts/deployment-config.mjs';

const base = new URL(process.env.BASE_URL || 'http://127.0.0.1:8080/');
const output = process.env.BROWSER_REPORT_DIR;
const profile = await mkdtemp(join(tmpdir(), 'picpoet-browser-'));
const chrome = spawn(process.env.CHROME_BIN || 'google-chrome', [
  '--headless=new', '--remote-debugging-pipe', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--disable-component-update', '--disable-sync', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
const exited = once(chrome, 'exit');
let stderr = '';
chrome.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-12000); });
let sequence = 0;
let buffer = '';
const pending = new Map();
const listeners = new Set();
const infrastructureErrors = [];
chrome.on('error', (error) => infrastructureErrors.push(error.message));
chrome.stdio[3].on('error', (error) => infrastructureErrors.push(error.message));
chrome.stdio[4].on('data', (chunk) => {
  buffer += chunk.toString();
  let end;
  while ((end = buffer.indexOf('\0')) !== -1) {
    const message = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) continue;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    } else {
      for (const listener of listeners) {
        Promise.resolve(listener(message)).catch((error) => infrastructureErrors.push(error.message));
      }
    }
  }
});
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP 超时：${method}\n${stderr}`));
    }, 15000);
    pending.set(id, { resolve, reject, timer });
    chrome.stdio[3].write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
  });
}
async function waitFor(check, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`等待超时：${label}`);
}
const results = [];
try {
  if (output) await mkdir(output, { recursive: true });
  const browser = await send('Browser.getVersion');
  const response = await fetch(new URL('releases/stable.json', base));
  assert.equal(response.status, 200);
  const real = await response.json();
  assert.equal(real.platforms.length, 6);
  const empty = structuredClone(real);
  for (const platform of empty.platforms) {
    Object.assign(platform, { versionName: null, versionCode: null, publishedAt: null, notes: [], artifacts: [] });
  }
  const formats = { android: 'apk', ios: 'ipa', ohos: 'hap', linux: 'tar.gz', macos: 'dmg', windows: 'zip' };
  const fixture = structuredClone(empty);
  const versionName = '0.1.0';
  for (const platform of fixture.platforms) {
    Object.assign(platform, {
      versionName, versionCode: androidVersionCode(versionName), publishedAt: '2026-10-24',
      notes: ['浏览器正向联调发布说明'],
      artifacts: [{
        arch: platform.id === 'android' ? 'arm64-v8a' : 'arm64',
        format: formats[platform.id],
        url: `https://cdn.example.com/picpoet/${versionName}/${platform.id}/picpoet.${formats[platform.id]}`,
        sha256: 'a'.repeat(64), sizeBytes: 10485760,
      }],
    });
    if (platform.id === 'android') Object.assign(platform, { applicationId: 'org.picpoet.app.android', minSdk: 26 });
  }
  for (const pathname of ['downloads.html', 'pages/downloads.html']) {
    for (const width of [1280, 375]) {
      for (const [mode, manifest] of Object.entries({ published: fixture, empty, real })) {
        const label = `${pathname.replaceAll('/', '-')}-${width}-${mode}`;
        const publishedCount = manifest.platforms.filter((platform) => platform.artifacts.length).length;
        const artifactCount = manifest.platforms.reduce((count, platform) => count + platform.artifacts.length, 0);
        const statusText = publishedCount ? '' : '暂无安装包';
        const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
        const cdp = (method, params) => send(method, params, sessionId);
        const evaluate = async (expression) => {
          const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
          assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
          return result.result.value;
        };
        const errors = [];
        const requests = [];
        const manifestResponses = [];
        const externalRequests = [];
        let fulfilled = 0;
        const listener = async (event) => {
          if (event.sessionId !== sessionId) return;
          const { method, params } = event;
          if (method === 'Runtime.exceptionThrown') errors.push(params.exceptionDetails);
          if (method === 'Runtime.consoleAPICalled' && params.type === 'error') errors.push(params.args);
          if (method === 'Log.entryAdded' && params.entry.level === 'error') errors.push(params.entry);
          if (method === 'Network.requestWillBeSent') {
            const url = new URL(params.request.url);
            if (url.pathname.endsWith('/releases/stable.json') && params.type === 'Fetch') requests.push(params.request.url);
            if (url.protocol.startsWith('http') && url.origin !== base.origin) externalRequests.push(url.href);
          }
          if (method === 'Network.responseReceived' && params.type === 'Fetch' && params.response.url.endsWith('/releases/stable.json')) {
            manifestResponses.push({ url: params.response.url, status: params.response.status });
          }
          if (method === 'Fetch.requestPaused') {
            await cdp('Fetch.fulfillRequest', {
              requestId: params.requestId, responseCode: 200,
              responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Cache-Control', value: 'no-store' }],
              body: Buffer.from(JSON.stringify(manifest)).toString('base64'),
            });
            fulfilled++;
          }
        };
        listeners.add(listener);
        try {
          await cdp('Page.enable');
          await cdp('Runtime.enable');
          await cdp('Log.enable');
          await cdp('Network.enable');
          await cdp('Network.setBlockedURLs', { urls: ['https://cdn.example.com/*'] });
          await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
          await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
            globalThis.__browserEvidence = { clicks: [], statuses: [] };
            document.addEventListener('click', (event) => {
              const target = event.target.closest('button, summary, a');
              if (target) __browserEvidence.clicks.push({ tag: target.tagName, id: target.id, text: target.textContent, trusted: event.isTrusted });
            }, true);
            document.addEventListener('DOMContentLoaded', () => {
              const status = document.querySelector('#download-status');
              if (status) new MutationObserver(() => __browserEvidence.statuses.push(status.textContent)).observe(status, { childList: true, subtree: true, characterData: true });
            });
          ` });
          if (mode !== 'real') await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/releases/stable.json', requestStage: 'Request' }] });
          await cdp('Page.navigate', { url: new URL(pathname, base).href });
          const ready = () => evaluate(`Boolean(document.querySelector('#refresh-downloads') && !document.querySelector('#refresh-downloads').disabled && document.querySelector('#download-status').textContent === ${JSON.stringify(statusText)})`);
          await waitFor(ready, `${label} 首次渲染`);
          await evaluate('document.fonts.ready.then(() => true)');
          const mouseClick = async (selector) => {
            const position = await evaluate(`(async () => {
              const element = document.querySelector(${JSON.stringify(selector)});
              if (!element) throw new Error('点击目标存在：' + ${JSON.stringify(selector)});
              element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
              await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
              const box = element.getBoundingClientRect();
              const x = box.x + box.width / 2, y = box.y + box.height / 2;
              const hit = document.elementFromPoint(x, y);
              return { x, y, hit: hit === element || element.contains(hit), width: box.width, height: box.height };
            })()`);
            assert.ok(position.hit && position.width > 0 && position.height > 0, `${label} 鼠标命中 ${selector}`);
            const { x, y } = position;
            await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
            await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
            await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
          };
          const before = requests.length;
          assert.equal(before, 1, `${label} 初始清单请求`);
          await mouseClick('#refresh-downloads');
          await waitFor(async () => requests.length === before + 1 && await ready(), `${label} 鼠标刷新完成`);
          // 每个已有安装包仅展开校验值，下载链接通过 href 验证。
          for (const platform of manifest.platforms) {
            for (let index = 0; index < platform.artifacts.length; index++) {
              await mouseClick(`[data-platform="${platform.id}"] .artifact:nth-child(${index + 1}) summary`);
            }
          }
          const state = await evaluate(`({
            status: document.querySelector('#download-status').textContent,
            disabled: document.querySelector('#refresh-downloads').disabled,
            viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth,
            cards: [...document.querySelectorAll('[data-platform]')].map(card => ({
              id: card.dataset.platform,
              version: card.querySelector('.release-version')?.textContent,
              date: card.querySelector('.release-date')?.textContent,
              unavailable: card.querySelector('.release-unavailable')?.textContent,
              artifacts: [...card.querySelectorAll('.artifact')].map(artifact => {
                const code = artifact.querySelector('code');
                const range = document.createRange(); range.selectNodeContents(code);
                const box = code.getBoundingClientRect(), parent = artifact.getBoundingClientRect();
                return {
                  href: artifact.querySelector('a').href, ariaLabel: artifact.querySelector('a').getAttribute('aria-label'),
                  meta: artifact.querySelector('.artifact-meta').textContent,
                  open: artifact.querySelector('details').open, checksum: code.textContent,
                  clientWidth: code.clientWidth, scrollWidth: code.scrollWidth,
                  box: { left: box.left, right: box.right, width: box.width },
                  contained: box.left >= parent.left - 1 && box.right <= parent.right + 1,
                  textContained: [...range.getClientRects()].every(rect => rect.left >= box.left - 1 && rect.right <= box.right + 1),
                };
              }),
            })),
            evidence: __browserEvidence,
          })`);
          assert.equal(state.cards.length, manifest.platforms.length);
          assert.equal(state.status, statusText);
          assert.equal(state.disabled, false);
          assert.equal(state.viewport, width);
          assert.ok(state.documentWidth <= width && state.bodyWidth <= width, `${label} 页面横向尺寸`);
          for (const platform of manifest.platforms) {
            const card = state.cards.find((item) => item.id === platform.id);
            assert.ok(card, `${label} 平台卡片 ${platform.id}`);
            assert.equal(card.artifacts.length, platform.artifacts.length);
            if (!platform.artifacts.length) {
              assert.equal(card.unavailable, '暂未发布');
              assert.equal(card.version, undefined);
              assert.equal(card.date, undefined);
            } else {
              assert.equal(card.unavailable, undefined);
              assert.equal(card.version, `版本 ${platform.versionName}`);
              assert.equal(card.date, `发布于 ${new Date(platform.publishedAt).toLocaleDateString('zh-CN')} · ${platform.minimumSystem}`);
            }
            for (const [index, expected] of platform.artifacts.entries()) {
              const artifact = card.artifacts[index];
              assert.equal(artifact.href, expected.url);
              assert.equal(artifact.ariaLabel, `下载 ${platform.name} ${platform.versionName} ${expected.arch} ${expected.format} 安装包`);
              assert.equal(artifact.meta, `${expected.format} · ${formatSize(expected.sizeBytes)} · 外部 CDN 下载`);
              assert.equal(artifact.checksum, expected.sha256);
              assert.equal(artifact.open, true);
              assert.ok(artifact.clientWidth >= artifact.scrollWidth && artifact.contained && artifact.textContained, `${label} ${platform.id} 校验和布局`);
              assert.ok(artifact.box.left >= 0 && artifact.box.right <= width, `${label} 校验和值位于视口内`);
            }
          }
          assert.equal(state.evidence.clicks.length, artifactCount + 1);
          assert.equal(state.evidence.clicks.filter((click) => click.tag === 'SUMMARY').length, artifactCount);
          assert.ok(state.evidence.clicks.every((click) => click.trusted));
          assert.equal(state.evidence.clicks[0].id, 'refresh-downloads');
          assert.ok(state.evidence.statuses.includes('正在读取发布信息…'), `${label} 刷新中状态`);
          assert.equal(requests.length, 2);
          const manifestUrl = new URL(pathname.startsWith('pages/') ? 'pages/releases/stable.json' : 'releases/stable.json', base).href;
          assert.ok(requests.every((url) => url === manifestUrl));
          await waitFor(() => manifestResponses.length === 2 && fulfilled === (mode === 'real' ? 0 : 2), `${label} 请求证据`);
          assert.ok(manifestResponses.every((item) => item.status === 200));
          assert.deepEqual(errors, [], `${label} 浏览器异常`);
          assert.deepEqual(externalRequests, [], `${label} 所有页面请求使用本地资源`);
          if (output) {
            await evaluate('scrollTo({ top: 0, behavior: "instant" })');
            const screenshot = await cdp('Page.captureScreenshot', { captureBeyondViewport: true, fromSurface: true });
            await writeFile(join(output, `${label}.png`), Buffer.from(screenshot.data, 'base64'));
          }
          results.push({ label, requests, manifestResponses, fulfilled, errors, externalRequests, ...state });
          console.log(`PASS ${label}：${artifactCount} 安装包、${artifactCount} 校验和展开、${manifest.platforms.length - publishedCount} 暂未发布，鼠标刷新成功，宽度 ${state.documentWidth}/${width}，无 JS 异常`);
        } finally {
          listeners.delete(listener);
          await send('Target.closeTarget', { targetId });
        }
      }
    }
  }
  assert.deepEqual(infrastructureErrors, []);
  assert.equal(results.length, 12);
  const report = { browser, base: base.href, fixture, empty, real, results };
  if (output) await writeFile(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`全部 ${results.length} 个场景通过；Chrome ${browser.product}；${results.reduce((count, item) => count + item.evidence.clicks.length, 0)} 次可信鼠标点击。`);
} finally {
  if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGTERM');
  const forceKill = setTimeout(() => chrome.kill('SIGKILL'), 3000);
  await exited;
  clearTimeout(forceKill);
  for (const request of pending.values()) clearTimeout(request.timer);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
