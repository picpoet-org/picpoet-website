# Picpoet 网站约定

先读 [README.md](README.md)。本仓库同时负责公开页面、网页版创作与 Node BFF；静态预览和业务联调使用各自入口。

## 开发与验证

工作目录：本仓库根目录，使用 Node.js 20+；静态预览另需 Python 3。

```sh
npm test
npm run public:sync
```

- 页面和资源在源目录修改，通过 `public:sync` 生成交付目录 `public/`；该命令同时校验发布清单。
- `npm run dev` 仅预览静态页面；网页版业务使用 README 中的 `dev:web` 或 `dev:web:official`，全栈联调使用 `dev:stack`。
- 浏览器正向流程验证使用 `npm run test:browser:create`，需要 Google Chrome，使用独立 HTTP 替身；真实上游联通与生成另行验收。

## 业务与发布边界

- 浏览器通过同源 `/web-api` 访问 BFF，用户令牌保存在服务端，浏览器持有 HttpOnly 会话 Cookie；服务密钥由相应后端持有。
- 网页版业务交付同时准备 Node BFF 与同源路由，纯静态交付仅覆盖静态能力。
- 公开地址以 `deployment.json` 为准；下载与 Android 升级清单共用 `releases/stable.json`，发布流程见 README。公开地址变更同步客户端 `../picpoet/android/packaging/release-config.json`。