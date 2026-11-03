import { canvasBlob } from './create-core.mjs';

export const CARD = Object.freeze({ width: 1080, padding: 96, top: 88, bottom: 64, titleSize: 72, bodySize: 48, maxHeight: 14000, maxCharacters: 20000 });
export function poemData(result) {
  const verse = result?.verse;
  if (verse != null && (typeof verse.title !== 'string' || !Array.isArray(verse.lines) || !verse.lines.every(line => typeof line === 'string'))) {
    throw new Error('结果缺少结构化诗词，无法生成分享图；请稍后重试获取结果。');
  }
  // verse 为可选字段；旧结果使用 poem 或 text，照片标题不属于诗词标题。
  const lines = verse?.lines ?? result?.poem;
  const body = (Array.isArray(lines) && lines.every(line => typeof line === 'string') ? lines.join('\n').trim() : '')
    || (verse == null && typeof result?.text === 'string' ? result.text.trim() : '');
  if (!body) throw new Error('结果没有诗词正文，无法生成分享图。');
  return { title: verse?.title.trim() ?? '', body, cipai: verse?.kind === 'ci' && typeof verse.cipai === 'string' ? verse.cipai.trim() : '' };
}
export function graphemes(text) {
  return typeof Intl.Segmenter === 'function' ? Array.from(new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(text), v => v.segment) : Array.from(text);
}
/** 保留段落空行；实际文楷测宽，避免长句、英文或 emoji 被截断。 */
export function wrapText(text, measure, maxWidth, spacing = 0) {
  if (typeof text !== 'string' || text.length > CARD.maxCharacters || !Number.isFinite(maxWidth) || maxWidth <= 0) throw new Error('文字排版超出安全范围。');
  const lines = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = '', width = 0;
    for (const glyph of graphemes(paragraph)) {
      const glyphWidth = measure(glyph);
      if (!Number.isFinite(glyphWidth) || glyphWidth < 0 || glyphWidth > maxWidth) throw new Error('文字宽度超过画布范围。');
      const nextWidth = width + glyphWidth + (line ? spacing : 0);
      if (line && nextWidth > maxWidth) { lines.push(line); line = glyph; width = glyphWidth; }
      else { line += glyph; width = nextWidth; }
    }
    lines.push(line);
  }
  return lines;
}
export function cardLayout(data, measure) {
  if ([data.title, data.body, data.cipai].join('').length > CARD.maxCharacters) throw new Error('诗词过长，超过安全绘图上限。文字仍可阅读和复制。');
  const width = CARD.width - 2 * CARD.padding;
  let y = CARD.top;
  const blocks = [];
  const block = (text, size, leading, spacing) => {
    const lines = wrapText(text, glyph => measure(glyph, size), width, spacing);
    const value = { lines, size, leading, spacing, y, height: lines.length * size * leading };
    y += value.height; blocks.push(value); return value;
  };
  if (data.title) block(data.title, 72, 1.35, 4);
  if (data.cipai) { if (data.title) y += 28; block(`词牌 · ${data.cipai}`, 32, 1.5, 2); }
  let divider;
  if (data.title || data.cipai) { y += 32; divider = y; y += 48; }
  const body = block(data.body, 48, 2.05, 2);
  const height = Math.ceil(y + CARD.bottom);
  if (height > CARD.maxHeight) throw new Error('诗词过长，分享图超过安全尺寸。文字仍可阅读和复制。');
  return { width: CARD.width, height, blocks, body, divider };
}
let fontPromise;
export async function loadCardFont() {
  if (!fontPromise) {
    fontPromise = (async () => {
      if (!globalThis.FontFace || !document.fonts) throw new Error('当前浏览器不支持文楷字体加载，请更换浏览器。');
      const font = new FontFace('PicpoetCard', `url("${new URL('../assets/fonts/LXGWWenKai-Regular.ttf', import.meta.url).href}")`);
      let timer;
      try {
        await Promise.race([font.load(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('font timeout')), 20000); })]);
        document.fonts.add(font);
        await document.fonts.load('48px PicpoetCard', '图赋山水');
        if (font.status !== 'loaded' || !document.fonts.check('48px PicpoetCard')) throw new Error('font unavailable');
      } catch { throw new Error('文楷字体未能加载，分享图尚未生成。请检查网络后点击“重绘分享图”。'); }
      finally { clearTimeout(timer); }
    })().catch(error => { fontPromise = undefined; throw error; });
  }
  return fontPromise;
}
export async function renderPoemCard(data) {
  await loadCardFont();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器无法创建分享画布。');
  const measure = (glyph, size) => { ctx.font = `${size}px PicpoetCard`; return ctx.measureText(glyph).width; };
  const layout = cardLayout(data, measure);
  canvas.width = layout.width; canvas.height = layout.height;
  const colors = getComputedStyle(document.documentElement);
  const color = (name, fallback) => colors.getPropertyValue(`--pp-color-${name}`).trim() || fallback;
  try {
    ctx.fillStyle = color('paper', '#f5f3ee'); ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = color('line', '#d7d3c9'); ctx.lineWidth = 1; ctx.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);
    const drawLine = (text, size, spacing, center, top) => {
      const glyphs = graphemes(text);
      ctx.font = `${size}px PicpoetCard`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const widths = glyphs.map(g => ctx.measureText(g).width);
      let x = center - (widths.reduce((a, b) => a + b, 0) + Math.max(0, glyphs.length - 1) * spacing) / 2;
      glyphs.forEach((g, i) => { ctx.fillText(g, x, top); x += widths[i] + spacing; });
    };
    ctx.fillStyle = color('ink', '#20201e');
    // 品牌底纹以正文居中；短诗缩小底纹，保持与客户端一致。
    ctx.save();
    const scale = Math.min(1, layout.body.height * .72 / 278, (CARD.width - 192) * .72 / 450);
    ctx.translate(CARD.width / 2, layout.body.y + layout.body.height / 2);
    ctx.scale(scale, scale); ctx.globalAlpha = .06;
    drawLine('图赋', 150, 20, 0, -42); drawLine('PicPoet', 64, 8, 0, 88);
    ctx.restore();
    if (layout.divider !== undefined) {
      const y = layout.divider + 6;
      ctx.beginPath(); ctx.moveTo(96, y); ctx.lineTo(508, y); ctx.moveTo(572, y); ctx.lineTo(984, y); ctx.stroke();
      ctx.fillStyle = color('accent-dark', '#c94427'); ctx.fillRect(534, y - 6, 12, 12);
    }
    ctx.fillStyle = color('ink', '#20201e');
    for (const block of layout.blocks) block.lines.forEach((line, i) => drawLine(line, block.size, block.spacing, CARD.width / 2, block.y + (i + .5) * block.size * block.leading));
    const blob = await canvasBlob(canvas, 'image/png');
    if (blob.type !== 'image/png') throw new Error('PNG 导出失败，请重试。');
    return blob;
  } finally { canvas.width = 0; canvas.height = 0; }
}
