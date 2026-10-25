import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deployment, validatePublishedManifest } from './deployment-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDirectory = path.join(root, 'public');
const pagesDirectory = path.join(publicDirectory, 'pages');
validatePublishedManifest(JSON.parse(await readFile(path.join(root, 'releases/stable.json'), 'utf8')));
const publicFiles = (await readdir(root)).filter((entry) => entry.endsWith('.html') || ['styles.css', 'assets', 'shared', 'releases'].includes(entry));

for (const entry of publicFiles) {
  const source = path.join(root, entry);
  const target = path.join(publicDirectory, entry);
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
}

// 部署域名单一来源；预览和兼容路径仍使用相对资源，索引归一到正式官网。
const pageFiles = publicFiles.filter((entry) => entry.endsWith('.html'));
for (const page of pageFiles) {
  const canonical = `${deployment.websiteUrl}/${page === 'index.html' ? '' : page}`;
  const file = path.join(publicDirectory, page);
  const html = await readFile(file, 'utf8');
  await writeFile(file, html.replace('  </head>', `    <link rel="canonical" href="${canonical}" />\n  </head>`));
}
await writeFile(path.join(publicDirectory, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${deployment.websiteUrl}/sitemap.xml\n`);
await writeFile(path.join(publicDirectory, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pageFiles.map((page) => `  <url><loc>${deployment.websiteUrl}/${page === 'index.html' ? '' : page}</loc></url>`).join('\n')}\n</urlset>\n`);

await mkdir(pagesDirectory, { recursive: true });
for (const entry of publicFiles) {
  const source = path.join(publicDirectory, entry);
  const target = path.join(pagesDirectory, entry);
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
}