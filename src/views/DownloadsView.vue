<script setup>
import { useSite } from '../i18n/context.mjs';
const { t, href } = useSite();
import ReleaseInfo from '../components/ReleaseInfo.vue';
import { useDownloads } from '../composables/useDownloads.mjs';
const { busy, status, refresh, recommended } = useDownloads();
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
      <div class="release-toolbar">
        <p id="download-status" role="status" aria-live="polite">{{ status }}</p>
        <button
          id="refresh-downloads"
          @click="refresh"
          :disabled="busy"
          type="button"
          class="button secondary"
        >
          {{ t('content.downloads.t008') }}
        </button>
      </div>

      <div class="download-grid">
        <article
          id="platform-android"
          data-platform="android"
          class="download-card"
          :class="{ recommended: recommended === 'android' }"
        >
          <h2>Android</h2>
          <p class="platform-requirement">{{ t('content.downloads.t011') }}</p>
          <ReleaseInfo :platform-id="'android'" />
        </article>
        <article
          id="platform-ios"
          data-platform="ios"
          class="download-card"
          :class="{ recommended: recommended === 'ios' }"
        >
          <h2>iOS</h2>
          <p class="platform-requirement">{{ t('content.downloads.t013') }}</p>
          <ReleaseInfo :platform-id="'ios'" />
        </article>
        <article
          id="platform-ohos"
          data-platform="ohos"
          class="download-card"
          :class="{ recommended: recommended === 'ohos' }"
        >
          <h2>HarmonyOS</h2>
          <p class="platform-requirement">{{ t('content.downloads.t015') }}</p>
          <ReleaseInfo :platform-id="'ohos'" />
        </article>
        <article
          id="platform-linux"
          data-platform="linux"
          class="download-card"
          :class="{ recommended: recommended === 'linux' }"
        >
          <h2>Linux</h2>
          <p class="platform-requirement">{{ t('content.downloads.t017') }}</p>
          <ReleaseInfo :platform-id="'linux'" />
        </article>
        <article
          id="platform-macos"
          data-platform="macos"
          class="download-card"
          :class="{ recommended: recommended === 'macos' }"
        >
          <h2>macOS</h2>
          <p class="platform-requirement">{{ t('content.downloads.t019') }}</p>
          <ReleaseInfo :platform-id="'macos'" />
        </article>
        <article
          id="platform-windows"
          data-platform="windows"
          class="download-card"
          :class="{ recommended: recommended === 'windows' }"
        >
          <h2>Windows</h2>
          <p class="platform-requirement">{{ t('content.downloads.t021') }}</p>
          <ReleaseInfo :platform-id="'windows'" />
        </article>
      </div>
    </section>
    <div class="content-grid download-guide">
      <aside class="side-nav">
        <nav :aria-label="t('content.downloads.t040')">
          <a :href="href('#updates')">{{ t('content.downloads.t023') }}</a><a :href="href('#install')">{{
            t('content.downloads.t024')
          }}</a
          ><a :href="href('#first-use')">{{ t('content.downloads.t025') }}</a>
        </nav>
      </aside>
      <div class="content">
        <section id="updates">
          <h2>{{ t('content.downloads.t026') }}</h2>
          <p>{{ t('content.downloads.t027') }}</p>
          <p>{{ t('content.downloads.t028') }}</p>
        </section>
        <section id="install">
          <h2>{{ t('content.downloads.t029') }}</h2>
          <ol class="steps">
            <li>{{ t('content.downloads.t030') }}</li>
            <li>{{ t('content.downloads.t031') }}</li>
            <li>{{ t('content.downloads.t032') }}</li>
          </ol>
          <div class="notice">
            <h3>{{ t('content.downloads.t033') }}</h3>
            <p>{{ t('content.downloads.t034') }}</p>
          </div>
          <p>{{ t('content.downloads.t035') }}</p>
        </section>
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
    </div>
  </main>
</template>
