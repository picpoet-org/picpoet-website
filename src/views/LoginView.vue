<script setup>
import { ref, computed, nextTick } from 'vue';
import { useSession } from '../composables/useSession.mjs';
import { safeReturnTo } from '../../shared/user-navigation.mjs';
import SessionGate from '../components/SessionGate.vue';
const session = useSession();
const { t, href, user, ready, verified, busy, action, request, failure } = session;
const mode = ref('login'),
  email = ref(''),
  password = ref(''),
  invitation = ref(''),
  verifyEmail = ref(''),
  otp = ref('');
const authStatus = ref(''),
  verifyStatus = ref(''),
  verifyOpen = ref(false),
  emailInput = ref(),
  passwordInput = ref(),
  otpInput = ref();
const registering = computed(() => mode.value === 'register');
const returnTo =
  typeof location === 'undefined'
    ? 'create.html'
    : safeReturnTo(new URLSearchParams(location.search).get('returnTo'));
const setMode = (value) => {
  mode.value = value;
  authStatus.value = '';
  nextTick(() => emailInput.value?.focus());
};
async function authenticate() {
  const success = await action('auth', authStatus, async (ticket) => {
    authStatus.value = t(registering.value ? 'auth.registering' : 'auth.loggingIn');
    const body = { email: email.value.trim(), password: password.value };
    if (registering.value && invitation.value.trim()) body.invitationCode = invitation.value.trim();
    const data = await request(ticket, '/' + mode.value, body);
    password.value = '';
    if (registering.value) {
      verifyEmail.value = body.email;
      verifyOpen.value = true;
      authStatus.value = '';
      verifyStatus.value = t(data.otpSent ? 'auth.registered' : 'auth.registeredPending');
    } else {
      if (!data?.user?.id || typeof data.user.email !== 'string') throw failure('auth.invalid');
      location.assign(href(returnTo));
    }
  });
  await nextTick();
  if (success && registering.value) otpInput.value?.focus();
  else if (!success) document.getElementById('auth-status')?.focus();
}
async function verify() {
  const success = await action('verify', verifyStatus, async (ticket) => {
    verifyStatus.value = t('auth.verifying');
    await request(ticket, '/verify-email', { email: verifyEmail.value.trim(), otp: otp.value.trim() });
    otp.value = '';
    mode.value = 'login';
    email.value = verifyEmail.value.trim();
    verifyStatus.value = t('auth.verified');
    authStatus.value = t('auth.verified');
  });
  await nextTick();
  if (success) passwordInput.value?.focus();
}
function resend() {
  if (!document.getElementById('verify-email').reportValidity()) return;
  return action('verify', verifyStatus, async (ticket) => {
    verifyStatus.value = t('auth.resending');
    await request(ticket, '/resend-otp', { email: verifyEmail.value.trim(), purpose: 'verify_email' });
    verifyStatus.value = t('auth.resent');
  });
}
session.resets.add(() => {
  password.value = '';
  otp.value = '';
});
</script>
<template>
  <main id="main" class="shell" tabindex="-1">
    <section class="create-intro">
      <p class="eyebrow">{{ t('common.eyebrow') }}</p>
      <h1>{{ t('auth.title') }}</h1>
      <p class="lede">{{ t('auth.intro') }}</p>
    </section>
    <SessionGate :session="session" />
    <div class="login-layout">
      <section class="create-panel account-panel" aria-labelledby="account-title">
        <div class="section-top">
          <h2 id="account-title">{{ t('session.login') }}</h2>
          <button id="logout" type="button" class="button secondary" :hidden="!user" @click="session.logout">
            {{ t('session.logout') }}
          </button>
        </div>
        <div id="account-summary" :hidden="!user">
          <p id="account-name">{{ user?.email }}</p>
          <a id="continue-link" class="button primary" :href="href(returnTo)">{{ t('common.continue') }}</a>
        </div>
        <div id="auth-panel" :hidden="!!user">
          <div id="auth-switch" class="auth-switch" role="group" :aria-label="t('auth.operation')">
            <button
              v-for="value in ['login', 'register']"
              :id="'mode-' + value"
              :key="value"
              type="button"
              :aria-pressed="mode === value"
              :disabled="!ready || busy.has('auth') || busy.has('verify')"
              @click="setMode(value)"
            >
              {{ t('auth.' + value) }}
            </button>
          </div>
          <p id="auth-status" class="create-status" role="status" aria-live="polite" tabindex="-1">
            {{ authStatus }}
          </p>
          <form id="auth-form" :aria-busy="busy.has('auth')" @submit.prevent="authenticate">
            <fieldset id="auth-fields" :disabled="!ready || busy.has('auth') || busy.has('verify')">
              <div class="form-grid">
                <div>
                  <label for="email">{{ t('auth.email') }}</label><input
                    id="email"
                    ref="emailInput"
                    v-model="email"
                    name="email"
                    type="email"
                    autocomplete="email"
                    maxlength="254"
                    required
                  />
                </div>
                <div>
                  <label for="password">{{ t('auth.password') }}</label><input
                    id="password"
                    ref="passwordInput"
                    v-model="password"
                    name="password"
                    type="password"
                    :autocomplete="registering ? 'new-password' : 'current-password'"
                    :minlength="registering ? 8 : 1"
                    maxlength="1024"
                    required
                    aria-describedby="password-help"
                  /><small id="password-help">{{
                    t(registering ? 'auth.passwordHelp' : 'auth.loginHelp')
                  }}</small>
                </div>
                <div id="invitation-field" :hidden="!registering">
                  <label for="invitation">{{ t('auth.invitation') }}</label><input
                    id="invitation"
                    v-model="invitation"
                    name="invitationCode"
                    autocomplete="off"
                    maxlength="40"
                  />
                </div>
              </div>
              <button id="auth-submit" class="button primary" type="submit">
                {{
                  t(
                    busy.has('auth')
                      ? registering
                        ? 'auth.registering'
                        : 'auth.loggingIn'
                      : registering
                        ? 'auth.submitRegister'
                        : 'auth.submitLogin',
                  )
                }}
              </button>
            </fieldset>
          </form>
        </div>
        <details id="verify-panel" :open="verifyOpen" :hidden="verified">
          <summary>{{ t('auth.verifyTitle') }}</summary>
          <p id="verify-status" class="create-status" role="status" aria-live="polite" tabindex="-1">
            {{ verifyStatus }}
          </p>
          <form id="verify-form" :aria-busy="busy.has('verify')" @submit.prevent="verify">
            <fieldset id="verify-fields" :disabled="!ready || busy.has('verify') || busy.has('auth')">
              <div class="form-grid">
                <div>
                  <label for="verify-email">{{ t('auth.verifyEmail') }}</label><input
                    id="verify-email"
                    v-model="verifyEmail"
                    type="email"
                    autocomplete="email"
                    maxlength="254"
                    required
                  />
                </div>
                <div>
                  <label for="otp">{{ t('auth.otp') }}</label><input
                    id="otp"
                    ref="otpInput"
                    v-model="otp"
                    type="text"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    maxlength="32"
                    required
                  />
                </div>
              </div>
              <div class="actions">
                <button type="submit" class="button primary">{{ t('auth.verify') }}</button><button
                  id="resend-otp"
                  type="button"
                  class="button secondary"
                  @click="resend"
                >
                  {{ t('auth.resend') }}
                </button>
              </div>
            </fieldset>
          </form>
          <p class="fine-print">{{ t('auth.mailHelp') }}</p>
        </details>
      </section>
    </div>
  </main>
</template>
