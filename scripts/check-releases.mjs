import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateManifest } from '../shared/releases.mjs';

const file = process.argv[2] ?? fileURLToPath(new URL('../releases/stable.json', import.meta.url));
try {
  const manifest = validateManifest(JSON.parse(await readFile(file, 'utf8')));
  const count = manifest.platforms.reduce((total, platform) => total + platform.artifacts.length, 0);
  console.log(`发布清单校验通过：${manifest.platforms.length} 个平台，${count} 个安装包。`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
