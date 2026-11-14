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
- 多语言由 agent 直接维护，不使用 project-translator-cli 或其他自动翻译生成流程。`src/locales/zh-cn/` 为文案源；新增或修改文案时，在同一变更中直接同步 `zh-hk`、`zh-tw`、`en-us`、`ko-kr`、`ja-jp` 字典，仅修改相关键，不整文件重译。保持键、结构、数组长度和 `{brand}`、`{count}` 等占位符一致，不以源文占位或删除目标字典绕过校验。
- 翻译需结合界面与业务语境，区分香港／台湾用语，保留产品事实、协议值和链接。完成后执行 `npm run locales:check`、`npm run build:all` 和 `node test/vue.browser.integration.mjs --all-locales`；结构检查不能代替语义审校。
- 简体中文品牌为“图赋”，其余语言为“PicPoet”；文案使用 `{brand}`，界面语言与创作请求的诗词语言分别维护。

## 业务与发布边界

- 浏览器通过同源 `/web-api` 访问 BFF，用户令牌保存在服务端，浏览器持有 HttpOnly 会话 Cookie；服务密钥由相应后端持有。
- 网页版业务交付同时准备 Node BFF 与同源路由，纯静态交付仅覆盖静态能力。
- 公开地址以 `deployment.json` 为准；下载与 Android 升级清单共用 `releases/stable.json`，发布流程见 README。公开地址变更同步客户端 `../picpoet-app/android/packaging/release-config.json`。