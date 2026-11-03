// 页面与 node:test 共用的边界校验、请求身份及生命周期。
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
export const POLL_LIMIT = 40;
export const POLL_INTERVAL = 3000;

export function validateImage(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    throw new Error('请选择 JPEG、PNG、WebP 或 GIF 图片；动图仅使用浏览器解码的首帧。');
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error('原图需大于 0 且不超过 25 MiB。');
  }
}
export function imageDimensions(width, height) {
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0) || width * height > MAX_IMAGE_PIXELS) {
    throw new Error('图片尺寸无效或超过 4000 万像素，请先缩小原图。');
  }
  const scale = Math.min(1, 2048 / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
export function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob?.size ? resolve(blob) : reject(new Error('浏览器无法导出图片，请重试或更换浏览器。')), type, quality);
  });
}
export async function prepareImage(file, { decode = globalThis.createImageBitmap, makeCanvas = () => document.createElement('canvas') } = {}) {
  validateImage(file);
  if (typeof decode !== 'function') throw new Error('此浏览器不支持安全图片解码，请使用新版浏览器。');
  let bitmap;
  try { bitmap = await decode(file); } catch { throw new Error('浏览器无法解码这张图片，请转换为 JPEG 或 PNG 后重试。'); }
  let canvas;
  try {
    const size = imageDimensions(bitmap.width, bitmap.height);
    canvas = makeCanvas();
    Object.assign(canvas, size);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('浏览器无法创建图片画布。');
    ctx.fillStyle = '#f5f3ee';
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await canvasBlob(canvas, 'image/jpeg', 0.9);
    if (blob.type !== 'image/jpeg' || blob.size > MAX_IMAGE_BYTES) throw new Error('图片重编码失败或仍然过大，请缩小后重试。');
    return { blob, ...size };
  } finally {
    bitmap.close();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
export function uuid(make = () => globalThis.crypto.randomUUID()) {
  const id = make();
  if (!UUID.test(id)) throw new Error('浏览器无法创建请求编号，请在 HTTPS 或本机地址使用新版浏览器。');
  return id.toLowerCase();
}
export function generationAttempt(image, poemLanguage, makeUUID) {
  if (!image || image.type !== 'image/jpeg') throw new Error('请先选择并处理图片。');
  if (!['', 'zh', 'zh-Hant'].includes(poemLanguage)) throw new Error('请选择支持的诗词语言。');
  return Object.freeze({ id: uuid(makeUUID), image, poemLanguage });
}
export function generationForm(attempt) {
  const form = new FormData();
  form.set('generationId', attempt.id);
  form.set('image', attempt.image, 'photo.jpg');
  if (attempt.poemLanguage) form.set('poemLanguage', attempt.poemLanguage);
  return form;
}
export function orderAttempt(planId, payMethod, makeUUID) {
  if (!UUID.test(planId) || !['alipay_page', 'alipay_wap'].includes(payMethod)) throw new Error('套餐或支付方式无效，请刷新套餐。');
  return Object.freeze({ planId, payMethod, requestId: uuid(makeUUID) });
}
export function safePaymentURL(raw, pageURL = 'https://picpoet.jqknono.com') {
  if (typeof raw !== 'string' || raw.length > 8192 || /[\u0000-\u0020\u007f\\]/u.test(raw)) throw new Error('支付链接无效，请重新获取支付链接。');
  let url, page;
  try { url = new URL(raw); page = new URL(pageURL); } catch { throw new Error('支付链接无效，请重新获取支付链接。'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(page.hostname);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.protocol !== 'https:' && (!local || page.protocol === 'https:'))) {
    throw new Error('已阻止不安全的支付链接：正式环境仅允许 HTTPS。');
  }
  return url.href;
}
export function orderStatus(order) {
  if (order.status === 'paid') return order.delivery?.mode === 'auto_redeem' && order.delivery.creditsGranted > 0 ? `已到账 ${order.delivery.creditsGranted} 次` : '已支付，请查询到账并刷新余额';
  return ({ pending: '待支付／待确认到账', closed: '订单已关闭' })[order.status] || '订单状态待确认';
}
export class ApiError extends Error {
  constructor(status, code) { super(errorMessage({ status, code })); this.status = status; this.code = code; }
}
export function errorMessage(error) {
  const messages = {
    400: '请求未被接受，请检查输入；重试将保留原请求编号。',
    401: '登录已失效或邮箱密码不正确，请重新登录。',
    402: '可用次数不足，请查看余额或购买套餐。',
    403: '操作未获授权，请确认邮箱已验证、账户可用；验证后请重新登录。',
    404: '未找到任务或订单；可继续查询，提交失败的任务可用原编号重试。',
    409: '当前有进行中的任务或请求冲突，请刷新余额恢复任务。',
    410: '结果已过期，无法恢复。请及时下载新作品。',
    413: '图片过大，请缩小图片后重试。',
    415: '图片或请求格式不受支持。',
    429: '操作过于频繁，请稍后再试。',
    502: '上游暂不可用，请稍后用原请求继续查询或重试。',
    503: '服务暂不可用，请稍后重试。',
    504: '请求超时，任务或订单可能已受理，请使用原编号重试或查询。',
  };
  if (error?.status) return messages[error.status] || '服务暂未完成请求，请稍后重试。';
  if (error instanceof TypeError) return '网络连接失败，请检查网络后继续查询或用原编号重试。';
  return error?.message || '操作未完成，请稍后重试。';
}
export function staleError() { return new DOMException('操作已取消', 'AbortError'); }
export function createScope() {
  let controller = new AbortController();
  let epoch = 0;
  return {
    capture: () => ({ epoch, signal: controller.signal }),
    current: ticket => ticket.epoch === epoch && !ticket.signal.aborted,
    assert(ticket) { if (!this.current(ticket)) throw staleError(); },
    reset() { controller.abort(); controller = new AbortController(); epoch++; },
  };
}
export function createAPI({ fetchImpl = globalThis.fetch, timeoutMs = 35_000 } = {}) {
  return async function request(path, { body, signal, method = body === undefined ? 'GET' : 'POST' } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) throw staleError();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    try {
      const multipart = body instanceof FormData;
      const response = await fetchImpl(`/web-api${path}`, {
        method, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal,
        headers: { Accept: 'application/json', ...(body !== undefined && !multipart ? { 'Content-Type': 'application/json' } : {}) },
        body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
      });
      if (!response.ok) throw new ApiError(response.status);
      if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('服务返回格式异常，请稍后重试。');
      const data = await response.json();
      if (signal?.aborted) throw staleError();
      return data;
    } catch (error) {
      if (signal?.aborted) throw staleError();
      if (controller.signal.aborted) throw new ApiError(504);
      throw error;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  };
}
export function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(staleError()); return; }
    const abort = () => { clearTimeout(timer); reject(staleError()); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
export async function pollGeneration({ read, signal, onStatus = () => {}, delay = wait, limit = POLL_LIMIT }) {
  for (let i = 0; i < limit; i++) {
    if (signal.aborted) throw staleError();
    const status = await read();
    if (signal.aborted) throw staleError();
    if (!['queued', 'running', 'succeeded', 'failed', 'expired'].includes(status?.status)) throw new Error('任务状态无法识别，请稍后继续查询。');
    onStatus(status);
    if (['succeeded', 'failed', 'expired'].includes(status.status)) return status;
    if (i < limit - 1) await delay(POLL_INTERVAL, signal);
  }
  return { status: 'paused' };
}
