import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { defaults, normalizePreferences, resolvePreferences } from '../../shared/generation-preferences.mjs';

export function useGenerationPreferences(session) {
  const value = ref({ ...defaults });
  const status = ref('');
  const key = () => (session.user.value?.id ? `picpoet:creation:v1:${session.user.value.id}` : '');
  function load() {
    value.value = { ...defaults };
    status.value = '';
    if (!key() || typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(key());
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved?.version !== 1 || !saved.preferences || typeof saved.preferences !== 'object')
        throw new Error('invalid preferences');
      value.value = normalizePreferences(saved.preferences);
    } catch {
      status.value = session.t('preferences.loadFailed');
    }
  }
  function save(next) {
    if (!key()) return;
    value.value = normalizePreferences(next);
    try {
      window.localStorage.setItem(key(), JSON.stringify({ version: 1, preferences: value.value }));
      status.value = session.t('preferences.saved');
    } catch {
      status.value = session.t('preferences.saveFailed');
    }
  }
  function changed(event) {
    if (event.key === null || event.key === key()) load();
  }
  watch(() => session.user.value?.id, load, { immediate: true, flush: 'sync' });
  onMounted(() => window.addEventListener('storage', changed));
  onBeforeUnmount(() => window.removeEventListener('storage', changed));
  return { value, status, save, snapshot: () => resolvePreferences(value.value, session.locale) };
}
