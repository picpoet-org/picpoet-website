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
  <div
    v-if="!session.ready.value"
    class="session-placeholder"
    role="status"
    aria-busy="true"
    :aria-label="t('session.checking')"
  >
    <span></span><span></span>
  </div>
  <p id="page-status" class="create-status" role="status" aria-live="polite" tabindex="-1">
    {{ session.status.value || session.balanceStatus.value }}
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
    :hidden="!session.ready.value || session.retrySession.value || session.verified.value"
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
<style scoped>
.session-placeholder {
  display: grid;
  gap: 0.5rem;
  padding-block: 0.75rem;
}
.session-placeholder span {
  height: 0.75rem;
  width: min(18rem, 70%);
  border-radius: 0.25rem;
  background: currentColor;
  opacity: 0.08;
}
.session-placeholder span + span {
  width: min(11rem, 45%);
}
</style>
