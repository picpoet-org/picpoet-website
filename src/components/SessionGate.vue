<script setup>
import { computed } from 'vue';
import { useSite } from '../i18n/context.mjs';
const props = defineProps({ session: { type: Object, required: true } });
const { t, href, page } = useSite();
const loginLink = computed(
  () =>
    href('login.html') +
    '?returnTo=' +
    encodeURIComponent(
      page + '.html' + (typeof location !== 'undefined' && page === 'account' ? location.hash : ''),
    ),
);
</script>
<template>
  <p id="page-status" class="create-status" role="status" aria-live="polite" tabindex="-1">
    {{ session.status.value }}
  </p>
  <button
    id="retry-session"
    class="button secondary"
    type="button"
    :hidden="!session.retrySession.value"
    @click="session.loadSession"
  >
    {{ t('session.retry') }}
  </button>
  <aside
    v-if="page !== 'login'"
    id="login-gate"
    class="notice"
    :hidden="!session.ready.value || session.verified.value"
  >
    <div>
      <h2>{{ t('session.loginTitle') }}</h2>
      <p>{{ t('session.loginHelp') }}</p>
    </div>
    <a id="login-link" class="button primary" :href="loginLink">{{ t('session.login') }}</a>
  </aside>
  <button
    id="retry-logout"
    class="button secondary"
    type="button"
    :hidden="!session.retryLogout.value"
    @click="session.logout"
  >
    {{ t('session.retryLogout') }}
  </button>
</template>
