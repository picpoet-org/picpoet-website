import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { locales } from '../src/i18n/context.mjs';

function entries(value, prefix = '') {
  if (typeof value === 'string') return [[prefix, value]];
  return Object.entries(value).flatMap(([key, item]) => entries(item, prefix ? `${prefix}.${key}` : key));
}
const placeholders = (value) => [...value.matchAll(/\{\w+\}/g)].map((match) => match[0]).sort();
function structure(value) {
  if (typeof value === 'string') return 'string';
  if (Array.isArray(value)) return value.map(structure);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, structure(value[key])]),
    );
  return typeof value;
}
export async function availableLocales() {
  const root = new URL('../src/locales/', import.meta.url);
  const source = (await readdir(new URL('zh-cn/', root))).filter((file) => file.endsWith('.json')).sort();
  const available = [];
  for (const locale of locales) {
    const files = await readdir(new URL(`${locale.id}/`, root)).catch(() => []);
    if (JSON.stringify(files.filter((file) => file.endsWith('.json')).sort()) === JSON.stringify(source))
      available.push(locale.id);
  }
  return available;
}
export async function checkLocales(ids = locales.map((item) => item.id)) {
  const root = new URL('../src/locales/', import.meta.url);
  const files = (await readdir(new URL('zh-cn/', root))).filter((file) => file.endsWith('.json'));
  for (const file of files) {
    const sourceDocument = JSON.parse(await readFile(new URL(`zh-cn/${file}`, root), 'utf8'));
    const source = entries(sourceDocument);
    for (const locale of ids) {
      let document;
      try {
        document = JSON.parse(await readFile(new URL(`${locale}/${file}`, root), 'utf8'));
      } catch (cause) {
        throw new Error(
          `${locale}/${file} 尚未由 project-translator-cli 完整生成；请更新本机翻译认证后执行 npm run translate。`,
          { cause },
        );
      }
      const target = entries(document);
      if (JSON.stringify(structure(sourceDocument)) !== JSON.stringify(structure(document)))
        throw new Error(`${locale}/${file}：保留源文件的对象键、数组长度与字符串结构。`);
      if (
        JSON.stringify(source.map(([key]) => key).sort()) !==
        JSON.stringify(target.map(([key]) => key).sort())
      )
        throw new Error(`${locale}/${file}：文案键与源文件保持一致`);
      const values = new Map(target);
      for (const [key, value] of source) {
        const translated = values.get(key);
        if (
          !translated.trim() ||
          JSON.stringify(placeholders(value)) !== JSON.stringify(placeholders(translated))
        )
          throw new Error(`${locale}/${file}/${key}：提供完整译文并保留占位符`);
        if (locale !== 'zh-cn' && translated.includes('图赋'))
          throw new Error(`${locale}/${file}/${key}：非简体中文使用 {brand} 品牌占位符`);
      }
    }
  }
  return { languages: ids.length, files: files.length };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(await checkLocales());
