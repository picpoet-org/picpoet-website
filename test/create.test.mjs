import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateImage, imageDimensions, prepareImage, MAX_IMAGE_BYTES, MAX_SOURCE_IMAGE_BYTES, generationAttempt, generationForm, orderAttempt, safePaymentURL, orderStatus, createAPI, createScope, pollGeneration, wait, errorMessage, ApiError, uuid } from '../shared/create-core.mjs';
import { poemData, wrapText, cardLayout, CARD } from '../shared/poem-card.mjs';
import { secureUUID } from '../shared/create-core.mjs';

test('局域网 HTTP 缺少 randomUUID 时用安全随机数生成 UUID v4', () => {
  assert.equal(secureUUID({ getRandomValues: bytes => bytes.fill(255) }), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
  const crypto = { getRandomValues: bytes => globalThis.crypto.getRandomValues(bytes) };
  const ids = Array.from({ length: 100 }, () => uuid(() => secureUUID(crypto)));
  assert.equal(new Set(ids).size, 100);
  assert.throws(() => secureUUID({}), /安全请求编号/);
  assert.equal(secureUUID({ randomUUID: () => 'native-uuid' }), 'native-uuid');
});
const ID = 'a1aa1111-1111-4111-8111-111111111111';
const PLAN = 'b2bb2222-2222-4222-8222-222222222222';
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

test('createAPI 显式 DELETE，默认无 body GET、有 body POST 保持兼容', async () => {
  const calls = [];
  const api = createAPI({ fetchImpl: async (url, options) => { calls.push({ url, ...options }); return json({ deleted: true }); } });
  await api('/history?limit=20'); await api('/login', { body: {} }); await api(`/history/${ID}`, { method: 'DELETE' });
  assert.deepEqual(calls.map(call => call.method), ['GET', 'POST', 'DELETE']);
  assert.equal(calls[2].body, undefined);
  assert.ok(calls.every(call => call.credentials === 'same-origin' && call.redirect === 'error' && call.cache === 'no-store'));
});

test('只接受四种图片 MIME，原图允许到 25 MiB，超过一个字节拒绝', () => {
  assert.equal(MAX_SOURCE_IMAGE_BYTES, 25 * 1024 * 1024);
  for (const type of ['image/jpeg', 'image/png', 'image/gif', 'image/webp']) assert.doesNotThrow(() => validateImage({ type, size: MAX_SOURCE_IMAGE_BYTES }));
  assert.doesNotThrow(() => validateImage({ type: 'image/jpeg', size: 21241635 }));
  for (const file of [null, { type: 'image/svg+xml', size: 10 }, { type: 'image/jpeg', size: 0 }, { type: 'image/png', size: MAX_SOURCE_IMAGE_BYTES + 1 }, { type: 'image/jpeg', size: NaN }]) assert.throws(() => validateImage(file));
});
test('25 MiB 原图可本地压缩，重编码输出仍限制 10 MiB', async () => {
  assert.equal(MAX_IMAGE_BYTES, 10 * 1024 * 1024);
  const file = { type: 'image/jpeg', size: MAX_SOURCE_IMAGE_BYTES };
  const output = new Blob(['compressed'], { type: 'image/jpeg' });
  let encoded = output;
  const options = {
    decode: async () => ({ width: 4000, height: 3000, close() {} }),
    makeCanvas: () => ({ getContext: () => ({ fillRect() {}, drawImage() {} }), toBlob: cb => cb(encoded) }),
  };
  assert.equal((await prepareImage(file, options)).blob, output);
  encoded = { type: 'image/jpeg', size: MAX_IMAGE_BYTES + 1 };
  await assert.rejects(prepareImage(file, options), /仍然过大/);
});
test('像素边界、横竖图缩放与小图不放大', () => {
  assert.deepEqual(imageDimensions(8000, 5000), { width: 2048, height: 1280 });
  assert.deepEqual(imageDimensions(1000, 4000), { width: 512, height: 2048 });
  assert.deepEqual(imageDimensions(20, 10), { width: 20, height: 10 });
  for (const [w, h] of [[8001, 5000], [0, 1], [Infinity, 1], [1.5, 20]]) assert.throws(() => imageDimensions(w, h));
});
test('图片经过 bitmap → 白底 Canvas → JPEG，不上传原字节或文件名', async () => {
  const calls = []; let closed = false;
  const output = new Blob(['reencoded'], { type: 'image/jpeg' });
  const canvas = { getContext: () => ({ fillRect: (...args) => calls.push(['fill', ...args]), drawImage: (...args) => calls.push(['draw', ...args]) }), toBlob: (cb, type, quality) => { calls.push(['export', type, quality]); cb(output); } };
  const bitmap = { width: 4096, height: 2048, close: () => { closed = true; } };
  const input = new Blob(['original-exif'], { type: 'image/png' });
  const result = await prepareImage(input, { decode: async file => { assert.equal(file, input); return bitmap; }, makeCanvas: () => canvas });
  assert.equal(result.blob, output); assert.equal(result.width, 2048); assert.equal(result.height, 1024);
  assert.deepEqual(calls[0], ['fill', 0, 0, 2048, 1024]); assert.deepEqual(calls[2], ['export', 'image/jpeg', .9]);
  assert.equal(closed, true); assert.equal(canvas.width, 0);
});
test('解码失败、像素超限、编码失败均明确失败并释放 bitmap', async () => {
  const file = new Blob(['x'], { type: 'image/jpeg' });
  await assert.rejects(prepareImage(file, { decode: async () => { throw new Error(); } }), /无法解码/);
  await assert.rejects(prepareImage(file, { decode: null }), /不支持/);
  let closed = 0;
  await assert.rejects(prepareImage(file, { decode: async () => ({ width: 10000, height: 10000, close: () => closed++ }) }), /4000 万/);
  await assert.rejects(prepareImage(file, { decode: async () => ({ width: 1, height: 1, close: () => closed++ }), makeCanvas: () => ({ getContext: () => ({ fillRect() {}, drawImage() {} }), toBlob: cb => cb(null) }) }), /无法导出/);
  assert.equal(closed, 2);
});
test('作品优先读取 verse.title/lines，照片 metadata.title 不混入作品', () => {
  const data = poemData({ verse: { kind: 'ci', title: ' 山月 ', cipai: '浣溪沙', lines: ['山月照清泉', '', '松风入梦来'] }, metadata: { title: 'GPS photo title' }, poem: ['非优先正文'], text: 'not authoritative' });
  assert.deepEqual(data, { title: '山月', cipai: '浣溪沙', body: '山月照清泉\n\n松风入梦来' });
  assert.throws(() => poemData({ verse: { title: '空', lines: [''] } }), /正文/);
  assert.throws(() => poemData({ verse: { title: '错', lines: [1] } }), /结构化/);
  assert.equal(poemData({ verse: { kind: 'poem', title: '<img onerror=x>', lines: ['<script>'], cipai: '不展示' } }).cipai, '');
});
test('缺少 verse 时先读取 poem 字符串数组，再回退 text，标题留空', () => {
  const metadata = { title: '照片标题不可用' };
  for (const verse of [undefined, null]) {
    assert.deepEqual(poemData({ verse, poem: [' 山月', '', '清泉 '], text: '次选正文', metadata }), { title: '', cipai: '', body: '山月\n\n清泉' });
    for (const poem of [undefined, null, [], ['  '], [1], '不是数组']) {
      assert.deepEqual(poemData({ verse, poem, text: ' 旧文本\n第二行 ', metadata }), { title: '', cipai: '', body: '旧文本\n第二行' });
    }
  }
  for (const result of [null, {}, { poem: [1] }, { text: 123 }, { text: '  ' }, { poem: [] }]) assert.throws(() => poemData(result), /正文/);
});
test('超长 verse、poem、text 均保留完整正文，仅绘图受字符数限制', () => {
  const body = '山'.repeat(CARD.maxCharacters + 1);
  for (const result of [{ verse: { title: '', lines: [body] } }, { poem: [body] }, { text: body }]) {
    const data = poemData(result);
    assert.equal(data.body, body);
    assert.throws(() => cardLayout(data, () => 48), /安全绘图/);
  }
});
test('真实换行保留、长句折行、字距和 grapheme 不被拆开', () => {
  assert.deepEqual(wrapText('一二三四\n\n五六', () => 10, 22, 2), ['一二', '三四', '', '五六']);
  assert.deepEqual(wrapText('👨‍👩‍👦春', () => 10, 10), ['👨‍👩‍👦', '春']);
  assert.deepEqual(wrapText('abc\r\nd', () => 1, 2), ['ab', 'c', 'd']);
  assert.throws(() => wrapText('山', () => 100, 50), /宽度/);
});
test('分享卡 1080 宽、边距 96、标题72正文48，长诗有安全高度上限', () => {
  const measure = (_g, size) => size;
  const layout = cardLayout({ title: '山月', body: '清泉\n松风', cipai: '' }, measure);
  assert.equal(layout.width, 1080); assert.equal(CARD.padding, 96);
  assert.equal(layout.blocks[0].size, 72); assert.equal(layout.body.size, 48);
  assert.equal(layout.height, Math.ceil(layout.body.y + layout.body.height + 64));
  const long = cardLayout({ title: '', body: '山'.repeat(1000), cipai: '' }, measure);
  assert.ok(long.height > layout.height && long.height <= CARD.maxHeight);
  assert.throws(() => cardLayout({ title: '', body: '山\n'.repeat(200), cipai: '' }, measure), /安全尺寸/);
  assert.throws(() => cardLayout({ title: '山', body: '山'.repeat(CARD.maxCharacters), cipai: '' }, measure), /安全绘图/);
});
test('任务重试使用同一个冻结快照和 UUID，只提交 image/generationId/可选语言', () => {
  let created = 0; const image = new Blob(['jpeg'], { type: 'image/jpeg' });
  const attempt = generationAttempt(image, 'zh-Hant', () => { created++; return ID; });
  const first = generationForm(attempt), retry = generationForm(attempt);
  assert.equal(created, 1); assert.equal(Object.isFrozen(attempt), true);
  assert.equal(first.get('generationId'), retry.get('generationId')); assert.equal(first.get('poemLanguage'), 'zh-Hant');
  assert.equal(first.get('image').name, 'photo.jpg'); assert.deepEqual([...first.keys()], ['generationId', 'image', 'poemLanguage']);
  assert.deepEqual([...generationForm(generationAttempt(image, '', () => ID)).keys()], ['generationId', 'image']);
  assert.equal(generationForm(generationAttempt(image, 'zh', () => ID)).get('poemLanguage'), 'zh');
  assert.throws(() => generationAttempt(image, 'zh-Hans', () => ID));
  assert.throws(() => generationAttempt(image, 'en', () => ID));
  assert.throws(() => uuid(() => 'bad'));
});
test('订单快照保留请求编号与支付方式，不含 claimToken 或其它鉴权字段', () => {
  const order = orderAttempt(PLAN, 'alipay_page', () => ID);
  assert.deepEqual(order, { planId: PLAN, payMethod: 'alipay_page', requestId: ID });
  assert.equal(Object.isFrozen(order), true);
  assert.throws(() => orderAttempt(PLAN, 'alipay_app', () => ID));
});
test('支付 URL 只允许绝对 HTTP(S)，生产 HTTPS，拒绝危险协议与凭据', () => {
  assert.equal(safePaymentURL('https://pay.example/path?a=1'), 'https://pay.example/path?a=1');
  assert.equal(safePaymentURL('http://pay.example/path', 'http://localhost:8090'), 'http://pay.example/path');
  for (const raw of ['javascript:alert(1)', 'data:text/html,x', 'file:///tmp/a', '//pay.example/a', '/pay', 'https://user:pass@pay.example', ' https://pay.example', 'https://pay.example/\n', 'https:\\pay.example']) assert.throws(() => safePaymentURL(raw));
  assert.throws(() => safePaymentURL('http://pay.example', 'http://production.example'));
  assert.throws(() => safePaymentURL('http://pay.example', 'https://localhost'));
});
test('局域网联调入口允许 HTTP 收银台，其他来源及危险链接仍拒绝', () => {
  const page = 'http://192.168.31.7:18090/account.html';
  const payment = 'http://192.168.31.7:13100/api/payment/cashier/test-order';
  assert.equal(safePaymentURL(payment, page), payment);
  assert.equal(safePaymentURL('https://pay.example/path', page), 'https://pay.example/path');
  for (const origin of ['https://192.168.31.7:18090', 'http://192.168.31.7:8080', 'http://192.168.31.8:18090', 'http://192.168.31.7.evil.example:18090', 'http://production.example', 'https://picpoet.jqknono.com']) {
    assert.throws(() => safePaymentURL(payment, origin));
  }
  for (const raw of ['javascript:alert(1)', 'data:text/html,x', '//pay.example/path', '/pay', 'http://user:pass@192.168.31.7:13100/pay']) {
    assert.throws(() => safePaymentURL(raw, page));
  }
});
test('支付链接存在、跳转或 paid 本身都不冒充到账', () => {
  assert.match(orderStatus({ status: 'pending', payment: { paymentUrl: 'https://pay.example' } }), /待/);
  assert.match(orderStatus({ status: 'paid' }), /请查询到账/);
  assert.equal(orderStatus({ status: 'paid', delivery: { mode: 'auto_redeem', creditsGranted: 10 } }), '已到账 10 次');
  assert.equal(orderStatus({ status: 'closed' }), '订单已关闭');
});
test('请求只用同源 BFF Cookie；orders details/payment 明确 POST {}', async () => {
  const calls = [];
  const api = createAPI({ fetchImpl: async (url, options) => { calls.push({ url, options }); return json({ ok: true }); } });
  await api(`/orders/${ID}/details`, { body: {} }); await api(`/orders/${ID}/payment`, { body: {} }); await api('/balance');
  for (const call of calls) {
    assert.ok(call.url.startsWith('/web-api/')); assert.equal(call.options.credentials, 'same-origin'); assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.headers.Authorization, undefined);
  }
  assert.equal(calls[0].options.body, '{}'); assert.equal(calls[1].options.method, 'POST'); assert.equal(calls[2].options.method, 'GET');
});
test('请求网络重试复用订单 requestId', async () => {
  const bodies = []; let count = 0;
  const api = createAPI({ fetchImpl: async (_url, options) => { bodies.push(options.body); if (++count === 1) throw new TypeError('network'); return json({ id: ID }); } });
  const attempt = orderAttempt(PLAN, 'alipay_wap', () => ID);
  await assert.rejects(api('/orders', { body: attempt }));
  await api('/orders', { body: attempt }); assert.equal(bodies[0], bodies[1]);
});
test('HTTP 错误使用可理解文案，不呈现上游错误体或密钥', async () => {
  const api = createAPI({ fetchImpl: async () => json({ message: '<script>secret</script>' }, 401) });
  await assert.rejects(api('/balance'), error => error instanceof ApiError && error.status === 401 && !error.message.includes('secret'));
  assert.match(errorMessage(new ApiError(409)), /恢复任务/);
  assert.match(errorMessage(new ApiError(504)), /原编号/);
  assert.match(errorMessage(new TypeError('fetch failed')), /网络/);
  await assert.rejects(createAPI({ fetchImpl: async () => new Response('<html>') })('/session'), /格式异常/);
});
test('请求超时可重试，账户取消与超时可区分', async () => {
  const fetchImpl = (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  await assert.rejects(createAPI({ fetchImpl, timeoutMs: 5 })('/balance'), error => error.status === 504);
  const scope = createScope(), ticket = scope.capture(); scope.reset();
  await assert.rejects(createAPI({ fetchImpl })('/balance', { signal: ticket.signal }), { name: 'AbortError' });
});
test('退出/切换账户会中止旧世代，忽略不遵守 abort 的晚到响应', async () => {
  const scope = createScope(), old = scope.capture();
  let resolve;
  const api = createAPI({ fetchImpl: () => new Promise(done => { resolve = done; }) });
  const request = api('/balance', { signal: old.signal });
  scope.reset(); resolve(json({ private: 'old user' }));
  await assert.rejects(request, { name: 'AbortError' });
  assert.equal(scope.current(old), false); assert.throws(() => scope.assert(old), { name: 'AbortError' });
  assert.equal(scope.current(scope.capture()), true);
});
test('轮询有上限，继续仅查询原任务，不创建新的 UUID', async () => {
  let queries = 0, delays = 0;
  const options = { read: async () => { queries++; return { status: 'running', id: ID }; }, signal: new AbortController().signal, delay: async () => { delays++; }, limit: 3 };
  assert.deepEqual(await pollGeneration(options), { status: 'paused' }); assert.equal(queries, 3); assert.equal(delays, 2);
  assert.deepEqual(await pollGeneration(options), { status: 'paused' }); assert.equal(queries, 6);
});
test('轮询成功/失败/过期终止，未知状态报错，取消后不回写状态', async () => {
  for (const status of ['succeeded', 'failed', 'expired']) {
    let count = 0;
    assert.equal((await pollGeneration({ signal: new AbortController().signal, read: async () => { count++; return { status }; } })).status, status);
    assert.equal(count, 1);
  }
  await assert.rejects(pollGeneration({ signal: new AbortController().signal, read: async () => ({ status: 'alien' }) }), /无法识别/);
  const controller = new AbortController(); let writes = 0;
  await assert.rejects(pollGeneration({ signal: controller.signal, read: async () => { controller.abort(); return { status: 'succeeded' }; }, onStatus: () => writes++ }), { name: 'AbortError' });
  assert.equal(writes, 0);
  await assert.rejects(wait(100, controller.signal), { name: 'AbortError' });
});
test('页面链接、label、noscript；用户数据使用纯文本，无持久敏感存储', async () => {
  const html = await readFile(new URL('../create.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('../shared/create.mjs', import.meta.url), 'utf8');
  assert.match(html, /<noscript>/); assert.match(html, /aria-live="polite"/);
  for (const path of ['shared/picpoet-tokens.css', 'styles.css', 'shared/create.css', 'shared/create.mjs']) assert.ok(html.includes(path));
  const forms = html + await readFile(new URL('../login.html', import.meta.url), 'utf8') + await readFile(new URL('../account.html', import.meta.url), 'utf8');
  for (const id of ['image', 'email', 'password', 'otp', 'verify-email']) assert.ok(forms.includes(`for="${id}"`));
  for (const removed of ['poem-language', '体裁、格律等使用官方服务默认设置。', '与下载、系统分享使用同一张 PNG', '这里是预览区域，并非示例作品。']) assert.ok(!forms.includes(removed));
  assert.doesNotMatch(forms, /id="pay-method"/);
  assert.doesNotMatch(script, /\.innerHTML\s*=|localStorage\.|sessionStorage\./);
  assert.doesNotMatch(script, /link\.target = '_blank'/);
});
