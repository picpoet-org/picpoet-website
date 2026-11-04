import qrcode from './vendor/qrcode.mjs';

// 仅在本机编码已校验的支付 URL，不向外部二维码服务传送订单信息。
export function paymentQR(doc, url) {
  const code = qrcode(0, 'M');
  code.addData(url);
  code.make();
  const image = doc.createElement('canvas');
  image.className = 'payment-qr';
  image.setAttribute('role', 'img');
  image.setAttribute('aria-label', '使用支付宝扫描二维码支付');
  const count = code.getModuleCount(), scale = 4, margin = 4;
  image.width = image.height = (count + margin * 2) * scale;
  const context = image.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, image.width, image.height);
  context.fillStyle = '#000';
  for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) {
    if (code.isDark(row, col)) context.fillRect((col + margin) * scale, (row + margin) * scale, scale, scale);
  }
  return image;
}