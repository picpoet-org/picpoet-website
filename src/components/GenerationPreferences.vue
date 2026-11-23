<script setup>
import { computed } from 'vue';
import CiPicker from './CiPicker.vue';
import SelectControl from './SelectControl.vue';
import { useGenerationPreferences } from '../composables/useGenerationPreferences.mjs';
import { defaultPoemLanguage, options } from '../../shared/generation-preferences.mjs';
const props = defineProps({ session: { type: Object, required: true } });
const { t } = props.session;
const { value, status, ready, failed, save, retry } = useGenerationPreferences(props.session);
const defaultScript = defaultPoemLanguage(props.session.locale);
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
  <section class="create-panel preferences-panel" aria-labelledby="preferences-title">
    <header class="preferences-head">
      <h2 id="preferences-title">{{ t('preferences.title') }}</h2>
      <p class="preferences-status" role="status" aria-live="polite">{{ status }}</p>
    </header>
    <button v-if="failed" type="button" class="button" @click="retry">{{ t('preferences.retry') }}</button>
    <section class="preferences-section" aria-labelledby="poetry-preferences-title">
      <h3 id="poetry-preferences-title" class="preferences-section-title">
        {{ t('preferences.groupPoetry') }}
      </h3>
      <fieldset class="preferences-group" :disabled="!ready" :aria-label="t('preferences.groupPoetry')">
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
          <div v-if="kind !== 'none'" class="preference-field">
            <label for="verse-language">{{ t('preferences.poemLanguage') }}</label>
            <SelectControl
              ><select
                id="verse-language"
                :value="value.poemLanguage"
                @change="update('poemLanguage', $event.target.value)"
              >
                <option value="auto">
                  {{ t('preferences.autoLanguage') }} ·
                  {{ t(defaultScript === 'zh' ? 'preferences.simplified' : 'preferences.traditional') }}
                </option>
                <option value="zh">{{ t('preferences.simplified') }}</option>
                <option value="zh-Hant">{{ t('preferences.traditional') }}</option>
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
            :poem-language="value.poemLanguage === 'auto' ? defaultScript : value.poemLanguage"
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
    </section>
    <p v-if="!value.photoInfo && kind === 'none'" class="fine-print" role="status">
      {{ t('preferences.enableContent') }}
    </p>
  </section>
</template>
