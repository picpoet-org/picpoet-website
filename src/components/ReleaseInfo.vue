<script setup>
import { computed, inject } from 'vue';
import { useSite } from '../i18n/context.mjs';
import { downloadsKey } from '../composables/useDownloads.mjs';
import publishedManifest from '../../releases/stable.json';
const props = defineProps({ platformId: String });
const { t, language, messages } = useSite();
const { platforms, failed } = inject(downloadsKey);
const platform = computed(() => platforms.value.find((item) => item.id === props.platformId));
const known = computed(() => publishedManifest.platforms.find((item) => item.id === props.platformId));
const localized = computed(
  () =>
    platform.value?.versionName === known.value?.versionName &&
    platform.value?.minimumSystem === known.value?.minimumSystem &&
    JSON.stringify(platform.value?.notes) === JSON.stringify(known.value?.notes),
);
const notes = computed(() =>
  localized.value ? messages.release[props.platformId].notes : platform.value.notes,
);
const size = (value) =>
  `${new Intl.NumberFormat(language.tag, { maximumFractionDigits: 1 }).format(value / 1024 / 1024)} MiB`;
</script>
<template>
  <div data-release-content>
    <p v-if="failed" class="release-unavailable">{{ t('downloads.unavailable') }}</p>
    <p v-else-if="!platform">{{ t('downloads.loading') }}</p>
    <p v-else-if="!platform.artifacts.length" class="release-unavailable">{{ t('downloads.unpublished') }}</p>
    <template v-else
      ><p class="release-version">{{ t('downloads.version', { version: platform.versionName }) }}</p>
      <p class="release-date">
        {{
          t('downloads.published', { date: new Date(platform.publishedAt).toLocaleDateString(language.tag) })
        }}
        · {{ localized ? messages.release[platformId].system : platform.minimumSystem }}
      </p>
      <ul v-if="notes.length" class="release-notes">
        <li v-for="note in notes" :key="note">{{ note }}</li>
      </ul>
      <div class="artifact-list">
        <div v-for="artifact in platform.artifacts" :key="artifact.url" class="artifact">
          <a
            class="button primary"
            :href="artifact.url"
            :aria-label="
              t('downloads.downloadLabel', {
                platform: platform.name,
                version: platform.versionName,
                arch: artifact.arch,
                format: artifact.format,
              })
            "
            >{{ t('downloads.download', { platform: platform.name, arch: artifact.arch }) }}</a
          >
          <p class="artifact-meta">
            {{ artifact.format }} · {{ size(artifact.sizeBytes) }} · {{ t('downloads.cdn') }}
          </p>
          <details>
            <summary>{{ t('downloads.checksum') }}</summary>
            <code class="checksum">{{ artifact.sha256 }}</code>
          </details>
        </div>
      </div></template
    >
  </div>
</template>
