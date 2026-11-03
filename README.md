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
- `/create.html`：注册账户的在线创作、纯诗词分享 PNG、次数套餐购买

## 网页版创作（本地验收）

网页版复用 Dashboard 的 Picpoet 邮箱注册／OTP 验证、账户及额度，通过官方异步任务生成诗词。分享卡在浏览器以文楷绘制，沿用客户端的纸色、1080px 宽度和品牌底纹，不包含原照片。图片选中后仅在本机解码、缩小及 JPEG 重编码（移除原图 EXIF）；点击生成才上传。结果不作为永久作品库保存，请及时下载。

工作目录 `website/`，Node.js 20+：

```bash
# 两个上游需分别启动；以下是默认本地端口，不会加载任何 .env。
DASHBOARD_API_URL=http://127.0.0.1:8080/api/v1 \
PICPOET_API_URL=http://127.0.0.1:8081/v1 npm run dev:web
```

打开 <http://127.0.0.1:8090/create.html>。此地址的 Host/Origin 必须与 `WEB_PUBLIC_ORIGIN` 一致（默认 `http://127.0.0.1:8090`），不能混用 localhost。单独的 `npm run dev` 仅预览静态内容，没有 `/web-api` 业务能力。

- `scripts/web-server.mjs` 同时托管 `public/` 和固定 `/web-api` 同源代理；只用用户自己的 JWT / 业务凭证，不需要模型、Dashboard 内部或 payments 服务密钥。
- 账户令牌只在服务端内存中保管，浏览器仅持有 HttpOnly、SameSite=Strict Cookie。HTTPS 时启用 Secure；生产环境要求设置 `NODE_ENV=production` 和 HTTPS `WEB_PUBLIC_ORIGIN`。
- 会话默认 30 分钟固定有效期，进程重启后失效，最多 1000 个；通过 `WEB_SESSION_TTL_MS`、`WEB_MAX_SESSIONS` 调整。首次登录按需新增业务凭证，不撤销其他设备凭证。上游尚无单凭证撤销接口，退出只撤销登录刷新凭证并清除本地会话。
- 上传默认最多 10 MiB，浏览器限制 4000 万像素、长边 2048px；后端再次校验边界。`WEB_MAX_IMAGE_BYTES` 可降低服务端限制；增大不会改变前端限制。
- `WEB_HOST` / `WEB_PORT` 默认为 `127.0.0.1` / `8090`；上游超时 `WEB_UPSTREAM_TIMEOUT_MS` 默认 30000，读取请求超时 `WEB_BODY_TIMEOUT_MS` 默认 15000。
- Dashboard 需开启 Picpoet、邮箱认证与购买功能，配置邮件、独立数据库、支付及可信结算信息；Picpoet Server 需具备官方生成、额度结算和模型服务能力。参考各仓库说明，不向前端配置服务密钥。
- 套餐价格来自服务端；用户明确下单后打开支付宝 PC 网页或 WAP 收银台。跳转不表示到账，通过订单详情和余额确认。重试保留请求编号；会话丢失后从账户订单列表恢复，不盲目重新购买。

### 验证与发布边界

```bash
npm test
npm run public:sync
npm run test:browser:create  # 需要 google-chrome；独立 HTTP 替身，不花费模型/支付额度
```

测试覆盖账户会话、原样 multipart、配额查询、任务重试、订单幂等、刷新并发、安全边界，以及 Chrome 375/1280px 的注册、上传、生成、PNG、购买状态与退出隔离。真实邮件、真实模型、沙箱付款和移动系统分享需在配置环境另行验收；测试替身通过不等于真实上游联通。

**现有 ESA 纯静态发布不具备 BFF 能力。** 上线前须为同一官网 origin 的 `/web-api/*` 部署 Node 服务并配置同源路由，或由 Node 服务统一托管官网；反向代理保留公开 Host，API 不缓存。本文不执行线上变更。当前会话为单进程内存，扩容前应建设共享会话存储、可信代理限流和业务凭证生命周期管理；不要仅上传 `public/` 就宣称网页版可用。

字体位于 `assets/fonts/`，附 `OFL.txt`；与客户端 `LXGWWenKai-Regular.ttf` 相同。本次保留完整字体以覆盖任意生成汉字，约 25 MiB，发布前可评估保留完整字形的 WOFF2 压缩。

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
