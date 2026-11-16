import options from './generation-options.json' with { type: 'json' };

export { options };
export const defaults = Object.freeze({ language: 'auto', suggest: false, ...options.defaults });
const ciNames = new Set(['', 'auto', ...options.ci.map(([name]) => name)]);
export function normalizePreferences(value) {
  const input = value && typeof value === 'object' ? value : {};
  const choice = (key, values) => (values.includes(input[key]) ? input[key] : defaults[key]);
  const poem = choice('poem', ['', ...options.forms]);
  return {
    language: choice('language', ['auto', ...options.languages]),
    poemLanguage: choice('poemLanguage', options.poemLanguages),
    poem,
    poemMeter: choice('poemMeter', options.meters),
    rhymeStandard: choice('rhymeStandard', options.rhymes),
    ci: poem ? '' : ciNames.has(input.ci) ? input.ci : defaults.ci,
    suggest: typeof input.suggest === 'boolean' ? input.suggest : defaults.suggest,
  };
}
export function resolvePreferences(value, locale) {
  const result = normalizePreferences(value);
  if (result.language === 'auto')
    result.language =
      { 'zh-cn': 'zh', 'zh-hk': 'zh-Hant', 'zh-tw': 'zh-Hant', 'en-us': 'en', 'ja-jp': 'ja', 'ko-kr': 'ko' }[
        locale
      ] || 'en';
  return Object.freeze(result);
}
