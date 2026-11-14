<script setup>
import { computed } from 'vue';
import { useSite } from '../i18n/context.mjs';
const { t, href } = useSite();
import ReleaseInfo from '../components/ReleaseInfo.vue';
import { useDownloads } from '../composables/useDownloads.mjs';
const { busy, status, platforms, failed, recommended } = useDownloads();
const published = computed(() => platforms.value.filter((platform) => platform.artifacts.length));
const upcoming = computed(() => platforms.value.filter((platform) => !platform.artifacts.length));
</script>
<template>
  <main id="main" class="shell" tabindex="-1">
    <section class="page-header">
      <p class="eyebrow">{{ t('content.downloads.t001') }}</p>
      <h1>{{ t('content.downloads.t002') }}<br />{{ t('content.downloads.t003') }}</h1>
      <p class="lede">{{ t('content.downloads.t004') }}</p>
    </section>
    <section class="download-section" aria-labelledby="platforms-title">
      <div class="section-heading">
        <h2 id="platforms-title">{{ t('content.downloads.t005') }}</h2>
        <p>{{ t('content.downloads.t006') }}</p>
      </div>
      <p id="download-status" class="download-status" role="status" aria-live="polite">{{ status }}</p>
      <div class="download-grid" :aria-busy="busy">
        <article
          v-for="platform in published"
          :id="`platform-${platform.id}`"
          :key="platform.id"
          :data-platform="platform.id"
          class="download-card"
          :class="{ recommended: recommended === platform.id }"
        >
          <h2>{{ platform.name }}</h2>
          <ReleaseInfo :platform-id="platform.id" />
        </article>
      </div>
      <section
        v-if="!busy && !failed && upcoming.length"
        class="upcoming-platforms"
        aria-labelledby="upcoming-title"
      >
        <h3 id="upcoming-title">{{ t('downloads.unpublished') }}</h3>
        <ul>
          <li
            v-for="platform in upcoming"
            :key="platform.id"
            :id="`platform-${platform.id}`"
            :data-platform="platform.id"
          >
            {{ platform.name }}
          </li>
        </ul>
      </section>
    </section>
    <div class="content download-guide">
      <section id="first-use">
        <h2>{{ t('content.downloads.t036') }}</h2>
        <p>{{ t('content.downloads.t037') }}</p>
        <div class="actions">
          <a class="button secondary" :href="href('docs.html#app')">{{ t('content.downloads.t038') }}</a><a
            class="text-link"
            :href="href('docs.html#website')"
            >{{ t('content.downloads.t039') }}<span aria-hidden="true">→</span></a
          >
        </div>
      </section>
    </div>
  </main>
</template>
