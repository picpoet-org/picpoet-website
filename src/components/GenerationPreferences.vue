<script setup>
import { computed } from 'vue';
import CiPicker from './CiPicker.vue';
import SelectControl from './SelectControl.vue';
import { useGenerationPreferences } from '../composables/useGenerationPreferences.mjs';
import { options } from '../../shared/generation-preferences.mjs';
const props = defineProps({ session: { type: Object, required: true } });
const { t } = props.session;
const { value, status, save } = useGenerationPreferences(props.session);
const languages = {
  zh: '简体中文',
  'zh-Hant': '繁體中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  vi: 'Tiếng Việt',
  th: 'ไทย',
};
const kind = computed(() => (value.value.ci ? 'ci' : value.value.poem || 'none'));
function update(key, next) {
  save({ ...value.value, [key]: next });
}
function setKind(next) {
  save({
    ...value.value,
    poem: options.forms.includes(next) ? next : '',
    ci: next === 'ci' ? options.defaults.ci : '',
  });
}
</script>
<template>
  <section
    id="creation-preferences"
    class="create-panel preferences-panel"
    aria-labelledby="preferences-title"
  >
    <header class="preferences-head">
      <h2 id="preferences-title">{{ t('preferences.title') }}</h2>
      <p class="preferences-status" role="status" aria-live="polite">{{ status }}</p>
    </header>
    <p class="fine-print preferences-scope">{{ t('preferences.scope') }}</p>
    <fieldset class="preferences-group">
      <legend>{{ t('preferences.groupLanguage') }}</legend>
      <div class="preferences-grid">
        <div class="preference-field">
          <label for="tag-language">{{ t('preferences.language') }}</label>
          <SelectControl
            ><select
              id="tag-language"
              :value="value.language"
              @change="update('language', $event.target.value)"
            >
              <option value="auto">{{ t('preferences.autoLanguage') }}</option>
              <option v-for="(label, code) in languages" :key="code" :value="code">{{ label }}</option>
            </select></SelectControl
          >
        </div>
        <div class="preference-field">
          <label for="verse-language">{{ t('preferences.poemLanguage') }}</label>
          <SelectControl
            ><select
              id="verse-language"
              :value="value.poemLanguage"
              aria-describedby="verse-language-help"
              @change="update('poemLanguage', $event.target.value)"
            >
              <option value="zh">{{ t('preferences.simplified') }}</option>
              <option value="zh-Hant">{{ t('preferences.traditional') }}</option>
            </select></SelectControl
          >
        </div>
      </div>
      <p id="verse-language-help" class="fine-print preference-help">{{ t('preferences.languageHelp') }}</p>
    </fieldset>
    <fieldset class="preferences-group">
      <legend>{{ t('preferences.groupPoetry') }}</legend>
      <div class="preferences-grid">
        <div class="preference-field">
          <label for="verse-kind">{{ t('preferences.form') }}</label>
          <SelectControl
            ><select id="verse-kind" :value="kind" @change="setKind($event.target.value)">
              <option v-for="form in [...options.forms, 'ci', 'none']" :key="form" :value="form">
                {{ t('preferences.forms.' + form) }}
              </option>
            </select></SelectControl
          >
        </div>
        <div v-if="['jueju', 'lvshi'].includes(kind)" class="preference-field">
          <label for="verse-meter">{{ t('preferences.meter') }}</label>
          <SelectControl
            ><select
              id="verse-meter"
              :value="value.poemMeter"
              @change="update('poemMeter', $event.target.value)"
            >
              <option v-for="meter in options.meters" :key="meter" :value="meter">
                {{ t('preferences.meters.' + meter) }}
              </option>
            </select></SelectControl
          >
        </div>
        <CiPicker
          v-if="kind === 'ci'"
          :model-value="value.ci"
          :poem-language="value.poemLanguage"
          :t="t"
          @update:model-value="update('ci', $event)"
        />
        <div v-if="kind !== 'none'" class="preference-field">
          <label for="verse-rhyme">{{ t('preferences.rhyme') }}</label>
          <SelectControl
            ><select
              id="verse-rhyme"
              :value="value.rhymeStandard"
              aria-describedby="rhyme-help"
              @change="update('rhymeStandard', $event.target.value)"
            >
              <option v-for="rhyme in options.rhymes" :key="rhyme" :value="rhyme">
                {{ t('preferences.rhymes.' + rhyme) }}
              </option>
            </select></SelectControl
          >
        </div>
      </div>
      <p v-if="kind === 'line'" class="fine-print preference-help">{{ t('preferences.lineHelp') }}</p>
      <p v-if="kind !== 'none'" id="rhyme-help" class="fine-print preference-help">
        {{ t('preferences.rhymeHelp') }}
      </p>
    </fieldset>
    <fieldset class="preferences-group">
      <legend>{{ t('preferences.groupExtras') }}</legend>
      <label class="preference-suggest" for="composition-suggest">
        <input
          id="composition-suggest"
          type="checkbox"
          :checked="value.suggest"
          aria-describedby="suggest-help"
          @change="update('suggest', $event.target.checked)"
        />
        <span class="preference-suggest-copy">
          <span class="preference-suggest-title">{{ t('preferences.suggest') }}</span>
          <span id="suggest-help" class="fine-print">{{ t('preferences.suggestHelp') }}</span>
        </span>
      </label>
    </fieldset>
  </section>
</template>
