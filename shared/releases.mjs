import deployment from '../deployment.json' with { type: 'json' };

// 网站与发布脚本共享清单校验；公开安装包使用最终 HTTPS CDN 地址。
export const platformNames = { android: 'Android', ios: 'iOS', ohos: 'HarmonyOS', linux: 'Linux', macos: 'macOS', windows: 'Windows' };
export const platformIds = Object.keys(platformNames);
export const manifestUrls = [deployment.manifestUrl, deployment.fallbackManifestUrl];
const formats = {
  android: ['apk'], ios: ['ipa'], ohos: ['hap', 'app'], linux: ['tar.gz', 'AppImage', 'deb', 'rpm', 'zip'],
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
    platformIds.every((id) => ids.includes(id)), '完整提供六个平台且每个平台唯一');
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
      if (url.origin !== base.origin || !url.pathname.startsWith(expectedPrefix) || !url.pathname.slice(expectedPrefix.length) || url.search || url.hash) {
        throw new Error(`安装包应使用 ${base.origin}${expectedPrefix} 下的稳定公开地址。`);
      }
    }
  }
  return manifest;
}

export async function loadManifest(url, { fetchImpl = fetch, signal } = {}) {
  const response = await fetchImpl(url, { cache: 'no-store', credentials: 'omit', signal, redirect: 'error', headers: { Accept: 'application/json' } });
  if (response.status !== 200 || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
    await response.body?.cancel();
    throw new Error(`公开升级清单须直接返回 200 JSON，实际 HTTP ${response.status}。`);
  }
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
  return validatePublishedManifest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
}
// 总预算 12 秒；主域名最多占一半，超时或契约无效后仍有机会从备用域名读取。
export async function loadDownloadPlatforms({ fetchImpl = fetch, signal, timeoutMs = 12000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (const [index, url] of manifestUrls.entries()) {
    signal?.throwIfAborted();
    const attempt = new AbortController();
    const abort = () => attempt.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, index === 0 ? timeoutMs / 2 : Math.max(0, deadline - Date.now()));
    try {
      const { platforms } = await loadManifest(url, { fetchImpl, signal: attempt.signal });
      const origin = new URL(url).origin;
      const alternate = new URL(manifestUrls[1 - index]).origin;
      return platforms.map((platform) => ({ ...platform, artifacts: platform.artifacts.map((artifact) => {
        const { pathname } = new URL(artifact.url);
        return { ...artifact, url: origin + pathname, alternateUrl: alternate + pathname };
      }) }));
    } catch (error) {
      if (signal?.aborted || index === manifestUrls.length - 1) throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
}
export function detectPlatform(userAgent) {
  if (/HarmonyOS|OpenHarmony|OHOS/i.test(userAgent)) return 'ohos';
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  if (/Windows/i.test(userAgent)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'macos';
  if (/Linux/i.test(userAgent)) return 'linux';
  return null;
}
export function formatSize(bytes) {
  return `${(bytes / 1024 / 1024).toLocaleString('zh-CN', { maximumFractionDigits: 1 })} MiB`;
}

// 发布事实以实时清单为准；翻译仅对应内容仍一致的文案源。
export function releaseCopy(platform, source, translation) {
  const matchesSource = platform && platform.minimumSystem === source?.system &&
    JSON.stringify(platform.notes) === JSON.stringify(source?.notes);
  if (matchesSource && text(translation?.system) && Array.isArray(translation?.notes) &&
      translation.notes.length === platform.notes.length && translation.notes.every(text)) {
    return { system: translation.system, notes: translation.notes };
  }
  return { system: platform?.minimumSystem ?? '', notes: platform?.notes ?? [] };
}
