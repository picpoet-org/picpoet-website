import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { deployment, validatePublishedManifest } from './deployment-config.mjs';
import { loadPublishedManifest } from './check-live-release.mjs';

const live = process.argv[2] === '--live';
const file = live ? process.argv[3] : process.argv[2] ?? fileURLToPath(new URL('../releases/stable.json', import.meta.url));
try {
  const manifest = file ? validatePublishedManifest(JSON.parse(await readFile(file, 'utf8')))
    : await loadPublishedManifest(deployment.releaseFeedUrl);
  if (live) {
    const compatibility = new URL('/pages/releases/stable.json', deployment.websiteUrl);
    for (const url of [deployment.manifestUrl, compatibility]) {
      assert.deepEqual(await loadPublishedManifest(url), manifest, `线上清单 ${url} 须与发布源一致。`);
    }
    console.log('标准与兼容入口的匿名升级请求通过：无 Cookie、无重定向，清单与发布源一致。');
  }
  const count = manifest.platforms.reduce((total, platform) => total + platform.artifacts.length, 0);
  console.log(`发布清单校验通过：${manifest.platforms.length} 个平台，${count} 个安装包。`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
