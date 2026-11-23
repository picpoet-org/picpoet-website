import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import {
  normalizePreferences as normalize,
  resolvePreferences,
} from '../../shared/generation-preferences.mjs';

export function useGenerationPreferences(session) {
  const value = ref(normalize()),
    status = ref(''),
    ready = ref(false),
    failed = ref(false);
  let mounted = false,
    epoch = 0,
    pending = null,
    saving = null,
    loading = null;
  const key = (version) => `picpoet:creation:v${version}:${session.user.value?.id}`;
  function cached(version) {
    try {
      const data = JSON.parse(localStorage.getItem(key(version)));
      return data?.version === version && data.preferences ? normalize(data.preferences) : null;
    } catch {
      return null;
    }
  }
  function cache(preferences) {
    try {
      localStorage.setItem(key(2), JSON.stringify({ version: 2, preferences }));
    } catch {
      /* 缓存不可用不影响账户保存。 */
    }
  }
  function read(data) {
    if (!data?.preferences || typeof data.preferences !== 'object' || Array.isArray(data.preferences))
      throw session.failure('preferences.loadFailed');
    return normalize(data.preferences);
  }
  function load() {
    if (loading) return loading;
    if (!mounted || !session.user.value?.id) return Promise.resolve(false);
    const current = epoch,
      ticket = session.scope.capture();
    ready.value = false;
    failed.value = false;
    status.value = session.t('preferences.loading');
    loading = (async () => {
      try {
        let data = await session.request(ticket, '/preferences');
        if (current !== epoch) return false;
        const legacy = data?.preferences === null ? cached(1) : null;
        if (legacy) {
          // 只迁移已有偏好，不把界面语言推导的默认值写成账户选择。
          data = await session.request(
            ticket,
            '/preferences',
            { preferences: legacy, initialize: true },
            'PUT',
          );
          if (current !== epoch) return false;
        }
        if (!legacy && data?.preferences === null) value.value = normalize();
        else {
          value.value = read(data);
          cache(value.value);
        }
        ready.value = true;
        status.value = '';
        return true;
      } catch {
        if (current === epoch) {
          failed.value = true;
          status.value = session.t('preferences.loadFailed');
        }
        return false;
      } finally {
        if (current === epoch) loading = null;
      }
    })();
    return loading;
  }
  function flush() {
    if (saving) return saving;
    const current = epoch,
      ticket = session.scope.capture();
    failed.value = false;
    status.value = session.t('preferences.saving');
    saving = (async () => {
      try {
        while (pending && current === epoch) {
          const next = pending;
          const data = await session.request(ticket, '/preferences', { preferences: next }, 'PUT');
          if (current !== epoch) return;
          const confirmed = read(data);
          cache(confirmed);
          if (pending === next) {
            pending = null;
            value.value = confirmed;
          }
        }
        if (current === epoch) status.value = '';
      } catch {
        if (current === epoch) {
          failed.value = true;
          status.value = session.t('preferences.saveFailed');
        }
      } finally {
        if (current === epoch) saving = null;
      }
    })();
    return saving;
  }
  function save(next) {
    if (!ready.value || !session.user.value?.id) return;
    value.value = normalize(next);
    pending = value.value;
    return flush();
  }
  function retry() {
    return pending ? flush() : load();
  }
  function refresh() {
    if (!pending && !saving && document.visibilityState === 'visible') void load();
  }
  function changed(event) {
    if (event.key === null || event.key === key(2)) refresh();
  }
  function reset() {
    epoch++;
    pending = saving = loading = null;
    ready.value = failed.value = false;
    value.value = mounted ? cached(2) || cached(1) || normalize() : normalize();
    status.value = '';
    if (mounted) void load();
  }
  watch(() => session.user.value?.id, reset, { flush: 'sync' });
  onMounted(() => {
    mounted = true;
    reset();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('storage', changed);
  });
  onBeforeUnmount(() => {
    mounted = false;
    epoch++;
    window.removeEventListener('focus', refresh);
    document.removeEventListener('visibilitychange', refresh);
    window.removeEventListener('storage', changed);
  });
  async function snapshot() {
    if (saving) await saving;
    if (pending || !(await load())) throw session.failure('preferences.loadFailed');
    return resolvePreferences(value.value, session.locale);
  }
  return { value, status, ready, failed, save, retry, snapshot };
}
