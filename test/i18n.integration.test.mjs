import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSiteContext, locales, pages, pagePath, parseLocation } from '../src/i18n/context.mjs';
import { availableLocales, checkLocales } from '../scripts/check-locales.mjs';

test('六语言共用路由与品牌协议，根目录和历史兼容路径可往返定位', () => {
  for (const language of locales) {
    for (const page of pages) {
      for (const compatibility of [false, true]) {
        const options = { locale: language.id, page, compatibility };
        assert.deepEqual(parseLocation(pagePath(page, language.id, compatibility)), options);
        // 占位符保持语言无关；实际译文只从 CLI 产物加载。
        const context = createSiteContext({ ...options, messages: { brandOnly: '{brand}' } });
        assert.equal(context.t('brandOnly'), language.id === 'zh-cn' ? '图赋' : 'PicPoet');
        assert.equal(
          context.href('account.html#purchase'),
          pagePath('account', language.id, compatibility) + '#purchase',
        );
        assert.equal(
          context.asset('releases/stable.json'),
          (compatibility ? '/pages' : '') + '/releases/stable.json',
        );
        assert.ok(context.money(100, 'CNY').length);
      }
    }
  }
});

test('已交付语言字典经完整性校验后生成 SEO 与共用组件', async () => {
  const ids = await availableLocales();
  assert.ok(ids.includes('zh-cn'));
  const result = await checkLocales(ids);
  assert.equal(result.languages, ids.length);
  for (const id of ids) {
    const html = await readFile(new URL('../public' + pagePath('downloads', id), import.meta.url), 'utf8');
    assert.ok(html.includes(`lang="${locales.find((item) => item.id === id).tag}"`));
    assert.ok(html.includes('id="site-language"'));
    assert.ok(html.includes('hreflang="x-default"'));
    assert.ok(html.includes('aria-current="page"'));
    assert.ok(html.includes('<main id="main"'));
  }
});
