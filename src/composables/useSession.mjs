import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, provide, inject } from 'vue';
import { createAPI, createScope, errorMessage } from '../../shared/create-core.mjs';
import { useSite } from '../i18n/context.mjs';
import { buildInvitationURL } from '../../shared/invitation.mjs';
import {
  canUseAccount,
  hasAccountIdentity,
  isPhoneAccount,
  accountLabel,
} from '../../shared/account-identity.mjs';
import { startSessionVisits } from '../session-visits.mjs';

const sessionKey = Symbol('session');

export function provideSession() {
  const site = useSite();
  const { t, messages } = site;
  const api = createAPI(),
    scope = createScope();
  const user = ref(null),
    ready = ref(false),
    status = ref(''),
    retrySession = ref(false),
    retryLogout = ref(false);
  const busy = reactive(new Set());
  // 业务可用资格独立于邮箱/手机号归属验证；旧组件的 verified 表示此资格。
  const verified = computed(() => canUseAccount(user.value));
  const phoneAccount = computed(() => isPhoneAccount(user.value));
  const identityLabel = computed(() => accountLabel(user.value));
  const balance = ref(null);
  const remaining = computed(() => {
    const groups = balance.value?.remaining;
    return [groups?.gifted, groups?.purchased].every((n) => Number.isSafeInteger(n) && n >= 0)
      ? groups
      : null;
  });
  const invitationURL = computed(() =>
    buildInvitationURL(
      user.value?.id,
      balance.value?.referral?.invitationCode,
      typeof window === 'undefined' ? '' : window.location.origin,
    ),
  );
  const grantedCredits = computed(() => {
    const value = balance.value?.referral?.totalGrantedCredits;
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  });
  const resets = new Set();
  const error = (value) => {
    if (value?.status === 423) return t('phoneAuth.locked');
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
    sessionRequest = null;
    retrySession.value = false;
    scope.reset();
    busy.clear();
    user.value = null;
    balance.value = null;
    balanceStatus.value = '';
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
  let balanceRequest = 0;
  async function refreshBalance(ticket) {
    const sequence = ++balanceRequest;
    const data = await request(ticket, '/balance');
    if (![data?.free?.remaining, data?.paid?.remaining].every((n) => Number.isSafeInteger(n) && n >= 0))
      throw failure('session.balanceInvalid');
    if (sequence === balanceRequest) {
      balance.value = data;
      balanceStatus.value = '';
    }
    return data;
  }
  const balanceStatus = ref('');
  function updateBalance() {
    if (!user.value || document.visibilityState !== 'visible') return;
    return action('balance', balanceStatus, async (ticket) => {
      await refreshBalance(ticket);
      balanceStatus.value = '';
    });
  }
  watch(user, (value) => {
    if (value) void updateBalance();
  });
  async function ensureInvitationURL(ticket) {
    if (!balance.value) {
      try {
        await refreshBalance(ticket);
      } catch (cause) {
        scope.assert(ticket);
        if (cause.status === 401) throw cause;
        // 余额暂不可用仍允许导出作品；调用方会提示此图未附邀请码。
      }
    }
    scope.assert(ticket);
    return invitationURL.value;
  }
  let sessionRequest = null;
  function loadSession() {
    if (logoutRequest) return logoutRequest.then(() => true);
    if (sessionRequest) return sessionRequest;
    const ticket = scope.capture();
    const pending = performLoadSession(ticket).finally(() => {
      if (sessionRequest === pending) sessionRequest = null;
    });
    sessionRequest = pending;
    return pending;
  }
  async function performLoadSession(ticket) {
    retrySession.value = false;
    const success = await action('session', status, async (ticket) => {
      const data = await request(ticket, '/session');
      if (data.authenticated) {
        if (!hasAccountIdentity(data.user)) throw failure('session.invalid');
        if (user.value && user.value.id !== data.user.id) reset();
        // 仅续期时保持引用，避免前台恢复重复装载作品、订单或扰动当前创作。
        if (JSON.stringify(user.value) !== JSON.stringify(data.user)) user.value = data.user;
      } else if (user.value) reset();
      ready.value = true;
      status.value = user.value && !verified.value ? t('session.unverified') : '';
    });
    if (scope.current(ticket)) {
      ready.value = true;
      retrySession.value = !success;
    }
    return !!success;
  }
  let channel;
  function acceptLogin(value) {
    reset();
    user.value = value;
    ready.value = true;
    status.value = verified.value ? '' : t('session.unverified');
    retrySession.value = false;
    channel?.postMessage('changed');
  }
  let logoutRequest = null;
  function logout() {
    if (logoutRequest) return logoutRequest;
    logoutRequest = performLogout().finally(() => {
      logoutRequest = null;
    });
    return logoutRequest;
  }
  async function performLogout() {
    reset();
    ready.value = true;
    retryLogout.value = false;
    status.value = t('session.loggingOut');
    await action('auth', status, async (ticket) => {
      try {
        await request(ticket, '/logout', {});
        status.value = t('session.loggedOut');
        channel?.postMessage('logout');
      } catch {
        status.value = t('session.logoutPending');
        retryLogout.value = true;
      }
    });
  }
  const pageHide = () => {
    reset();
    ready.value = false;
  };
  let stopVisits;
  onMounted(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('picpoet-session');
      channel.onmessage = ({ data }) => {
        if (!['logout', 'changed'].includes(data)) return;
        reset();
        status.value = '';
        ready.value = data === 'logout';
        if (data === 'changed') void loadSession();
      };
    }
    stopVisits = startSessionVisits(loadSession);
    addEventListener('pagehide', pageHide);
    addEventListener('focus', updateBalance);
    addEventListener('online', updateBalance);
    document.addEventListener('visibilitychange', updateBalance);
  });
  onBeforeUnmount(() => {
    stopVisits?.();
    reset();
    removeEventListener('pagehide', pageHide);
    channel?.close();
    removeEventListener('focus', updateBalance);
    removeEventListener('online', updateBalance);
    document.removeEventListener('visibilitychange', updateBalance);
  });
  const session = {
    ...site,
    api,
    scope,
    user,
    ready,
    verified,
    phoneAccount,
    identityLabel,
    balance,
    remaining,
    invitationURL,
    grantedCredits,
    ensureInvitationURL,
    status,
    balanceStatus,
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
    acceptLogin,
    error,
    failure,
  };
  provide(sessionKey, session);
  return session;
}

