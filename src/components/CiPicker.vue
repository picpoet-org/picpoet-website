<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { options } from '../../shared/generation-preferences.mjs';
const props = defineProps({
  modelValue: { type: String, required: true },
  poemLanguage: { type: String, required: true },
  t: { type: Function, required: true },
});
const emit = defineEmits(['update:modelValue']);
const open = ref(false);
const query = ref('');
const active = ref(-1);
const input = ref();
const list = ref();
const picker = ref();
let pointerInside = false;
function pointerDown(event) {
  pointerInside = !!picker.value?.contains(event.target);
  if (pointerInside) return;
  // 某些浏览器将原生滚动条事件归到外层节点，按弹层实际边界兜底。
  const rect = list.value?.getBoundingClientRect();
  if (
    rect &&
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  ) {
    pointerInside = true;
    return;
  }
  close();
}
function pointerEnd() {
  pointerInside = false;
}
function outsideKeyboard(event) {
  if (['Tab', 'Escape'].includes(event.key) && !picker.value?.contains(event.target)) close();
}
function focusIn(event) {
  // 原生滚动条会将焦点交给可聚焦祖先（如 main），内部指针操作不视为离开。
  if (pointerInside || event.target === document.body || event.target === document.documentElement) return;
  if (!picker.value?.contains(event.target)) close();
}
onMounted(() => {
  document.addEventListener('pointerdown', pointerDown, true);
  document.addEventListener('focusin', focusIn, true);
  document.addEventListener('pointerup', pointerEnd, true);
  document.addEventListener('pointercancel', pointerEnd, true);
  document.addEventListener('keydown', outsideKeyboard, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', pointerDown, true);
  document.removeEventListener('focusin', focusIn, true);
  document.removeEventListener('pointerup', pointerEnd, true);
  document.removeEventListener('pointercancel', pointerEnd, true);
  document.removeEventListener('keydown', outsideKeyboard, true);
});
const label = (pair) => pair[props.poemLanguage === 'zh-Hant' ? 1 : 0];
const selectedLabel = computed(() => {
  const pair = options.ci.find(([name]) => name === props.modelValue);
  return pair ? label(pair) : props.t('preferences.autoCi');
});
const matches = computed(() =>
  options.ci.filter((pair) => pair.some((name) => name.includes(query.value.trim()))),
);
const choices = computed(() => [
  { value: 'auto', label: props.t('preferences.autoCi') },
  ...matches.value.map((pair) => ({ value: pair[0], label: label(pair) })),
]);
function reveal() {
  nextTick(() => list.value?.children[active.value]?.scrollIntoView({ block: 'nearest' }));
}
function expand() {
  if (open.value) return;
  query.value = '';
  open.value = true;
  active.value = choices.value.findIndex((item) => item.value === props.modelValue);
  reveal();
}
function close() {
  open.value = false;
  query.value = '';
  active.value = -1;
}
function search(event) {
  query.value = event.target.value;
  open.value = true;
  active.value = matches.value.length ? 1 : 0;
  reveal();
}
function choose(index) {
  const item = choices.value[index];
  if (!item) return;
  emit('update:modelValue', item.value);
  input.value?.focus({ preventScroll: true });
  close();
}
function keyboard(event) {
  // 输入法确认候选词不等于确认词牌。
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === 'Escape') {
    if (open.value) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!open.value) expand();
    else
      active.value = Math.max(
        0,
        Math.min(choices.value.length - 1, active.value + (event.key === 'ArrowDown' ? 1 : -1)),
      );
    reveal();
  } else if (event.key === 'Enter' && open.value) {
    event.preventDefault();
    choose(active.value);
  } else if (event.key === 'Tab') close();
}
watch(() => [props.modelValue, props.poemLanguage], close);
</script>
<template>
  <div class="preference-field">
    <label id="verse-ci-label" for="verse-ci">{{ t('preferences.ci') }}</label>
    <div ref="picker" class="ci-picker" @keydown.esc="close" @keydown.tab="close">
      <input
        id="verse-ci"
        ref="input"
        role="combobox"
        type="text"
        autocomplete="off"
        :spellcheck="false"
        aria-autocomplete="list"
        aria-controls="verse-ci-options"
        :aria-expanded="open"
        :aria-activedescendant="open && active >= 0 ? `verse-ci-option-${active}` : undefined"
        :value="open ? query : selectedLabel"
        :placeholder="t('preferences.searchCi')"
        @focus="expand"
        @click="expand"
        @input="search"
        @keydown="keyboard"
      />
      <svg class="ci-picker-chevron" aria-hidden="true" viewBox="0 0 20 20" fill="none">
        <path d="m5 7 5 5 5-5" stroke="currentColor" stroke-width="1.5" />
      </svg>
      <div v-if="open" class="ci-picker-popup">
        <ul id="verse-ci-options" ref="list" role="listbox" aria-labelledby="verse-ci-label">
          <li
            v-for="(item, index) in choices"
            :id="`verse-ci-option-${index}`"
            :key="item.value"
            role="option"
            :aria-selected="item.value === modelValue"
            :class="{ 'is-active': index === active }"
            @pointerdown.prevent
            @click="choose(index)"
          >
            <span>{{ item.label }}</span><span v-if="item.value === modelValue" aria-hidden="true">✓</span>
          </li>
        </ul>
        <p v-if="query && !matches.length" class="fine-print ci-picker-empty" role="status">
          {{ t('preferences.noCi') }}
        </p>
      </div>
    </div>
  </div>
</template>
<style scoped>
.ci-picker {
  position: relative;
  min-inline-size: 0;
}
.ci-picker input {
  padding-inline-end: 2.5rem;
}
.ci-picker-popup {
  position: absolute;
  z-index: 5;
  inset-inline: 0;
  inset-block-start: calc(100% + 0.375rem);
  background: var(--pp-color-paper);
  border: 1px solid var(--pp-color-line);
  border-radius: var(--pp-radius-1);
  box-shadow: 0 0.5rem 1.5rem rgb(32 32 30 / 12%);
  overflow: hidden;
}
.ci-picker-popup ul {
  list-style: none;
  padding: 0.25rem;
  margin: 0;
  max-block-size: min(18rem, 40dvh);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.ci-picker-popup li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-block-size: 2.75rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  overflow-wrap: anywhere;
  border-radius: var(--pp-radius-1);
}
.ci-picker-popup li:hover,
.ci-picker-popup li.is-active {
  background: var(--pp-color-panel);
  outline: 1px solid var(--pp-color-ink);
  outline-offset: -1px;
}
.ci-picker-popup li[aria-selected='true'] {
  font-weight: 700;
}
.ci-picker-empty {
  padding: 0.75rem;
}
</style>
