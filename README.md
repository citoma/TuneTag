# 乐签 TuneTag

TuneTag 是一款面向 macOS 的本地媒体标签编辑工具，聚焦一件事：

**把一批音频文件拖进来，然后快速修改标签信息。**

> 当前仓库主开发目录：`tunetag-web`（Electron + React + TypeScript）

## 下载与运行

当前仓库提供源码，建议本地打包后运行：

```bash
cd tunetag-web
npm install
npm run build
npx @electron/packager . TuneTag \
  --platform=darwin \
  --arch=arm64 \
  --overwrite \
  --icon=electron/assets/app-icon.icns \
  --out=release \
  --app-bundle-id=com.citoma.tunetag
open release/TuneTag-darwin-arm64/TuneTag.app
```

## 界面预览

### Logo

![TuneTag Logo](docs/screenshot/logo.png)

### 空状态

![空状态](docs/screenshot/empty.png)

### 主工作区

![主工作区](docs/screenshot/workspace.png)

## 产品定位

- 轻量本地工具，不是媒体库管理器
- 以批量标签编辑为核心，不做播放能力
- 面向中文场景，强调直接、清晰、可控

## 当前已实现能力（V1）

- 批量拖拽导入：文件 / 多文件 / 文件夹
- 文件列表：多选、全选、状态标记
- 单文件编辑：标题、艺术家、专辑、年份、曲目号、原始标签（如 WOAS / COMM）
- 批量编辑：统一设值 + 按规则清空
  - 标题、艺术家留空：不修改
  - 其他字段留空：写入空值
- 封面处理：读取内嵌封面、替换封面、删除封面
- 保存写入：保存进度、成功/失败结果、失败详情
- 同名保存冲突处理：覆盖 / 保留两者 / 跳过
- 外链跳转：系统浏览器打开（非内置浏览）

## 支持格式

- `MP3`
- `FLAC`
- `WAV`
- `M4A`

## 技术栈

- Electron
- React 19
- TypeScript
- Vite
- ffmpeg / ffprobe
- music-metadata
- node-id3

## 核心交互闭环

`拖入文件 -> 列表展示 -> 单选/多选 -> 编辑标签 -> 保存写入`

## 本地开发

### 1. 安装依赖

```bash
cd tunetag-web
npm install
```

### 2. 启动开发环境

```bash
npm run dev
```

会同时启动：

- Vite 开发服务（`5173`）
- Electron 桌面应用

### 3. 构建前端

```bash
npm run build
```

## 打包 macOS App

在 `tunetag-web` 目录执行：

```bash
npx @electron/packager . TuneTag \
  --platform=darwin \
  --arch=arm64 \
  --overwrite \
  --icon=electron/assets/app-icon.icns \
  --out=release \
  --app-bundle-id=com.citoma.tunetag
```

产物默认在：

`tunetag-web/release/TuneTag-darwin-arm64/TuneTag.app`

## 常见问题（FAQ）

### 1) 为什么打包后页面空白？

- 请确认 `vite.config.ts` 中 `base` 为 `./`
- 重新执行 `npm run build` 后再打包

### 2) 同名文件保存时会怎样？

- 会弹出冲突处理对话框：`覆盖 / 保留两者 / 跳过`

### 3) 批量编辑留空规则是什么？

- 标题、艺术家留空：不修改
- 其他字段留空：清空写入

### 4) 为什么链接不是应用内打开？

- 外链已强制走系统浏览器，避免内置网页窗口干扰编辑流程

## 项目结构

```text
TuneTag/
├── tunetag-web/             # 主应用（Electron + React）
│   ├── electron/            # 主进程、预加载、桌面能力
│   ├── src/                 # 前端 UI 与交互逻辑
│   ├── public/              # 静态资源
│   └── release/             # 本地打包产物（已忽略）
├── TuneTagMac/              # 早期原生尝试/预研目录
├── design/                  # 设计稿与素材
├── docs/                    # 设计与文档
└── prototype/               # 原型实验
```

## 已明确不做（当前阶段）

- Web 端正式产品
- Windows 端
- 在线播放
- 歌词编辑
- 自动抓取元数据
- 云同步 / 账号系统
- 复杂媒体库管理

## Roadmap

- [ ] 增加发布页（GitHub Releases）
- [ ] 提供 DMG 安装包
- [ ] 增加更多可编辑标签字段映射说明
- [ ] 批量规则模板保存（预设）
- [ ] 国际化（中英双语 UI）

## License

当前仓库未单独声明 License。如需开源协议（MIT/Apache-2.0 等），可在根目录补充 `LICENSE` 文件。
