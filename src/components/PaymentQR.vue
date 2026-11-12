<script setup>
import { ref, onMounted, watch } from 'vue';
import qrcode from 'qrcode-generator';
import { useSite } from '../i18n/context.mjs';
const props = defineProps({ value: { type: String, required: true } });
const canvas = ref();
const { t } = useSite();
function draw() {
  const code = qrcode(0, 'M');
  code.addData(props.value);
  code.make();
  const count = code.getModuleCount(),
    scale = 4,
    margin = 4,
    element = canvas.value;
  element.width = element.height = (count + margin * 2) * scale;
  const context = element.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, element.width, element.height);
  context.fillStyle = '#000';
  for (let row = 0; row < count; row++)
    for (let col = 0; col < count; col++)
      if (code.isDark(row, col))
        context.fillRect((col + margin) * scale, (row + margin) * scale, scale, scale);
}
onMounted(draw);
watch(() => props.value, draw);
</script>
<template><canvas ref="canvas" class="payment-qr" role="img" :aria-label="t('account.qrAlt')" /></template>
