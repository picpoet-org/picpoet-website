import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { safeReturnTo, loginDestination } from '../shared/user-navigation.mjs';

test('登录返回仅允许已知站内用户页面及受限锚点', () => {
  for (const value of ['create.html', 'works.html', 'account.html', 'account.html#purchase']) assert.equal(safeReturnTo(value), value);
  for (const value of [null, '', '//evil.test', 'https://evil.test', '../account.html', 'javascript:alert(1)', 'works.html?x=1', 'account.html#purchase#x', 'account.html#evil', 'works.html\\evil']) assert.equal(safeReturnTo(value), 'create.html');
  assert.equal(loginDestination('account.html', '#purchase'), 'login.html?returnTo=account.html%23purchase');
});

test('用户页面分工明确，创作页不包含登录表单订单或历史列表', async () => {
  const page = name => readFile(new URL(`../public/${name}.html`, import.meta.url), 'utf8');
  const create = await page('create');
  assert.match(create, /id="create-form"/);
  for (const id of ['auth-form', 'orders', 'plans', 'history-list']) assert.ok(!create.includes(`id="${id}"`));
  assert.match(await page('login'), /id="auth-form"/);
  assert.match(await page('works'), /id="history-list"/);
  assert.match(await page('account'), /id="orders"/);
});
