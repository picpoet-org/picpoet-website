<script setup>
import { computed, inject } from 'vue';
import { useSite } from '../i18n/context.mjs';
import { downloadsKey } from '../composables/useDownloads.mjs';
import { releaseCopy } from '../../shared/releases.mjs';
import sourceMetadata from '../locales/zh-cn/metadata.json';
const props = defineProps({ platformId: String });
const { t, language, messages } = useSite();
const { platforms, failed } = inject(downloadsKey);
const platform = computed(() => platforms.value.find((item) => item.id === props.platformId));
const copy = computed(() =>
  releaseCopy(platform.value, sourceMetadata.release[props.platformId], messages.release[props.platformId]),
);
const size = (value) =>
  `${new Intl.NumberFormat(language.tag, { maximumFractionDigits: 1 }).format(value / 1024 / 1024)} MiB`;
</script>
<template>
  <div data-release-content>
    <p v-if="failed" class="release-unavailable">{{ t('downloads.unavailable') }}</p>
    <p v-else-if="!platform">{{ t('downloads.loading') }}</p>
    <p v-else-if="!platform.artifacts.length" class="release-unavailable">{{ t('downloads.unpublished') }}</p>
    <template v-else>
      <div class="release-facts">
        <p class="release-version">{{ t('downloads.version', { version: platform.versionName }) }}</p>
        <p class="platform-requirement">{{ copy.system }}</p>
      </div>
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
            >{{ t('downloads.downloadCompact', { arch: artifact.arch }) }}</a
          >
          <p class="artifact-meta">{{ artifact.format }} · {{ size(artifact.sizeBytes) }}</p>
          <div class="artifact-secondary">
            <a class="text-link" :href="artifact.alternateUrl">{{
              t('downloads.alternateDownload', { arch: artifact.arch })
            }}</a>
            <details>
              <summary>{{ t('downloads.checksum') }}</summary>
              <code class="checksum">{{ artifact.sha256 }}</code>
            </details>
          </div>
        </div>
      </div>
      <details class="release-details">
        <summary>{{ t('downloads.releaseDetails') }}</summary>
        <p class="release-date">
          {{
            t('downloads.published', {
              date: new Date(platform.publishedAt).toLocaleDateString(language.tag),
            })
          }}
        </p>
        <ul v-if="copy.notes.length" class="release-notes">
          <li v-for="note in copy.notes" :key="note">{{ note }}</li>
        </ul>
      </details>
    </template>
  </div>
</template>
