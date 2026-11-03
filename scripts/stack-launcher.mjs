import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const officialDev = fileURLToPath(new URL('../../picpoet/official-dev.sh', import.meta.url));

// 两个入口固定选择模式；共享路径解析与子进程执行，不透传 CLI 参数。
export function startStack({ gui }, { args = process.argv.slice(2), spawn = spawnSync } = {}) {
  if (args.length) {
    console.error('请直接使用 npm run dev:stack 或 npm run dev:stack:gui，无需附加参数。');
    return 1;
  }
  const result = spawn('bash', [officialDev, 'start', ...(gui ? [] : ['--no-gui'])], {
    cwd: path.dirname(officialDev),
    stdio: 'inherit',
    env: process.env,
  });
  return result.status ?? 1;
}