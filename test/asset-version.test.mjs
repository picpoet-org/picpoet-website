import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { versionAssets } from '../scripts/asset-version.mjs';

const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 10);

test('页面样式与模块地址携带内容版本，依赖变化传导到页面入口', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'picpoet-assets-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'shared/vendor'), { recursive: true });
  await writeFile(path.join(dir, 'styles.css'), 'nav { gap: 26px; }');
  await writeFile(path.join(dir, 'shared/vendor/qr.mjs'), 'export const qr = 1;');
  await writeFile(path.join(dir, 'shared/app.mjs'), "import { qr } from './vendor/qr.mjs';\nexport default qr;");
  await writeFile(path.join(dir, 'index.html'), '<link rel="stylesheet" href="styles.css" /><a href="docs.html#a">说明</a><script type="module" src="shared/app.mjs"></script>');

  await versionAssets(dir, ['index.html']);

  const app = await readFile(path.join(dir, 'shared/app.mjs'), 'utf8');
  assert.equal(app, `import { qr } from './vendor/qr.mjs?v=${hash('export const qr = 1;')}';\nexport default qr;`);
  const html = await readFile(path.join(dir, 'index.html'), 'utf8');
  assert.equal(html, `<link rel="stylesheet" href="styles.css?v=${hash('nav { gap: 26px; }')}" /><a href="docs.html#a">说明</a><script type="module" src="shared/app.mjs?v=${hash(app)}"></script>`);
});
