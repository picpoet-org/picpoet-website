import { detectPlatform, formatSize, loadManifest } from './releases.mjs';

const manifestUrl = new URL('../releases/stable.json', import.meta.url);
const status = document.querySelector('#download-status');
const refresh = document.querySelector('#refresh-downloads');
const recommended = detectPlatform(navigator.userAgent);
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function render(platform) {
  const card = document.querySelector(`[data-platform="${platform.id}"]`);
  const content = card.querySelector('[data-release-content]');
  content.replaceChildren();
  if (!platform.artifacts.length) {
    content.append(node('p', '暂未发布', 'release-unavailable'), node('p', '安装包就绪后将在此提供下载。可先阅读使用说明，了解创作流程。'));
    return;
  }
  content.append(node('p', `版本 ${platform.versionName}`, 'release-version'),
    node('p', `发布于 ${new Date(platform.publishedAt).toISOString().slice(0, 10)} · ${platform.minimumSystem}`, 'release-date'));
  if (platform.notes.length) {
    const notes = node('ul', undefined, 'release-notes');
    for (const note of platform.notes) notes.append(node('li', note));
    content.append(notes);
  }
  const artifacts = node('div', undefined, 'artifact-list');
  for (const artifact of platform.artifacts) {
    const wrapper = node('div', undefined, 'artifact');
    const link = node('a', `下载 ${platform.name} · ${artifact.arch}`, 'button primary');
    link.href = artifact.url;
    link.setAttribute('aria-label', `下载 ${platform.name} ${platform.versionName} ${artifact.arch} ${artifact.format} 安装包`);
    const checksum = node('details');
    checksum.append(node('summary', '查看 SHA-256 校验值'), node('code', artifact.sha256, 'checksum'));
    wrapper.append(link, node('p', `${artifact.format} · ${formatSize(artifact.sizeBytes)} · 外部 CDN 下载`, 'artifact-meta'), checksum);
    artifacts.append(wrapper);
  }
  content.append(artifacts);
}
if (recommended) {
  const card = document.querySelector(`[data-platform="${recommended}"]`);
  card.classList.add('is-recommended');
  card.prepend(node('p', '可能适合当前设备 · 请核对系统与架构', 'platform-recommendation'));
}
async function refreshReleases() {
  refresh.disabled = true;
  status.textContent = '正在读取发布信息…';
  try {
    const manifest = await loadManifest(manifestUrl, { signal: AbortSignal.timeout(12000) });
    manifest.platforms.forEach(render);
    const published = manifest.platforms.filter((platform) => platform.artifacts.length).length;
    status.textContent = published ? `${published} 个平台已有安装包。请选择与你的系统及架构匹配的版本。` : '目前暂无公开安装包。各平台发布后，这里将提供直接下载。';
  } catch {
    // 清空旧下载状态，避免把旧清单误认为刚刚校验过的发布信息。
    document.querySelectorAll('[data-release-content]').forEach((content) => {
      content.replaceChildren(node('p', '暂时无法读取发布信息，请稍后刷新。', 'release-unavailable'));
    });
    status.textContent = '发布信息加载未完成，请检查网络后重试。';
  } finally { refresh.disabled = false; }
}
refresh.addEventListener('click', refreshReleases);
await refreshReleases();
