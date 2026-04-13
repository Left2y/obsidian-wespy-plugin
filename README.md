# Obsidian WeSpy Plugin

一个用于把微信公众号文章保存到 Obsidian，并把文章图片下载到本地 vault 的桌面端插件。

它的核心目标很明确：解决 Obsidian Web Clipper 剪藏微信文章时图片丢失、变成远程链接、或者被替换成 1px 占位 SVG，导致离线后无法查看的问题。

当前插件名：`WeChat Offline Importer`

当前插件 ID：`obsidian-wechat-importer`

当前版本：`1.0.3`

## 适合谁用

- 你主要用 Obsidian Web Clipper 剪藏微信文章。
- 你希望图片保存到 vault 里，离线也能查看。
- 你不介意图片占用本地或 NAS 存储空间。
- 你希望旧的剪藏笔记也能从原始 `source` 链接重新补图。

## 它解决了什么问题

微信文章里的图片通常不是普通 `<img src="...">`，而是懒加载的 `data-src`，还会带微信 CDN 参数和防盗链限制。

常见现象：

- Web Clipper 只保存正文，图片没有下载。
- 笔记里只剩少量 `mmbiz.qpic.cn` 远程图片链接。
- 图片被 Web Clipper 保存成 `data:image/svg+xml` 的 1px 占位图。
- 在线时偶尔能看，离线后图片全部不可用。

本插件的处理方式：

- 读取笔记 frontmatter 或正文里的 `https://mp.weixin.qq.com/...` 原文链接。
- 重新请求微信公众号原文页面。
- 从微信正文区域提取真实图片地址，包括 `data-src`、`data-original`、`data-actualsrc`。
- 带微信移动端 UA 和 Referer 下载图片。
- 用 Obsidian 本地附件链接替换原来的远程图片。
- 对 Web Clipper 已经漏掉的图片，直接从原文重建正文。

## 安装方式

推荐直接下载打包好的版本，不需要 Node.js，也不需要 `npm install` 或 `npm run build`。

1. 打开 Release 页面。
2. 下载 `obsidian-wechat-importer.zip`。
3. 解压后得到 `obsidian-wechat-importer` 文件夹。
4. 把这个文件夹复制到你的 vault 插件目录：

```text
<你的 Vault>/.obsidian/plugins/obsidian-wechat-importer/
```

5. 打开 Obsidian。
6. 进入 `设置 -> 第三方插件`。
7. 启用 `WeChat Offline Importer`。

Release 地址：

- GitHub: https://github.com/Left2y/obsidian-wespy-plugin/releases/tag/v1.0.3

如果你是直接覆盖旧版本，请重启 Obsidian，或者至少在第三方插件里关闭再重新打开 `WeChat Offline Importer`。Obsidian 不会自动重新加载已经运行中的插件代码。

## 和 Obsidian Web Clipper 怎么接

插件不会修改浏览器里的 Web Clipper 扩展。它是在 Obsidian 侧监听新建或修改的笔记。

推荐流程：

1. 用 Obsidian Web Clipper 正常剪藏微信文章。
2. 确保剪藏笔记保存到监听目录，例如 `📚 Sources` 或 `Clippings`。
3. 确保笔记里保留原文链接，最好放在 frontmatter 的 `source` 字段。
4. 插件检测到新笔记后，会自动从 `source` 重新抓取微信原文并下载图片。

推荐 Web Clipper frontmatter 至少包含：

```yaml
---
title: "{{title}}"
source: "{{url}}"
created: "{{date}}"
tags:
  - clippings
---
```

只要 `source` 指向 `https://mp.weixin.qq.com/...`，插件就能识别这是一篇微信文章。

## 命令说明

在 Obsidian 命令面板里可以使用这些命令：

- `Import article from link`：手动粘贴一个微信公众号文章链接，导入成新笔记。
- `Import article from clipboard`：从剪贴板读取微信公众号文章链接，导入成新笔记。
- `Download external images in current note`：下载当前笔记里已经存在的远程图片链接。
- `Rebuild current note from source`：从当前笔记的 `source` 重新抓取微信原文，重建正文并下载图片。

最常用的是 `Rebuild current note from source`。如果 Web Clipper 已经把图片漏掉或替换成 1px SVG，仅仅运行 `Download external images in current note` 没用，因为笔记里已经没有真实图片链接了。

