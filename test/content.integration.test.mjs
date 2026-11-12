import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pages = ['index.html', 'docs.html', 'pricing.html', 'downloads.html', 'create.html', 'works.html', 'account.html', 'login.html'];
const readPage = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('官网导航统一通向使用说明、定价和下载，页内链接均有对应内容', async () => {
  const contents = new Map(await Promise.all(pages.map(async (name) => [name, await readPage(name)])));
  for (const [name, html] of contents) {
    const nav = html.match(/<nav aria-label="主导航">([\s\S]*?)<\/nav>/)[1];
    assert.deepEqual([...nav.matchAll(/href="([^"]+)"/g)].map((match) => match[1]), ['index.html', 'create.html', 'works.html', 'account.html']);
    for (const [, href] of html.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
      const [target, anchor] = href.split('#');
      const targetPage = target || name;
      assert.ok(contents.has(targetPage), `${name} 的 ${href} 通向官网内容`);
      if (anchor) assert.ok(contents.get(targetPage).includes(`id="${anchor}"`), `${href} 有对应章节`);
    }
  }
});

test('首页以诗意叙事引导下载，并保留费用、隐私与真实使用说明', async () => {
  const home = await readPage('index.html');
  const docs = await readPage('docs.html');
  const pricing = await readPage('pricing.html');
  assert.match(home, /有些瞬间，<br\s*\/><span>值得再读一遍。/);
  assert.match(home, /让 Picpoet 为照片写下诗句/);
  assert.match(home, /class="landscape-boat"/);
  assert.doesNotMatch(home, /非实际生成作品|诗意示例/);
  assert.match(home, /href="docs.html#privacy">隐私与数据/);
  assert.match(home, /href="pricing.html">费用说明/);
  assert.match(docs, /网站在线创作/);
  assert.match(docs, /客户端 App/);
  assert.match(docs, /API key/);
  assert.match(docs, /所选照片及生成所需内容会发送至你配置的模型服务/);
  assert.match(docs, /分享图都不包含原照片/);
  assert.match(pricing, /免费软件不包含云端模型额度/);
});
