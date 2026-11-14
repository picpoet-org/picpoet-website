<script setup>
import { ref } from 'vue';
import { useSite } from '../i18n/context.mjs';
const { t } = useSite();
defineProps({ modelValue: Boolean, disabled: Boolean });
const emit = defineEmits(['update:modelValue']);
const dialog = ref();
function change(event) {
  const checked = event.target.checked;
  event.target.checked = !checked;
  if (checked) emit('update:modelValue', true);
  else dialog.value.showModal();
}
function omit() {
  dialog.value.close();
  emit('update:modelValue', false);
}
</script>
<template>
  <label class="share-invitation-option">
    <input type="checkbox" :checked="modelValue" :disabled="disabled" @change="change" />
    <span>{{ t('sharing.includeQR') }}</span>
  </label>
  <dialog ref="dialog" class="share-invitation-dialog" :aria-label="t('sharing.rewardTitle')">
    <h3>{{ t('sharing.rewardTitle') }}</h3>
    <div class="invitation-reward">
      <p class="invitation-reward-amount">{{ t('sharing.rewardAmount') }}</p>
      <p>{{ t('sharing.rewardNotice') }}</p>
    </div>
    <p class="invitation-choice">{{ t('sharing.rewardChoice') }}</p>
    <div class="actions">
      <button type="button" class="button secondary" @click="omit">{{ t('sharing.omitQR') }}</button>
      <button type="button" class="button primary" autofocus @click="dialog.close()">
        {{ t('sharing.keepQR') }}
      </button>
    </div>
  </dialog>
</template>
<style scoped>
label.share-invitation-option {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  min-block-size: 3rem;
  margin: 0;
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.5;
  color: var(--text-secondary);
  cursor: pointer;
}
.share-invitation-option input {
  flex: 0 0 auto;
  inline-size: 1.125em;
  block-size: 1.125em;
  min-block-size: 0;
  margin: 0;
  padding: 0;
  accent-color: var(--pp-color-ink);
}
.share-invitation-option:hover {
  color: var(--pp-color-ink);
}
.share-invitation-option:has(:disabled) {
  cursor: not-allowed;
}
.share-invitation-dialog {
  max-width: min(28rem, 90vw);
  padding: clamp(1.25rem, 4vw, 2rem);
}
.invitation-reward {
  margin-block: 1.25rem;
  padding: 1rem 1.25rem;
  border-inline-start: 0.25rem solid var(--pp-color-accent-dark);
  border-radius: 0.5rem;
  background: var(--pp-color-panel);
}
.invitation-reward p {
  margin: 0;
}
.invitation-reward .invitation-reward-amount {
  margin-block-end: 0.5rem;
  font-size: clamp(1.5rem, 5vw, 2rem);
  font-weight: 650;
  line-height: 1.4;
  color: var(--pp-color-accent-dark);
}
.invitation-choice {
  font-size: 0.875rem;
  color: var(--text-secondary);
}
</style>