export function useSession() {
  const shared = inject(sessionKey);
  // 账户状态属于应用；页面任务有独立的取消域，切页不能清空登录或留下旧请求。
  const scope = createScope();
  const busy = reactive(new Set());
  const resets = new Set();
  function resetPage() {
    scope.reset();
    busy.clear();
    for (const callback of resets) callback();
  }
  shared.resets.add(resetPage);
  onBeforeUnmount(() => {
    shared.resets.delete(resetPage);
    resetPage();
  });
  async function request(ticket, path, body, method) {
    scope.assert(ticket);
    const data = await shared.api(path, { body, method, signal: ticket.signal });
    scope.assert(ticket);
    return data;
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
        shared.reset();
        shared.ready.value = true;
        shared.status.value = shared.t('http.s401');
      } else target.value = shared.error(cause);
    } finally {
      if (scope.current(ticket)) busy.delete(key);
    }
  }
  async function refreshBalance(ticket) {
    scope.assert(ticket);
    const data = await shared.refreshBalance(shared.scope.capture());
    scope.assert(ticket);
    return data;
  }
  async function ensureInvitationURL(ticket) {
    scope.assert(ticket);
    const url = await shared.ensureInvitationURL(shared.scope.capture());
    scope.assert(ticket);
    return url;
  }
  const pageBusy = new Proxy(busy, {
    get(target, key) {
      if (key === 'has') return (name) => target.has(name) || (name === 'auth' && shared.busy.has('auth'));
      return Reflect.get(target, key);
    },
  });
  return {
    ...shared,
    scope,
    busy: pageBusy,
    resets,
    request,
    action,
    refreshBalance,
    ensureInvitationURL,
    logout: () => action('auth', shared.status, shared.logout),
  };
}
