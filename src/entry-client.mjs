import { createSite } from './app.mjs';
import { parseLocation } from './i18n/context.mjs';
import { createAPI } from '../shared/create-core.mjs';
import { startSessionVisits } from './session-visits.mjs';
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
const { app } = await createSite(options);
app.mount('#app');
document.documentElement.dataset.hydrated = 'true';
// 用户页面由 useSession 统一读取身份；公开页也记录访问，以保持登录。
if (!['login', 'create', 'works', 'account'].includes(options.page)) {
  const api = createAPI();
  startSessionVisits(() => api('/session'));
}
