import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer, h, ref, nextTick } from 'vue';
import { provideSession, useSession } from '../src/composables/useSession.mjs';
import { createSiteContext, provideSite } from '../src/i18n/context.mjs';
import { startSessionVisits } from '../src/session-visits.mjs';
import { internalDestination } from '../src/navigation.mjs';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const account = (id) => ({ id, email: `${id}@example.test`, emailVerified: true });
function environment(t) {
  const window = new EventTarget();
  const document = new EventTarget();
  document.visibilityState = 'visible';
  document.getElementById = () => null;
  const values = {
    window,
    document,
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window),
    BroadcastChannel: undefined,
  };
  for (const [key, value] of Object.entries(values)) {
    const old = globalThis[key];
    globalThis[key] = value;
    t.after(() => {
      if (old === undefined) delete globalThis[key];
      else globalThis[key] = old;
    });
  }
  return { window, document };
}
function mount(t, respond) {
  let app;
  t.after(() => app?.unmount());
  environment(t);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const path = new URL(url, 'http://localhost').pathname.replace('/web-api', '');
    calls.push(path);
    const result = await respond(path, options);
    return result instanceof Response ? result : Response.json(result);
  });
  const renderer = createRenderer({
    createElement: () => ({}),
    createText: () => ({}),
    createComment: () => ({}),
    insert() {},
    remove() {},
    setElementText() {},
    setText() {},
    patchProp() {},
    parentNode() {},
    nextSibling() {},
  });
  let shared, page;
  const route = ref(0);
  const Child = {
    setup() {
      page = useSession();
      return () => null;
    },
  };
  app = renderer.createApp({
    setup() {
      shared = provideSession();
      return () => h(Child, { key: route.value });
    },
  });
  provideSite(
    app,
    createSiteContext({
      messages: {
        session: {
          unverified: 'unverified',
          balanceInvalid: 'balanceInvalid',
          invalid: 'invalid',
          loggingOut: 'loggingOut',
          loggedOut: 'loggedOut',
        },
        http: { generic: 'error', s401: 'expired', network: 'offline' },
      },
    }),
  );
  app.mount({});
  return {
    calls,
    shared,
    get page() {
      return page;
    },
    route,
  };
}
const balance = { free: { remaining: 1 }, paid: { remaining: 2 } };

test('切页复用会话，取消旧页面票据但不清除账户或重复检查', async (t) => {
  const state = mount(t, (path) =>
    path === '/session' ? { authenticated: true, user: account('a') } : balance,
  );
  await tick();
  const old = state.page;
  const ticket = old.scope.capture();
  state.route.value++;
  await nextTick();
  assert.equal(old.scope.current(ticket), false);
  assert.equal(state.page.user.value.id, 'a');
  assert.equal(state.page.ready.value, true);
  assert.equal(state.calls.filter((p) => p === '/session').length, 1);
  const current = state.page.scope.capture();
  state.shared.acceptLogin(account('b'));
  assert.equal(state.page.scope.current(current), false);
  assert.equal(state.page.user.value.id, 'b');
  await state.shared.logout();
  assert.equal(state.page.user.value, null);
});

test('并发会话检查合并，退出后旧检查响应不能恢复账户', async (t) => {
  let resolve;
  const state = mount(t, (path) =>
    path === '/session'
      ? new Promise((done) => {
          resolve = done;
        })
      : {},
  );
  await tick();
  const first = state.shared.loadSession();
  assert.equal(first, state.shared.loadSession());
  await state.shared.logout();
  resolve({ authenticated: true, user: account('old') });
  await first;
  assert.equal(state.shared.user.value, null);
  assert.equal(state.shared.status.value, 'loggedOut');
  assert.equal(state.shared.retrySession.value, false);
  assert.equal(state.calls.filter((p) => p === '/session').length, 1);
});

test('后台检查网络失败保留已登录状态，明确 401 清理身份', async (t) => {
  let failure = null;
  const state = mount(t, (path) => {
    if (failure === 'offline') throw new TypeError('offline');
    if (failure === 'expired') return new Response('', { status: 401 });
    return path === '/session' ? { authenticated: true, user: account('a') } : balance;
  });
  await tick();
  failure = 'offline';
  await state.shared.loadSession();
  assert.equal(state.shared.user.value.id, 'a');
  assert.equal(state.shared.ready.value, true);
  assert.equal(state.shared.retrySession.value, true);
  failure = 'expired';
  await state.shared.loadSession();
  assert.equal(state.shared.user.value, null);
  assert.equal(state.shared.status.value, 'expired');
});

test('前台事件五分钟内复用、失败退避，后台不检查且停止后不再触发', async (t) => {
  const { window, document } = environment(t);
  let now = 0,
    calls = 0,
    success = true;
  t.mock.method(Date, 'now', () => now);
  const stop = startSessionVisits(async () => {
    calls++;
    return success;
  });
  await tick();
  now = 299_999;
  window.dispatchEvent(new Event('focus'));
  await tick();
  assert.equal(calls, 1);
  now = 300_000;
  success = false;
  window.dispatchEvent(new Event('focus'));
  window.dispatchEvent(new Event('online'));
  await tick();
  assert.equal(calls, 2);
  now += 29_999;
  window.dispatchEvent(new Event('focus'));
  await tick();
  assert.equal(calls, 2);
  now++;
  document.visibilityState = 'hidden';
  window.dispatchEvent(new Event('focus'));
  await tick();
  assert.equal(calls, 2);
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  await tick();
  assert.equal(calls, 3);
  stop();
  now += 600_000;
  window.dispatchEvent(new Event('focus'));
  await tick();
  assert.equal(calls, 3);
});

test('客户端导航仅拦截同源同语言已知页面，文件下载与跨语言保持原生导航', () => {
  const base = 'https://example.test/works.html';
  assert.equal(internalDestination('/account.html#orders', base), '/account.html#orders');
  assert.equal(internalDestination('/login?returnTo=create.html', base), '/login?returnTo=create.html');
  for (const target of [
    'https://other.test/account.html',
    '/assets/fonts/OFL.txt',
    '/en-us/account.html',
    '/unknown',
    '/pages/account.html',
  ]) {
    assert.equal(internalDestination(target, base), null);
  }
});
