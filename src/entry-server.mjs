import { renderToString } from '@vue/server-renderer';
import { createSite } from './app.mjs';
export async function render(options) {
  const { app, context } = await createSite(options);
  return {
    html: await renderToString(app),
    title: context.t(`meta.${options.page}.title`),
    description: context.t(`meta.${options.page}.description`),
    noscript: context.t('common.enableJS'),
  };
}
