import { inject } from 'vue';
import { createI18n } from 'vue-i18n';

export const locales = Object.freeze([
  { id: 'zh-cn', tag: 'zh-CN', label: '简体中文' },
  { id: 'zh-hk', tag: 'zh-HK', label: '繁體中文（香港）' },
  { id: 'zh-tw', tag: 'zh-TW', label: '繁體中文（台灣）' },
  { id: 'en-us', tag: 'en-US', label: 'English' },
  { id: 'ko-kr', tag: 'ko-KR', label: '한국어' },
  { id: 'ja-jp', tag: 'ja-JP', label: '日本語' },
]);
export const pages = ['index', 'docs', 'pricing', 'downloads', 'create', 'works', 'account', 'login'];
const key = Symbol('site-context');
export function parseLocation(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const compatibility = parts[0] === 'pages';
  if (compatibility) parts.shift();
  const locale = locales.find((item) => item.id === parts[0])?.id || 'zh-cn';
  if (parts[0] === locale) parts.shift();
  const name = (parts[0] || 'index.html').replace(/\.html$/, '');
  return { locale, page: pages.includes(name) ? name : 'index', compatibility };
}
export function pagePath(page, locale = 'zh-cn', compatibility = false) {
  return `${compatibility ? '/pages' : ''}${locale === 'zh-cn' ? '' : '/' + locale}/${page}.html`;
}
export function createSiteContext({ locale = 'zh-cn', page = 'index', compatibility = false, messages }) {
  const language = locales.find((item) => item.id === locale) || locales[0];
  const brand = language.id === 'zh-cn' ? '图赋' : 'PicPoet';
  const i18n = createI18n({
    legacy: false,
    locale: language.id,
    fallbackLocale: false,
    messages: { [language.id]: messages },
    missingWarn: false,
    fallbackWarn: false,
  });
  const t = (name, parameters = {}) => {
    const value = name.split('.').reduce((item, part) => item?.[part], messages);
    if (typeof value !== 'string') throw new Error(`缺少界面文案：${language.id}/${name}`);
    return i18n.global.t(name, { brand, ...parameters });
  };
  const href = (value) => {
    if (value.startsWith('#') || /^(?:https?:|mailto:)/.test(value)) return value;
    const [file, anchor] = value.split('#');
    return pagePath(file.replace(/\.html$/, ''), language.id, compatibility) + (anchor ? '#' + anchor : '');
  };
  const asset = (value) => `${compatibility ? '/pages' : ''}/${value}`;
  const number = (value) => new Intl.NumberFormat(language.tag).format(value);
  const time = (value) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? date.toLocaleString(language.tag, { hour12: false })
      : t('common.unknownTime');
  };
  const money = (value, currency) => {
    if (!Number.isSafeInteger(value) || value < 0 || !/^[A-Z]{3}$/.test(currency))
      throw new Error(t('common.invalidPrice'));
    return new Intl.NumberFormat(language.tag, { style: 'currency', currency }).format(value / 100);
  };
  return {
    locale: language.id,
    language,
    page,
    compatibility,
    brand,
    t,
    href,
    asset,
    number,
    time,
    money,
    messages,
  };
}
export function provideSite(app, context) {
  app.provide(key, context);
}
export function useSite() {
  return inject(key);
}
