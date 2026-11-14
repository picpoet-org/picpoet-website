import qrcode from 'qrcode-generator';

/** 本地二维码，保持四模块静区和整数像素，支付及分享图复用同一绘制规则。 */
export function createQRMatrix(value) {
  const code = qrcode(0, 'M');
  code.addData(value);
  code.make();
  const count = code.getModuleCount();
  return Array.from({ length: count }, (_, row) => Array.from({ length: count }, (_, col) => code.isDark(row, col)));
}

export function drawQRCode(context, matrix, x = 0, y = 0, scale = 4, { background = '#fff', foreground = '#000' } = {}) {
  const margin = 4;
  const size = (matrix.length + margin * 2) * scale;
  context.save();
  context.fillStyle = background;
  context.fillRect(x, y, size, size);
  context.fillStyle = foreground;
  matrix.forEach((row, r) => row.forEach((dark, c) => {
    if (dark) context.fillRect(x + (c + margin) * scale, y + (r + margin) * scale, scale, scale);
  }));
  context.restore();
  return size;
}
