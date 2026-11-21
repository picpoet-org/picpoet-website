const utf8 = new TextEncoder();
const suffix = '_picpoet.png';

function shorten(value, bytes) {
  let length = 0, result = '';
  for (const char of value) {
    length += utf8.encode(char).length;
    if (length > bytes) break;
    result += char;
  }
  return result;
}

function basename(value) {
  if (typeof value !== 'string') return '';
  const name = value.split(/[\\/]/u).pop().trim().replace(/^[a-z]:/iu, '').trim().replace(/[. ]+$/u, '');
  if (!name || utf8.encode(name).length > 255) return '';
  return name.replace(/[<>:"|?*\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, '_');
}

export function shareFilename(value) {
  const name = basename(value);
  const dot = name.lastIndexOf('.');
  let stem = (dot < 0 ? name : name.slice(0, dot)).replace(/^[. ]+|[. ]+$/gu, '');
  if (!stem) return 'PicPoet.png';
  if (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\./iu.test(stem)) stem = '_' + stem;
  return shorten(stem, 255 - suffix.length) + suffix;
}

function timestampParts(value) {
  if (typeof value !== 'string') return null;
  const parts = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u.exec(value);
  if (!parts || parts[1].startsWith('0000')) return null;
  // JS 会将 2 月 30 日等自动进位，不能把这种结果当作有效原始时间。
  const wall = new Date(parts[1] + 'Z');
  return Number.isFinite(+wall) && wall.toISOString().startsWith(parts[1] + '.') ? parts : null;
}

// 保留来源偏移与亚秒；不能将缺失值或作品创建时间当成拍摄时间。
export function photoSource(value) {
  const photoName = basename(value?.photoName);
  const photoDateTime = timestampParts(value?.photoDateTime)?.[0];
  return { ...(photoName && { photoName }), ...(photoDateTime && { photoDateTime }) };
}

function localOffset(date) {
  const minutes = -date.getTimezoneOffset();
  const pad = n => String(n).padStart(2, '0');
  return `${minutes < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
}

function captureTimestamp(tags) {
  const raw = tags.DateTimeOriginal?.description;
  const parts = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})$/u.exec(raw);
  if (!parts) return '';
  const [, y, m, d, clock] = parts;
  const fraction = tags.SubSecTimeOriginal?.description?.trim();
  const subsec = /^\d+$/u.test(fraction) ? '.' + fraction.slice(0, 9) : '';
  const wall = `${y}-${m}-${d}T${clock}`;
  let offset = tags.OffsetTimeOriginal?.description?.trim();
  if (!offset || offset === ':') {
    const local = new Date(wall);
    if (!Number.isFinite(+local)) return '';
    // 本地夏令时跳过的钟点没有对应时刻，不悄悄挪到相邻小时。
    if (!new Date(+local - local.getTimezoneOffset() * 60000).toISOString().startsWith(wall + '.')) return '';
    offset = localOffset(local);
  }
  return timestampParts(wall + subsec + offset)?.[0] || '';
}

export async function readPhotoSource(file) {
  let photoDateTime = '';
  if (file.type !== 'image/gif' && typeof file.arrayBuffer === 'function') {
    try {
      const { default: reader } = await import('exifreader');
      const tags = reader.load(await file.arrayBuffer(), {
        includeTags: { exif: ['DateTimeOriginal', 'OffsetTimeOriginal', 'SubSecTimeOriginal'] },
      });
      photoDateTime = captureTimestamp(tags);
    } catch { /* 可解码的图片不一定包含有效的 EXIF。 */ }
  }
  if (!photoDateTime && Number.isFinite(file.lastModified)) {
    const date = new Date(file.lastModified);
    if (Number.isFinite(+date)) photoDateTime = date.toISOString();
  }
  return photoSource({ photoName: file.name, photoDateTime });
}

// 只为浏览器新绘制的 PNG 创建 TIFF；绝不从原图拷贝元数据块。
export function dateStampedPNG(blob, dateTime) {
  const parts = timestampParts(dateTime);
  if (!parts) return blob;
  const [, wall, fraction, zone] = parts;
  const stamp = wall.replaceAll('-', ':').replace('T', ' ') + '\0';
  const offset = (zone === 'Z' ? '+00:00' : zone) + '\0';
  const subsec = fraction ? fraction + '\0' : '';
  // TIFF 的短 ASCII 值内嵌在 4 字节槽中，较长值使用相对于 TIFF 起点的偏移。
  const exifIFD = 8 + 2 + 2 * 12 + 4;
  const count = subsec ? 4 : 3;
  const text = exifIFD + 2 + count * 12 + 4;
  const tiff = new Uint8Array(text + 20 + 7 + (subsec.length > 4 ? subsec.length : 0));
  const v = new DataView(tiff.buffer);
  function entry(at, tag, type, count, value) {
    v.setUint16(at, tag); v.setUint16(at + 2, type); v.setUint32(at + 4, count);
    if (typeof value === 'string') tiff.set(utf8.encode(value), at + 8);
    else v.setUint32(at + 8, value);
  }
  v.setUint16(0, 0x4d4d); v.setUint16(2, 42); v.setUint32(4, 8);
  v.setUint16(8, 2);
  entry(10, 0x0132, 2, 20, text);
  entry(22, 0x8769, 4, 1, exifIFD);
  v.setUint16(exifIFD, count);
  entry(exifIFD + 2, 0x9003, 2, 20, text);
  entry(exifIFD + 14, 0x9010, 2, 7, text + 20);
  entry(exifIFD + 26, 0x9011, 2, 7, text + 20);
  if (subsec) entry(exifIFD + 38, 0x9291, 2, subsec.length, subsec.length <= 4 ? subsec : text + 27);
  tiff.set(utf8.encode(stamp + offset + (subsec.length > 4 ? subsec : '')), text);

  const chunk = new Uint8Array(12 + tiff.length);
  const header = new DataView(chunk.buffer);
  header.setUint32(0, tiff.length);
  chunk.set(utf8.encode('eXIf'), 4);
  chunk.set(tiff, 8);
  let crc = -1;
  for (const byte of chunk.subarray(4, -4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  header.setUint32(chunk.length - 4, ~crc);
  // PNG 固定的 8 字节签名及 25 字节 IHDR 后、首个 IDAT 前插入 eXIf。
  return new Blob([blob.slice(0, 33), chunk, blob.slice(33)], { type: 'image/png' });
}

export function shareFile(blob, source) {
  const time = source?.photoDateTime;
  return new File([blob], shareFilename(source?.photoName), {
    type: 'image/png', ...(time && { lastModified: Date.parse(time) }),
  });
}
