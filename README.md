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

登录账户购买由 Dashboard 服务端复用创建时间未超过 5 分钟的未支付订单，匹配同账户、套餐、价格、币种、次数、支付方式与交付方式。再次点击不延长复用窗口；已支付、已关闭和超时订单不复用。数据库事务串行处理同账户的并发创建；网页按返回订单 ID 去重并定位到第一页。匿名购买继续使用原 requestId 幂等规则。

- `/index.html`：产品首页
- `/docs.html`：使用说明，分别说明网站在线创作与客户端 App 的当前能力
- `/pricing.html`：定价
- `/downloads.html`：下载资源
- `/create.html`：选图、在线创作、纯诗词分享 PNG，仅展示轻量次数提示
- `/works.html`：我的作品，历史缩略图、详情、下载和删除
- `/account.html`：个人中心，账户信息、剩余次数、套餐购买与订单
- `/login.html`：独立登录、注册和邮箱验证；成功后回到原目标页

主导航统一为「首页 / 在线创作 / 我的作品 / 个人中心」。公共介绍页面不依赖账号 API；使用说明、定价和下载继续保留。用户页面共享 HttpOnly 会话，各页仅加载自身需要的业务数据。登录 `returnTo` 只允许已知站内页面及指定锚点，不接受外站 URL；跨页不会保存密码或业务凭证到浏览器存储。

创作中的图片与尚未下载的分享图仍只在当前页面内存；离开前请保存作品，进行中的服务端任务可返回创作页恢复。历史作品在独立作品页查看。`test/fixtures/create-workflow.html` 仅用于既有业务全路径回归，不同步到 `public/`；浏览器测试同时验证真实独立页面及登录回跳。

## 网页版创作（本地验收）

网页版复用 Dashboard 的 Picpoet 邮箱注册／OTP 验证、账户及额度，通过官方异步任务生成诗词。分享卡在浏览器以文楷绘制，沿用客户端的纸色、1080px 宽度和品牌底纹，不包含原照片。文楷使用 ZSFT 发布的霞鹜文楷 v1.530 Regular 网页分片，缓存在 `assets/fonts/lxgw-wenkai/`；绘制时只启用当次文字覆盖的同源 woff2，不请求外部字体，也不再下载完整 TTF。图片选中后仅在本机解码、缩小及 JPEG 重编码（移除原图 EXIF）；点击生成才上传。历史启用后，新提交的账户官方成功任务保存压缩照片与诗词 90 天，可提前永久删除；不保存原图、不回填旧任务。是否已保存以历史接口记录为准，需要长期保留的作品请下载。

工作目录 `website/`，Node.js 20+：

```bash
# 两个上游需分别启动；以下是默认本地端口，不会加载任何 .env。
DASHBOARD_API_URL=http://127.0.0.1:8080/api/v1 \
PICPOET_API_URL=http://127.0.0.1:8081/v1 npm run dev:web
```

打开 <http://127.0.0.1:18090/create.html>。此地址的 Host/Origin 必须与 `WEB_PUBLIC_ORIGIN` 一致（默认 `http://127.0.0.1:18090`），不能混用 localhost。单独的 `npm run dev` 仅预览静态内容，没有 `/web-api` 业务能力。

一键启动前后端联调（推荐）：

```bash
# 工作目录 website/
npm run dev:stack
```

该命令复用 `picpoet/official-dev.sh start --no-gui`，启动 Mailpit、Dashboard API/Web、Picpoet Server、Payments，并纳入 website BFF（`0.0.0.0:18090`）。不启动 Flutter GUI；需要 GUI 时使用独立入口 `npm run dev:stack:gui`。两个入口均无需附加参数。查看状态与停止仍走：

```bash
bash ../picpoet/official-dev.sh status
bash ../picpoet/official-dev.sh stop
```

浏览器可打开 `http://127.0.0.1:18090/create.html` 或 `http://192.168.31.7:18090/create.html`（BFF 同时接受这两个 Origin，不要混用 `localhost`）。注册验证码在联调 Mailpit `http://127.0.0.1:18025` 查看。

若后端已由官方联调启动，仅需启动 website BFF：

```bash
npm run dev:web:official
# 已同步 public/ 时也可执行 npm run start:web:official
```

此入口默认连接 Dashboard `http://127.0.0.1:18080/api/v1` 和 Picpoet `http://127.0.0.1:18081/v1`，不启动或重启后端，不读取任何秘密文件；显式环境变量仍优先。账户与额度属于现有官方联调的 debug 数据库，不是主开发库或生产库。网页端口仍为 18090，请先停止旧网页进程再切换入口。

排查连接时，Dashboard `/health` 应为 200、`/api/v1/picpoet/plans` 应返回套餐数组，Picpoet `/healthz` 应为 204；再检查网页 `/web-api/plans`。仅 `/web-api/session` 返回 200 并不能证明上游连通。真实图片生成会调用模型并消耗相应次数，健康检查与登录验收不代表模型生成已通过。

