import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { detectPlatform, formatSize, loadManifest, validateManifest } from '../shared/releases.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const base = JSON.parse(await readFile(new URL('../releases/stable.json', import.meta.url), 'utf8'));
function publishedManifest() {
  const manifest = structuredClone(base);
  for (const platform of manifest.platforms) {
    const format = { android: 'apk', ohos: 'hap', linux: 'tar.gz', macos: 'dmg', windows: 'zip' }[platform.id];
    platform.versionName = '0.3.0';
    platform.versionCode = 2;
    platform.publishedAt = '2026-10-24T00:00:00Z';
    platform.notes = ['照片创作体验更新', '本机历史与分享'];
    platform.artifacts = [{ arch: platform.id === 'android' ? 'arm64-v8a' : 'arm64', format,
      url: `https://cdn.example.com/picpoet/${platform.id}/0.3.0/picpoet.${format}`,
      sha256: 'a'.repeat(64), sizeBytes: 10485760 }];
  }
  return manifest;
}

test('发布清单经 HTTP 读取后提供五个平台的版本和直链', async (t) => {
  const manifest = publishedManifest();
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(manifest));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const result = await loadManifest(`http://127.0.0.1:${server.address().port}/stable.json`);
  assert.deepEqual(result, manifest);
  for (const platform of result.platforms) {
    assert.equal(new URL(platform.artifacts[0].url).protocol, 'https:');
    assert.equal(formatSize(platform.artifacts[0].sizeBytes), '10 MiB');
  }
});

test('空发布清单支持如实呈现五个平台的待发布状态', () => {
  assert.equal(validateManifest(base), base);
  assert.ok(base.platforms.every((platform) => platform.artifacts.length === 0));
});

test('设备识别为下载页推荐对应平台，同时保留完整平台列表', () => {
  const devices = [
    ['Mozilla Android 14', 'android'], ['Mozilla OpenHarmony Linux', 'ohos'],
    ['Mozilla Windows NT 10.0', 'windows'], ['Mozilla Macintosh', 'macos'],
    ['Mozilla X11 Linux x86_64', 'linux'], ['Mozilla iPhone Mac OS X', null],
  ];
  for (const [agent, platform] of devices) assert.equal(detectPlatform(agent), platform);
  assert.equal(base.platforms.length, 5);
});

test('部署同步后根目录和 pages 子路径包含相同清单、页面与下载模块', async () => {
  execFileSync(process.execPath, ['scripts/sync-public.mjs'], { cwd: root });
  for (const resource of ['index.html', 'docs.html', 'downloads.html', 'pricing.html', 'styles.css',
    'shared/downloads.mjs', 'shared/releases.mjs', 'releases/stable.json']) {
    const source = await readFile(new URL(`../${resource}`, import.meta.url), 'utf8');
    for (const prefix of ['public/', 'public/pages/']) {
      assert.equal(await readFile(new URL(`../${prefix}${resource}`, import.meta.url), 'utf8'), source);
    }
  }
  const html = await readFile(new URL('../public/downloads.html', import.meta.url), 'utf8');
  for (const platform of base.platforms) assert.ok(html.includes(`data-platform="${platform.id}"`));
  assert.match(html, /id="download-status"/);
  assert.match(html, /shared\/downloads\.mjs/);
});
