import { poemData } from './poem-card.mjs';

const adviceHeading =
  /^(?:构图建议|構圖建議|Composition suggestions|構図の提案|구도 제안|Gợi ý bố cục|คำแนะนำด้านองค์ประกอบภาพ)[：:][ \t]*\r?$/m;
const text = (value) => (typeof value === 'string' ? value.trim() : '');
export function generationResult(data) {
  const hasPoem = data?.verse != null || data?.poem?.some?.((line) => text(line)) || text(data?.text);
  const poem = hasPoem ? poemData(data) : null;
  const metadata = data?.metadata || {};
  let description = text(metadata.comments ?? metadata.description);
  const match = adviceHeading.exec(description);
  const advice = match ? description.slice(match.index + match[0].length).trim() : '';
  if (advice) description = description.slice(0, match.index).trim();
  if (poem) {
    const prefixes = data.verse
      ? ['词牌', '詞牌'].map((label) =>
          [poem.title, poem.cipai ? `${label}：${poem.cipai}` : '', poem.body].filter(Boolean).join('\n'),
        )
      : [poem.body];
    for (const prefix of prefixes) {
      if (description === prefix || description.startsWith(prefix + '\n')) {
        description = description.slice(prefix.length).trim();
        break;
      }
    }
  }
  return {
    poem,
    title: text(metadata.title),
    subject: text(metadata.subject),
    subtitle: text(metadata.subtitle),
    description,
    advice,
    tags: Array.isArray(metadata.tags)
      ? metadata.tags.filter((tag) => typeof tag === 'string' && tag.trim())
      : [],
  };
}