- `scripts/web-server.mjs` 同时托管 `public/` 和固定 `/web-api` 同源代理；只用用户自己的 JWT / 业务凭证，不需要模型、Dashboard 内部或 payments 服务密钥。
- 账户令牌只在服务端内存中保管，浏览器仅持有 HttpOnly、SameSite=Strict Cookie。HTTPS 时启用 Secure；生产环境要求设置 `NODE_ENV=production` 和 HTTPS `WEB_PUBLIC_ORIGIN`。
- 会话默认 30 分钟固定有效期，进程重启后失效，最多 1000 个；通过 `WEB_SESSION_TTL_MS`、`WEB_MAX_SESSIONS` 调整。首次登录按需新增业务凭证，不撤销其他设备凭证。上游尚无单凭证撤销接口，退出只撤销登录刷新凭证并清除本地会话。
- 浏览器可选择最大 25 MiB 的原图，限制 4000 万像素；本地重编码缩至长边 2048px，压缩后上传仍最多 10 MiB，后端再次校验边界。`WEB_MAX_IMAGE_BYTES` 可降低服务端上传限制；增大不会改变前端限制。
- `WEB_HOST` / `WEB_PORT` 默认为 `127.0.0.1` / `18090`；官方联调栈将 `WEB_HOST` 设为 `0.0.0.0`。`WEB_PUBLIC_ORIGIN` 仍可用；多 Origin 用逗号分隔的 `WEB_PUBLIC_ORIGINS`（例如 `http://127.0.0.1:18090,http://192.168.31.7:18090`）。上游超时 `WEB_UPSTREAM_TIMEOUT_MS` 默认 30000，读取请求超时 `WEB_BODY_TIMEOUT_MS` 默认 15000。
- Dashboard 需开启 Picpoet、邮箱认证与购买功能，配置邮件、独立数据库、支付及可信结算信息；Picpoet Server 需具备官方生成、额度结算和模型服务能力。参考各仓库说明，不向前端配置服务密钥。
- 套餐价格来自服务端；用户明确下单后打开支付宝 PC 网页或 WAP 收银台。跳转不表示到账，通过订单详情和余额确认。重试保留请求编号；会话丢失后从账户订单列表恢复，不盲目重新购买。

### 账户历史：接口与启用前置条件

创作页“我的历史”独立于当前选图、任务和作品。登录后与成功生成后读取列表，支持游标分页、详情、压缩照片、完整诗词、纯诗词分享 PNG 和显式二次确认永久删除。历史以统一账户归属，不局限当前浏览器或某个业务凭证。照片通过同源 Cookie 请求 Blob，缩略图进入视口附近才加载；登出/账户切换会取消请求、清除内容并释放对象 URL，浏览器持久存储不写入历史。

| 网站同源接口 | 官方上游 | 约束 |
| --- | --- | --- |
| `GET /web-api/history?limit=20&cursor=…` | `GET /v1/history` | `limit` 1–100，`cursor` 最长 512 字符，仅允许两个键且各出现一次 |
| `GET /web-api/history/{id}` | `GET /v1/history/{id}` | UUID，返回诗词详情及创建/到期时间 |
| `GET /web-api/history/{id}/image` | `GET /v1/history/{id}/image` | JPEG，最大 2 MiB，独立超时默认 15 秒（`WEB_HISTORY_IMAGE_TIMEOUT_MS`，最大 30 秒） |
| `DELETE /web-api/history/{id}` | `DELETE /v1/history/{id}` | 用户明确确认后发送，成功须返回 `{deleted:true}` |

所有历史接口仅接受已登录会话，BFF 使用该用户的业务 credential，不使用共享服务 token。其他路由仍禁止查询参数。图片代理禁止重定向，独立限制流式字节数和 MIME，不转发 Cookie、认证、缓存标识等上游隐私头；返回 `no-store` / `nosniff`。JSON 仍经过原有 `safeJSON` 脱敏。

**后端未启用时历史返回 503，页面显示“历史尚未启用”，不阻止生成、当前作品下载和购买。** 404/410 表示记录已删除或过期。客户端不会仅凭生成成功宣称历史自动保存。

启用由服务管理员按 [Picpoet Server 历史说明与迁移步骤](../picpoet-server/README.md) 执行：

1. 先备份目标数据库，再按服务端 README 显式应用 `migrations/20261102_history.up.sql`；新建空库按其 `schema.sql` 流程准备。网站启动不会执行迁移。
2. 发布包含历史能力的服务端，先保持 `HISTORY_ENABLED=false`，核实官方生成依赖与数据库可用，并确保队列 worker 全部使用支持历史的新版本。
3. 管理员设置 `HISTORY_ENABLED=true` 后按服务端发布流程重启/滚动更新，再验证上述列表、详情、图片与删除接口。仅启用后新提交的任务开始收录。

