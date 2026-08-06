# PROGRESS.md — TuneTag

> 工作流：上班打卡读 PROGRESS.md / DECISIONS.md → make check；下班打卡更新 PROGRESS.md → make check → 提交。
> 注：本仓库尚未建立 Makefile 与 `make check` 目标，仓库一致性以 `git status` 干净 + 已推送为准。

## 当前状态（2026-08-06）

### 已完成
- **macOS 26（Apple Silicon）启动闪退修复并发布 v1.5.0**
  - 根因（已用 `~/Library/Logs/DiagnosticReports/*.ips` 崩溃报告确认）：Chromium 辅助进程（GPU/工具进程）沙箱限制 V8 的 JIT 可执行内存映射，helper 进程在 `v8::V8::EnableWebAssemblyTrapHandler` 初始化时触发 `EXC_BREAKPOINT`/`SIGTRAP` 崩溃；主进程不受沙箱隔离故正常。此前 entitlement/Hardened Runtime 推断为误诊（签名与 runtime 均有效）。
  - 修复：`main.mjs` 启动早期 `app.commandLine.appendSwitch('no-sandbox')` + `disable-gpu-sandbox`。
  - `package.json` 版本 `0.1.0 → 1.5.0`，对齐 GitHub Release 版本号。
  - 清理了上一轮临时加入的崩溃诊断日志代码（`tunetag-crash.log`）。
- **发布 GitHub Release 1.5**（Latest，已 published），上传 `TuneTag.dmg`（arm64，约 184 MB，含 `--options runtime` 签名）。
- **官网下载页更新**：`website/index.html` 下载体积文案 `150 MB → 180 MB`（链接本身直连 `latest/download/TuneTag.dmg`，已随 Latest 自动生效）。
- 提交并推送：`43a0ef1`（main.mjs / package.json / website/index.html）至 `origin/main`。

### 仓库一致性
- `git status` 干净，已推送至 `origin/main`，最新提交 `43a0ef1`。
- 本地构建产物：`tunetag-web/release/TuneTag.dmg`（16:01 重建，含 no-sandbox 修复，无诊断残留，签名 runtime）。

## 下一步
1. ~~**官网部署（Cloudflare Pages）**：tunetag.keecheer.com 为独立 Cloudflare Pages 项目 `tunetag`（Git Provider: No，无 git 联动，靠 `wrangler pages deploy` 上传）。已用 wrangler 将本地 `website/` 部署上线，线上文案已从「约 150 MB」更新为「约 180 MB」（部署 ID 229fd3cb，HTTP 200 验证通过）。~~ ✅ 已完成。
2. **观察反馈**：收集用户升级到 1.5 后在 macOS 26 的实际运行反馈，确认无回归。
3. **长期待办**：本仓库尚无 Makefile / `make check` 目标、无 PROGRESS/DECISIONS 历史文件；若需要规范化工作流，可补建。
4. **Electron 升级（备选）**：若后续大版本 macOS 仍出现同类崩溃，可考虑升级 Electron 37.10.3（V8 版本偏旧）。本次 no-sandbox 已规避，暂不必动。

## 关键决策记录
- 分发策略：官网/GitHub Releases 提供 dmg，adhoc 签名、不公证（用户决策）。首次打开若提示「已损坏」，需 `xattr -dr com.apple.quarantine /Applications/TuneTag.app`。
- macOS 崩溃定位方法：读 `~/Library/Logs/DiagnosticReports/*.ips`（JSON 格式，需用 raw_decode 解析第二份 JSON），比应用内日志更权威。
