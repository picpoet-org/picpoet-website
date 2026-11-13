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
    {{ t('sharing.includeQR') }}
  </label>
  <dialog ref="dialog" class="share-invitation-dialog" :aria-label="t('sharing.rewardTitle')">
    <h3>{{ t('sharing.rewardTitle') }}</h3>
    <p>{{ t('sharing.rewardNotice') }}</p>
    <div class="actions">
      <button type="button" class="button secondary" @click="omit">{{ t('sharing.omitQR') }}</button>
      <button type="button" class="button primary" autofocus @click="dialog.close()">
        {{ t('sharing.keepQR') }}
      </button>
    </div>
  </dialog>
</template>
<style scoped>
.share-invitation-option {
  display: flex;
  align-items: center;
  gap: 0.6em;
  margin-block: 1rem;
  cursor: pointer;
}
.share-invitation-option input {
  width: 1.2em;
  height: 1.2em;
  margin: 0;
}
.share-invitation-dialog {
  max-width: min(28rem, 90vw);
  padding: 1.5rem;
}
</style>
