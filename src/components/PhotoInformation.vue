<script setup>
import { computed } from 'vue';
const props = defineProps({ info: { type: Object, required: true }, t: { type: Function, required: true } });
const hasContent = computed(
  () =>
    ['title', 'subject', 'subtitle', 'description', 'advice'].some((key) => props.info[key]?.trim()) ||
    props.info.tags.some((tag) => tag.trim()),
);
// 仅整理明确的项目符号；普通段落和续行保留原意，不把模型文本当 HTML。
const adviceItems = computed(() => {
  const lines = props.info.advice?.trim().split(/\r?\n/) || [];
  const marker = /^\s*(?:[-*•]\s+|\d+[.)、]\s*)/u;
  if (!lines.length || !marker.test(lines[0])) return null;
  const items = [];
  for (const line of lines) {
    if (marker.test(line)) items.push(line.replace(marker, ''));
    else if (line.trim()) items[items.length - 1] += '\n' + line;
  }
  return items;
});
</script>
<template>
  <section v-if="hasContent" class="result-metadata" :aria-label="t('preferences.photoInfo')">
    <h3>{{ t('preferences.photoInfo') }}</h3>
    <p v-if="info.title" class="metadata-title">
      <strong>{{ info.title }}</strong>
    </p>
    <p v-if="info.subject && info.subject !== info.title">{{ info.subject }}</p>
    <p v-if="info.subtitle">{{ info.subtitle }}</p>
    <p v-if="info.description" class="metadata-description">{{ info.description }}</p>
    <ul v-if="info.tags.length" class="metadata-tags" :aria-label="t('preferences.tags')">
      <li v-for="(tag, index) in info.tags" :key="index">{{ tag }}</li>
    </ul>
    <section v-if="info.advice" class="composition-advice">
      <h4>{{ t('preferences.advice') }}</h4>
      <ul v-if="adviceItems" class="composition-list">
        <li v-for="(item, index) in adviceItems" :key="index">{{ item }}</li>
      </ul>
      <p v-else class="metadata-description">{{ info.advice }}</p>
    </section>
  </section>
</template>
