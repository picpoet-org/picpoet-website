import { ref, provide, onMounted, onBeforeUnmount } from 'vue';
import { loadManifest, detectPlatform } from '../../shared/releases.mjs';
import { useSite } from '../i18n/context.mjs';
export const downloadsKey = Symbol('downloads');
export function useDownloads() {
  const { t, asset } = useSite();
  const platforms = ref([]),
    busy = ref(false),
    status = ref(t('downloads.loading')),
    failed = ref(false),
    recommended = ref(null);
  let controller;
  async function refresh() {
    controller?.abort();
    controller = new AbortController();
    const active = controller;
    const timeout = setTimeout(() => active.abort(), 12000);
    busy.value = true;
    failed.value = false;
    status.value = t('downloads.loading');
    try {
      const manifest = await loadManifest(asset('releases/stable.json'), { signal: active.signal });
      if (active !== controller) return;
      platforms.value = manifest.platforms;
      status.value = manifest.platforms.some((item) => item.artifacts.length) ? '' : t('downloads.empty');
    } catch {
      if (active === controller) {
        platforms.value = [];
        failed.value = true;
        status.value = t('downloads.failed');
      }
    } finally {
      clearTimeout(timeout);
      if (active === controller) busy.value = false;
    }
  }
  provide(downloadsKey, { platforms, failed, recommended });
  onMounted(() => {
    recommended.value = detectPlatform(navigator.userAgent);
    void refresh();
  });
  onBeforeUnmount(() => {
    controller?.abort();
    controller = null;
  });
  return { busy, status, refresh, recommended };
}