## 设置项

进入 `设置 -> WeChat Offline Importer` 可以配置：

- `Import folder`：手动导入新文章时的默认保存目录。
- `Prefix published date`：文件名是否加上发布日期前缀。
- `Open note after import`：导入完成后是否自动打开笔记。
- `Auto-localize clipped notes`：是否自动处理 Web Clipper 新建或修改的笔记。
- `Rebuild clips from source`：是否从原始微信文章链接重建正文，用于恢复 Web Clipper 漏掉的图片。
- `Watched folders`：监听目录，一行一个目录。默认监听 `📚 Sources` 和 `Clippings`。

## 推荐使用方式

### 新剪藏的微信文章

1. 用 Web Clipper 正常剪藏。
2. 保存到 `📚 Sources` 或 `Clippings`。
3. 等几秒钟，插件会自动处理。
4. 处理成功后，笔记里的图片应该变成本地 Obsidian embed，例如 `![[image 1.webp]]`。

### 已经剪藏过但图片丢失的旧笔记

1. 打开那篇旧笔记。
2. 确认 frontmatter 里有 `source: "https://mp.weixin.qq.com/..."`。
3. 打开命令面板。
4. 运行 `Rebuild current note from source`。
5. 等待下载完成。

### 不通过 Web Clipper，直接导入微信文章

1. 复制微信公众号文章链接。
2. 打开 Obsidian 命令面板。
3. 运行 `Import article from clipboard`。
4. 插件会创建一篇新笔记并下载图片。

## 排障

### 重新抓取后还是没图

先判断笔记里是什么情况：

- 如果图片是 `data:image/svg+xml`，说明 Web Clipper 保存的是占位图，不是真图。请运行 `Rebuild current note from source`。
- 如果笔记里只有 1 张远程图，说明 Web Clipper 已经漏掉了大部分图片。请运行 `Rebuild current note from source`。
- 如果笔记里有很多 `https://mmbiz.qpic.cn/...`，可以运行 `Download external images in current note`。

### 自动处理没有触发

检查这几项：

- Obsidian 是否已经重新加载过插件。
- 笔记是否在 `Watched folders` 里配置的目录下。
- 笔记里是否有 `source: "https://mp.weixin.qq.com/..."`。
- 设置里的 `Auto-localize clipped notes` 是否开启。
- 设置里的 `Rebuild clips from source` 是否开启。

插件会写一个简单调试日志：

```text
<你的 Vault>/.obsidian/plugins/obsidian-wechat-importer/debug.log
```

如果你覆盖了新版插件但日志没有 `loaded`，说明 Obsidian 还没有加载新版插件，需要重启 Obsidian 或重新启用插件。

### 微信文章仍然失败

可能原因：

- 文章需要登录态或特殊访问环境。
- 微信页面结构变化。
- 网络环境无法访问 `mp.weixin.qq.com` 或 `mmbiz.qpic.cn`。
- 文章被删除或下架。

这类情况插件会尽量保留原文内容或原始链接，不会故意删除已有笔记文件。

## 本地图片保存在哪里

插件使用 Obsidian 的附件路径逻辑创建图片文件，所以实际位置取决于你的 Obsidian 附件设置。

如果你的 vault 附件默认存到当前文件夹、统一附件目录或指定子目录，插件会跟随 Obsidian 的规则。

## 当前限制

- 只支持桌面端 Obsidian。
- V1 只支持直接的 `mp.weixin.qq.com` 微信文章链接。
- 不修改浏览器 Web Clipper 扩展，只在 Obsidian 里处理已经创建的笔记。
- 对需要登录态、访问受限或页面结构变化的微信文章，不保证 100% 成功。
- 自动处理主要面向新建或最近修改的笔记；旧笔记建议手动运行 `Rebuild current note from source`。

## 开发

如果你要改源码：

```bash
npm install
npm run build
npm run lint
```

构建产物：

```text
main.js
manifest.json
styles.css
release/obsidian-wechat-importer.zip
```

本仓库刻意提交了 `main.js` 和 `release/`，目的是让下载源码或 release 的用户可以直接安装，不依赖本地 npm 构建。

## 仓库

- GitHub: https://github.com/Left2y/obsidian-wespy-plugin
