import options from './generation-options.json' with { type: 'json' };

export { options };
export const defaults = Object.freeze({
  language: 'auto',
  photoInfo: false,
  suggest: false,
  ...options.defaults,
  poemLanguage: 'zh',
});
const ciNames = new Set(['', 'auto', ...options.ci.map(([name]) => name)]);
export function normalizePreferences(value) {
  const input = value && typeof value === 'object' ? value : {};
  const choice = (key, values) => (values.includes(input[key]) ? input[key] : defaults[key]);
  const poem = choice('poem', ['', ...options.forms]);
  return {
    // 网站暂不提供照片信息生成，旧账户的开启值也不启用此分支。
    photoInfo: false,
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
  if (!result.photoInfo) result.suggest = false;
  if (result.language === 'auto')
    result.language =
      { 'zh-cn': 'zh', 'zh-hk': 'zh-Hant', 'zh-tw': 'zh-Hant', 'en-us': 'en', 'ja-jp': 'ja', 'ko-kr': 'ko' }[
        locale
      ] || 'en';
  return Object.freeze(result);
}
