<script setup>
import { ref, computed, nextTick, onMounted } from 'vue';
import { useSession } from '../composables/useSession.mjs';
import { readInvitation } from '../../shared/invitation.mjs';
import { normalizePhone, hasAccountIdentity } from '../../shared/account-identity.mjs';
import { safeReturnTo } from '../../shared/user-navigation.mjs';
import SessionGate from '../components/SessionGate.vue';
const session = useSession();
const { t, href, user, ready, verified, busy, action, request, failure } = session;
const mode = ref('login'),
  identity = ref(''),
  identityBlurred = ref(false),
  identityError = ref(''),
  passwordError = ref(''),
  password = ref(''),
  confirmPassword = ref(''),
  showPassword = ref(false),
  invitation = ref(''),
  verifyEmail = ref(''),
  otp = ref('');
const authStatus = ref(''),
  verifyStatus = ref(''),
  verifyOpen = ref(false),
  identityInput = ref(),
  passwordInput = ref(),
  confirmInput = ref(),
  otpInput = ref();
const registering = computed(() => mode.value === 'register');
const usingPhone = computed(() => identity.value.trim() !== '' && !identity.value.includes('@'));
const focusIdentity = () => identityInput.value?.focus();
const passwordsMatch = computed(() => !confirmPassword.value || password.value === confirmPassword.value);
const returnTo =
  typeof location === 'undefined'
    ? 'create.html'
    : safeReturnTo(new URLSearchParams(location.search).get('returnTo'));
