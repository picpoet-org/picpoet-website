# Picpoet website

Picpoet 的公开网站，集中维护产品使用说明、定价信息和下载入口。

## 本地预览

要求 Python 3 和 Node.js 20+，命令工作目录为 `website/`：

```bash
npm run public:sync
npm run dev
```

打开 <http://localhost:8080>。

## 页面

- `/index.html`：产品首页
- `/docs.html`：使用说明
- `/pricing.html`：定价
- `/downloads.html`：下载资源

首页与说明对应当前 Flutter 客户端的单张照片创作、元数据保存、本机历史与分享图流程。下载页分别展示 Android、OpenHarmony、Linux、macOS 和 Windows，使用自有 CDN 安装包直链。平台能力与实际发布包区分展示。

## 统一发布清单

`releases/stable.json` 是网站下载页和 Android 升级检查的共同数据源。当前五个平台均未发布安装包，`artifacts: []` 表示“暂未发布”；接入真实产物后自动展示版本、更新说明、架构、大小与 SHA-256。下载页会推荐可能匹配的系统，用户仍需核对架构。

清单包含 `schemaVersion: 1` 和五项 `platforms`。每个平台包含：

| 字段 | 内容 |
| --- | --- |
| `id` / `name` | 平台标识与显示名称 |
| `minimumSystem` | 已验收系统版本、发行版与架构要求 |
| `versionName` / `versionCode` | 展示版本与递增的正整数版本码，未发布时为 `null` |
| `publishedAt` | ISO 8601 发布日期，未发布时为 `null` |
| `notes` | 更新说明字符串数组 |
| `artifacts` | 安装包数组，未发布时为空 |

Android 额外提供固定的 `applicationId: org.picpoet.app.android` 与 `minSdk`。每个安装包包含 `arch`、`format`、`url`、`sha256`、`sizeBytes`。`url` 使用不含凭据、可公开访问的 HTTPS CDN 绝对地址；安装包上传完成后再加入清单。`sha256` 是最终签名安装包的 64 位十六进制校验值，`sizeBytes` 为实际字节数。更新说明按纯文本展示。

Android 当前已验证产物为 `arm64-v8a` / `apk`，仅在完整引擎及安装验收通过后声明其他 ABI。其余平台按最终构建填写实际架构；OpenHarmony 支持 `hap` / `app`，Linux 支持 `tar.gz` / `AppImage` / `deb` / `rpm` / `zip`，macOS 支持 `dmg` / `pkg` / `zip`，Windows 支持 `exe` / `msi` / `zip`。包格式受支持表示页面可分发该格式，不代表当前已经生成该产物。

发布流程：

1. 生成正式签名包，核对包名、版本码、最低系统、CPU 架构及 Rust 引擎随包分发。
2. 上传安装包到 CDN 的版本化路径，验证公开 HTTPS 下载；计算最终文件 SHA-256 与字节数。
3. 更新 `releases/stable.json`，补全真实版本、系统要求、日期、说明和安装包信息。
4. 运行 `npm run releases:check`、`npm test`、`npm run public:sync`。
5. 部署 `public/` 并刷新清单 CDN 缓存，再验证下载直链与 Android 升级提示。

根路径和 `/pages/` 均同步相同清单及脚本。网站脚本相对于自身定位 `../releases/stable.json`，无需硬编码官网域名。清单建议响应 `Content-Type: application/json`、`Cache-Control: no-cache` 或较短 TTL；安装包使用包含版本的稳定地址和正确 MIME 类型，可配置 `Content-Disposition: attachment`。清单请求不跟随重定向，使用最终可直接返回 JSON 的地址。

Android 构建时，将最终公开清单 URL 传入 `--dart-define=PICPOET_UPDATE_MANIFEST_URL=<正式 HTTPS 清单 URL>`。官网/CDN 域名确定前保持未配置状态；设置页会说明尚未配置更新源。自动检查滚动 24 小时最多一次，手动检查可再次提示已忽略版本。用户确认后由浏览器下载、系统完成安装；同包名、同签名并递增版本码才能覆盖升级。签名配置见客户端仓库的 `README.md`（工作区路径 `../picpoet/README.md`）。

## 验证

```bash
npm test
npm run releases:check
npm run public:sync
```

正向集成测试覆盖 HTTP 发布清单、五平台直链、未发布状态、设备推荐，以及根目录与 `/pages/` 同步交付。上线前对真实 CDN 链接、Android 覆盖安装和各平台安装包补充验收。静态网站在清单加载失败时提示重试，不把网络故障展示为最新版本或未发布。

在本地预览运行且已安装 Chrome 的环境中，可以额外执行零依赖浏览器集成验证：

```bash
node test/downloads.browser.integration.mjs
```

该脚本通过 Chrome CDP 测试 375px／1280px、根路径／`/pages/`、模拟已发布／真实未发布状态，以及鼠标刷新、安装包直链和展开校验值；测试清单仅在浏览器请求中注入，不写入正式发布清单，也不访问示例 CDN。

## 品牌资产

统一品牌资产位于 `assets/`，包含网页 SVG 图标、Wordmark、PNG 和 Windows ICO。页面使用 `picpoet-mark.svg` 作为 favicon 和导航图标。

## ESA Pages

网站使用根目录的 `esa.jsonc` 配置 ESA Pages，静态资源目录为 `public`。部署前将页面资源同步到 `public`，然后在项目目录执行：

```bash
npm run public:sync
esa-cli deploy --assets ./public --name picpoet-website --environment production
```

`jqknono.com/pages/*` 通过 ESA 路由指向该 Pages 项目。
