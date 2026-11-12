import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInvitationURL,
  invitationRedirect,
  normalizeInvitationCode,
  readInvitation,
} from '../shared/invitation.mjs';

const USER = '12345678-1234-4234-8234-123456789abc';
const CODE = 'inv_0123456789abcdef0123456789abcdef';
const ORIGIN = 'https://picpoet.jqknono.com';

test('邀请链接仅用 user.id 与 invite_code，origin 由调用方提供', () => {
  assert.equal(
    buildInvitationURL(USER, CODE, ORIGIN),
    `${ORIGIN}/${USER}/invite_code=${CODE}`,
  );
  assert.equal(
    buildInvitationURL(USER.toUpperCase(), CODE.toUpperCase(), `${ORIGIN}/`),
    `${ORIGIN}/${USER}/invite_code=${CODE}`,
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
  ]) assert.equal(buildInvitationURL(userId, code, origin), '');
});

test('深路径受控跳转到 login.html，并保留受限 returnTo', () => {
  assert.deepEqual(invitationRedirect(`/${USER}/invite_code=${CODE}`), {
    status: 302,
    location: `/login.html?invitationCode=${CODE}`,
  });
  assert.deepEqual(
    invitationRedirect(`/${USER}/invite_code=${CODE}`, 'returnTo=create.html'),
    {
      status: 302,
      location: `/login.html?invitationCode=${CODE}&returnTo=create.html`,
    },
  );
  assert.deepEqual(
    invitationRedirect(`/${USER}/invite_code=${CODE}`, '?returnTo=https://evil.example'),
    {
      status: 302,
      location: `/login.html?invitationCode=${CODE}`,
    },
  );
  assert.equal(invitationRedirect('/create.html'), null);
  assert.equal(invitationRedirect('/index.html'), null);
  assert.deepEqual(invitationRedirect(`/${USER}/invite_code=invite`), { status: 404 });
  assert.deepEqual(invitationRedirect(`/not-a-uuid/invite_code=${CODE}`), { status: 404 });
  assert.deepEqual(invitationRedirect(`/${USER}/invite_code=${CODE}/extra`), { status: 404 });
});

test('登录页仅接受严格 invitationCode', () => {
  assert.equal(normalizeInvitationCode(CODE.toUpperCase()), CODE);
  assert.equal(readInvitation(`?invitationCode=${CODE}&returnTo=create.html`), CODE);
  assert.equal(readInvitation(new URLSearchParams({ invitationCode: CODE })), CODE);
  assert.equal(readInvitation('?invitationCode=invite'), '');
  assert.equal(readInvitation('?invitationCode=' + 'inv_' + 'a'.repeat(40)), '');
});
