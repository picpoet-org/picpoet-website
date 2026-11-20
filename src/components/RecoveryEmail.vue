<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { hasVerifiedEmail, isPhoneAccount } from '../../shared/account-identity.mjs';
import { useSession } from '../composables/useSession.mjs';

const { t, user, phoneAccount, action, busy, request, resets, scope, updateProfile, loadSession, failure } =
  useSession();
const bound = computed(() => hasVerifiedEmail(user.value));
const changing = ref(false);
const email = ref(''),
  pending = ref(''),
  otp = ref(''),
  status = ref(''),
  invalidField = ref('');
const emailInput = ref(),
  passwordInput = ref(),
  otpInput = ref(),
  changeButton = ref();
const submitting = computed(() => busy.has('bind-email'));
function clearForm() {
  changing.value = false;
  if (passwordInput.value) passwordInput.value.value = '';
  email.value = pending.value = otp.value = status.value = invalidField.value = '';
}
resets.add(clearForm);
// 同账号在另一标签页更改了已验证邮箱，也应作废本页未完成的步骤。
watch(
  () => (bound.value ? user.value.email : ''),
  () => {
    scope.reset();
    busy.clear();
    clearForm();
  },
  { flush: 'sync' },
);
function clearFieldError() {
  if (invalidField.value) invalidField.value = status.value = '';
}
function editEmail() {
  changing.value = bound.value;
  pending.value = otp.value = status.value = invalidField.value = '';
  nextTick(() => emailInput.value?.focus());
}
function cancel() {
  clearForm();
  nextTick(() => changeButton.value?.focus());
}
async function submit(confirm) {
  if (submitting.value || (bound.value ? !changing.value : !phoneAccount.value)) return;
  const address = pending.value || email.value.trim();
  const owner = user.value;
  const change = changing.value;
  let focusTicket = scope.capture();
  await action('bind-email', status, async (ticket) => {
    invalidField.value = '';
    if (change && !confirm && address.toLowerCase() === owner.email.toLowerCase()) {
      invalidField.value = 'email';
      throw failure('recoveryEmail.sameAddress');
    }
    status.value = t(confirm ? 'auth.verifying' : 'auth.resending');
    let result;
    try {
      const body = { email: address };
      if (confirm) body.otp = otp.value;
      else if (change) {
        body.password = passwordInput.value.value;
        passwordInput.value.value = '';
      }
      result = await request(
        ticket,
        `/account/email/${change ? 'change/' : ''}${confirm ? 'confirm' : 'request'}`,
        body,
      );
    } catch (cause) {
      scope.assert(ticket);
      if (cause.status === 401 || cause.status === 423) throw cause;
      if (change && !confirm && cause.status === 403 && cause.code === 'CURRENT_PASSWORD_INCORRECT') {
        invalidField.value = 'password';
        throw failure('recoveryEmail.wrongPassword');
      }
      if (cause.status === 409) {
        void loadSession();
        throw failure('recoveryEmail.conflict');
      }
      if (cause.status === 400) {
        invalidField.value = confirm ? 'otp' : 'email';
        throw failure(confirm ? 'recoveryEmail.invalidCode' : 'recoveryEmail.invalidEmail');
      }
      if (cause.status === 429) throw failure('http.s429');
      if (!confirm && cause.status === 503) throw failure('recoveryEmail.deliveryFailed');
      if (cause.status === 403) throw failure('recoveryEmail.forbidden');
      if (cause.status) throw failure('http.generic');
      if (cause instanceof TypeError) throw failure('http.network');
      throw cause;
    }
    scope.assert(ticket);
    if (confirm) {
      const updated = result?.user;
      if (
        !hasVerifiedEmail(updated) ||
        updated.id !== owner.id ||
        isPhoneAccount(updated) !== isPhoneAccount(owner) ||
        (isPhoneAccount(owner) && updated.phone !== owner.phone) ||
        updated.email.toLowerCase() !== address.toLowerCase()
      )
        throw failure('session.invalid');
      updateProfile(updated);
      // 资料更新会同步重置旧表单；在新的生命周期里播报成功并恢复焦点。
      focusTicket = scope.capture();
      status.value = t('recoveryEmail.saved');
    } else {
      if (result?.otpSent !== true) throw failure('recoveryEmail.deliveryFailed');
      pending.value = address;
      otp.value = '';
      status.value = '';
    }
  });
  await nextTick();
  if (!scope.current(focusTicket)) return;
  if (bound.value && !changing.value) changeButton.value?.focus();
  else if (invalidField.value === 'password') passwordInput.value?.focus();
  else if (pending.value) {
    otpInput.value?.focus();
    if (invalidField.value === 'otp') otpInput.value?.select();
  } else if (invalidField.value === 'email') emailInput.value?.focus();
}
</script>
<template>
  <section
    class="recovery-email"
    :class="{ 'is-bound': bound && !changing }"
    aria-labelledby="recovery-email-title"
  >
    <h3 v-if="phoneAccount || changing" id="recovery-email-title">
      {{ t(phoneAccount ? 'recoveryEmail.title' : 'recoveryEmail.change') }}
    </h3>
    <div v-if="phoneAccount && bound" class="bound-info">
      <bdi>{{ t('recoveryEmail.bound', { email: user.email }) }}</bdi>
      <span class="account-badge">{{ t('session.verified') }}</span>
    </div>
    <button
      v-if="bound && !changing"
      :id="phoneAccount ? undefined : 'recovery-email-title'"
      ref="changeButton"
      class="button secondary"
      type="button"
      @click="editEmail"
    >
      {{ t('recoveryEmail.change') }}
    </button>
    <template v-else>
      <p v-if="!pending" id="binding-email-help">
        {{
          t(
            !changing
              ? 'recoveryEmail.help'
              : phoneAccount
                ? 'recoveryEmail.phoneChangeHelp'
                : 'recoveryEmail.loginChangeHelp',
          )
        }}
      </p>
      <p v-else id="binding-destination">{{ t('recoveryEmail.sent', { email: pending }) }}</p>
      <form :aria-busy="submitting" @submit.prevent="submit(!!pending)">
        <fieldset :disabled="submitting">
          <template v-if="!pending">
            <label for="binding-email">{{ t(changing ? 'recoveryEmail.newAddress' : 'auth.email') }}</label>
            <input
              id="binding-email"
              ref="emailInput"
              v-model.trim="email"
              name="email"
              type="email"
              autocomplete="email"
              autocapitalize="none"
              :spellcheck="false"
              maxlength="254"
              aria-describedby="binding-email-help binding-status"
              :aria-invalid="invalidField === 'email' || undefined"
              @input="clearFieldError"
              required
            />
            <template v-if="changing">
              <label for="binding-password">{{ t('recoveryEmail.currentPassword') }}</label>
              <input
                id="binding-password"
                ref="passwordInput"
                name="password"
                type="password"
                autocomplete="current-password"
                required
                aria-describedby="binding-status"
                :aria-invalid="invalidField === 'password' || undefined"
                @input="clearFieldError"
              />
            </template>
            <div class="actions">
              <button class="button primary" type="submit">{{ t('recoveryEmail.send') }}</button>
              <button v-if="changing" class="button quiet-button" type="button" @click="cancel">
                {{ t('common.cancel') }}
              </button>
            </div>
          </template>
          <template v-else>
            <label for="binding-otp">{{ t('auth.otp') }}</label>
            <input
              id="binding-otp"
              ref="otpInput"
              v-model="otp"
              name="otp"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              pattern="[0-9]{6}"
              minlength="6"
              maxlength="6"
              required
              aria-describedby="binding-destination binding-mail-help binding-status"
              :aria-invalid="invalidField === 'otp' || undefined"
              @input="clearFieldError"
            />
            <small id="binding-mail-help">{{ t('auth.mailHelp') }}</small>
            <div class="actions">
              <button class="button primary" type="submit">
                {{ t(changing ? 'recoveryEmail.confirmChange' : 'recoveryEmail.confirm') }}
              </button>
              <button class="button secondary" type="button" @click="changing ? editEmail() : submit(false)">
                {{ t(changing ? 'recoveryEmail.editAndResend' : 'auth.resend') }}
              </button>
              <button class="button quiet-button" type="button" @click="changing ? cancel() : editEmail()">
                {{ t(changing ? 'common.cancel' : 'recoveryEmail.edit') }}
              </button>
            </div>
          </template>
        </fieldset>
      </form>
    </template>
    <p id="binding-status" class="create-status" role="status" aria-live="polite">{{ status }}</p>
  </section>
</template>
<style scoped>
.recovery-email {
  margin-block-start: 1.25rem;
  padding: clamp(0.875rem, 2vw, 1.25rem);
  border-radius: var(--pp-radius-2);
  background: var(--pp-color-panel);
  overflow-wrap: anywhere;
}
.recovery-email h3 {
  margin: 0;
  font-size: 1rem;
}
.recovery-email.is-bound,
.bound-info {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.375rem 0.75rem;
}
.recovery-email.is-bound {
  padding: 0;
  background: none;
}
.bound-info {
  min-inline-size: 0;
}
.recovery-email p,
.recovery-email small {
  font-size: 0.9375rem;
  line-height: 1.5;
}
.recovery-email fieldset {
  display: grid;
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  border: 0;
  gap: 0.625rem;
  justify-items: start;
}
.recovery-email input {
  box-sizing: border-box;
  inline-size: min(100%, 24rem);
  min-inline-size: 0;
}
#binding-otp {
  max-inline-size: 12em;
  letter-spacing: 0.2em;
  font-variant-numeric: tabular-nums;
}
.recovery-email .actions {
  flex-wrap: wrap;
  margin: 0;
}
.recovery-email .create-status:empty {
  margin: 0;
  min-height: 0;
}
</style>
