import deployment from '../deployment.json' with { type: 'json' };
import { publicHttpsUrl } from '../shared/releases.mjs';
export { deployment };
export { validatePublishedManifest, androidVersionCode } from '../shared/releases.mjs';
for (const field of ['websiteUrl', 'compatibilityWebsiteUrl', 'dashboardWebUrl', 'manifestUrl', 'downloadBaseUrl', 'fallbackManifestUrl']) {
  const value = deployment[field];
  if (!publicHttpsUrl(value) || new URL(value).search || new URL(value).hash) {
    throw new Error(`部署配置 ${field} 使用无凭据、查询参数或片段的 HTTPS 地址。`);
  }
}
if (deployment.manifestUrl !== `${deployment.downloadBaseUrl}/stable.json` ||
    new URL(deployment.fallbackManifestUrl).pathname !== new URL(deployment.manifestUrl).pathname ||
    new URL(deployment.fallbackManifestUrl).origin === new URL(deployment.manifestUrl).origin) {
  throw new Error('主备清单须位于不同域名下的同一发布对象路径。');
}
