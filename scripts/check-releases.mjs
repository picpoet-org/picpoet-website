import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { deployment, validatePublishedManifest } from './deployment-config.mjs';
import { loadPublishedManifest } from './check-live-release.mjs';

const live = process.argv[2] === '--live';
const file = (live ? process.argv[3] : process.argv[2]) ?? fileURLToPath(new URL('../releases/stable.json', import.meta.url));
try {
  const manifest = validatePublishedManifest(JSON.parse(await readFile(file, 'utf8')));
  if (live) {
    assert.deepEqual(await loadPublishedManifest(deployment.manifestUrl), manifest,
      '线上升级清单须与本次发布清单一致。');
    console.log('匿名升级请求通过：无 Cookie、无重定向，线上清单与本地一致。');
  }
  const count = manifest.platforms.reduce((total, platform) => total + platform.artifacts.length, 0);
  console.log(`发布清单校验通过：${manifest.platforms.length} 个平台，${count} 个安装包。`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
