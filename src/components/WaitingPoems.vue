<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useSite } from '../i18n/context.mjs';
const props = defineProps({ active: Boolean });
const { t } = useSite();
const paused = ref(false),
  hovered = ref(false),
  focused = ref(false),
  reducedMotion = ref(true),
  pageVisible = ref(false),
  index = ref(0);
const poems = [
  ['行到水穷处，坐看云起时。', '王维《终南别业》'],
  ['明月松间照，清泉石上流。', '王维《山居秋暝》'],
  ['山光悦鸟性，潭影空人心。', '常建《题破山寺后禅院》'],
  ['采菊东篱下，悠然见南山。', '陶渊明《饮酒·其五》'],
  ['疏影横斜水清浅，暗香浮动月黄昏。', '林逋《山园小梅·其一》'],
  ['一道残阳铺水中，半江瑟瑟半江红。', '白居易《暮江吟》'],
];
let timer, motionPreference;
const updateMotion = () => {
  reducedMotion.value = motionPreference.matches;
};
const updateVisibility = () => {
  pageVisible.value = !document.hidden;
};
const leaveFocus = (event) => {
  if (!event.currentTarget.contains(event.relatedTarget)) focused.value = false;
};
watch(
  () => [props.active, paused.value, hovered.value, focused.value, reducedMotion.value, pageVisible.value],
  () => {
    clearInterval(timer);
    if (
      props.active &&
      !paused.value &&
      !hovered.value &&
      !focused.value &&
      !reducedMotion.value &&
      pageVisible.value
    )
      timer = setInterval(() => {
        index.value = (index.value + 1) % poems.length;
      }, 8000);
  },
);
watch(
  () => props.active,
  (active) => {
    if (!active) {
      index.value = 0;
      paused.value = false;
      hovered.value = false;
      focused.value = false;
    }
  },
);
onMounted(() => {
  motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  updateMotion();
  updateVisibility();
  motionPreference.addEventListener('change', updateMotion);
  document.addEventListener('visibilitychange', updateVisibility);
});
onBeforeUnmount(() => {
  clearInterval(timer);
  motionPreference?.removeEventListener('change', updateMotion);
  document.removeEventListener('visibilitychange', updateVisibility);
});
</script>
<template>
  <aside
    id="waiting-poems"
    class="waiting-poems"
    :hidden="!active"
    :aria-label="t('create.waiting')"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @focusin="focused = true"
    @focusout="leaveFocus"
  >
    <div class="waiting-poems-stage" aria-live="off">
      <blockquote
        v-for="(poem, position) in poems"
        :key="poem[1]"
        class="waiting-poem"
        lang="zh-CN"
        :class="{ 'is-current': position === index }"
        :aria-hidden="position !== index"
      >
        <p>
          <span v-for="(line, lineIndex) in poem[0].split('，')" :key="lineIndex"
            >{{ line }}{{ lineIndex === 0 ? '，' : '' }}</span
          >
        </p>
        <cite>{{ poem[1] }}</cite>
      </blockquote>
    </div>
    <!-- 保留键盘/读屏暂停入口，仅获得焦点时显现，普通等待界面专注诗句。 -->
    <button
      class="waiting-poems-control"
      type="button"
      :aria-pressed="paused"
      :hidden="reducedMotion"
      @click="paused = !paused"
    >
      {{ t(paused ? 'create.resumePoems' : 'create.pausePoems') }}
    </button>
  </aside>
</template>

<style scoped>
.waiting-poems {
  position: relative;
  margin-block: 1rem;
  padding: 1.5rem 1.25rem;
  border: 1px solid var(--pp-color-line);
  border-radius: var(--pp-radius-2);
  background: var(--pp-color-paper);
}
.waiting-poems-stage {
  display: grid;
}
.waiting-poem {
  /* 所有诗句共用网格轨道，按最长内容保留高度，切换时页面不跳动。 */
  grid-area: 1 / 1;
  margin: 0;
  min-inline-size: 0;
  align-self: center;
  text-align: center;
  opacity: 0;
  visibility: hidden;
  transform: translateY(0.375rem);
  transition:
    opacity 450ms ease,
    transform 450ms ease,
    visibility 450ms;
}
.waiting-poem.is-current {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}
.waiting-poem p {
  margin: 0 0 0.875rem;
  font-family: 'LXGW WenKai', serif;
  font-size: clamp(1.125rem, 2.5vw, 1.375rem);
  line-height: 1.8;
  text-wrap: balance;
}
.waiting-poem p span {
  display: block;
}
.waiting-poem cite {
  font-size: 0.8125rem;
  font-style: normal;
  color: var(--create-muted);
}
.waiting-poems-control:not(:focus-visible) {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.waiting-poems-control:focus-visible {
  position: absolute;
  inset-inline-end: 0.5rem;
  inset-block-end: 0.5rem;
  min-block-size: 2.75rem;
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--pp-color-muted);
  border-radius: var(--pp-radius-1);
  background: var(--pp-color-paper);
  color: var(--pp-color-ink);
  font-size: 0.875rem;
}
@media (prefers-reduced-motion: reduce) {
  .waiting-poem {
    transition: none;
    transform: none;
  }
}
</style>
