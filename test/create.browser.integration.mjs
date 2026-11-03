// 工作目录 website/：node test/create.browser.integration.mjs
// 自包含本机 HTTP 替身 + Chrome CDP；不读取 .env、不调用真实支付或模型。
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const ID = 'a1aa1111-1111-4111-8111-111111111111';
const PLAN = 'b2bb2222-2222-4222-8222-222222222222';
const root = new URL('../', import.meta.url);
// 提前核对网站交付资源，缺失时直接报告路径，而不是等待绘图超时。
const cardFont = await readFile(new URL('assets/fonts/LXGWWenKai-Regular.ttf', root)).catch(error => {
  throw new Error('浏览器测试需要网站字体 assets/fonts/LXGWWenKai-Regular.ttf，请完成字体交付后重跑。', { cause: error });
});
const calls = [], runtimeErrors = [];
let authenticated = false, active = null, generationID = ID, generationPosts = 0, orderPosts = 0, paid = false;
let fontEnabled = false, unauthorized = false, delayedBalance = null, holdBalance = false, taskStatus = 'succeeded';
let emptyOrders = null;
let generationResult = { verse: { kind: 'ci', title: '山月 <不是标签>', cipai: '浣溪沙', lines: ['山月照清泉，松风入梦来。', '', '一纸留诗意，千山共此怀。'] }, poem: ['非优先正文'], text: '非优先文本', metadata: { title: '照片标题不可用' } };
const user = { id: 'user-one', email: 'reader@example.test', emailVerified: true };
const order = () => ({ id: ID, status: paid ? 'paid' : 'pending', credits: 10, amountMinor: 100, currency: 'CNY', payment: { paymentUrl: 'https://pay.example.test/checkout' }, ...(paid ? { delivery: { mode: 'auto_redeem', creditsGranted: 10 } } : {}) });
const reply = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname.startsWith('/web-api/')) {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString();
      let body = raw;
      if (req.headers['content-type']?.includes('application/json')) body = JSON.parse(raw);
      calls.push({ path: pathname, method: req.method, body });
      const path = pathname.slice(8);
      if (path === '/session') return reply(res, 200, authenticated ? { authenticated, user } : { authenticated });
      if (path === '/plans') return reply(res, 200, [{ id: PLAN, title: '十次诗意', credits: 10, priceMinor: 100, currency: 'CNY' }]);
      if (path === '/register') return reply(res, 200, { user, otpSent: true });
      if (path === '/verify-email' || path === '/resend-otp') return reply(res, 200, {});
      if (path === '/login') { authenticated = true; return reply(res, 200, { user }); }
      if (path === '/logout') { authenticated = false; return reply(res, 200, { authenticated }); }
      if (unauthorized || !authenticated) return reply(res, 401, { code: 'UNAUTHENTICATED' });
      if (path === '/balance') {
        const data = { free: { remaining: 3 }, paid: { remaining: paid ? 10 : 0 }, activeGenerationId: active };
        if (holdBalance) { holdBalance = false; delayedBalance = () => reply(res, 200, { ...data, paid: { remaining: 999 } }); return; }
        return reply(res, 200, data);
      }
      if (path === '/orders' && req.method === 'GET') return reply(res, 200, orderPosts ? [order()] : emptyOrders);
      if (path === '/orders' && req.method === 'POST') {
        orderPosts++; if (orderPosts === 1) return reply(res, 504, {});
        return reply(res, 200, order());
      }
      if (path === `/orders/${ID}/details`) { paid = true; return reply(res, 200, order()); }
      if (path === `/orders/${ID}/payment`) return reply(res, 200, order());
      if (path === '/generations' && req.method === 'POST') {
        generationPosts++;
        generationID = raw.match(/name="generationId"\r\n\r\n([^\r]+)/)?.[1];
        if (generationPosts === 1) return reply(res, 504, {});
        return reply(res, 202, { id: generationID, status: 'queued' });
      }
      if (path === `/generations/${generationID}/result` || path === `/generations/${ID}/result`) return reply(res, 200, { id: generationID, ...generationResult, charged: true });
      if (path === `/generations/${generationID}` || path === `/generations/${ID}`) return reply(res, 200, { id: generationID, status: taskStatus, resultAvailableUntil: '2027-01-01T00:00:00Z' });
      return reply(res, 404, {});
    }
    if (pathname === '/assets/fonts/LXGWWenKai-Regular.ttf') {
      if (!fontEnabled) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'font/ttf', 'Cache-Control': 'no-store' }); res.end(cardFont); return;
    }
    const allowed = ['create.html', 'styles.css', 'shared/create.css', 'shared/create.mjs', 'shared/create-core.mjs', 'shared/poem-card.mjs', 'shared/picpoet-tokens.css', 'assets/picpoet-mark.svg'];
    const file = pathname.slice(1);
    if (!allowed.includes(file)) { res.writeHead(404); res.end(); return; }
    const type = file.endsWith('.mjs') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
    res.writeHead(200, { 'Content-Type': type, 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
    res.end(await readFile(new URL(file, root)));
  } catch (error) { reply(res, 500, { message: error.message }); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'picpoet-create-'));
