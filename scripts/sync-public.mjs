import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import { deployment, validatePublishedManifest } from './deployment-config.mjs';
import { locales, pages, pagePath } from '../src/i18n/context.mjs';
import { checkLocales, availableLocales } from './check-locales.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'public');
const renderDirectory = path.join(root, '.build/render');
const languageIds = process.argv.includes('--zh-only')
  ? ['zh-cn']
  : process.argv.includes('--all-locales')
    ? locales.map((item) => item.id)
    : await availableLocales();
await checkLocales(languageIds);
const pending = locales.filter((item) => !languageIds.includes(item.id));
if (pending.length)
  console.warn(
    `待 CLI 翻译：${pending.map((item) => item.id).join('、')}。本次仅交付已完成字典的语言；正式六语言验收使用 npm run build:all。`,
  );
validatePublishedManifest(JSON.parse(await readFile(path.join(root, 'releases/stable.json'), 'utf8')));
// 客户端与预渲染使用同一份组件；认证和业务数据只在浏览器挂载后请求。
await rm(renderDirectory, { recursive: true, force: true });
await build({
  root,
  configFile: path.join(root, 'vite.config.mjs'),
  build: {
    ssr: 'src/entry-server.mjs',
    outDir: renderDirectory,
    emptyOutDir: true,
    manifest: false,
    rollupOptions: { input: path.join(root, 'src/entry-server.mjs') },
  },
});
const { render } = await import(pathToFileURL(path.join(renderDirectory, 'entry-server.mjs')));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const directory of ['assets', 'releases'])
  await cp(path.join(root, directory), path.join(output, directory), { recursive: true });
await build({ root, configFile: path.join(root, 'vite.config.mjs') });
const manifest = JSON.parse(await readFile(path.join(output, '.vite/manifest.json'), 'utf8'));
const entry = manifest['src/entry-client.mjs'];
const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const locations = [];
for (const locale of locales.filter((item) => languageIds.includes(item.id))) {
  for (const page of pages) {
    const canonicalPath = pagePath(page, locale.id).replace(/\/index\.html$/, '/');
    const canonical = deployment.websiteUrl + (canonicalPath === '/' ? '/' : canonicalPath);
    locations.push(canonical);
    for (const compatibility of [false, true]) {
      const rendered = await render({ locale: locale.id, page, compatibility });
      const bodyClass = ['create', 'works', 'account', 'login'].includes(page)
        ? `create-page ${page}-page`
        : '';
      const html = `<!doctype html>\n<html lang="${locale.tag}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="${escape(rendered.description)}"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#20201e"><title>${escape(rendered.title)}</title><link rel="icon" href="/assets/picpoet-mark.svg" type="image/svg+xml"><link rel="canonical" href="${canonical}">${locales
        .filter((item) => languageIds.includes(item.id))
        .map(
          (item) =>
            `<link rel="alternate" hreflang="${item.tag}" href="${deployment.websiteUrl}${pagePath(page, item.id).replace(/\/index\.html$/, '/')}" />`,
        )
        .join(
          '',
        )}<link rel="alternate" hreflang="x-default" href="${deployment.websiteUrl}${pagePath(page).replace(/\/index\.html$/, '/')}" />${(entry.css || []).map((file) => `<link rel="stylesheet" href="/${file}">`).join('')}<script type="module" src="/${entry.file}"></script></head><body class="${bodyClass}"><div id="app">${rendered.html}</div><noscript><p class="notice shell">${escape(rendered.noscript)}</p></noscript></body></html>\n`;
      const file = path.join(output, pagePath(page, locale.id, compatibility).slice(1));
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, html);
    }
  }
}
for (const directory of ['assets', 'releases'])
  await cp(path.join(output, directory), path.join(output, 'pages', directory), { recursive: true });
await writeFile(
  path.join(output, 'robots.txt'),
  `User-agent: *\nAllow: /\nSitemap: ${deployment.websiteUrl}/sitemap.xml\n`,
);
await writeFile(
  path.join(output, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locations.map((location) => `<url><loc>${location}</loc></url>`).join('')}</urlset>\n`,
);
console.log(`Vue 构建完成：${languageIds.length} 种语言 × ${pages.length} 个页面，含 /pages/ 兼容路径。`);
