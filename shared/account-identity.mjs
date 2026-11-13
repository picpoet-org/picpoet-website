/** 手机号仅作登录标识；格式合法不表示号码归属经过验证。 */
export function normalizePhone(value) {
  if (typeof value !== 'string') return '';
  let phone = value.trim().replace(/[ -]/g, '');
  if (phone.startsWith('+86')) phone = phone.slice(3);
  else if (phone.startsWith('0086')) phone = phone.slice(4);
  else if (phone.length === 13 && phone.startsWith('86')) phone = phone.slice(2);
  return /^1[3-9][0-9]{9}$/.test(phone) ? phone : '';
}

export function isPhoneAccount(user) {
  return user?.authMethod === 'phone' && !!normalizePhone(user.phone);
}

export function hasAccountIdentity(user) {
  return typeof user?.id === 'string' && !!user.id &&
    (isPhoneAccount(user) || (user.authMethod !== 'phone' && typeof user.email === 'string' && !!user.email));
}

export function canUseAccount(user) {
  return hasAccountIdentity(user) && (!user.status || user.status === 'active') &&
    (isPhoneAccount(user) || user.emailVerified === true);
}

export function accountLabel(user) {
  return isPhoneAccount(user) ? user.phone : user?.email || '';
}
