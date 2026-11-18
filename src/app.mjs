import { createSSRApp, reactive } from 'vue';
import { createNavigation } from './navigation.mjs';
import { parseLocation } from './i18n/context.mjs';
import App from './App.vue';
import { createSiteContext, provideSite, locales } from './i18n/context.mjs';
import sourceMetadata from './locales/zh-cn/metadata.json';
const dictionaries = import.meta.glob('./locales/*/*.json', { import: 'default' });
function merge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value))
      target[key] = merge(target[key] || {}, value);
    else target[key] = value;
  }
  return target;
}
export async function createSite(options) {
  const files = Object.entries(dictionaries).filter(([file]) =>
    file.startsWith(`./locales/${options.locale}/`),
  );
  if (!files.length) throw new Error(`缺少语言字典：${options.locale}，请由 agent 补齐对应译文。`);
  const messages = (await Promise.all(files.map(([, load]) => load()))).reduce(merge, {});
  const context = reactive(createSiteContext({ ...options, messages }));
  const router = await createNavigation(options);
  router.afterEach((to) => {
    context.page = parseLocation(to.path).page;
  });
  context.navigate = (target) => router.push(target);
  context.sourceErrors = sourceMetadata.errors;
  const filesFor = (id) =>
    Object.keys(dictionaries)
      .filter((file) => file.startsWith(`./locales/${id}/`))
      .map((file) => file.split('/').at(-1))
      .sort();
  context.availableLocales = locales.filter(
    (language) => JSON.stringify(filesFor(language.id)) === JSON.stringify(filesFor('zh-cn')),
  );
  const app = createSSRApp(App);
  provideSite(app, context);
  app.use(router);
  return { app, context, router };
}