const chrome = spawn('google-chrome', ['--headless=new', '--remote-debugging-pipe', `--user-data-dir=${profile}`, '--no-first-run', '--disable-background-networking', '--disable-component-update', '--disable-sync', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
const exited = once(chrome, 'exit');
let seq = 0, buffer = '', stderr = '';
const pending = new Map();
chrome.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
chrome.stdio[4].on('data', chunk => {
  buffer += chunk.toString();
  let end;
  while ((end = buffer.indexOf('\0')) >= 0) {
    const event = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
    if (event.id) {
      const job = pending.get(event.id); if (!job) continue;
      clearTimeout(job.timer); pending.delete(event.id);
      if (event.error) job.reject(new Error(JSON.stringify(event.error))); else job.resolve(event.result);
    } else if (event.method === 'Runtime.exceptionThrown') runtimeErrors.push(event.params.exceptionDetails);
  }
});
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timeout ${stderr}`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); chrome.stdio[3].write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
  });
}
try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (method, params) => send(method, params, sessionId);
  const evaluate = async expression => {
    const value = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.ok(!value.exceptionDetails, JSON.stringify(value.exceptionDetails)); return value.result.value;
  };
  const until = async (expression, label) => {
    const result = await evaluate(`new Promise((resolve, reject) => { const end = Date.now() + 10000; const check = () => { if (${expression}) resolve(true); else if(Date.now() > end) reject(new Error(${JSON.stringify(label)})); else setTimeout(check, 25); }; check(); })`);
    assert.equal(result, true, label);
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill = (id, value) => evaluate(`document.getElementById(${JSON.stringify(id)}).value = ${JSON.stringify(value)}`);
  const login = async () => {
    await fill('email', 'reader@example.test'); await fill('password', 'test-password-only'); await click('#auth-submit');
    await until(`!document.querySelector('#account-summary').hidden && document.querySelector('#balance').textContent.includes('免费剩余')`, '登录及余额');
  };
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
  await cdp('Network.setBlockedURLs', { urls: ['https://*', 'http://pay.example.test/*'] });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `${base}/create.html` });
  await until(`document.querySelector('#auth-fields') && !document.querySelector('#auth-fields').disabled && document.querySelector('#plans button')`, '匿名页面');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, '375px 无横向溢出');
  assert.equal(await evaluate('document.querySelector("#generate").disabled'), true);
  assert.equal(await evaluate('document.querySelector("#pay-method").value'), 'alipay_wap');
  await fill('auth-mode', 'register'); await evaluate('document.querySelector("#auth-mode").dispatchEvent(new Event("change"))');
  await fill('email', 'reader@example.test'); await fill('password', 'test-password-only'); await fill('invitation', 'INVITE'); await click('#auth-submit');
  await until(`document.querySelector('#page-status').textContent.includes('注册成功')`, '注册');
  await fill('otp', '123456'); await click('#verify-form button[type=submit]');
  await until(`document.querySelector('#page-status').textContent.includes('验证成功')`, '验证码');
  await login();
  await until(`document.querySelector('#orders').textContent.includes('暂无订单') && !document.querySelector('#refresh-orders').disabled`, 'null 订单显示空列表');
  for (const invalid of [{}, 'invalid', 0, false, [null], [{ id: 'bad' }]]) {
    emptyOrders = invalid;
    await evaluate(`document.querySelector('#purchase-status').textContent = ''`);
    await click('#refresh-orders');
    await until(`/订单列表响应无效|订单编号无效/.test(document.querySelector('#purchase-status').textContent) && !document.querySelector('#refresh-orders').disabled`, '畸形订单列表仍报错');
  }
  for (const empty of [[], null]) {
    emptyOrders = empty;
    await evaluate(`document.querySelector('#orders').textContent = ''`);
    await click('#refresh-orders');
    await until(`document.querySelector('#orders').textContent.includes('暂无订单') && !document.querySelector('#refresh-orders').disabled`, '空订单兼容数组和 null');
  }
  const beforeUpload = generationPosts;
  await evaluate(`(async () => { const canvas = document.createElement('canvas'); canvas.width=320; canvas.height=200; const ctx=canvas.getContext('2d'); ctx.fillStyle='#426349'; ctx.fillRect(0,0,320,200); const blob=await new Promise(r=>canvas.toBlob(r,'image/png')); const transfer=new DataTransfer(); transfer.items.add(new File([blob],'private-location.png',{type:'image/png'})); const input=document.querySelector('#image'); input.files=transfer.files; input.dispatchEvent(new Event('change')); })()`);
  await until(`!document.querySelector('#generate').disabled`, '本地图片处理');
  assert.equal(generationPosts, beforeUpload, '选图不上传');
  await fill('poem-language', 'zh');
  await click('#generate');
  await until(`!document.querySelector('#retry-generation').hidden`, '失败可重试');
  assert.equal(await evaluate('document.querySelector("#generation-inputs").disabled'), true, '失败重试保持输入冻结');
  await click('#retry-generation');
  await until(`document.querySelector('#card-status').textContent.includes('文楷字体未能加载')`, '字体失败不可伪装成功');
  assert.equal(await evaluate('document.querySelector("#download-card").hidden'), true);
  assert.equal(await evaluate('document.querySelector("#poem-title").textContent'), '山月 <不是标签>');
  assert.equal(await evaluate('document.querySelector("#poem-body").textContent.includes("松风")'), true);
  const uploads = calls.filter(c => c.path === '/web-api/generations');
  assert.equal(uploads.length, 2);
  assert.equal(uploads[0].body.match(/name="generationId"\r\n\r\n([^\r]+)/)[1], uploads[1].body.match(/name="generationId"\r\n\r\n([^\r]+)/)[1]);
  assert.ok(uploads[0].body.includes('filename="photo.jpg"')); assert.ok(!uploads[0].body.includes('private-location'));
  for (const upload of uploads) assert.equal(upload.body.match(/name="poemLanguage"\r\n\r\n([^\r]+)/)?.[1], 'zh', '简体提交及重试遵循服务端语言契约');
  fontEnabled = true; await click('#redraw-card');
  await until(`!document.querySelector('#download-card').hidden`, '字体恢复后 PNG 导出');
  assert.equal(await evaluate('document.querySelector("#download-card").href === document.querySelector("#poem-card").src'), true, '同一 PNG 预览与下载');
  assert.equal(await evaluate('document.querySelector("#poem-card").naturalWidth'), 1080);
  // 使用同一任务读取不同契约结果；纯文本与分享图共用回退规则。
  const longBody = '山'.repeat(20001);
  for (const sample of [
    { result: { poem: ['旧诗第一行', '', '旧诗第二行'], text: '次选正文' }, body: '旧诗第一行\n\n旧诗第二行' },
    { result: { verse: null, poem: null, text: '仅文本 <不是标签>\n第二行' }, body: '仅文本 <不是标签>\n第二行' },
    { result: { poem: [longBody] }, body: longBody, error: '安全绘图' },
    { result: { text: `${longBody}水` }, body: `${longBody}水`, error: '安全绘图' },
    { result: { verse: { title: '长诗', lines: [longBody] } }, title: '长诗', body: longBody, error: '安全绘图' },
    { result: { text: '山\n'.repeat(200).trim() }, body: '山\n'.repeat(200).trim(), error: '安全尺寸' },
  ]) {
    await until(`!document.querySelector('#resume-generation').hidden`, '结果读取结束');
    generationResult = { ...sample.result, metadata: { title: '照片标题不可用' } };
    await click('#resume-generation');
    await until(`document.querySelector('#poem-body').textContent === ${JSON.stringify(sample.body)} && !document.querySelector('#resume-generation').hidden`, '回退正文完整展示');
    assert.equal(await evaluate('document.querySelector("#poem-title").textContent'), sample.title || '');
    assert.equal(await evaluate('document.querySelector("#poem-cipai").textContent'), '');
    assert.equal(await evaluate('document.querySelector("#result-content").hidden'), false);
    if (sample.error) {
      assert.ok((await evaluate('document.querySelector("#card-status").textContent')).includes(sample.error));
      assert.equal(await evaluate('document.querySelector("#download-card").hidden'), true);
    } else assert.equal(await evaluate('document.querySelector("#download-card").hidden'), false);
  }
  generationResult = { poem: ['恢复后的正文'], metadata: { title: '照片标题不可用' } };
  await click('#plans button');
  await until(`!document.querySelector('#retry-order').hidden && !document.querySelector('#retry-order').disabled`, '订单请求失败');
  await click('#retry-order');
  await until(`document.querySelector('.payment-link')`, '原订单支付恢复');
  const creations = calls.filter(c => c.path === '/web-api/orders' && c.method === 'POST');
  assert.equal(creations.length, 2); assert.deepEqual(creations[0].body, creations[1].body);
  assert.equal(creations[0].body.claimToken, undefined); assert.equal(creations[0].body.payMethod, 'alipay_wap');
  assert.equal(await evaluate('document.querySelector(".payment-link").target'), '_blank');
  assert.equal(await evaluate('document.querySelector(".payment-link").rel'), 'noopener noreferrer');
  assert.ok(!(await evaluate('document.querySelector("#orders").textContent')).includes('已到账'));
  await click('[data-action="details"]');
  await until(`document.querySelector('#orders').textContent.includes('已到账 10 次') && document.querySelector('#balance').textContent.includes('付费剩余 10')`, '手动查询到账');
  assert.deepEqual(calls.find(c => c.path.endsWith('/details')).body, {});
  assert.equal(await evaluate('localStorage.length + sessionStorage.length'), 0);
  // 刷新恢复 activeGenerationId，仅 GET 查询，不重新 POST。
  active = ID; taskStatus = 'running';
  const prior = generationPosts;
  await cdp('Page.reload');
  await until(`document.querySelector('#generation-id')?.textContent.includes('${ID}') && !document.querySelector('#stop-poll').hidden`, '恢复并轮询');
  await click('#stop-poll');
  await until(`!document.querySelector('#resume-generation').hidden`, '暂停可继续');
  taskStatus = 'succeeded';
  await click('#resume-generation');
  await until(`document.querySelector('#generation-id')?.textContent.includes('${ID}') && !document.querySelector('#download-card').hidden`, '恢复服务端任务');
  assert.equal(generationPosts, prior);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, '1280px 无横向溢出');
  holdBalance = true; await click('#refresh-balance');
  await until(`document.querySelector('#refresh-balance').disabled`, '旧账户余额请求发出');
  await click('#logout');
  await until(`document.querySelector('#page-status').textContent.includes('已退出登录')`, '退出');
  delayedBalance?.();
  await evaluate('new Promise(resolve => setTimeout(resolve, 50))');
  assert.equal(await evaluate('document.querySelector("#balance").textContent'), '');
  assert.equal(await evaluate('document.querySelector("#poem-body").textContent'), '');
  assert.equal(await evaluate('document.querySelector("#photo").getAttribute("src")'), null);
  active = null; await login(); unauthorized = true; await click('#refresh-balance');
  await until(`document.querySelector('#page-status').textContent.includes('登录已失效')`, '401 回到登录');
  assert.equal(await evaluate('document.querySelector("#auth-panel").hidden'), false);
  assert.equal(await evaluate('document.querySelector("#auth-fields").disabled'), false);
  assert.equal(await evaluate('document.querySelector("#orders").textContent'), '登录后查看订单。');
  assert.deepEqual(runtimeErrors, []);
  console.log('PASS Chrome: 375/1280 布局、注册/OTP/登录、选图不上传、任务幂等重试、语言契约、可选 verse 与超长正文、网站字体失败/恢复、PNG 同源预览下载、null 空订单与畸形列表、订单幂等/手动到账、activeGenerationId 恢复、登出晚到响应隔离、401 清理。');
} finally {
  for (const job of pending.values()) clearTimeout(job.timer);
  chrome.kill('SIGTERM'); await exited;
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 5 });
}
