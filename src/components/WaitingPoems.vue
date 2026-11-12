<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import { useSite } from '../i18n/context.mjs';
const props = defineProps({ active: Boolean });
const { t } = useSite();
const paused = ref(false),
  index = ref(0);
const poems = [
  ['行到水穷处，坐看云起时。', '王维《终南别业》'],
  ['明月松间照，清泉石上流。', '王维《山居秋暝》'],
  ['山光悦鸟性，潭影空人心。', '常建《题破山寺后禅院》'],
  ['采菊东篱下，悠然见南山。', '陶渊明《饮酒·其五》'],
  ['疏影横斜水清浅，暗香浮动月黄昏。', '林逋《山园小梅·其一》'],
  ['一道残阳铺水中，半江瑟瑟半江红。', '白居易《暮江吟》'],
];
let timer;
watch(
  () => [props.active, paused.value],
  () => {
    clearInterval(timer);
    if (props.active && !paused.value)
      timer = setInterval(() => {
        index.value = (index.value + 1) % poems.length;
      }, 6000);
  },
);
onBeforeUnmount(() => clearInterval(timer));
</script>
<template>
  <aside id="waiting-poems" class="waiting-poems" :hidden="!active" :aria-label="t('create.waiting')">
    <blockquote lang="zh-CN">
      <p>{{ poems[index][0] }}</p>
      <cite>{{ poems[index][1] }}</cite>
    </blockquote>
    <button class="waiting-poems-toggle" type="button" @click="paused = !paused">
      {{ t(paused ? 'create.resumePoems' : 'create.pausePoems') }}
    </button>
  </aside>
</template>
