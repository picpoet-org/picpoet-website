import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDirectory = path.join(root, 'public');
const pagesDirectory = path.join(publicDirectory, 'pages');
const publicFiles = (await readdir(root)).filter((entry) => entry.endsWith('.html') || ['styles.css', 'assets', 'shared', 'releases'].includes(entry));

for (const entry of publicFiles) {
  const source = path.join(root, entry);
  const target = path.join(publicDirectory, entry);
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
}

await mkdir(pagesDirectory, { recursive: true });
for (const entry of publicFiles) {
  const source = path.join(publicDirectory, entry);
  const target = path.join(pagesDirectory, entry);
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
}