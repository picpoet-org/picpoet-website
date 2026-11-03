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
let pagedOrders = null;
let historyMode = 'disabled', historyImage = null, holdHistory = '', delayedHistory = null, failHistoryPage = false;
const historyItem = id => ({ id, generationId: id, createdAt: '2026-11-02T01:00:00Z', expiresAt: '2027-01-31T01:00:00Z', title: '历史 <不是标签>', excerpt: '第一句\n第二句\n第三句\n第四句\n第五句\n第六句\n第七句\n第八句', poemLanguage: 'zh' });
let historyItems = [historyItem(ID), historyItem(PLAN)];
let generationResult = { verse: { kind: 'ci', title: '山月 <不是标签>', cipai: '浣溪沙', lines: ['山月照清泉，松风入梦来。', '', '一纸留诗意，千山共此怀。'] }, poem: ['非优先正文'], text: '非优先文本', metadata: { title: '照片标题不可用' } };
const user = { id: 'user-one', email: 'reader@example.test', emailVerified: true };
let failLogin = false, failVerify = false;
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
      if (path === '/verify-email' || path === '/resend-otp') return reply(res, path === '/verify-email' && failVerify ? 400 : 200, {});
      if (path === '/login') { if (failLogin) return reply(res, 401, {}); authenticated = true; return reply(res, 200, { user }); }
      if (path === '/logout') { authenticated = false; return reply(res, 200, { authenticated }); }
      if (unauthorized || !authenticated) return reply(res, 401, { code: 'UNAUTHENTICATED' });
      if (path === '/history' || path.startsWith('/history/')) {
        if (historyMode === 'disabled') return reply(res, 503, {});
        const requestItems = historyItems.slice();
        const finish = () => {
          if (path === '/history') {
            const more = new URL(req.url, 'http://localhost').searchParams.has('cursor');
            if (more && failHistoryPage) return reply(res, 502, {});
            return reply(res, 200, { items: requestItems.slice(more ? 1 : 0, more ? 2 : 1), nextCursor: !more && requestItems.length > 1 ? 'page.two' : null });
          }
          const id = path.split('/')[2];
          if (!requestItems.some(item => item.id === id) || historyMode === 'gone') return reply(res, 410, {});
          if (req.method === 'DELETE') { historyItems = historyItems.filter(item => item.id !== id); return reply(res, 200, { deleted: true }); }
          if (path.endsWith('/image')) { res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' }); res.end(historyImage); return; }
          if (historyMode === 'metadata-only') return reply(res, 200, { ...historyItem(id), verse: null, poem: [], text: '' });
          return reply(res, 200, { ...historyItem(id), verse: { title: '历史 <不是标签>', kind: 'ci', cipai: '浣溪沙', lines: ['历史第一行', '', '历史第二行'] }, poem: ['回退正文'], text: '回退正文' });
        };
        const kind = path === '/history' ? 'list' : path.endsWith('/image') ? 'image' : req.method === 'DELETE' ? 'delete' : 'detail';
        if (holdHistory === kind) { holdHistory = ''; delayedHistory = finish; return; }
        finish(); return;
      }
      if (path === '/balance') {
        const data = { free: { remaining: 3 }, paid: { remaining: paid ? 10 : 0 }, activeGenerationId: active };
        if (holdBalance) { holdBalance = false; delayedBalance = () => reply(res, 200, { ...data, paid: { remaining: 999 } }); return; }
        return reply(res, 200, data);
      }
      if (path === '/orders' && req.method === 'GET') return reply(res, 200, pagedOrders ?? (orderPosts ? [order()] : emptyOrders));
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
    const allowed = ['create.html', 'login.html', 'account.html', 'works.html', 'test/fixtures/create-workflow.html', 'shared/user-navigation.mjs', 'styles.css', 'shared/create.css', 'shared/create.mjs', 'shared/create-core.mjs', 'shared/history.mjs', 'shared/poem-card.mjs', 'shared/picpoet-tokens.css', 'assets/picpoet-mark.svg'];
    const file = pathname.slice(1);
    if (!allowed.includes(file) && file !== 'shared/waiting-poems.mjs') { res.writeHead(404); res.end(); return; }
    const type = file.endsWith('.mjs') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
    res.writeHead(200, { 'Content-Type': type, 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
    const content = await readFile(new URL(file, root));
    res.end(file === 'test/fixtures/create-workflow.html' ? content.toString().replaceAll('href="shared/', 'href="/shared/').replaceAll('src="shared/', 'src="/shared/').replaceAll('href="styles.css', 'href="/styles.css').replaceAll('src="assets/', 'src="/assets/').replaceAll('href="assets/', 'href="/assets/') : content);
  } catch (error) { reply(res, 500, { message: error.message }); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'picpoet-create-'));
const chrome = spawn('google-chrome', ['--headless=new', '--remote-debugging-pipe', `--user-data-dir=${profile}`, '--no-first-run', '--disable-background-networking', '--disable-component-update', '--disable-sync', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
const exited = once(chrome, 'exit');
let seq = 0, buffer = '', stderr = '';
let downloadDone;
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
    else if (event.method === 'Browser.downloadProgress' && event.params.state === 'completed') downloadDone?.();
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
    try {
    const result = await evaluate(`new Promise((resolve, reject) => { const end = Date.now() + 10000; const check = () => { if (${expression}) resolve(true); else if(Date.now() > end) reject(new Error(${JSON.stringify(label)})); else setTimeout(check, 25); }; check(); })`);
    assert.equal(result, true, label);
    } catch (error) {
      if (!/navigated or closed|Execution context was destroyed|Cannot find context/.test(error.message)) throw error;
      const result = await evaluate(`new Promise((resolve, reject) => { const end = Date.now() + 10000; const check = () => { if (${expression}) resolve(true); else if(Date.now() > end) reject(new Error(${JSON.stringify(label)})); else setTimeout(check, 25); }; check(); })`);
      assert.equal(result, true, label);
    }
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  // 不合成 dialog 确认按钮点击：用真实鼠标输入验证取消与确认。
  const realClick = async selector => {
    const point = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  };
  const fill = (id, value) => evaluate(`document.getElementById(${JSON.stringify(id)}).value = ${JSON.stringify(value)}`);
  const login = async () => {
    await fill('email', 'reader@example.test'); await fill('password', 'test-password-only'); await click('#auth-submit');
    await until(`!document.querySelector('#account-summary').hidden && document.querySelector('#balance').textContent.includes('免费剩余')`, '登录及余额');
  };
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
  await cdp('Network.setBlockedURLs', { urls: ['https://*', 'http://pay.example.test/*'] });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `${base}/test/fixtures/create-workflow.html` });
  await until(`document.querySelector('#auth-fields') && !document.querySelector('#auth-fields').disabled && document.querySelector('#plans button')`, '匿名页面');
  historyImage = Buffer.from(await evaluate(`(() => { const c = document.createElement('canvas'); c.width=80; c.height=60; c.getContext('2d').fillRect(0,0,80,60); return c.toDataURL('image/jpeg').split(',')[1]; })()`), 'base64');
  await evaluate(`globalThis.revokedHistoryURLs = []; const originalRevoke = URL.revokeObjectURL.bind(URL); URL.revokeObjectURL = url => { revokedHistoryURLs.push(url); originalRevoke(url); };`);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, '375px 无横向溢出');
  assert.equal(await evaluate('document.querySelector("#generate").disabled'), true);
  assert.equal(await evaluate('document.querySelector("#pay-method").value'), 'alipay_wap');
  for (const [width, height] of [[768, 1024], [900, 500], [1280, 900], [375, 900]]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `${width}px 无横向溢出`);
    if (width === 1280) {
      assert.equal(await evaluate(`Math.abs(document.querySelector('.account-panel').getBoundingClientRect().top - document.querySelector('.result-panel').getBoundingClientRect().top) < 2`), true, '桌面账户与预览顶部对齐');
    }
  }
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await evaluate(`document.querySelector('#auth-mode-field').hidden && !document.querySelector('#auth-switch').hidden`), true);
  await click('#mode-register');
  assert.equal(await evaluate(`document.querySelector('#mode-register').getAttribute('aria-pressed')`), 'true');
  await fill('email', 'reader@example.test'); await fill('password', 'test-password-only'); await fill('invitation', 'INVITE'); await click('#auth-submit');
  await until(`document.querySelector('#verify-status').textContent.includes('注册成功') && document.activeElement.id === 'otp'`, '注册后焦点到验证码');
  failVerify = true;
  await fill('otp', '123456'); await click('#verify-form button[type=submit]');
  await until(`document.activeElement.id === 'verify-status' && !document.querySelector('#verify-fields').disabled`, '验证失败就近反馈');
  assert.equal(await evaluate(`document.querySelector('#otp').value`), '123456', '验证失败保留验证码');
  failVerify = false;
  await fill('otp', '123456'); await click('#verify-form button[type=submit]');
  await until(`document.querySelector('#verify-status').textContent.includes('验证成功') && document.activeElement.id === 'password'`, '验证后焦点到密码');
  failLogin = true;
  await fill('password', 'test-password-only'); await click('#auth-submit');
  await until(`document.activeElement.id === 'auth-status' && !document.querySelector('#auth-fields').disabled`, '登录失败局部错误焦点');
  assert.equal(await evaluate(`document.querySelector('#email').value`), user.email, '登录失败保留邮箱');
  assert.equal(await evaluate(`document.querySelector('#password').value`), 'test-password-only', '登录失败保留密码以便重试');
  failLogin = false;
  await login();
  await until(`document.querySelector('#history-status').textContent.includes('历史尚未启用')`, '503 历史独立提示');
  assert.equal(await evaluate(`document.querySelector('#verify-panel').hidden`), true, '验证完成收起账户验证操作');
  assert.equal(await evaluate(`document.querySelector('#password').value`), '', '登录成功清除密码');
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
  assert.equal(await evaluate(`document.querySelector('#poem-language') === null`), true, '语言选择已移除');
  await click('#generate');
  await until(`!document.querySelector('#retry-generation').hidden`, '失败可重试');
  assert.equal(await evaluate(`!document.querySelector('#task-details').hidden && !document.querySelector('#task-details').open`), true, '任务详情按需展开');
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
  for (const upload of uploads) assert.equal(upload.body.match(/name="poemLanguage"\r\n\r\n([^\r]+)/)?.[1], 'zh', '提交及重试均固定使用简体中文');
  fontEnabled = true; await click('#redraw-card');
  await until(`!document.querySelector('#download-card').hidden`, '字体恢复后 PNG 导出');
  assert.equal(await evaluate('document.querySelector("#download-card").href === document.querySelector("#poem-card").src'), true, '同一 PNG 预览与下载');
  assert.equal(await evaluate('document.querySelector("#poem-card").naturalWidth'), 1080);
  assert.equal(await evaluate(`document.querySelector('#history-status').textContent.includes('历史尚未启用')`), true, '历史 503 不影响当前生成与 PNG');
  historyMode = 'ready'; await click('#refresh-history');
  await until(`document.querySelectorAll('.history-item').length === 1 && !document.querySelector('#refresh-history').disabled`, '历史第一页');
  assert.equal(await evaluate(`document.querySelector('#history-status').hidden && document.querySelector('#history-status').textContent === ''`), true, '作品已展示，不再重复提示加载成功');
  await evaluate(`document.querySelector('#history').scrollIntoView()`);
  await until(`document.querySelector('.history-item img').naturalWidth === 80`, '懒加载 Blob 缩略图');
  assert.equal(await evaluate(`document.querySelector('.history-item img').src.startsWith('blob:')`), true);
  assert.equal(await evaluate(`document.querySelector('.history-excerpt').textContent`), historyItem().excerpt, '卡片保留完整诗词，不截断第四句后的正文');
  assert.equal(await evaluate(`document.querySelector('#history-close') === null && document.querySelector('#history-detail-retry') === null`), true);
  assert.equal(await evaluate(`Math.abs(document.querySelector('.history-image-toggle').getBoundingClientRect().width / document.querySelector('.history-image-toggle').getBoundingClientRect().height - 3/5) < 0.01`), true, '图片为3:5纵图');
  const historyCardHeight = await evaluate(`document.querySelector('.history-item').getBoundingClientRect().height`);
  const currentWork = await evaluate(`({photo:document.querySelector('#photo').src, poem:document.querySelector('#poem-body').textContent, task:document.querySelector('#generation-id').textContent})`);
  await click('.history-item button');
  await until(`document.querySelector('#history-photo').naturalWidth === 80 && document.querySelector('#history-body').textContent.includes('历史第二行')`, '独立详情及完整诗词');
  assert.equal(await evaluate(`document.querySelector('#history-detail-title').textContent`), '历史 <不是标签>');
  assert.equal(await evaluate(`document.querySelector('#history-detail-title').children.length`), 0, '标题 textContent 防 XSS');
  assert.ok((await evaluate(`document.querySelector('#history-time').textContent`)).includes('到期时间'));
  assert.deepEqual(await evaluate(`({photo:document.querySelector('#photo').src, poem:document.querySelector('#poem-body').textContent, task:document.querySelector('#generation-id').textContent})`), currentWork);
  assert.equal(await evaluate(`document.querySelector('.history-item button').getAttribute('aria-expanded')`), 'true');
  assert.equal(await evaluate(`document.querySelector('#history-detail').matches(':modal') && document.activeElement.id === 'history-dialog-close'`), true, '详情为模态弹窗且焦点移入');
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  assert.equal(await evaluate(`document.querySelector('#history-detail').hidden`), true, '键盘可收起全文');
  assert.equal(await evaluate(`document.activeElement === document.querySelector('.history-item button')`), true, '关闭恢复图片按钮焦点');
  assert.equal(await evaluate(`document.querySelector('.history-item').getBoundingClientRect().height`), historyCardHeight, '展开不改变卡片尺寸');
  await click('.history-item button');
  await until(`document.querySelector('#history-photo').naturalWidth === 80`, '图片再次点击展开');
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 2, y: 2, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 2, y: 2, button: 'left', clickCount: 1 });
  assert.equal(await evaluate(`!document.querySelector('#history-detail').open`), true, '点击遮罩关闭弹窗');
  await realClick('.history-item button');
  await until(`document.querySelector('#history-photo').naturalWidth === 80`, '遮罩关闭后可重新打开');
  await click('#history-render');
  await until(`!document.querySelector('#history-download').hidden && document.querySelector('#history-card').naturalWidth === 1080`, '历史纯文字分享 PNG');
  assert.equal(await evaluate(`document.querySelector('#history-export-status').hidden`), true, '导出成功由预览和下载入口表达');
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: profile, eventsEnabled: true });
  const downloaded = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('历史 PNG 下载超时')), 10000);
    downloadDone = () => { clearTimeout(timer); resolve(); };
  });
  await realClick('#history-download'); await downloaded;
  const png = await readFile(join(profile, 'picpoet-history-poem.png'));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 1080);
  for (const width of [375, 768, 1280, 375]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `${width}px 历史详情无横向溢出`);
    assert.equal(await evaluate(`document.querySelector('.history-item-copy').getBoundingClientRect().left >= document.querySelector('.history-image-toggle').getBoundingClientRect().right`), true, `${width}px 图词左右排列`);
    assert.equal(await evaluate(`document.querySelector('#history-detail').scrollWidth <= document.querySelector('#history-detail').clientWidth`), true, `${width}px 弹窗内部无横向溢出`);
  }
  await realClick('#history-dialog-close');
  const longPoem = Array.from({ length: 40 }, (_, i) => `第${i + 1}句长诗正文`).join('\n');
  await evaluate(`document.querySelector('.history-excerpt').textContent = ${JSON.stringify(longPoem)}`);
  assert.equal(await evaluate(`document.querySelector('.history-item').getBoundingClientRect().height`), 300, '窄屏长诗仍保持卡片高度');
  assert.equal(await evaluate(`(() => { const body = document.querySelector('.history-excerpt'); body.scrollTop = body.scrollHeight; return body.scrollTop > 0 && body.getBoundingClientRect().bottom <= document.querySelector('.history-item-copy > .fine-print').getBoundingClientRect().top; })()`), true, '长诗可以滚动读完且不遮挡日期');
  await evaluate(`document.querySelector('.history-excerpt').textContent = ${JSON.stringify(historyItem().excerpt)}`);
  failHistoryPage = true; await click('#history-more');
  await until(`!document.querySelector('#history-retry').hidden && !document.querySelector('#refresh-history').disabled`, '分页错误提供重试');
  assert.equal(await evaluate(`document.querySelectorAll('.history-item').length`), 1, '分页失败保留已有列表');
  failHistoryPage = false; await click('#history-retry');
  await until(`document.querySelectorAll('.history-item').length === 2 && document.querySelector('#history-more').hidden`, '历史分页追加');
  await realClick('.history-item button');
  await until(`document.querySelector('#history-photo').naturalWidth === 80`, '分页后重新打开弹窗');
  await click('#history-render');
  await until(`!document.querySelector('#history-download').hidden`, '弹窗分享图就绪');
  const deletedBefore = calls.filter(call => call.path.startsWith('/web-api/history') && call.method === 'DELETE').length;
  await realClick('#history-delete');
  assert.equal(await evaluate(`document.querySelector('#history-delete-dialog').open && document.activeElement.id === 'history-delete-cancel'`), true);
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await until(`!document.querySelector('#history-delete-dialog').open`, '键盘 Escape 取消删除');
  assert.equal(calls.filter(call => call.path.startsWith('/web-api/history') && call.method === 'DELETE').length, deletedBefore);
  await realClick('#history-delete');
  await realClick('#history-delete-cancel');
  assert.equal(calls.filter(call => call.path.startsWith('/web-api/history') && call.method === 'DELETE').length, deletedBefore);
  assert.equal(await evaluate(`document.querySelector('#history-detail').hidden`), false);
  const deletedURLs = await evaluate(`[document.querySelector('#history-photo').src, document.querySelector('#history-card').src, document.querySelector('.history-item img').src]`);
  await realClick('#history-delete'); await realClick('#history-delete-confirm');
  await until(`document.querySelector('#history-status').textContent.includes('已永久删除') && document.querySelector('#history-detail').hidden`, '确认删除成功');
  assert.equal(await evaluate(`document.querySelectorAll('.history-item').length`), 1);
  assert.equal(await evaluate(`document.querySelector('#history-photo').getAttribute('src')`), null);
  assert.equal(await evaluate(`document.querySelector('#history-download').getAttribute('href')`), null);
  assert.equal(await evaluate(`${JSON.stringify(deletedURLs)}.every(url => revokedHistoryURLs.includes(url))`), true, '删除释放全部对应 URL');
  assert.deepEqual(await evaluate(`({photo:document.querySelector('#photo').src, poem:document.querySelector('#poem-body').textContent, task:document.querySelector('#generation-id').textContent})`), currentWork);
  historyMode = 'gone'; await click('.history-item button');
  await until(`document.querySelector('#history-status').textContent.includes('已删除或过期') && document.querySelector('#history-detail').hidden`, '410 提示失效并清除详情');
  historyMode = 'ready'; historyItems = []; await click('#refresh-history');
  await until(`document.querySelector('#history-status').textContent === '暂无作品'`, '作品空态不重复说明存储实现');
  historyItems = [historyItem(ID), historyItem(PLAN)];
  historyMode = 'metadata-only'; await click('#refresh-history');
  await until(`document.querySelectorAll('.history-item').length === 1 && !document.querySelector('#refresh-history').disabled`, '无诗词任务列表');
  await click('.history-item button');
  await until(`document.querySelector('#history-photo').naturalWidth === 80 && document.querySelector('#history-body').textContent.includes('没有生成诗词')`, 'metadata-only 历史仍能查看照片和删除');
  assert.equal(await evaluate(`document.querySelector('#history-delete').disabled`), false);
  assert.equal(await evaluate(`document.querySelector('#history-render').disabled`), true);
  await realClick('#history-dialog-close'); historyMode = 'ready';
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
  await until(`!document.querySelector('#waiting-poems').hidden`, '处理中显示古典诗句');
  assert.equal(await evaluate(`document.querySelector('#waiting-poems cite').textContent`), '王维《终南别业》');
  await until(`document.querySelector('#waiting-poems cite').textContent === '王维《山居秋暝》'`, '六秒后轮转诗句');
  await click('.waiting-poems-toggle');
  assert.equal(await evaluate(`document.querySelector('.waiting-poems-toggle').textContent`), '继续轮播');
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await click('.waiting-poems-toggle');
  await until(`document.querySelector('#waiting-poems cite').textContent === '常建《题破山寺后禅院》'`, '减少动态效果时仍可阅读轮转诗句');
  assert.equal(await evaluate(`document.querySelector('#waiting-poems blockquote').getAnimations().filter(a => a.playState === 'running').length`), 0);
  await cdp('Emulation.setEmulatedMedia', { features: [] });
  await until(`document.querySelector('.history-item button')`, '轮询期间历史就绪');
  await click('.history-item button');
  await until(`document.querySelector('#history-photo').naturalWidth === 80`, '轮询中仍可查看历史详情');
  assert.equal(await evaluate(`!document.querySelector('#stop-poll').hidden && document.querySelector('#generation-id').textContent.includes('${ID}')`), true, '详情不覆盖进行中的任务');
  await realClick('#history-dialog-close');
  await click('#stop-poll');
  await until(`!document.querySelector('#resume-generation').hidden`, '暂停可继续');
  assert.equal(await evaluate(`document.querySelector('#waiting-poems').hidden`), true, '暂停查询清理轮播');
  taskStatus = 'succeeded';
  await click('#resume-generation');
  await until(`document.querySelector('#generation-id')?.textContent.includes('${ID}') && !document.querySelector('#download-card').hidden`, '恢复服务端任务');
  assert.equal(generationPosts, prior);
  assert.equal(await evaluate(`document.querySelector('#waiting-poems').hidden`), true, '完成后收起轮播');
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
  // 旧列表/详情/图片/删除即使晚到，也不能写入新账户或重建 Blob URL。
  await evaluate(`globalThis.originalHistoryFetch = fetch; globalThis.fetch = (url, options) => originalHistoryFetch(url, String(url).startsWith('/web-api/history') ? {...options, signal:undefined} : options);`);
  active = null;
  for (const kind of ['list', 'detail', 'image', 'delete']) {
    historyItems = [historyItem(ID), historyItem(PLAN)];
    await login();
    await until(`document.querySelectorAll('.history-item').length === 1 && !document.querySelector('#refresh-history').disabled`, '隔离测试准备历史');
    delayedHistory = null;
    if (kind === 'list') { holdHistory = kind; await click('#refresh-history'); }
    else {
      if (kind === 'image') {
        await evaluate(`document.querySelector('#history').scrollIntoView()`);
        await until(`document.querySelector('.history-item img').naturalWidth === 80`, '先完成缩略图，挂起详情图片');
      }
      if (kind !== 'delete') holdHistory = kind;
      await click('.history-item button');
      if (kind === 'delete') {
        await until(`document.querySelector('#history-photo').naturalWidth === 80`, '删除隔离准备详情');
        holdHistory = kind; await realClick('#history-delete'); await realClick('#history-delete-confirm');
      }
    }
    // 请求确实进入替身后再退出。
    await until(`document.querySelector(${JSON.stringify(kind === 'list' ? '#history-list' : '#history-detail')}) !== null`, '历史请求启动');
    if (!delayedHistory) await evaluate('new Promise(resolve => setTimeout(resolve, 100))');
    assert.ok(delayedHistory, `挂起 ${kind}`);
    await click('#logout');
    await until(`document.querySelector('#page-status').textContent.includes('已退出登录')`, '历史请求中退出');
    user.id = 'user-two'; user.email = 'second@example.test'; historyItems = [];
    await login();
    await until(`document.querySelector('#history-status').textContent.includes('暂无作品')`, '新账户作品独立空态');
    delayedHistory();
    await evaluate('new Promise(resolve => setTimeout(resolve, 100))');
    assert.equal(await evaluate(`document.querySelector('#history-list').children.length`), 0);
    assert.equal(await evaluate(`document.querySelector('#history-photo').getAttribute('src')`), null);
    assert.equal(await evaluate(`document.querySelector('#history-body').textContent`), '');
    assert.equal(await evaluate(`document.querySelector('#history-detail').hidden`), true);
    await click('#logout'); await until(`document.querySelector('#page-status').textContent.includes('已退出登录')`, '清理隔离测试账户');
    user.id = 'user-one'; user.email = 'reader@example.test';
  }
  await evaluate(`globalThis.fetch = originalHistoryFetch`);
  active = null; await login(); unauthorized = true; await click('#refresh-balance');
  await until(`document.querySelector('#page-status').textContent.includes('登录已失效')`, '401 回到登录');
  assert.equal(await evaluate('document.querySelector("#auth-panel").hidden'), false);
  assert.equal(await evaluate('document.querySelector("#auth-fields").disabled'), false);
  assert.equal(await evaluate('document.querySelector("#orders").textContent'), '登录后查看订单。');
  assert.deepEqual(runtimeErrors, []);
  unauthorized = false; authenticated = false; active = null;
  historyMode = 'ready'; historyItems = [historyItem(ID)];
  await cdp('Page.navigate', { url: `${base}/works.html` });
  await until(`document.querySelector('#login-gate') && !document.querySelector('#login-gate').hidden`, '作品页未登录入口');
  assert.equal(await evaluate(`document.querySelector('#login-link').getAttribute('href')`), 'login.html?returnTo=works.html');
  await click('#login-link');
  await until(`document.querySelector('#auth-fields') && !document.querySelector('#auth-fields').disabled`, '独立登录页');
  await fill('email', user.email); await fill('password', 'test-password-only'); await click('#auth-submit');
  await until(`location.pathname === '/works.html' && document.querySelector('#history-list').children.length > 0`, '登录返回作品页');
  assert.equal(await evaluate(`document.getElementById('create-form') === null && document.getElementById('plans') === null`), true);
  for (const [width, height] of [[375, 900], [600, 900], [844, 390], [1280, 900]]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, `${width}px 作品页无横向溢出`);
    assert.equal(await evaluate(`(() => {
      const card = document.querySelector('.history-item').getBoundingClientRect();
      const image = document.querySelector('.history-image-toggle').getBoundingClientRect();
      const copy = document.querySelector('.history-item-copy').getBoundingClientRect();
      const intro = document.querySelector('.works-intro').getBoundingClientRect();
      const toolbar = document.querySelector('#history > .section-top').getBoundingClientRect();
      return image.bottom <= card.bottom - 12 && copy.left >= image.right + 16 && toolbar.top >= intro.bottom && card.top >= toolbar.bottom + 23;
    })()`), true, `${width}px 图词间距、卡片边界与区块留白`);
    assert.equal(await evaluate(`parseFloat(getComputedStyle(document.querySelector('.history-excerpt')).fontSize) >= 16`), true, '诗词正文保持可读字号');
    assert.equal(await evaluate(`document.querySelector('.history-excerpt').textContent`), historyItem().excerpt);
  }
  await realClick('.history-image-toggle');
  await until(`document.querySelector('#history-photo').naturalWidth === 80`, '作品页详情弹窗');
  assert.equal(await evaluate(`document.querySelector('#history-detail').scrollWidth <= document.querySelector('#history-detail').clientWidth`), true);
  await realClick('#history-dialog-close');
  await cdp('Page.navigate', { url: `${base}/account.html#purchase` });
  await until(`document.querySelector('#balance')?.textContent.includes('免费剩余') && document.querySelector('#plans button')`, '个人中心加载次数套餐');
  await until(`document.querySelector('#page-status').hidden && document.querySelector('#page-status').textContent === ''`, '次数和订单加载后收起提示且不占空间');
  await until(`document.querySelector('#purchase-status').hidden && document.querySelector('#purchase-status').textContent === ''`, '套餐正常展示后没有说明条');
  await click('#refresh-plans');
  await until(`!document.querySelector('#refresh-plans').disabled`, '套餐刷新完成');
  assert.equal(await evaluate(`document.querySelector('#purchase-status').hidden`), true);
  assert.equal(await evaluate(`document.querySelector('#orders-panel').open`), false);
  await click('#orders-panel > summary');
  assert.equal(await evaluate(`document.querySelector('#orders-panel').open`), true);
  assert.equal(await evaluate(`document.querySelector('#pay-method') === null`), true);
  await click('#orders [data-action="details"]');
  await until(`document.querySelector('.order-feedback')?.textContent.includes('已到账') && !document.querySelector('#refresh-orders').disabled`, '到账提示属于对应订单');
  assert.equal(await evaluate(`document.querySelector('#purchase-status').hidden`), true);
  for (const [width, expected] of [[1280, 'alipay_page'], [375, 'alipay_wap']]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await click('#plans button');
    await until(`!document.querySelector('#refresh-orders').disabled && document.querySelector('#purchase-status').hidden`, '自动支付方式下单成功');
    assert.equal(calls.filter(call => call.path === '/web-api/orders' && call.method === 'POST').at(-1).body.payMethod, expected);
  }
  await click('#refresh-orders');
  await until(`!document.querySelector('#refresh-orders').disabled`, '展开后刷新订单');
  assert.equal(await evaluate(`document.querySelector('#orders-panel').open`), true);
  assert.equal(await evaluate(`document.querySelectorAll('#balance dt').length === 2 && document.querySelectorAll('#balance strong').length === 2`), true);
  assert.equal(await evaluate(`document.querySelector('.order-reference')?.open`), false);
  await click('.order-reference summary');
  assert.equal(await evaluate(`document.querySelector('.order-reference').open`), true);
  pagedOrders = Array.from({ length: 12 }, (_, index) => ({ ...order(), id: `12345678-1234-4234-8234-${String(index + 1).padStart(12, '0')}` }));
  await click('#refresh-orders');
  await until(`document.querySelector('#orders-page').textContent === '1 / 3' && !document.querySelector('#refresh-orders').disabled`, '12 个订单分为三页');
  assert.equal(await evaluate(`document.querySelectorAll('#orders .order-item').length`), 5);
  assert.equal(await evaluate(`document.querySelector('#orders-prev').disabled`), true);
  await click('#orders-next');
  assert.equal(await evaluate(`document.querySelector('#orders-page').textContent`), '2 / 3');
  assert.equal(await evaluate(`document.querySelector('#orders .order-item').dataset.orderId`), pagedOrders[5].id);
  await click('#refresh-orders');
  await until(`!document.querySelector('#refresh-orders').disabled`, '刷新保持当前页');
  assert.equal(await evaluate(`document.querySelector('#orders-page').textContent`), '2 / 3');
  await click('#orders-next');
  assert.equal(await evaluate(`document.querySelectorAll('#orders .order-item').length`), 2);
  assert.equal(await evaluate(`document.querySelector('#orders-next').disabled`), true);
  await click('#plans button');
  await until(`!document.querySelector('#refresh-orders').disabled && document.querySelector('#orders-page').textContent.startsWith('1 /')`, '下单返回旧订单时回第一页');
  assert.equal(await evaluate(`document.querySelector('#orders .order-item').dataset.orderId`), ID);
  await click('#plans button');
  await until(`!document.querySelector('#refresh-orders').disabled`, '再次复用同一订单');
  assert.equal(await evaluate(`document.querySelectorAll('#orders [data-order-id="${ID}"]').length`), 1);
  await click('#orders-next');
  await click('#orders-next');
  await click('#orders-prev');
  assert.equal(await evaluate(`document.querySelector('#orders-page').textContent`), '2 / 3');
  pagedOrders = pagedOrders.slice(0, 5);
  await click('#refresh-orders');
  await until(`!document.querySelector('#refresh-orders').disabled && document.querySelector('#orders-pagination').hidden`, '列表缩短后回第一页并隐藏分页');
  assert.equal(await evaluate(`document.querySelectorAll('#orders .order-item').length`), 5);
  pagedOrders = [];
  await click('#refresh-orders');
  await until(`document.querySelector('#orders').textContent.includes('暂无订单') && !document.querySelector('#refresh-orders').disabled`, '空订单不显示分页');
  assert.equal(await evaluate(`document.querySelector('#orders-pagination').hidden`), true);
  pagedOrders = null;
  for (const [width, height] of [[375, 812], [812, 375], [768, 900], [1280, 900]]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `个人中心 ${width} 无横向溢出`);
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('#plans button, #refresh-balance, #refresh-orders')).every(el => el.getBoundingClientRect().height >= 44)`), true);
  }
  assert.equal(await evaluate(`document.getElementById('history-list') === null && document.getElementById('auth-form') === null`), true);
  await cdp('Page.navigate', { url: `${base}/create.html` });
  await until(`document.querySelector('#generation-inputs') && !document.querySelector('#generation-inputs').disabled`, '跨页会话创作');
  assert.equal(await evaluate(`document.getElementById('orders') === null && document.getElementById('auth-form') === null && document.getElementById('history-list') === null`), true);
  for (const width of [375, 768, 1280]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  }
  await cdp('Page.navigate', { url: `${base}/account.html` });
  await until(`document.querySelector('#logout') && !document.querySelector('#logout').hidden`, '个人中心退出入口');
  await click('#logout');
  await until(`document.querySelector('#page-status').textContent.includes('已退出登录')`, '个人中心退出');
  await cdp('Page.navigate', { url: `${base}/create.html` });
  await until(`document.querySelector('#login-gate') && !document.querySelector('#login-gate').hidden`, '退出后创作需登录');
  assert.equal(await evaluate(`document.querySelector('#generation-inputs').disabled`), true);
  assert.equal(runtimeErrors.length, 0, JSON.stringify(runtimeErrors));
  console.log('PASS Chrome: 原业务全流程、独立登录回跳、作品页、个人中心、跨页会话、退出保护及响应式布局。');
} finally {
  for (const job of pending.values()) clearTimeout(job.timer);
  chrome.kill('SIGTERM'); await exited;
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 5 });
}
