import { createSite } from './app.mjs';
import { parseLocation } from './i18n/context.mjs';
import { startNavigation } from './navigation.mjs';
import '../shared/picpoet-tokens.css';
import '../styles.css';
import '../shared/create.css';
import './site.css';
const options = parseLocation(location.pathname);
document.documentElement.lang = {
  'zh-cn': 'zh-CN',
  'zh-hk': 'zh-HK',
  'zh-tw': 'zh-TW',
  'en-us': 'en-US',
  'ko-kr': 'ko-KR',
  'ja-jp': 'ja-JP',
}[options.locale];
const { app, context, router } = await createSite(options);
app.mount('#app');
startNavigation(router, context);
document.documentElement.dataset.hydrated = 'true';
