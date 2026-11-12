<script setup>
import { computed } from 'vue';
import { safePaymentURL } from '../../shared/create-core.mjs';
import { useSite } from '../i18n/context.mjs';
import PaymentQR from './PaymentQR.vue';
const props = defineProps({ order: Object, label: String, busy: Boolean, feedback: String });
defineEmits(['payment']);
const { t, time, money } = useSite();
const delivered = computed(
  () =>
    props.order.status === 'paid' &&
    props.order.delivery?.mode === 'auto_redeem' &&
    props.order.delivery.creditsGranted > 0,
);
const payment = computed(() => {
  try {
    return safePaymentURL(
      props.order.payment?.qrCode || props.order.payment?.paymentUrl,
      typeof location === 'undefined' ? undefined : location.href,
    );
  } catch {
    return '';
  }
});
</script>
<template>
  <article class="order-item" :data-order-id="order.id">
    <div class="order-info">
      <h3>{{ t('common.credits', { count: order.credits ?? '—' }) }}</h3>
      <span class="order-status" role="status" :data-state="delivered ? 'delivered' : 'pending'">{{
        label
      }}</span>
      <p class="request-id">{{ t('account.orderId', { id: order.id }) }}</p>
      <time class="order-created" :datetime="order.createdAt">{{
        t('account.created', { time: time(order.createdAt) })
      }}</time>
    </div>
    <p v-if="order.amountMinor !== undefined && order.currency" class="order-price">
      {{ money(order.amountMinor, order.currency) }}
    </p>
    <div v-if="order.status === 'pending' && payment" class="order-payment">
      <figure v-if="order.payment.qrCode" class="order-payment-qr">
        <PaymentQR :value="payment" />
        <figcaption>{{ t('account.scan') }}</figcaption>
      </figure>
      <a v-else :href="payment" class="button primary payment-link">{{ t('account.payment') }}</a>
    </div>
    <div v-if="order.status === 'pending'" class="actions">
      <button
        class="button secondary"
        type="button"
        data-action="payment"
        :disabled="busy"
        @click="$emit('payment', order.id)"
      >
        {{ t('account.refreshPayment') }}
      </button>
    </div>
    <p
      :id="'order-feedback-' + order.id"
      class="create-status order-feedback"
      role="status"
      aria-live="polite"
    >
      {{ feedback }}
    </p>
  </article>
</template>
