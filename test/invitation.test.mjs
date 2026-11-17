import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvitationURL, normalizeInvitationCode, readInvitation } from '../shared/invitation.mjs';

const USER = '12345678-1234-4234-8234-123456789abc';
const CODE = 'inv_0123456789abcdef0123456789abcdef';
const ORIGIN = 'https://picpoet.jqknono.com';

test('邀请链接仅用 user.id 与 invite_code，origin 由调用方提供', () => {
  assert.equal(
    buildInvitationURL(USER, CODE, ORIGIN),
    `https://picpoet-api.jqknono.com/${USER}/invite_code=${CODE}`,
  );
  assert.equal(
    buildInvitationURL(USER.toUpperCase(), CODE.toUpperCase(), `${ORIGIN}/`),
    `https://picpoet-api.jqknono.com/${USER}/invite_code=${CODE}`,
  );
  for (const [userId, code, origin] of [
    ['', CODE, ORIGIN],
    [USER, '', ORIGIN],
    [USER, CODE, ''],
    ['poet', CODE, ORIGIN],
    [USER, 'invite', ORIGIN],
    [USER, 'inv_' + 'a'.repeat(31), ORIGIN],
    [USER, 'inv_' + 'g'.repeat(32), ORIGIN],
    [USER, CODE, 'https://evil.example/path'],
    [USER, CODE, 'javascript:alert(1)'],
  ])
    assert.equal(buildInvitationURL(userId, code, origin), '');
});

test('登录页仅接受严格 invitationCode', () => {
  assert.equal(normalizeInvitationCode(CODE.toUpperCase()), CODE);
  assert.equal(readInvitation(`?invitationCode=${CODE}&returnTo=create.html`), CODE);
  assert.equal(readInvitation(new URLSearchParams({ invitationCode: CODE })), CODE);
  assert.equal(readInvitation('?invitationCode=invite'), '');
  assert.equal(readInvitation('?invitationCode=' + 'inv_' + 'a'.repeat(40)), '');
});