const continueLabel = {
  'create.html': 'account.create',
  'works.html': 'nav.works',
  'account.html': 'account.title',
  'account.html#purchase': 'account.topUp',
  'account.html#orders': 'account.orders',
}[returnTo];
onMounted(() => {
  // 仅在客户端读取邀请码，避免 SSR 与 hydration 因 query 不一致。
  const code = readInvitation(location.search);
  if (!code) return;
  invitation.value = code;
  mode.value = 'register';
});
const setMode = (value) => {
  mode.value = value;
  authStatus.value = '';
  identityError.value = '';
  passwordError.value = '';
  showPassword.value = false;
  confirmPassword.value = '';
  nextTick(focusIdentity);
};
async function authenticate() {
  const wasRegistering = registering.value;
  const phoneMode = usingPhone.value;
  identityError.value = '';
  passwordError.value = '';
  authStatus.value = '';
  const account = identity.value.trim();
  if (!account || (phoneMode ? !normalizePhone(account) : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account))) {
    identityError.value = t(phoneMode ? 'phoneAuth.phoneHelp' : 'phoneAuth.identityInvalid');
    await nextTick();
    focusIdentity();
    return;
  }
  if (!password.value || (wasRegistering && [...password.value].length < (phoneMode ? 6 : 8))) {
    passwordError.value = t(
      wasRegistering
        ? phoneMode
          ? 'phoneAuth.passwordHelp'
          : 'auth.passwordHelp'
        : 'phoneAuth.passwordRequired',
    );
    await nextTick();
    passwordInput.value?.focus();
    return;
  }
  if (wasRegistering && phoneMode && password.value !== confirmPassword.value) {
    authStatus.value = t('phoneAuth.mismatch');
    await nextTick();
    confirmInput.value?.focus();
    return;
  }
  const success = await action('auth', authStatus, async (ticket) => {
    authStatus.value = t(
      wasRegistering ? (phoneMode ? 'phoneAuth.registering' : 'auth.registering') : 'auth.loggingIn',
    );
    const body = phoneMode
      ? { phone: normalizePhone(identity.value), password: password.value }
      : { email: identity.value.trim(), password: password.value };
    if (wasRegistering && new TextEncoder().encode(password.value).length > 72)
      throw failure('phoneAuth.passwordLong');
    if (phoneMode && !body.phone) throw failure('phoneAuth.invalid');
    if (wasRegistering && phoneMode) body.confirmPassword = confirmPassword.value;
    if (wasRegistering && invitation.value.trim()) body.invitationCode = invitation.value.trim();
    let data;
    try {
      data = await request(ticket, '/' + mode.value, body);
    } catch (cause) {
      if (cause.status === 401 && !wasRegistering) throw failure('phoneAuth.loginFailed');
      if (cause.status === 409 && wasRegistering) throw failure('phoneAuth.alreadyRegistered');
      throw cause;
    }
    password.value = '';
    confirmPassword.value = '';
    showPassword.value = false;
    if (wasRegistering && phoneMode) {
      identity.value = body.phone;
      mode.value = 'login';
      verifyOpen.value = false;
      authStatus.value = t('phoneAuth.registered');
    } else if (wasRegistering) {
      verifyEmail.value = body.email;
      verifyOpen.value = true;
      authStatus.value = '';
      verifyStatus.value = t(data.otpSent ? 'auth.registered' : 'auth.registeredPending');
    } else {
      if (!hasAccountIdentity(data?.user)) throw failure('auth.invalid');
      location.assign(href(returnTo));
    }
  });
  await nextTick();
  if (success && wasRegistering) (phoneMode ? passwordInput.value : otpInput.value)?.focus();
  else if (!success) document.getElementById('auth-status')?.focus();
}
async function verify() {
  const success = await action('verify', verifyStatus, async (ticket) => {
    verifyStatus.value = t('auth.verifying');
    await request(ticket, '/verify-email', { email: verifyEmail.value.trim(), otp: otp.value.trim() });
    otp.value = '';
    mode.value = 'login';
    identity.value = verifyEmail.value.trim();
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
  confirmPassword.value = '';
  showPassword.value = false;
  otp.value = '';
});
</script>
<template>
  <main id="main" class="shell auth-page" tabindex="-1">
    <section class="create-intro">
      <p class="eyebrow">{{ t('common.eyebrow') }}</p>
      <h1>{{ t(user ? 'auth.signedInTitle' : 'auth.title') }}</h1>
      <p class="lede">{{ t(user ? 'auth.signedInIntro' : 'phoneAuth.intro') }}</p>
    </section>
    <SessionGate :session="session" />
    <div class="login-layout">
      <section class="create-panel account-panel" aria-labelledby="account-title">
        <div class="section-top">
          <h2 id="account-title">{{ t(user ? 'auth.currentAccount' : 'session.login') }}</h2>
        </div>
        <div id="account-summary" :hidden="!user">
          <p id="account-name">{{ session.identityLabel.value }}</p>
          <p v-if="invitation" class="signed-in-invitation">{{ t('auth.signedInInvitation') }}</p>
          <div class="signed-in-actions">
            <a id="continue-link" class="button primary" :href="href(returnTo)">{{ t(continueLabel) }}</a>
            <button
              id="logout"
              type="button"
              class="button quiet-button"
              :disabled="busy.has('auth')"
              @click="session.logout"
            >
              {{ t('session.logout') }}
            </button>
          </div>
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
          <p v-if="usingPhone && identityBlurred" id="phone-notice" class="notice phone-notice">
            {{ t('phoneAuth.notice') }}
          </p>
          <form id="auth-form" novalidate :aria-busy="busy.has('auth')" @submit.prevent="authenticate">
            <fieldset id="auth-fields" :disabled="!ready || busy.has('auth') || busy.has('verify')">
              <div class="form-grid">
                <div>
                  <label for="identity">{{ t('phoneAuth.identity') }}</label>
                  <input
                    id="identity"
                    ref="identityInput"
                    v-model="identity"
                    name="username"
                    type="text"
                    autocomplete="username"
                    autocapitalize="none"
                    :spellcheck="false"
                    maxlength="254"
                    required
                    :aria-invalid="!!identityError"
                    :aria-describedby="identityError ? 'identity-error' : undefined"
                    @focus="identityBlurred = false"
                    @blur="identityBlurred = true"
                    @input="
                      identityBlurred = false;
                      identityError = '';
                      authStatus = '';
                    "
                  />
                  <small v-if="identityError" id="identity-error" role="alert">{{ identityError }}</small>
                </div>
                <div>
                  <div class="password-label-row">
                    <label for="password">{{ t('auth.password') }}</label>
                    <button
                      id="toggle-password"
                      class="password-visibility"
                      type="button"
                      :aria-pressed="showPassword"
                      @click="showPassword = !showPassword"
                    >
                      {{ t(showPassword ? 'phoneAuth.hidePassword' : 'phoneAuth.showPassword') }}
                    </button>
                  </div>
                  <input
                    id="password"
                    ref="passwordInput"
                    v-model="password"
                    name="password"
                    :type="showPassword ? 'text' : 'password'"
                    :autocomplete="registering ? 'new-password' : 'current-password'"
                    :minlength="registering ? (usingPhone ? 6 : 8) : 1"
                    maxlength="1024"
                    required
                    :aria-invalid="!!passwordError"
                    :aria-describedby="passwordError ? 'password-help' : undefined"
                    @input="
                      passwordError = '';
                      authStatus = '';
                    "
                  /><small v-if="passwordError" id="password-help" role="alert">{{ passwordError }}</small>
                </div>
                <div v-if="registering && usingPhone">
                  <label for="confirm-password">{{ t('phoneAuth.confirm') }}</label>
                  <input
                    id="confirm-password"
                    ref="confirmInput"
                    v-model="confirmPassword"
                    name="confirmPassword"
                    :type="showPassword ? 'text' : 'password'"
                    autocomplete="new-password"
                    minlength="6"
                    maxlength="1024"
                    required
                    :aria-invalid="!passwordsMatch"
                    aria-describedby="confirm-help"
                  />
                  <small id="confirm-help">{{
                    t(passwordsMatch ? 'phoneAuth.confirmHelp' : 'phoneAuth.mismatch')
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
                        ? usingPhone
                          ? 'phoneAuth.registering'
                          : 'auth.registering'
                        : 'auth.loggingIn'
                      : registering
                        ? usingPhone
                          ? 'phoneAuth.submitRegister'
                          : 'auth.submitRegister'
                        : 'auth.submitLogin',
                  )
                }}
              </button>
            </fieldset>
          </form>
        </div>
        <details id="verify-panel" :open="verifyOpen" :hidden="verified || usingPhone">
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
