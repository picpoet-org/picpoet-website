import { nextTick } from 'vue';
import { createRouter, createMemoryHistory, createWebHistory } from 'vue-router';
import { parseLocation, pagePath, locales } from './i18n/context.mjs';

export function internalDestination(value, current) {
  const url = new URL(value, current);
  const base = new URL(current);
  if (url.origin !== base.origin || !/^https?:$/.test(url.protocol)) return null;
  if (
    !/^(?:\/pages)?(?:\/(?:zh-cn|zh-hk|zh-tw|en-us|ko-kr|ja-jp))?\/(?:index|docs|pricing|downloads|create|works|account|login)?(?:\.html)?$/.test(
      url.pathname,
    )
  )
    return null;
  const target = parseLocation(url.pathname);
  const source = parseLocation(base.pathname);
  if (target.locale !== source.locale || target.compatibility !== source.compatibility) return null;
  return url.pathname + url.search + url.hash;
}

export async function createNavigation(options) {
  const browser = typeof window !== 'undefined';
  const router = createRouter({
    history: browser ? createWebHistory() : createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
    scrollBehavior: async (to, from, saved) => {
      await nextTick();
      if (saved) return saved;
      let id = to.hash.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        /* 无效编码沿用原锚点。 */
      }
      const element = id && document.getElementById(id);
      return element ? { el: element } : { top: 0 };
    },
  });
  await router.push(
    browser
      ? location.pathname + location.search + location.hash
      : pagePath(options.page, options.locale, options.compatibility),
  );
  return router;
}

export function startNavigation(router, site) {
  function click(event) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = event.target.closest?.('a[href]');
    if (
      !link ||
      link.hasAttribute('download') ||
      (link.target && link.target !== '_self') ||
      link.relList.contains('external')
    )
      return;
    const target = internalDestination(link.href, location.href);
    if (!target) return;
    // 同页锚点交给浏览器，保留跳过导航及原生焦点行为。
    const url = new URL(link.href);
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
    event.preventDefault();
    void router.push(target);
  }
  const stop = router.afterEach(async (to, from, failure) => {
    if (failure) return;
    const { page, locale } = parseLocation(to.path);
    document.title = site.t(`meta.${page}.title`);
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', site.t(`meta.${page}.description`));
    document.body.className = ['create', 'works', 'account', 'login'].includes(page)
      ? `create-page ${page}-page`
      : '';
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical)
      canonical.href = new URL(pagePath(page, locale).replace(/\/index\.html$/, '/'), canonical.href).href;
    for (const link of document.querySelectorAll('link[rel="alternate"][hreflang]')) {
      const language = locales.find((item) => item.tag === link.hreflang)?.id || 'zh-cn';
      link.href = new URL(pagePath(page, language).replace(/\/index\.html$/, '/'), link.href).href;
    }
    await nextTick();
    if (to.path !== from.path) document.getElementById('main')?.focus({ preventScroll: true });
  });
  document.addEventListener('click', click);
  return () => {
    stop();
    document.removeEventListener('click', click);
  };
}
