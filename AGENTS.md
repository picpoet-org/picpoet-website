# Picpoet 网站约定

先读 [README.md](README.md)。本仓库只负责 Vue 前端与静态构建；全部 BFF 业务、会话和边缘转发代码归相邻 `picpoet-server`。

## 开发与验证

工作目录：本仓库根目录，使用 Node.js 22.13+。前端为 Vue 3 + Vite，多页地址与 Go Server 的 /web-api 契约保持兼容。

```sh
npm test
npm run public:sync
npm run build:all
```

- 页面内容在 `src/views/` 修改，共享组件在 `src/components/`，业务状态与生命周期在 `src/composables/`；`shared/` 维护图片、诗词、发布和导航等纯契约模块。
- `public:sync` / `build` 用 Vite 编译并从相同组件预渲染到 `public/`；同时校验发布清单，交付完整字典的语言。`build:all` 严格验证六种语言齐全。
- `npm run dev` 使用 Vite 热更新；`dev:web` 使用 18090 端口。`/web-api` 和邀请深路径转发 `VITE_API_PROXY_TARGET`（默认本机 18081），保留 Host/Origin；Go 后端需允许开发来源。全栈联调使用 `dev:stack`。
- 旧 Node BFF 专属测试及混合浏览器集成脚本已删除；保留前端现有测试，真实上游联通与生成另行验收。
- 多语言由 agent 直接维护，不使用 project-translator-cli 或其他自动翻译生成流程。`src/locales/zh-cn/` 为文案源；新增或修改文案时，在同一变更中直接同步 `zh-hk`、`zh-tw`、`en-us`、`ko-kr`、`ja-jp` 字典，仅修改相关键，不整文件重译。保持键、结构、数组长度和 `{brand}`、`{count}` 等占位符一致，不以源文占位或删除目标字典绕过校验。
- 翻译需结合界面与业务语境，区分香港／台湾用语，保留产品事实、协议值和链接。完成后执行 `npm run locales:check`、`npm run build:all` 并检查六语言页面；结构检查不能代替语义审校。
- 简体中文品牌为“图赋”，其余语言为“PicPoet”；文案使用 `{brand}`，界面语言与创作请求的诗词语言分别维护。

## 业务与发布边界

- 浏览器通过同源 `/web-api` 访问 BFF，用户令牌保存在服务端，浏览器持有 HttpOnly 会话 Cookie；服务密钥由相应后端持有。
- 官网域名直接绑定 ESA Pages；动态 `/web-api*` 与邀请路径通过 server 仓库的 ESA 薄代理转发到现有 API 域名。website 不构建后端镜像，不部署集群工作负载。
- 公开地址以 `deployment.json` 为准；下载与 Android 升级清单共用 `releases/stable.json`，发布流程见 README。公开地址变更同步客户端 `../picpoet-app/android/packaging/release-config.json`。