import { safeReturnTo } from './user-navigation.mjs';

// 与 Dashboard users.invite_code 默认生成一致：inv_ + 32 位小写十六进制；API 上限 40。
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVITATION_CODE = /^inv_[0-9a-f]{32}$/i;
const INVITATION_PATH = /^\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/invite_code=([^/]+)$/i;

export function isInvitationUserId(value) {
  return typeof value === 'string' && USER_ID.test(value);
}

export function normalizeInvitationCode(value) {
  if (typeof value !== 'string') return '';
  const code = value.trim().toLowerCase();
  return INVITATION_CODE.test(code) && code.length <= 40 ? code : '';
}

function normalizeOrigin(origin) {
  if (typeof origin !== 'string' || !origin.trim()) return '';
  try {
    const url = new URL(origin.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (url.username || url.password || url.search || url.hash) return '';
    if (url.pathname !== '/' && url.pathname !== '') return '';
    return url.origin;
  } catch {
    return '';
  }
}

function searchParamsOf(search) {
  if (search instanceof URLSearchParams) return search;
  if (typeof search !== 'string') return new URLSearchParams();
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}

/** 由调用方传入 deployment.json 的 websiteUrl；缺数据时返回空串。 */
export function buildInvitationURL(userId, code, origin) {
  const normalizedOrigin = normalizeOrigin(origin);
  const normalizedCode = normalizeInvitationCode(code);
  if (!normalizedOrigin || !isInvitationUserId(userId) || !normalizedCode) return '';
  return `${normalizedOrigin}/${userId.toLowerCase()}/invite_code=${normalizedCode}`;
}

/**
 * 解析邀请深路径。
 * - 非邀请路径：null
 * - 形态匹配但 UUID/code 无效：{ status: 404 }
 * - 有效：{ status: 302, location: '/login.html?invitationCode=...' }
 * search 仅用于可选且未放宽的 returnTo。
 */
export function invitationRedirect(pathname, search = '') {
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//')) return null;
  if (!pathname.includes('/invite_code=')) return null;
  const matched = INVITATION_PATH.exec(pathname);
  if (!matched) return { status: 404 };
  const code = normalizeInvitationCode(matched[2]);
  if (!code || !isInvitationUserId(matched[1])) return { status: 404 };
  const params = new URLSearchParams({ invitationCode: code });
  const returnTo = searchParamsOf(search).get('returnTo');
  if (returnTo != null && safeReturnTo(returnTo) === returnTo) params.set('returnTo', returnTo);
  return { status: 302, location: `/login.html?${params}` };
}

/** 登录页 query 中的受限 invitationCode；无效则空串。 */
export function readInvitation(search) {
  const values = searchParamsOf(search).getAll('invitationCode');
  return values.length === 1 ? normalizeInvitationCode(values[0]) : '';
}
