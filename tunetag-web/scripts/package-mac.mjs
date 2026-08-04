#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const options = { arch: 'arm64', slim: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--slim') {
      options.slim = true;
      continue;
    }
    if (arg === '--arch') {
      options.arch = String(argv[index + 1] || 'arm64');
      index += 1;
      continue;
    }
    if (arg.startsWith('--arch=')) {
      options.arch = arg.slice('--arch='.length);
    }
  }
  return options;
}

function run(command, args, extraOptions = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: false,
    ...extraOptions
  });

  if (result.status !== 0) {
    const label = [command, ...args].join(' ');
    throw new Error(`Command failed: ${label}`);
  }
}

function findElectronZipDir(electronVersion, arch) {
  const cacheRoot = path.join(os.homedir(), 'Library', 'Caches', 'electron');
  const zipName = `electron-v${electronVersion}-darwin-${arch}.zip`;
  const finder = spawnSync('find', [cacheRoot, '-type', 'f', '-name', zipName], {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: false
  });

  if (finder.status !== 0) {
    return '';
  }

  const match = String(finder.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  return match ? path.dirname(match) : '';
}

function buildIgnorePatterns(arch) {
  // 仅排除「其他平台」的 ffprobe 原生二进制，保留当前 arch 的 darwin/${arch}/ffprobe。
  // 注意:之前用负向预查 (?!darwin/${arch}/ffprobe$) 会把本平台二进制也误排除，导致 asar 内无 ffprobe。
  // 改用显式锚定模式，不含预查，行为可预期。
  const otherPlatformBinaries = [
    '^/node_modules/ffprobe-static/bin/linux',
    '^/node_modules/ffprobe-static/bin/win32',
    '^/node_modules/ffprobe-static/bin/darwin/x64'
  ];
  return [
    '^/release($|/)',
    '^/release[^/]+($|/)',
    ...otherPlatformBinaries,
    '^/node_modules/ffprobe-static/tests',
    '^/node_modules/.*/test',
    '^/node_modules/.*/tests',
    '^/node_modules/.*/docs'
  ];
}

async function packageApp({ arch, slim, electronZipDir }) {
  const outDir = slim ? 'release-slim' : 'release';
  // 通过 JS API 调用 electron-packager:
  // - asar 对象形式的 unpack 解包原生二进制(.node / ffmpeg / ffprobe)到 app.asar.unpacked，
  //   使其可被 spawn 执行。注意 electron-packager 20 不识别 asarUnpack 选项(会被静默忽略)，
  //   只能用 asar:{unpack:'单条 minimatch glob'} 形式；glob 用 {} 组合多模式。
  // - osxSign:false 彻底禁用内部签名(本机无 Developer ID 证书会失败)，
  //   改由 signApp() 用 codesign 手动 adhoc 签名并应用 entitlements(无需证书、无需公证)。
  const options = {
    dir: projectRoot,
    name: 'TuneTag',
    platform: 'darwin',
    arch,
    out: outDir,
    overwrite: true,
    icon: 'electron/assets/app-icon.icns',
    appBundleId: 'com.citoma.tunetag',
    extendInfo: 'electron/extend-info.plist',
    electronZipDir,
    ignore: buildIgnorePatterns(arch).map((p) => new RegExp(p)),
    asar: {
      unpack: '{**/{.**,**}/**/*.node,**/ffmpeg-static/ffmpeg,**/ffprobe-static/bin/**}'
    },
    osxSign: false
  };
  await packager(options);
}

function signApp({ arch, slim }) {
  const outDir = slim ? 'release-slim' : 'release';
  const appPath = path.join(projectRoot, outDir, `TuneTag-darwin-${arch}`, 'TuneTag.app');
  const entitlementsPath = path.join(projectRoot, 'electron', 'entitlements.plist');
  // adhoc 签名('-' 表示无证书) + entitlements,--deep 递归签主进程与所有 Helper 子进程,
  // 赋予 allow-jit 等授权,修复 Apple Silicon 上渲染进程 JIT 初始化 SIGTRAP 崩溃(打开闪退)。
  // 无需 Apple 证书、无需公证,符合官网直接分发。
  run('codesign', ['--force', '--deep', '--sign', '-', '--entitlements', entitlementsPath, appPath]);
}

function createDmg({ arch, slim }) {
  const outDir = slim ? 'release-slim' : 'release';
  const stagingDir = path.join(projectRoot, outDir, 'dmg-staging');
  const appDir = path.join(projectRoot, outDir, `TuneTag-darwin-${arch}`, 'TuneTag.app');
  const dmgName = slim
    ? (arch === 'arm64' ? 'TuneTag-slim.dmg' : 'TuneTag-slim-x64.dmg')
    : (arch === 'arm64' ? 'TuneTag.dmg' : 'TuneTag-x64.dmg');
  const dmgPath = path.join(projectRoot, outDir, dmgName);

  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });
  fs.cpSync(appDir, path.join(stagingDir, 'TuneTag.app'), { recursive: true });

  const applicationsLink = path.join(stagingDir, 'Applications');
  try {
    fs.rmSync(applicationsLink, { force: true });
  } catch {
    // ignore
  }
  fs.symlinkSync('/Applications', applicationsLink);
  fs.rmSync(dmgPath, { force: true });

  run('hdiutil', ['create', '-volname', 'TuneTag', '-srcfolder', stagingDir, '-ov', '-format', 'UDZO', dmgPath]);
  return dmgPath;
}

async function main() {
  const { arch, slim } = parseArgs(process.argv.slice(2));
  if (!['arm64', 'x64'].includes(arch)) {
    throw new Error(`Unsupported arch: ${arch}`);
  }

  const electronVersionPath = path.join(projectRoot, 'node_modules', 'electron', 'package.json');
  const electronVersion = JSON.parse(fs.readFileSync(electronVersionPath, 'utf8')).version;
  const electronZipDir = findElectronZipDir(electronVersion, arch);

  if (!electronZipDir) {
    throw new Error(`Electron cache not found for v${electronVersion} darwin-${arch}`);
  }

  await packageApp({ arch, slim, electronZipDir });
  signApp({ arch, slim });
  const dmgPath = createDmg({ arch, slim });
  console.log(`created: ${dmgPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
