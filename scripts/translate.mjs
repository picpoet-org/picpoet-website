// 所有目标译文由用户自研 CLI 生成；本脚本只校验、调用和核对结果。
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkLocales } from './check-locales.mjs';
const cwd = fileURLToPath(new URL('../', import.meta.url));
const common = ['--workspace', '.', '--config', 'project.translation.json'];
async function run(args) {
  const child = spawn('project-translator-cli', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  // 日志仅在内存核对；保持密钥与上游响应原文留在 CLI 私有配置中。
  const capture = (chunk) => {
    output = (output + chunk.toString()).slice(-4 * 1024 * 1024);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  if (code !== 0) throw new Error(`翻译 CLI 未完成（退出码 ${code}），请在本机核对认证与配置。`);
  return output;
}
for (const effective of [false, true]) {
  const output = await run([
    'config',
    'validate',
    ...common,
    ...(effective ? ['--effective'] : []),
    '--json',
  ]);
  if (/"valid"\s*:\s*false/.test(output)) throw new Error('翻译配置需要通过项目及有效配置校验。');
}
console.log('项目及有效配置已校验，正在通过 project-translator-cli 翻译五种目标语言…');
const output = await run(['translate', 'project', ...common, '--json']);
const failed = [...output.matchAll(/"failedFiles"\s*:\s*(\d+)/g)].at(-1)?.[1];
if (
  failed === undefined ||
  Number(failed) > 0 ||
  /"cancelled"\s*:\s*true|"fatalError"\s*:\s*"/.test(output)
) {
  throw new Error(
    `目标翻译尚未完成（失败文件数：${failed ?? '未知'}）。请在本机修复 CLI 认证或服务后重试；不使用手工译文补位。`,
  );
}
console.log('翻译产物校验通过：', await checkLocales());
