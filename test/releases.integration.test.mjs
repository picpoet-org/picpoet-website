import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { detectPlatform, formatSize, loadManifest, validateManifest } from '../shared/releases.mjs';
import { androidVersionCode, deployment, validatePublishedManifest } from '../scripts/deployment-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const base = JSON.parse(await readFile(new URL('../releases/stable.json', import.meta.url), 'utf8'));
function publishedManifest() {
  const manifest = structuredClone(base);
  for (const platform of manifest.platforms) {
    const format = { android: 'apk', ohos: 'hap', linux: 'tar.gz', macos: 'dmg', windows: 'zip' }[platform.id];
    platform.versionName = '0.1.0';
    platform.versionCode = androidVersionCode(platform.versionName);
    platform.publishedAt = '2026-10-24T00:00:00Z';
    platform.notes = ['照片创作体验更新', '本机历史与分享'];
    platform.artifacts = [{ arch: platform.id === 'android' ? 'arm64-v8a' : 'arm64', format,
      url: `${deployment.downloadBaseUrl}/${platform.id}/0.1.0/picpoet.${format}`,
      sha256: 'a'.repeat(64), sizeBytes: 10485760 }];
  }
  return manifest;
}

test('发布清单经 HTTP 读取后提供五个平台的版本和直链', async (t) => {
  const manifest = publishedManifest();
  assert.equal(validatePublishedManifest(manifest), manifest);
  assert.equal(manifest.platforms.find((platform) => platform.id === 'android').versionCode, 1000);
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
  const unpublished = structuredClone(base);
  for (const platform of unpublished.platforms) {
    Object.assign(platform, { versionName: null, versionCode: null, publishedAt: null, notes: [], artifacts: [] });
  }
  assert.equal(validateManifest(unpublished), unpublished);
  assert.ok(unpublished.platforms.every((platform) => platform.artifacts.length === 0));
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
  for (const resource of ['index.html', 'docs.html', 'downloads.html', 'pricing.html', 'create.html', 'works.html', 'account.html', 'login.html', 'styles.css',
    'shared/downloads.mjs', 'shared/releases.mjs', 'releases/stable.json',
    'shared/user-navigation.mjs', 'shared/history.mjs', 'shared/create.css', 'shared/create.mjs', 'shared/create-core.mjs', 'shared/poem-card.mjs', 'assets/fonts/OFL.txt']) {
    let source = await readFile(new URL(`../${resource}`, import.meta.url), 'utf8');
    if (resource.endsWith('.html')) {
      const canonical = `${deployment.websiteUrl}/${resource === 'index.html' ? '' : resource}`;
      source = source.replace('  </head>', `    <link rel="canonical" href="${canonical}" />\n  </head>`);
    }
    for (const prefix of ['public/', 'public/pages/']) {
      // 交付内容与源文件一致；样式与模块地址额外携带 10 位内容版本。
      const published = await readFile(new URL(`../${prefix}${resource}`, import.meta.url), 'utf8');
      assert.equal(published.replace(/(\.(?:css|mjs))\?v=[0-9a-f]{10}/g, '$1'), source);
    }
  }
  const html = await readFile(new URL('../public/downloads.html', import.meta.url), 'utf8');
  for (const platform of base.platforms) assert.ok(html.includes(`data-platform="${platform.id}"`));
  assert.match(html, /id="download-status"/);
  assert.match(html, /shared\/downloads\.mjs/);
  assert.equal((html.match(/rel="canonical"/g) ?? []).length, 1);
  const robots = await readFile(new URL('../public/robots.txt', import.meta.url), 'utf8');
  assert.ok(robots.includes(`Sitemap: ${deployment.websiteUrl}/sitemap.xml`));
  const sitemap = await readFile(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  for (const page of ['', 'downloads.html', 'docs.html', 'pricing.html', 'create.html']) {
    assert.ok(sitemap.includes(`<loc>${deployment.websiteUrl}/${page}</loc>`));
  }
  const font = await readFile(new URL('../assets/fonts/LXGWWenKai-Regular.ttf', import.meta.url));
  for (const prefix of ['public/', 'public/pages/']) {
    assert.deepEqual(await readFile(new URL(`../${prefix}assets/fonts/LXGWWenKai-Regular.ttf`, import.meta.url)), font);
  }
});
