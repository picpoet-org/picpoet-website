import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { createAPI, createScope, errorMessage } from '../../shared/create-core.mjs';
import { useSite } from '../i18n/context.mjs';

export function useSession() {
  const site = useSite();
  const { t, messages } = site;
  const api = createAPI(),
    scope = createScope();
  const user = ref(null),
    ready = ref(false),
    status = ref(t('session.checking')),
    retrySession = ref(false),
    retryLogout = ref(false);
  const busy = reactive(new Set());
  const verified = computed(() => user.value?.emailVerified === true);
  const balance = ref(null);
  const resets = new Set();
  const error = (value) => {
    const original = errorMessage(value);
    const entry = Object.entries(site.sourceErrors || messages.errors || {}).find(
      ([, text]) => text === original,
    );
    // 共享协议模块保留兼容错误，界面按稳定错误键展示译文。
    if (entry) return t(`errors.${entry[0]}`);
    if (value?.status)
      return t(messages.http?.[`s${value.status}`] ? `http.s${value.status}` : 'http.generic');
    if (value instanceof TypeError) return t('http.network');
    return value?.localized ? value.message : t('http.generic');
  };
  const failure = (key) => Object.assign(new Error(t(key)), { localized: true });
  function reset() {
    scope.reset();
    busy.clear();
    user.value = null;
    balance.value = null;
    for (const callback of resets) callback();
  }
  async function request(ticket, path, body, method) {
    scope.assert(ticket);
    const result = await api(path, { body, method, signal: ticket.signal });
    scope.assert(ticket);
    return result;
  }
  async function action(key, target, callback) {
    if (busy.has(key)) return;
    const ticket = scope.capture();
    busy.add(key);
    try {
      await callback(ticket);
      return true;
    } catch (cause) {
      if (!scope.current(ticket) || cause.name === 'AbortError') return;
      if (cause.status === 401 && key !== 'auth') {
        reset();
        ready.value = true;
        status.value = t('http.s401');
      } else target.value = error(cause);
    } finally {
      if (scope.current(ticket)) busy.delete(key);
    }
  }
  async function refreshBalance(ticket) {
    const data = await request(ticket, '/balance');
    if (![data?.free?.remaining, data?.paid?.remaining].every((n) => Number.isSafeInteger(n) && n >= 0))
      throw failure('session.balanceInvalid');
    balance.value = data;
    return data;
  }
  async function loadSession() {
    retrySession.value = false;
    const success = await action('session', status, async (ticket) => {
      const data = await request(ticket, '/session');
      if (data.authenticated) {
        if (!data.user?.id || typeof data.user.email !== 'string') throw failure('session.invalid');
        if (user.value && user.value.id !== data.user.id) reset();
        user.value = data.user;
      } else if (user.value) reset();
      status.value = user.value && !verified.value ? t('session.unverified') : '';
    });
    ready.value = true;
    retrySession.value = !success;
  }
  async function logout() {
    reset();
    ready.value = true;
    retryLogout.value = false;
    status.value = t('session.loggingOut');
    await action('auth', status, async (ticket) => {
      try {
        await request(ticket, '/logout', {});
        status.value = t('session.loggedOut');
      } catch {
        status.value = t('session.logoutPending');
        retryLogout.value = true;
      }
    });
  }
  const pageHide = () => reset();
  const pageShow = (event) => {
    if (event.persisted) location.reload();
  };
  onMounted(() => {
    void loadSession();
    addEventListener('pagehide', pageHide);
    addEventListener('pageshow', pageShow);
  });
  onBeforeUnmount(() => {
    reset();
    removeEventListener('pagehide', pageHide);
    removeEventListener('pageshow', pageShow);
  });
  return {
    ...site,
    api,
    scope,
    user,
    ready,
    verified,
    balance,
    status,
    retrySession,
    retryLogout,
    busy,
    resets,
    reset,
    request,
    action,
    refreshBalance,
    loadSession,
    logout,
    error,
    failure,
  };
}
