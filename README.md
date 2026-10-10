# Picpoet website

Picpoet 的公开网站，集中维护产品使用说明、定价信息和下载入口。

## 本地预览

要求 Python 3：

```bash
npm run dev
```

打开 <http://localhost:8080>。

## 页面

- `/index.html`：产品首页
- `/docs.html`：使用说明
- `/pricing.html`：定价
- `/downloads.html`：下载资源

下载入口指向统一 Flutter 客户端 `picpoet-org/picpoet` 的 GitHub Releases，客户端覆盖 Android、OpenHarmony、Linux、macOS 和 Windows。CLI 源码位于 `picpoet-org/picpoet-cli`。

## 品牌资产

统一品牌资产位于 `assets/`，包含网页 SVG 图标、Wordmark、PNG 和 Windows ICO。页面使用 `picpoet-mark.svg` 作为 favicon 和导航图标。

## ESA Pages

网站使用根目录的 `esa.jsonc` 配置 ESA Pages，静态资源目录为 `public`。部署前将页面资源同步到 `public`，然后在项目目录执行：

```bash
esa-cli deploy --assets ./public --name picpoet-website --environment production
```

`jqknono.com/pages/*` 通过 ESA 路由指向该 Pages 项目。
