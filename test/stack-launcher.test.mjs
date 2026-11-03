import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startStack } from '../scripts/stack-launcher.mjs';

test('两个 npm 命令使用独立入口并固定 GUI 模式', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  for (const [name, gui, script] of [
    ['dev:stack', false, 'dev-stack.mjs'],
    ['dev:stack:gui', true, 'dev-stack-gui.mjs'],
  ]) {
    assert.equal(pkg.scripts[name], `node scripts/${script}`);
    const source = await readFile(new URL(`../scripts/${script}`, import.meta.url), 'utf8');
    assert.ok(source.includes(`startStack({ gui: ${gui} })`));
    let called = false;
    assert.equal(startStack({ gui }, { args: [], spawn(command, args, options) {
      called = true;
      assert.equal(command, 'bash');
      assert.ok(args[0].endsWith('/picpoet/official-dev.sh'));
      assert.deepEqual(args.slice(1), gui ? ['start'] : ['start', '--no-gui']);
      assert.equal(options.stdio, 'inherit');
      return { status: 7 };
    } }), 7);
    assert.equal(called, true);
  }
});

test('旧切换参数不启动服务，启动失败返回非零', () => {
  assert.equal(startStack({ gui: false }, { args: ['--gui'], spawn() {
    assert.fail('附加参数应在启动前拒绝');
  } }), 1);
  assert.equal(startStack({ gui: true }, { args: [], spawn: () => ({ status: null }) }), 1);
});