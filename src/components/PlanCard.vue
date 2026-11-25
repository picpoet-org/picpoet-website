<script setup>
import { computed } from 'vue';
import { useSite } from '../i18n/context.mjs';

const props = defineProps({ plan: { type: Object, required: true }, disabled: Boolean });
defineEmits(['buy']);
const { t, money, number } = useSite();
const multiplier = computed(() => {
  const { baseCredits, credits } = props.plan;
  return Number.isSafeInteger(baseCredits) && baseCredits > 0 && baseCredits < credits
    ? credits / baseCredits
    : null;
});
const caption = computed(() => {
  const { title } = props.plan;
  return /^\d+次(?:创作)?$/.test(title.replace(/\s/g, '')) ? '' : title;
});
const price = computed(() => money(props.plan.priceMinor, props.plan.currency));
</script>
<template>
  <article class="plan-item">
    <h3>{{ t(multiplier ? 'account.planTotal' : 'common.credits', { count: number(plan.credits) }) }}</h3>
    <p v-if="multiplier" :id="`plan-offer-${plan.id}`" class="plan-offer">
      <strong class="account-badge">{{
        t('account.planPromotion', { multiplier: number(multiplier) })
      }}</strong>
      <span class="plan-caption">{{ t('account.planBase', { count: number(plan.baseCredits) }) }}</span>
    </p>
    <p v-if="caption" class="plan-caption">{{ caption }}</p>
    <p class="plan-price">{{ price }}</p>
    <button
      class="button primary"
      type="button"
      :data-plan-id="plan.id"
      :aria-label="t('account.buyLabel', { count: number(plan.credits), price })"
      :aria-describedby="multiplier ? `plan-offer-${plan.id}` : undefined"
      :disabled="disabled"
      @click="$emit('buy', plan)"
    >
      {{ t('account.buy') }}
    </button>
  </article>
</template>
