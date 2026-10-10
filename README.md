# 千千静听 · 个人版定制

拟物化的静态配置生成器，部署在 **https://ttplayerrebuild.github.io/**。

- 输入个人名称，下载新建的 `TTPlayer.xml` 或 `TTPlayerRebuild.xml`。
- 也可选择或拖入已有配置，只修改 `<Player>` 的 `UserWord` 与 `UserWordMD5`。
- 自动读取已有的有效个人名称；导入后清空名称可取消个人定制。
- 实时预览原版“xxx 个人版”及社区版关于页“社区版 献给 xxx”。
- 主窗口按原版/社区版分别显示完整版本和个人名称；社区版使用日期版本，支持 `p1` 后缀。
- 超长信息按播放器规则往返滚动，社区版献辞单行省略；展开预览设置可查看全文和选择实际版本。
- 将 `.skn` 拖入左侧预览区或点击“选择皮肤”，按皮肤图片、位置、字体与透明色预览；可恢复默认。
- 文件和名称仅在浏览器内处理，不上传、不持久化保存，无第三方脚本、字体或统计。
- 适配桌面与手机，支持键盘操作及减少动态效果的系统偏好。

## 使用

使用现代浏览器打开网站，选择配置（可选）、输入名称，点击“生成并下载”。
退出播放器，备份正在使用的 XML，将下载文件放回该配置的位置，然后重启播放器。
检查浏览器是否在下载文件名中追加了 `(1)` 等后缀。

上传原配置可保留已有设置；新建配置只包含个人名称。不同版本的原版播放器是否显示
个人版取决于其自身支持，已分析的 5.0.1、5.7.9 使用这一格式。社区版需支持个人定制功能的版本。
原版 5.0.1 的旧定制 Cookie 可能优先于 XML，详见播放器仓库的个人版分析文档。

## 本地运行

```sh
npm run dev
```

访问 `http://127.0.0.1:4173/`。仅需 Node.js 22 或更新版本，无 npm 依赖安装步骤。
不要直接以 `file://` 打开 HTML：模块和本地编码表需要 HTTP 服务。

```sh
npm run build
```

输出位于 `dist/`。构建只复制 `public/` 中明确列出的站点文件，不打包测试、源码工具或配置样本。

## GitHub Pages

仓库：`TTPlayerRebuild/TTPlayerRebuild.github.io`。

在仓库 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。
推送到 `master` / `main`，或手动运行 `Deploy personal edition website`，即可构建并部署。
工作流位于 `.github/workflows/pages.yml`，构建产物为 `dist/`，不运行测试。
所有站内资源使用相对路径，也可部署到 GitHub Pages 项目子目录。

## 配置兼容

1. 名称去除两端空白和控制字符，最多 64 个 UTF-16 单元。
2. 按 Windows CP936 / GBK 编码，不使用问号替代不支持的字符。
3. 对字节 `0x5C` 双写转义，包括 GBK 双字节字符的尾字节。
4. `UserWord` 是转义字节的 URL 百分号编码；仅字母、数字、`-_.` 不编码。
5. `UserWordMD5` 为 `MD5(转义字节 + ASCII("tt#$(@#*$!2")))` 的小写十六进制。
   MD5 用于匹配原播放器格式，不用于安全认证。
6. 清空时两个属性都写为空字符串，不增加 `PersonalName` 等其它字段。

编码表 `public/assets/cp936.bin` 由 Windows NLS API 生成，约 47 KB，无运行时依赖。
在 Windows 上使用 `python scripts/generate-cp936.py` 可重建。
MD5 为本项目依 RFC 1321 实现的本地代码。

支持 UTF-8（含 BOM）、UTF-16 LE / BE 和 GBK / GB2312 输入，输出统一为 UTF-8。
导入限制为 2 MB；检查 XML 结构，拒绝 DTD / 实体声明、错误根节点和多个直接子级 Player。
更新时保留注释、其它节点、原属性顺序和缩进；仅必要时更新 XML 声明的编码。
不通过 HTML 插入名称或文件内容。

## 视觉

参考 [853 的页面](https://page.853lab.com/) 的玻璃高光、立体按钮和深色氛围。
本站外围布局和图标以 HTML、CSS、SVG 绘制，未引用参考站图片。
播放器预览使用用户指定的 `DEFAULT_SKIN_579.skn`（TT.experience，作者 TTplayer）
原始位图及播放器图标，按 `Skin.xml` 的 327 × 141 坐标组合，保留原始像素和透明色。
通过 `python scripts/extract-default-skin.py` 重建预览资源（仅重建时需要 Pillow）。
预览是个人名称展示示意，不运行音频播放；按钮为皮肤图片，不提供播放或关闭操作。
皮肤及播放器图标权利归原作者所有。

版本规则、长名称修正、验证范围及 SKN 拖放预览可行性见
[预览兼容分析](docs/PREVIEW_PARITY_AND_SKN.md)。SKN 只影响网页主窗口预览，不修改 XML 皮肤路径。

SKN 解压与图片处理在本地 Worker 中执行，需要支持 `DecompressionStream('deflate-raw')`
和 `OffscreenCanvas` 的现代浏览器。支持第 2 版 SKN、stored/deflate ZIP、旧式 Skin.xml、
BMP/PNG/JPEG/GIF 和常见 ICO；预览是静态空闲状态，不运行皮肤动画或播放器按钮。
皮肤上限 8 MB；不支持的压缩图像或损坏的主背景会显示错误并保留原预览。

本地回归测试保存在相邻播放器工作区 `rebuild/tests/website/`，不提交到此仓库、不由 Actions 执行。
