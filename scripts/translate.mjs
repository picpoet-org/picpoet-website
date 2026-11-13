// 所有目标译文由用户自研 CLI 生成；本脚本只校验、调用和核对结果。
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkLocales } from './check-locales.mjs';
const cwd = fileURLToPath(new URL('../', import.meta.url));
const common = ['--workspace', '.', '--config', 'project.translation.json'];
async function run(args) {
  const child = spawn('project-translator-cli', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let diagnostics = '';
  const heartbeat = setInterval(() => console.log('翻译 CLI 仍在运行，等待生成结果…'), 30_000);
  // 日志仅在内存核对；保持密钥与上游响应原文留在 CLI 私有配置中。
  const capture = (chunk) => {
    const text = chunk.toString();
    if (args[0] === 'translate') {
      if (text.includes('Sending translation request')) console.log('正在请求模型生成译文…');
      if (text.includes('File translation completed')) console.log('一个翻译文件已完成。');
      if (text.includes('Completed segment')) console.log('一个翻译分段已完成。');
    }
    output = (output + chunk.toString()).slice(-4 * 1024 * 1024);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    diagnostics = (diagnostics + text).slice(-1024 * 1024);
    if (args[0] === 'translate' && /Failed to translate|Translation failed/.test(text)) {
      const category = /401|Invalid API key/i.test(text)
        ? '认证失败'
        : /429|rate.limit|quota/i.test(text)
          ? '限流或额度不足'
          : /timeout|timed out/i.test(text)
            ? '请求超时'
            : '模型输出或服务异常';
      console.log(`翻译请求未完成：${category}。`);
    }
  });
  let code;
  try {
    code = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });
  } finally {
    clearInterval(heartbeat);
  }
  if (code !== 0) throw new Error(`翻译 CLI 未完成（退出码 ${code}），请在本机核对认证与配置。`);
  return args[0] === 'config' ? output : output + '\n' + diagnostics;
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
// 仅在内存解析有效凭据，认证响应正文保持私密。
const config = JSON.parse(await run(['config', 'list', ...common, '--effective', '--json']));
const vendor = config.vendors.find((item) => item.name === config.currentVendor);
if (!vendor) throw new Error('有效配置中缺少当前翻译服务。');
const apiKey = vendor.apiKey || process.env[vendor.apiKeyEnvVarName];
if (!apiKey) throw new Error('请在翻译工具全局配置或对应环境变量中配置客户端密钥。');
let response;
try {
  response = await fetch(vendor.apiEndpoint.replace(/\/$/, '') + '/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
} catch {
  throw new Error('翻译服务连接失败或超时，请检查有效配置中的服务地址。');
}
if (!response.ok) {
  await response.body?.cancel();
  throw new Error(
    [401, 403].includes(response.status)
      ? `翻译服务认证失败（HTTP ${response.status}），请更新翻译工具全局配置中的客户端密钥。`
      : `翻译服务预检失败（HTTP ${response.status}），请检查模型代理服务。`,
  );
}
const models = await response.json();
if (!Array.isArray(models.data) || !models.data.some((item) => item.id === vendor.model))
  throw new Error('当前翻译模型未出现在服务的模型列表中，请核对有效配置的模型名称。');
console.log('项目配置、服务认证与模型列表预检通过。');
if (process.argv.includes('--check')) process.exit(0);
console.log('正在翻译五种目标语言…');
const output = await run(['translate', 'project', ...common, '--json']);
const failed = [...output.matchAll(/"failedFiles"\s*:\s*(\d+)/g)].at(-1)?.[1];
if (
  failed === undefined ||
  Number(failed) > 0 ||
  /"cancelled"\s*:\s*true|"fatalError"\s*:\s*"/.test(output)
) {
  const category = /401|Invalid API key/i.test(output)
    ? '认证失败'
    : /429|rate.limit|quota/i.test(output)
      ? '限流或额度不足'
      : /timeout|timed out/i.test(output)
        ? '请求超时'
        : '服务或译文输出异常';
  throw new Error(
    `目标翻译尚未完成（${category}）（失败文件数：${failed ?? '未知'}）。请在本机修复 CLI 认证或服务后重试；不使用手工译文补位。`,
  );
}
console.log('翻译产物校验通过：', await checkLocales());
