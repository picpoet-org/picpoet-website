// 网站与发布脚本共享清单校验；公开安装包使用最终 HTTPS CDN 地址。
export const platformIds = ['android', 'ohos', 'linux', 'macos', 'windows'];
const formats = {
  android: ['apk'], ohos: ['hap', 'app'], linux: ['tar.gz', 'AppImage', 'deb', 'rpm', 'zip'],
  macos: ['dmg', 'pkg', 'zip'], windows: ['exe', 'msi', 'zip'],
};
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const positive = (value) => Number.isSafeInteger(value) && value > 0;
function requireValue(condition, message) {
  if (!condition) throw new Error(`发布清单：${message}`);
}
export function publicHttpsUrl(value) {
  if (!text(value)) return false;
  try {
    const url = new URL(value);
    return /^https:\/\//i.test(value) && url.protocol === 'https:' && !!url.hostname &&
      !url.username && !url.password && !value.split('/')[2].includes('@');
  } catch { return false; }
}
export function validateManifest(manifest) {
  requireValue(manifest?.schemaVersion === 1, 'schemaVersion 应为 1');
  requireValue(Array.isArray(manifest.platforms), 'platforms 应为数组');
  const ids = manifest.platforms.map((platform) => platform?.id);
  requireValue(ids.length === platformIds.length && new Set(ids).size === ids.length &&
    platformIds.every((id) => ids.includes(id)), '完整提供五个平台且每个平台唯一');
  for (const platform of manifest.platforms) {
    const label = platform.id;
    requireValue(text(platform.name) && text(platform.minimumSystem), `${label} 提供名称与系统要求`);
    requireValue(Array.isArray(platform.notes) && platform.notes.every(text), `${label} notes 应为文字数组`);
    requireValue(Array.isArray(platform.artifacts), `${label} artifacts 应为数组`);
    if (label === 'android') {
      requireValue(platform.applicationId === 'org.picpoet.app.android', 'Android 包名应与客户端一致');
      requireValue(positive(platform.minSdk), 'Android minSdk 应为正整数');
    }
    if (!platform.artifacts.length) continue;
    requireValue(text(platform.versionName) && positive(platform.versionCode), `${label} 提供版本名称与正整数版本码`);
    requireValue(text(platform.publishedAt) && Number.isFinite(Date.parse(platform.publishedAt)), `${label} 提供 ISO 发布日期`);
    const variants = new Set();
    for (const artifact of platform.artifacts) {
      requireValue(text(artifact.arch) && formats[label].includes(artifact.format), `${label} 提供架构与受支持的包格式`);
      if (label === 'android') requireValue(['arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86'].includes(artifact.arch), 'Android 使用标准 ABI 名称');
      requireValue(publicHttpsUrl(artifact.url), `${label} 下载地址应为不含凭据的 HTTPS 绝对地址`);
      requireValue(typeof artifact.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(artifact.sha256), `${label} 提供 SHA-256`);
      requireValue(positive(artifact.sizeBytes), `${label} 提供安装包字节数`);
      const variant = `${artifact.arch}/${artifact.format}`;
      requireValue(!variants.has(variant), `${label} 每种架构与格式只提供一个安装包`);
      variants.add(variant);
    }
  }
  return manifest;
}
export async function loadManifest(url, { fetchImpl = fetch, signal } = {}) {
  const response = await fetchImpl(url, { cache: 'no-store', signal, redirect: 'error', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('发布信息暂时不可用');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512 * 1024) throw new Error('发布信息超过大小限制');
      chunks.push(value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return validateManifest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
}
export function detectPlatform(userAgent) {
  if (/OpenHarmony|HarmonyOS|OHOS/i.test(userAgent)) return 'ohos';
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return null;
  if (/Windows/i.test(userAgent)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'macos';
  if (/Linux/i.test(userAgent)) return 'linux';
  return null;
}
export function formatSize(bytes) {
  return `${(bytes / 1024 / 1024).toLocaleString('zh-CN', { maximumFractionDigits: 1 })} MiB`;
}
