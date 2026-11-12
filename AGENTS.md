# Picpoet 网站约定

先读 [README.md](README.md)。本仓库同时负责公开页面、网页版创作与 Node BFF；静态预览和业务联调使用各自入口。

## 开发与验证

工作目录：本仓库根目录，使用 Node.js 22.13+。前端为 Vue 3 + Vite，多页地址与独立 Node BFF 保持兼容。

```sh
npm test
npm run public:sync
npm run test:browser:create
```

- 页面内容在 `src/views/` 修改，共享组件在 `src/components/`，业务状态与生命周期在 `src/composables/`；`shared/` 维护图片、诗词、发布和导航等纯契约模块。
- `public:sync` / `build` 用 Vite 编译并从相同组件预渲染到 `public/`；同时校验发布清单，交付完整字典的语言。`build:all` 严格验证六种语言齐全。
- `npm run dev` 使用 Vite 热更新，`/web-api` 转发本机 `18090` BFF；BFF 仍通过 `dev:web` 或 `dev:web:official` 启动，全栈联调使用 `dev:stack`。
- 浏览器正向流程验证使用 `npm run test:browser:create`，需要 Google Chrome，使用独立 HTTP 替身；真实上游联通与生成另行验收。
- `src/locales/zh-cn/` 为文案源；五种目标字典通过 `npm run translate` 调用 `project-translator-cli` 生成，凭据复用本机全局配置。源文更新后运行翻译、`locales:check`、`build:all` 和六语言浏览器验收。
- 简体中文品牌为“图赋”，其余语言为“PicPoet”；文案使用 `{brand}`，界面语言与创作请求的诗词语言分别维护。

## 业务与发布边界

- 浏览器通过同源 `/web-api` 访问 BFF，用户令牌保存在服务端，浏览器持有 HttpOnly 会话 Cookie；服务密钥由相应后端持有。
- 网页版业务交付同时准备 Node BFF 与同源路由，纯静态交付仅覆盖静态能力。
- 公开地址以 `deployment.json` 为准；下载与 Android 升级清单共用 `releases/stable.json`，发布流程见 README。公开地址变更同步客户端 `../picpoet/android/packaging/release-config.json`。