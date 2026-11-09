import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const pageAsset = /((?:href|src)=")([^"#?:]+\.(?:css|mjs))(")/g;
const moduleImport = /((?:from|import)\s*\(?\s*['"])(\.{1,2}\/[^'"?]+\.mjs)(['"])/g;

// 交付目录中的样式与脚本地址携带内容版本：内容变化即换新地址，浏览器取到最新资源。
// 模块先改写自身依赖再取哈希，依赖变化逐级传导到页面入口。
export async function versionAssets(directory, pages) {
  const versions = new Map();
  const visiting = new Set();

  async function version(file) {
    if (versions.has(file)) return versions.get(file);
    if (visiting.has(file)) throw new Error(`模块循环引用：${path.relative(directory, file)}`);
    visiting.add(file);
    let content = await readFile(file, 'utf8');
    if (file.endsWith('.mjs')) {
      content = await replaceAsync(content, moduleImport, async (prefix, ref, suffix) =>
        `${prefix}${ref}?v=${await version(path.resolve(path.dirname(file), ref))}${suffix}`);
      await writeFile(file, content);
    }
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 10);
    visiting.delete(file);
    versions.set(file, hash);
    return hash;
  }

  for (const page of pages) {
    const file = path.join(directory, page);
    const html = await readFile(file, 'utf8');
    await writeFile(file, await replaceAsync(html, pageAsset, async (prefix, ref, suffix) =>
      `${prefix}${ref}?v=${await version(path.join(directory, ref))}${suffix}`));
  }
  return versions;
}

async function replaceAsync(text, pattern, replacer) {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    parts.push(text.slice(last, match.index), await replacer(...match.slice(1)));
    last = match.index + match[0].length;
  }
  return parts.join('') + text.slice(last);
}
