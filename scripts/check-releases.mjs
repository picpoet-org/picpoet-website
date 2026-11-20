import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { deployment, validatePublishedManifest } from './deployment-config.mjs';
import { manifestUrls } from '../shared/releases.mjs';
import { loadPublishedManifest } from './check-live-release.mjs';

const live = process.argv[2] === '--live';
const file = process.argv[live ? 3 : 2] ?? (live ? null : fileURLToPath(new URL('../test/fixtures/release-snapshot.json', import.meta.url)));
try {
  let manifest = file ? validatePublishedManifest(JSON.parse(await readFile(file, 'utf8'))) : null;
  if (live) {
    for (const origin of [deployment.websiteUrl, deployment.compatibilityWebsiteUrl]) {
      for (const url of manifestUrls) {
        const remote = await loadPublishedManifest(url, { origin });
        manifest ??= remote;
        assert.deepEqual(remote, manifest, `主备下载域名须提供同一发布清单：${url}`);
      }
    }
    console.log('主备 R2 清单一致：无 Cookie、无重定向，官网与历史父域均可跨域读取。');
  }
  const count = manifest.platforms.reduce((total, platform) => total + platform.artifacts.length, 0);
  console.log(`发布清单校验通过：${manifest.platforms.length} 个平台，${count} 个安装包。`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
