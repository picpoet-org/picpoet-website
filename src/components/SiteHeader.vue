<script setup>
import { ref } from 'vue';
import { pagePath, useSite } from '../i18n/context.mjs';
const { t, href, asset, brand, page, locale, compatibility, availableLocales } = useSite();
const expanded = ref(false);
const items = [
  ['index', 'home', 'M4 10.5 12 4l8 6.5V20H14v-6H10v6H4z'],
  ['create', 'create', 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z'],
  ['works', 'works', 'M3 5h18v14H3z M3 16l5-4 4 3 3-2 6 4'],
  ['downloads', 'downloads', 'M12 3v12 m-5-5 5 5 5-5 M5 21h14'],
  ['account', 'account', 'M5 20a7 7 0 0 1 14 0 M15.25 8a3.25 3.25 0 1 1-6.5 0 3.25 3.25 0 0 1 6.5 0'],
];
function changeLanguage(event) {
  // 仅保留站内登录目标、锚点和界面语言；照片和凭据继续只保存在内存。
  const target = new URL(pagePath(page, event.target.value, compatibility), location.origin);
  if (page === 'login') {
    const returnTo = new URLSearchParams(location.search).get('returnTo');
    if (returnTo) target.searchParams.set('returnTo', returnTo);
  }
  target.hash = location.hash;
  location.assign(target.href);
}
</script>
<template>
  <a class="skip-link" href="#main">{{ t('nav.skip') }}</a>
  <header class="site-header">
    <a class="brand" :href="href('index.html')" :aria-label="t('nav.brandHome')"
      ><img :src="asset('assets/picpoet-mark.svg')" width="32" height="32" alt="" /><span>{{
        brand
      }}</span></a
    >
    <button
      class="menu-toggle button secondary"
      type="button"
      aria-controls="site-navigation"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      {{ t(expanded ? 'nav.close' : 'nav.menu') }}
    </button>
    <div id="site-navigation" class="header-controls" :class="{ 'is-expanded': expanded }">
      <nav :aria-label="t('nav.main')">
        <a
          v-for="[target, label, path] in items"
          :key="target"
          :href="href(target + '.html')"
          :class="{ 'nav-cta': target === 'downloads' }"
          :aria-current="page === target ? 'page' : undefined"
          ><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="path" /></svg
          >{{ t('nav.' + label) }}</a
        >
      </nav>
      <label class="language-picker"
        ><span class="sr-only">{{ t('nav.language') }}</span
        ><select id="site-language" :value="locale" @change="changeLanguage">
          <option
            v-for="language in availableLocales"
            :key="language.id"
            :value="language.id"
            :lang="language.tag"
          >
            {{ language.label }}
          </option>
        </select></label
      >
    </div>
  </header>
</template>
