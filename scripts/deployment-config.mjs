import { readFile } from 'node:fs/promises';
import { validateManifest, publicHttpsUrl } from '../shared/releases.mjs';

export const deployment = JSON.parse(await readFile(new URL('../deployment.json', import.meta.url), 'utf8'));
for (const field of ['websiteUrl', 'manifestUrl', 'downloadBaseUrl']) {
  const value = deployment[field];
  if (!publicHttpsUrl(value) || new URL(value).search || new URL(value).hash) {
    throw new Error(`部署配置 ${field} 使用无凭据、查询参数或片段的 HTTPS 地址。`);
  }
}
if (deployment.manifestUrl !== `${deployment.websiteUrl}/releases/stable.json`) {
  throw new Error('升级清单位于官网 /releases/stable.json。');
}

// 发布契约校验：与客户端从唯一语义版本推导的 Android 系统字段保持一致。
export function androidVersionCode(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error('版本使用主.次.修订格式。');
  }
  const [major, minor, patch] = version.split('.').map(Number);
  const code = major * 1000000 + minor * 1000 + patch;
  if (minor >= 1000 || patch >= 1000 || !Number.isSafeInteger(code) || code <= 0 || code > 2100000000) {
    throw new Error('版本须符合 Android 整数映射范围。');
  }
  return code;
}

export function validatePublishedManifest(manifest) {
  validateManifest(manifest);
  const base = new URL(`${deployment.downloadBaseUrl}/`);
  for (const platform of manifest.platforms) {
    if (platform.id === 'android' && platform.artifacts.length &&
        platform.versionCode !== androidVersionCode(platform.versionName)) {
      throw new Error('Android 系统版本码须由展示版本自动推导。');
    }
    for (const artifact of platform.artifacts) {
      const url = new URL(artifact.url);
      const expectedPrefix = `${base.pathname}${platform.id}/${platform.versionName}/`;
      if (url.origin !== base.origin || !url.pathname.startsWith(expectedPrefix) || url.search || url.hash) {
        throw new Error(`安装包应使用 ${base.origin}${expectedPrefix} 下的稳定公开地址。`);
      }
    }
  }
  return manifest;
}
