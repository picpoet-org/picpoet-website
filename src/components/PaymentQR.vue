<script setup>
import { ref, onMounted, watch } from 'vue';
import { createQRMatrix, drawQRCode } from '../../shared/qr-code.mjs';
import { useSite } from '../i18n/context.mjs';
const props = defineProps({ value: { type: String, required: true } });
const canvas = ref();
const { t } = useSite();
function draw() {
  const matrix = createQRMatrix(props.value);
  const count = matrix.length,
    scale = 4,
    margin = 4,
    element = canvas.value;
  element.width = element.height = (count + margin * 2) * scale;
  const context = element.getContext('2d');
  drawQRCode(context, matrix, 0, 0, scale);
}
onMounted(draw);
watch(() => props.value, draw);
</script>
<template><canvas ref="canvas" class="payment-qr" role="img" :aria-label="t('account.qrAlt')" /></template>
