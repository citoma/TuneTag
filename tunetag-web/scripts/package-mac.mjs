#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
  const keepBinaryPattern = `^/node_modules/ffprobe-static/bin/(?!darwin/${arch}/ffprobe$)`;
  return [
    '^/release($|/)',
    '^/release[^/]+($|/)',
    keepBinaryPattern,
    '^/node_modules/ffprobe-static/tests',
    '^/node_modules/.*/test',
    '^/node_modules/.*/tests',
    '^/node_modules/.*/docs'
  ];
}

function packageApp({ arch, slim, electronZipDir }) {
  const outDir = slim ? 'release-slim' : 'release';
  const args = [
    path.join(projectRoot, 'node_modules', '.bin', 'electron-packager'),
    '.',
    'TuneTag',
    '--platform=darwin',
    `--arch=${arch}`,
    '--overwrite',
    '--icon=electron/assets/app-icon.icns',
    `--out=${outDir}`,
    '--app-bundle-id=com.citoma.tunetag',
    '--extend-info=electron/extend-info.plist',
    `--electron-zip-dir=${electronZipDir}`
  ];

  for (const pattern of buildIgnorePatterns(arch)) {
    args.push(`--ignore=${pattern}`);
  }

  run(args[0], args.slice(1));
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

  packageApp({ arch, slim, electronZipDir });
  const dmgPath = createDmg({ arch, slim });
  console.log(`created: ${dmgPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
