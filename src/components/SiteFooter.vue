<script setup>
import { useSite } from '../i18n/context.mjs';
const { t, href, brand } = useSite();
</script>
<template>
  <footer class="site-footer shell">
    <span>© 2026 {{ brand }} · {{ t('common.tagline') }}</span>
    <nav :aria-label="t('nav.footer')">
      <a :href="href('docs.html')">{{ t('nav.docs') }}</a><a :href="href('pricing.html')">{{
        t('nav.pricing')
      }}</a
      ><a :href="href('docs.html#privacy')">{{ t('nav.privacy') }}</a>
    </nav>
  </footer>
</template>
