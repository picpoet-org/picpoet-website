import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWebServer, readConfig } from './web-server.mjs';

// 仅选择已有官方 debug 服务；不启动后端、不加载秘密、不切换生产数据库。
export function officialDevConfig(env = process.env) {
  return readConfig({
    ...env,
    DASHBOARD_API_URL: env.DASHBOARD_API_URL || 'http://127.0.0.1:18080/api/v1',
    PICPOET_API_URL: env.PICPOET_API_URL || 'http://127.0.0.1:18081/v1',
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = officialDevConfig();
  createWebServer({ config }).listen(config.port, config.host, () => {
    for (const origin of config.publicOrigins) console.log(`Picpoet Web: ${origin}/create.html`);
    console.log(`Dashboard: ${config.dashboardApiUrl}`);
    console.log(`Picpoet: ${config.picpoetApiUrl}`);
    console.log('使用已有官方联调服务；账户与额度属于所连接的 debug 环境。');
  });
}
