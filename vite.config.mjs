import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { parseLocation } from './src/i18n/context.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root,
  plugins: [
    vue(),
    {
      name: 'picpoet-vue-pages',
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          const pathname = new URL(request.url, 'http://localhost').pathname;
          if (/^\/pages\/(?:assets|releases)\//.test(pathname)) {
            request.url = request.url.replace(/^\/pages/, '');
            return next();
          }
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
      '/web-api': {
        target: 'http://127.0.0.1:18090',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (forwarded, request) => {
            // Vite 仅将来自当前开发页面的 Origin 映射到 BFF；BFF 自身保持原有来源校验。
            if (request.headers.origin === `http://${request.headers.host}`)
              forwarded.setHeader('Origin', 'http://127.0.0.1:18090');
          });
        },
      },
    },
  },
  appType: 'mpa',
});
