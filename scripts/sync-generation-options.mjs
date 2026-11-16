// 从原生契约同步选项；构建使用已提交快照，不依赖相邻仓库。
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const rust = new URL('../../picpoet-rust/', import.meta.url);
const schema = JSON.parse(await readFile(new URL('picpoet.schema.json', rust), 'utf8'));
const root = schema.properties;
const generation = root.generation.properties;
const app = new URL('../../picpoet-app/', import.meta.url);
const packages = new URL('.dart_tool/package_config.json', app);
const packageConfig = JSON.parse(await readFile(packages, 'utf8'));
const flutter = packageConfig.packages.find((item) => item.name === 'flutter');
const dart = fileURLToPath(
  new URL('../../bin/cache/dart-sdk/bin/dart', new URL(flutter.rootUri + '/', packages)),
);
const options = {
  languages: root.language.enum,
  poemLanguages: root.poemLanguage.enum,
  forms: generation.poem.enum.filter(Boolean),
  meters: generation.poemMeter.enum,
  rhymes: generation.rhymeStandard.enum,
  defaults: Object.fromEntries(
    ['poemLanguage', 'poem', 'poemMeter', 'ci', 'rhymeStandard', 'suggest'].map((key) => [
      key,
      generation[key].default ?? root[key]?.default,
    ]),
  ),
  ci: JSON.parse(
    execFileSync(
      dart,
      [
        `--packages=${fileURLToPath(packages)}`,
        fileURLToPath(new URL('./export-ci-names.dart', import.meta.url)),
        fileURLToPath(new URL('crates/picpoet-model/src/ci_options.rs', rust)),
      ],
      { cwd: fileURLToPath(new URL('../../picpoet-app/', import.meta.url)), encoding: 'utf8' },
    ),
  ),
};
await writeFile(
  new URL('../shared/generation-options.json', import.meta.url),
  JSON.stringify(options, null, 2) + '\n',
);
console.log(`已同步生成选项及 ${options.ci.length} 个词牌`);
