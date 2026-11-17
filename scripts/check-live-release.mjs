import { validatePublishedManifest } from './deployment-config.mjs';

// 与 Android 一致：不依赖浏览器 Cookie，不跟随挑战跳转，整次请求限时并限制解压后大小。
export async function loadPublishedManifest(url) {
  const response = await fetch(url, {
    redirect: 'manual',
    credentials: 'omit',
    headers: { Accept: 'application/json', 'User-Agent': 'Dart/3.11 (dart:io)' },
    signal: AbortSignal.timeout(12_000),
  });
  if (response.status !== 200 || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
    await response.body?.cancel();
    throw new Error(`公开升级清单须直接返回 200 JSON，实际 HTTP ${response.status}。`);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 512 * 1024) throw new Error('公开升级清单超过 512 KiB。');
    chunks.push(chunk);
  }
  return validatePublishedManifest(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}