停用时保留历史表与新版清理 worker，按服务端 README 处理归档/清理；普通停用不执行破坏性 down 迁移。永久删除清除服务端可读历史与任务结果副本，但数据库备份/WAL 的销毁受运维保留策略约束。本网站实现与自动测试不启动真实后端、不运行数据库迁移、不调用模型或支付。

### 验证与发布边界

```bash
npm test
npm run public:sync
npm run test:browser:create  # 需要 google-chrome；独立 HTTP 替身，不花费模型/支付额度
```

测试覆盖账户会话、原样 multipart、配额查询、任务重试、订单幂等、刷新并发、安全边界，以及 Chrome 375/768/900/1280px 的注册、上传、生成、PNG、购买状态与退出隔离。历史测试覆盖分页白名单、二进制大小/超时/重定向/隐私头、未登录与跨站拦截、列表/详情/分页/PNG 实际下载、原生对话框取消和确认删除、历史 503 不影响创作及登出迟到响应隔离。测试照片由 Canvas 合成。真实邮件、真实模型、沙箱付款和移动系统分享需在配置环境另行验收；测试替身通过不等于真实上游联通。

**现有 ESA 纯静态发布不具备 BFF 能力。** 上线前须为同一官网 origin 的 `/web-api/*` 部署 Node 服务并配置同源路由，或由 Node 服务统一托管官网；反向代理保留公开 Host，API 不缓存。本文不执行线上变更。当前会话为单进程内存，扩容前应建设共享会话存储、可信代理限流和业务凭证生命周期管理；不要仅上传 `public/` 就宣称网页版可用。

字体位于 `assets/fonts/`，附 `OFL.txt`；与客户端 `LXGWWenKai-Regular.ttf` 相同。本次保留完整字体以覆盖任意生成汉字，约 25 MiB，发布前可评估保留完整字形的 WOFF2 压缩。

首页与说明对应当前 Flutter 客户端的单张照片创作、元数据保存、本机历史与分享图流程。下载页分别展示 Android、iOS、HarmonyOS（华为鸿蒙）、Linux、macOS 和 Windows，使用自有 CDN 安装包直链。平台能力与实际发布包区分展示。

## 统一发布清单

`releases/stable.json` 是网站下载页和 Android 升级检查的共同数据源。Android 已提供首版 `0.1.0` ARM64 安装包，其余平台保持“暂未发布”。`artifacts: []` 表示“暂未发布”；接入真实产物后自动展示版本、更新说明、架构、大小与 SHA-256。下载页会推荐可能匹配的系统，用户仍需核对架构。

清单包含 `schemaVersion: 1` 和六项 `platforms`。每个平台包含：

| 字段 | 内容 |
| --- | --- |
| `id` / `name` | 平台标识与显示名称 |
| `minimumSystem` | 已验收系统版本、发行版与架构要求 |
| `versionName` / `versionCode` | 展示版本与机器读取的版本字段，Android 整数由版本自动生成，未发布时为 `null` |
| `publishedAt` | ISO 8601 发布日期，未发布时为 `null` |
| `notes` | 更新说明字符串数组 |
| `artifacts` | 安装包数组，未发布时为空 |

Android 额外提供固定的 `applicationId: org.picpoet.app.android` 与 `minSdk`。每个安装包包含 `arch`、`format`、`url`、`sha256`、`sizeBytes`。`url` 使用不含凭据、可公开访问的 HTTPS CDN 绝对地址；安装包上传完成后再加入清单。`sha256` 是最终签名安装包的 64 位十六进制校验值，`sizeBytes` 为实际字节数。更新说明按纯文本展示。

Android 当前已验证产物为 `arm64-v8a` / `apk`，仅在完整引擎及安装验收通过后声明其他 ABI。其余平台按最终构建填写实际架构；iOS 支持 `ipa`，HarmonyOS 支持 `hap` / `app`，Linux 支持 `tar.gz` / `AppImage` / `deb` / `rpm` / `zip`，macOS 支持 `dmg` / `pkg` / `zip`，Windows 支持 `exe` / `msi` / `zip`。包格式受支持表示页面可分发该格式，不代表当前已经生成该产物。

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

### Website 联调端口冲突处理

网站默认端口为 `18090`。一键联调启动时若该端口被占用，仅向当前用户的 TCP 监听进程发送 TERM，等待 5 秒后仍未退出则发送 KILL；不会终止整个进程组。其他用户的进程、无法识别或回收后仍占用的端口会报错，保留现场。此操作可能中断同一用户的其他项目；仅 website 端口启用此策略，其他后端端口继续保留占用进程。需要 Linux pidfd 支持及 `lsof`。已受管理且健康的 website 进程正常复用。旧 `8090` 进程不受影响。
