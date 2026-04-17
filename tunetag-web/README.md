# 乐签 TuneTag

TuneTag 是一个面向 macOS 的本地媒体标签编辑工具（Electron + React）。

## 当前能力

- 拖拽/选择导入：支持文件与目录导入
- 支持格式：`MP3`、`FLAC`、`WAV`、`M4A`
- 单文件编辑：标题、艺术家、专辑、年份、曲目号、流派、歌词、备注、自定义来源
- 批量编辑：支持多选后统一填写并保存
- 封面处理：支持 MP3 封面选择/删除
- 保存流程：支持同名覆盖 / 保留新副本 / 跳过（可“全部应用”）
- 导出后定位：状态栏可一键在 Finder 中定位导出文件
- 中英双语：随系统语言自动切换

## 设计边界

TuneTag 一期是“标签编辑工具”，不做播放器与媒体库管理。

- 不做在线播放
- 不做自动抓取元数据
- 不做云同步与账号系统
- 不做复杂媒体整理规则

## 开发启动

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## 打包（macOS）

```bash
npm run dist:mac
# 或瘦身包
npm run dist:mac:slim
```

## 技术栈

- Electron
- React + TypeScript
- Vite
- ffmpeg / ffprobe
- music-metadata
- node-id3

## 许可证

MIT
