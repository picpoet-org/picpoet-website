import test from 'node:test';
import assert from 'node:assert/strict';
import { officialDevConfig } from '../scripts/web-official-dev.mjs';

test('官方联调入口使用现有 debug 端口，不改变通用服务默认值', () => {
  const config = officialDevConfig({});
  assert.equal(config.dashboardApiUrl, 'http://127.0.0.1:18080/api/v1');
  assert.equal(config.picpoetApiUrl, 'http://127.0.0.1:18081/v1');
  assert.equal(config.publicOrigin, 'http://127.0.0.1:18090');
  assert.deepEqual(config.publicOrigins, ['http://127.0.0.1:18090']);
  assert.equal(config.host, '127.0.0.1');
});

test('显式配置优先，仍复用通用 URL 和生产 HTTPS 校验', () => {
  const config = officialDevConfig({
    WEB_PORT: '8091',
    WEB_PUBLIC_ORIGINS: 'http://127.0.0.1:8091,http://192.168.31.7:8091',
    DASHBOARD_API_URL: 'http://127.0.0.1:28080/api/v1',
    PICPOET_API_URL: 'http://127.0.0.1:28081',
  });
  assert.equal(config.dashboardApiUrl, 'http://127.0.0.1:28080/api/v1');
  assert.equal(config.picpoetApiUrl, 'http://127.0.0.1:28081/v1');
  assert.equal(config.publicOrigin, 'http://127.0.0.1:8091');
  assert.deepEqual(config.publicOrigins, ['http://127.0.0.1:8091', 'http://192.168.31.7:8091']);
  assert.throws(() => officialDevConfig({ NODE_ENV: 'production' }), /HTTPS/);
  assert.throws(() => officialDevConfig({ DASHBOARD_API_URL: 'http://user:secret@localhost/api/v1' }), /无凭据/);
});
