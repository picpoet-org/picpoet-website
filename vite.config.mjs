import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:18081';
import { parseLocation } from './src/i18n/context.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
function sendSourceFile(rootDir, pathname, response, next) {
  const relative = path.posix.normalize(pathname).replace(/^(\.\.(\/|$))+/, '');
  const file = path.resolve(rootDir, relative);
  if (!file.startsWith(rootDir + path.sep)) return next();
  access(file)
    .then(() => {
      response.setHeader('Content-Type', mimeTypes[path.extname(file)] || 'application/octet-stream');
      createReadStream(file).on('error', next).pipe(response);
    })
    .catch(() => next());
}
export default defineConfig({
  root,
  plugins: [
    vue(),
    {
      name: 'picpoet-vue-pages',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const url = new URL(request.url, 'http://localhost');
          // Vite 会把 JSON/CSS 转成 JS 模块；带查询参数时必须交给 Vite，不能按静态文件返回。
          if (url.search) return next();
          const pathname = url.pathname.replace(/^\/pages/, '');
          if (pathname.startsWith('/assets/'))
            return sendSourceFile(
              path.join(root, 'assets'),
              pathname.slice('/assets/'.length),
              response,
              next,
            );
          return next();
        });
        server.middlewares.use(async (request, response, next) => {
          const pathname = new URL(request.url, 'http://localhost').pathname;
          if (
            !/^(?:\/pages)?(?:\/(?:zh-cn|zh-hk|zh-tw|en-us|ko-kr|ja-jp))?\/(?:index|docs|pricing|downloads|create|works|account|login)?(?:\.html)?$/.test(
              pathname,
            )
          )
            return next();
          try {
            const options = parseLocation(pathname);
            const { render } = await server.ssrLoadModule('/src/entry-server.mjs');
            const result = await render(options);
            const escape = (value) =>
              value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
            const html = `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(result.title)}</title><meta name="description" content="${escape(result.description)}"><link rel="icon" href="/assets/picpoet-mark.svg" type="image/svg+xml"><script type="module" src="/src/entry-client.mjs"></script></head><body class="${['create', 'account', 'works', 'login'].includes(options.page) ? 'create-page ' + options.page + '-page' : ''}"><div id="app">${result.html}</div></body></html>`;
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(await server.transformIndexHtml(pathname, html));
          } catch (error) {
            next(error);
          }
        });
      },
    },
  ],
  publicDir: false,
  define: { __INTLIFY_JIT_COMPILATION__: true },
  build: {
    outDir: 'public',
    emptyOutDir: false,
    assetsDir: 'app',
    manifest: true,
    rollupOptions: { input: fileURLToPath(new URL('src/entry-client.mjs', import.meta.url)) },
  },
  server: {
    host: '127.0.0.1',
    port: 8080,
    strictPort: true,
    proxy: {
      '/web-api': { target: apiTarget, changeOrigin: false },
      '^/[^/]+/invite_code=': { target: apiTarget, changeOrigin: false },
    },
  },
  appType: 'mpa',
});
