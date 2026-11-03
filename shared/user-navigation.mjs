// 只允许已知站内页面，避免登录 returnTo 成为开放重定向。
const destinations = new Set(['create.html', 'works.html', 'account.html']);
export function safeReturnTo(value) {
  if (typeof value !== 'string' || /[\\\x00-\x20\x7f]/.test(value)) return 'create.html';
  const [file, anchor, extra] = value.split('#');
  if (!destinations.has(file) || extra !== undefined || (anchor !== undefined && !(file === 'account.html' && ['purchase', 'orders'].includes(anchor)))) return 'create.html';
  return value;
}
export function loginDestination(pageName, hash = '') {
  return `login.html?returnTo=${encodeURIComponent(safeReturnTo(pageName + hash))}`;
}
