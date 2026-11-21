import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer, ref } from 'vue';
import { useHistory } from '../src/composables/useHistory.mjs';
import { ApiError, createScope } from '../shared/create-core.mjs';

const ID = 'a1aa1111-1111-4111-8111-111111111111';
const tick = () => new Promise((resolve) => setImmediate(resolve));
const jpeg = () => new Response(new Uint8Array([255, 216, 255, 217]), {
  headers: { 'Content-Type': 'image/jpeg' },
});

function setup(t, fetchImage = async () => jpeg()) {
  let history, intersect, imageCalls = 0, detailCalls = 0, detailError;
  const revoked = [];
  t.mock.method(globalThis, 'fetch', (...args) => {
    imageCalls++;
    return fetchImage(...args);
  });
  t.mock.method(URL, 'revokeObjectURL', (url) => revoked.push(url));
  const previousObserver = globalThis.IntersectionObserver;
  globalThis.IntersectionObserver = class {
    constructor(callback) { intersect = callback; }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  const previousDocument = globalThis.document;
  globalThis.document = { getElementById: () => null };
  const session = {
    t: (key) => key,
    scope: createScope(),
    user: ref({ id: 'account-a' }),
    ready: ref(true),
    status: ref(''),
    resets: new Set(),
    failure: (key) => new Error(key),
    error: (cause) => String(cause.status),
    api: async (path, options) => {
      if (options?.method === 'DELETE') return { deleted: true };
      if (path.includes('?')) return { items: [{ id: ID, title: '山水', excerpt: '清风' }] };
      detailCalls++;
      if (detailError) throw new ApiError(detailError);
      return { id: ID, poem: ['清风入山林'], photoName: '清风.原图.jpg', photoDateTime: '2019-09-23T00:10:11+05:30' };
    },
    reset() {
      this.scope.reset();
      this.user.value = null;
      for (const reset of this.resets) reset();
    },
  };
  const renderer = createRenderer({
    createComment: () => ({}), insert() {}, remove() {}, parentNode() {}, nextSibling() {},
  });
  const app = renderer.createApp({
    setup() { history = useHistory(session); return () => null; },
  });
  app.mount({});
  history.dialog.value = { showModal() {}, close() {} };
  history.deleteDialog.value = { open: true, close() {} };
  t.after(() => {
    app.unmount();
    if (previousObserver === undefined) delete globalThis.IntersectionObserver;
    else globalThis.IntersectionObserver = previousObserver;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  return {
    history, session, revoked,
    get imageCalls() { return imageCalls; },
    get detailCalls() { return detailCalls; },
    set detailError(value) { detailError = value; },
    open: () => history.open(ID, { currentTarget: {} }),
    thumbnail() {
      const target = { dataset: { historyId: ID } };
      history.observe(target);
      intersect([{ isIntersecting: true, target }]);
    },
  };
}

test('列表、并发详情及重复打开共用一次图片请求，关闭详情不释放列表图片', async (t) => {
  let resolve;
  const s = setup(t, () => new Promise((done) => { resolve = done; }));
  await s.history.load();
  s.thumbnail();
  const opened = s.open();
  await tick();
  assert.equal(s.imageCalls, 1);
  resolve(jpeg());
  await opened;
  const url = s.history.photoURL.value;
  assert.ok(url.startsWith('blob:'));
  assert.equal(s.history.selected.value.cardName, '清风.原图_picpoet.png');
  assert.equal(s.history.selected.value.photoDateTime, '2019-09-23T00:10:11+05:30');
  assert.equal(s.history.rows.value[0].url, url);
  s.history.close();
  assert.deepEqual(s.revoked, []);
  await s.open();
  assert.equal(s.history.photoURL.value, url);
  assert.equal(s.imageCalls, 1);
  assert.equal(s.detailCalls, 2);
});

test('图片请求失败不缓存失败，重新打开可重试；删除释放共享图片', async (t) => {
  let fail = true;
  const s = setup(t, async () => fail ? new Response('', { status: 503 }) : jpeg());
  await s.history.load();
  await s.open();
  assert.equal(s.history.detailStatus.value, 'history.unavailable');
  fail = false;
  await s.open();
  const url = s.history.photoURL.value;
  assert.equal(s.imageCalls, 2);
  await s.history.remove();
  assert.deepEqual(s.revoked, [url]);
  assert.equal(s.history.rows.value.length, 0);
  assert.equal(s.history.photoURL.value, '');
});

test('已有缓存仍检查详情权限，服务端已删除时释放缓存，401 清空会话', async (t) => {
  const s = setup(t);
  await s.history.load();
  await s.open();
  const url = s.history.photoURL.value;
  s.detailError = 410;
  await s.open();
  assert.equal(s.history.detailStatus.value, 'history.gone');
  assert.equal(s.history.photoURL.value, '');
  assert.equal(s.history.rows.value[0].url, '');
  assert.deepEqual(s.revoked, [url]);
  assert.equal(s.imageCalls, 1);
  s.detailError = 401;
  await s.open();
  assert.equal(s.session.user.value, null);
  assert.equal(s.history.rows.value.length, 0);
});

test('会话重置丢弃迟到图片，列表刷新释放旧地址并重新加载', async (t) => {
  let resolve;
  const s = setup(t, () => new Promise((done) => { resolve = done; }));
  await s.history.load();
  const pending = s.open();
  await tick();
  s.session.reset();
  resolve(jpeg());
  await pending;
  assert.equal(s.history.photoURL.value, '');
  assert.equal(s.history.rows.value.length, 0);
  s.session.user.value = { id: 'account-b' };
  await tick();
  const next = s.open();
  await tick();
  resolve(jpeg());
  await next;
  const url = s.history.photoURL.value;
  assert.ok(url.startsWith('blob:'));
  assert.equal(s.imageCalls, 2);
  await s.history.load();
  assert.deepEqual(s.revoked, [url]);
  assert.equal(s.history.photoURL.value, '');
});
