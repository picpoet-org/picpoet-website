# Picpoet website

Picpoet 的公开网站，集中维护产品使用说明、定价信息和下载入口。

## 正式发布地址

公开地址在 `deployment.json` 维护：

| 用途 | 地址 |
| --- | --- |
| 官网 | `https://picpoet.jqknono.com` |
| Android 更新清单 | `https://picpoet.jqknono.com/releases/stable.json` |
| 安装包 CDN 根路径 | `https://downloads.nullprivate.com/picpoet/release` |

安装包路径约定为 `<CDN 根路径>/<平台>/<版本>/<文件名>`。本次 Android 首版为 **0.1.0**，版本仅在客户端 `pubspec.yaml` 维护，目标地址为：

```text
https://downloads.nullprivate.com/picpoet/release/android/0.1.0/picpoet-0.1.0-arm64-v8a.apk
```

首版 Android 正式签名包已上传该路径，完整公开回下载的大小与 SHA-256 均与本地产物一致。`npm run releases:check` 会校验所有已发布安装包均位于指定 CDN 的平台／版本目录，并校验 Android 系统版本码由版本自动推导。网站部署与客户端属于独立仓库，客户端对应配置位于工作区 `../picpoet/android/packaging/release-config.json`；调整公开地址时同步两侧。

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

`releases/stable.json` 是网站下载页和 Android 升级检查的共同数据源。Android 已提供首版 `0.1.0` ARM64 安装包，其余平台保持“暂未发布”。`artifacts: []` 表示“暂未发布”；接入真实产物后自动展示版本、更新说明、架构、大小与 SHA-256。下载页会推荐可能匹配的系统，用户仍需核对架构。

清单包含 `schemaVersion: 1` 和五项 `platforms`。每个平台包含：

| 字段 | 内容 |
| --- | --- |
| `id` / `name` | 平台标识与显示名称 |
| `minimumSystem` | 已验收系统版本、发行版与架构要求 |
| `versionName` / `versionCode` | 展示版本与机器读取的版本字段，Android 整数由版本自动生成，未发布时为 `null` |
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

Android 正式构建脚本自动注入 `--dart-define=PICPOET_UPDATE_MANIFEST_URL=https://picpoet.jqknono.com/releases/stable.json`。在客户端目录执行 `python3 android/packaging/init-signing.py` 完成本机交互式证书初始化并加密备份后，执行 `python3 android/packaging/build-release.py`。Flutter 源版本声明为 `version: 0.1.0`，Android 系统必需的整数字段按 `主版本 × 1000000 + 次版本 × 1000 + 修订版本` 自动生成，当前为 `1000`；界面与下载路径仅显示 `0.1.0`。次版本和修订版本各小于 1000，生成值为正整数且不超过 2100000000。每次正式发布递增语义版本即可。

正式构建生成 `build/release/android/0.1.0/stable.candidate.json`，其中只有 Android 条目、发布时间为 `null`，供上传验证后补充实际日期与更新说明。把该条目合入本网站五平台清单，并保留其他平台状态；正式清单仍按完整契约校验。自动检查滚动 24 小时最多一次，手动检查可再次提示已忽略版本。用户确认后由浏览器下载、系统完成安装；同包名、同签名且新版本对应更高的系统版本码才能覆盖升级。首次从调试签名迁移到正式签名需另行处理数据备份。签名细节见客户端仓库的 `README.md`（工作区路径 `../picpoet/README.md`）。

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
esa-cli deploy --assets ./public --name picpoet-website --environment production --no-preview
```

在 ESA 控制台将 `picpoet.jqknono.com` 绑定到该 Pages 项目，并按控制台指引配置 DNS 和 HTTPS 证书。`esa.jsonc` 负责静态资源目录；自定义域名绑定、DNS 与证书须在服务端完成，不由本地构建脚本代办。

同步脚本根据 `deployment.json` 为页面生成正式官网 canonical、`robots.txt` 和 `sitemap.xml`。保留 `/pages/` 兼容产物，相对资源仍适用于本地预览；旧 `jqknono.com/pages/*` 路由若继续保留，可在 ESA 单独配置跳转到正式官网。上线后检查官网、清单和真实安装包路径均可通过 HTTPS 访问，清单直接返回 JSON。
