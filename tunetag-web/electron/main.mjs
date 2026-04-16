import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseFile } from 'music-metadata';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import NodeID3 from 'node-id3';

const SUPPORTED_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.m4a']);
const WRITABLE_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.m4a']);
const FFPROBE_PATH = ffprobeStatic?.path;
const WAV_SOURCE_PREFIX = '[TuneTagSource] ';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    title: 'TuneTag',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const devUrl = 'http://localhost:5173';
  const prodPath = path.join(__dirname, '..', 'dist', 'index.html');
  const isDev = !app.isPackaged;

  if (isDev) {
    let retries = 0;
    const maxRetries = 20;

    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      if (retries >= maxRetries) {
        console.error(`[TuneTag] dev load failed: ${errorCode} ${errorDescription}`);
        return;
      }
      retries += 1;
      const delayMs = 200 + retries * 150;
      console.warn(`[TuneTag] retry load (${retries}/${maxRetries}) in ${delayMs}ms`);
      setTimeout(() => {
        mainWindow.loadURL(devUrl).catch((error) => {
          console.error('[TuneTag] retry load error:', error);
        });
      }, delayMs);
    });

    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      if (level <= 2) {
        console.error(`[Renderer:${level}] ${sourceId}:${line} ${message}`);
      }
    });

    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      console.error('[TuneTag] renderer process gone:', details);
    });

    mainWindow.loadURL(devUrl).catch((error) => {
      console.error('[TuneTag] initial dev load error:', error);
    });
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  if (!existsSync(prodPath)) {
    throw new Error(`未找到生产构建文件: ${prodPath}`);
  }

  mainWindow.loadFile(prodPath);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

async function collectMediaFiles(inputPaths) {
  const output = [];
  const skipped = [];
  const seen = new Set();

  async function walk(currentPath) {
    let stat;
    try {
      stat = await fs.stat(currentPath);
    } catch {
      skipped.push({ path: currentPath, reason: '文件不可访问' });
      return;
    }

    if (stat.isDirectory()) {
      let entries = [];
      try {
        entries = await fs.readdir(currentPath, { withFileTypes: true });
      } catch {
        skipped.push({ path: currentPath, reason: '目录不可访问' });
        return;
      }
      await Promise.all(entries.map((entry) => walk(path.join(currentPath, entry.name))));
      return;
    }

    if (!stat.isFile()) return;

    const ext = path.extname(currentPath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      skipped.push({ path: currentPath, reason: '格式不支持' });
      return;
    }

    const normalized = path.resolve(currentPath);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    output.push(normalized);
  }

  await Promise.all(inputPaths.map((p) => walk(p)));
  return { files: output, skipped };
}

function toTrackNo(track) {
  if (!track?.no && !track?.of) return '';
  if (track.no && track.of) return `${track.no}/${track.of}`;
  if (track.no) return String(track.no);
  return `/${track.of}`;
}

function readCommentTag(parsed) {
  const common = parsed?.common ?? {};
  if (Array.isArray(common.comment) && common.comment.length) {
    const value = String(common.comment[0] ?? '').trim();
    if (value) return value;
  }

  const native = parsed?.native ?? {};
  const candidates = ['COMM', 'COMMENT', '©cmt', '----:com.apple.iTunes:COMMENT', 'TXXX:COMMENT'];

  for (const group of Object.values(native)) {
    for (const tag of group || []) {
      const id = String(tag?.id || '');
      if (!candidates.includes(id)) continue;
      const value = toDisplayValue(tag?.value);
      if (value) return value;
    }
  }

  return '';
}

function readSourceTag(parsed) {
  const common = parsed?.common ?? {};
  if (typeof common.source === 'string' && common.source.trim()) {
    return common.source.trim();
  }

  const native = parsed?.native ?? {};
  const candidates = ['SOURCE', 'TSRC', 'TXXX:SOURCE', 'TXXX:Source', '----:com.apple.iTunes:SOURCE'];

  for (const group of Object.values(native)) {
    for (const tag of group || []) {
      const id = String(tag?.id || '');
      if (!candidates.includes(id)) continue;

      const value = tag?.value;
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (Array.isArray(value) && value.length) {
        const first = value[0];
        if (typeof first === 'string' && first.trim()) return first.trim();
      }
    }
  }

  return '';
}

function readNativeFirst(parsed, ids) {
  const native = parsed?.native ?? {};
  for (const group of Object.values(native)) {
    for (const tag of group || []) {
      const id = String(tag?.id || '');
      if (!ids.includes(id)) continue;
      const value = toDisplayValue(tag?.value);
      if (value) return value;
    }
  }
  return '';
}

function toDisplayValue(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => toDisplayValue(item)).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text.trim();
    if (typeof value.no === 'number' && typeof value.of === 'number') return `${value.no}/${value.of}`;
    if (typeof value.no === 'number') return String(value.no);
    return '';
  }
  return '';
}

function pictureToDataUrl(picture) {
  if (!picture || !picture.data) return '';
  const mime = typeof picture.format === 'string' && picture.format ? picture.format : 'image/jpeg';
  try {
    const buffer = Buffer.isBuffer(picture.data) ? picture.data : Buffer.from(picture.data);
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return '';
  }
}

function extFromMime(mime) {
  const normalized = String(mime || '').toLowerCase();
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('gif')) return 'gif';
  return 'jpg';
}

async function writeEmbeddedCoverTemp(filePath, picture) {
  if (!picture || !picture.data) return '';
  try {
    const buffer = Buffer.isBuffer(picture.data) ? picture.data : Buffer.from(picture.data);
    if (!buffer.length) return '';
    const dir = path.join(app.getPath('temp'), 'tunetag-covers');
    await fs.mkdir(dir, { recursive: true });
    const safeName = path.basename(filePath).replace(/[^a-zA-Z0-9._-]/g, '_');
    const out = path.join(dir, `${Date.now()}_${safeName}.${extFromMime(picture.format)}`);
    await fs.writeFile(out, buffer);
    return out;
  } catch {
    return '';
  }
}

async function getEmbeddedCoverPreview(filePath) {
  try {
    const parsed = await parseFile(filePath, { skipCovers: false, duration: false });
    const pictures = Array.isArray(parsed?.common?.picture) ? parsed.common.picture : [];
    if (!pictures.length) return { hasEmbeddedCover: false, embeddedCoverPath: '', embeddedCoverDataUrl: '' };
    const picture = pictures[0];
    const embeddedCoverPath = await writeEmbeddedCoverTemp(filePath, picture);
    const embeddedCoverDataUrl = pictureToDataUrl(picture);
    return {
      hasEmbeddedCover: true,
      embeddedCoverPath,
      embeddedCoverDataUrl
    };
  } catch {
    return { hasEmbeddedCover: false, embeddedCoverPath: '', embeddedCoverDataUrl: '' };
  }
}

function buildRawAttributes(parsed, stat, filePath, sourceTag) {
  const common = parsed?.common ?? {};
  const formatInfo = parsed?.format ?? {};
  const items = [];
  const push = (key, value) => {
    const normalized = toDisplayValue(value);
    if (!normalized) return;
    items.push({ key, value: normalized });
  };

  push('路径', filePath);
  push('来源', sourceTag || path.dirname(filePath));
  push('标题', common.title);
  push('艺术家', common.artist);
  push('专辑', common.album);
  push('年份', common.year);
  push('曲目号', toTrackNo(common.track));
  push('注释', Array.isArray(common.comment) ? common.comment[0] : '');
  push('格式', path.extname(filePath).replace('.', '').toUpperCase());
  push('编码', formatInfo.codec);
  push('采样率', formatInfo.sampleRate ? `${formatInfo.sampleRate} Hz` : '');
  push('位深', formatInfo.bitsPerSample ? `${formatInfo.bitsPerSample} bit` : '');
  push('时长', formatInfo.duration ? `${Math.round(formatInfo.duration)}s` : '');
  push('大小', `${Math.round(stat.size / 1024)} KB`);
  push('修改时间', stat.mtime.toISOString());

  const seen = new Set(items.map((item) => `${item.key}:${item.value}`));
  let nativeCount = 0;
  for (const group of Object.values(parsed?.native ?? {})) {
    for (const tag of group || []) {
      if (nativeCount >= 50) break;
      const key = `原始:${tag?.id || 'unknown'}`;
      const value = toDisplayValue(tag?.value);
      if (!value) continue;
      const fingerprint = `${key}:${value}`;
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      items.push({ key, value });
      nativeCount += 1;
    }
    if (nativeCount >= 50) break;
  }

  return items;
}

function parseWavCommentAndSource(rawComment) {
  const text = toDisplayValue(rawComment);
  if (!text) {
    return { note: '', source: '' };
  }

  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  const sourceLine = lines.find((line) => line.startsWith(WAV_SOURCE_PREFIX)) || '';
  const source = sourceLine.slice(WAV_SOURCE_PREFIX.length).trim();
  const note = lines.filter((line) => !line.startsWith(WAV_SOURCE_PREFIX)).join('\n').trim();

  return { note, source };
}

function composeWavComment(note, source) {
  const noteText = toDisplayValue(note);
  const sourceText = toDisplayValue(source);
  if (!sourceText) return noteText;
  if (!noteText) return `${WAV_SOURCE_PREFIX}${sourceText}`;

  const lines = noteText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith(WAV_SOURCE_PREFIX));
  lines.push(`${WAV_SOURCE_PREFIX}${sourceText}`);
  return lines.join('\n');
}

async function probeWavTags(filePath) {
  const probed = await probeMedia(filePath);
  const formatTags = probed?.format?.tags && typeof probed.format.tags === 'object' ? probed.format.tags : {};
  const audioStream = Array.isArray(probed?.streams)
    ? probed.streams.find((stream) => String(stream?.codec_type || '').toLowerCase() === 'audio')
    : null;
  const streamTags = audioStream?.tags && typeof audioStream.tags === 'object' ? audioStream.tags : {};
  const merged = { ...streamTags, ...formatTags };

  const get = (...keys) => {
    for (const key of keys) {
      const value = merged[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return '';
  };

  return {
    title: get('title'),
    artist: get('artist'),
    album: get('album'),
    year: get('date', 'year'),
    comment: get('comment', 'description'),
    trackNo: get('track')
  };
}

async function readMetadata(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const format = ext.replace('.', '').toUpperCase();

  try {
    const parsed = await parseFile(filePath, { skipCovers: false, duration: true });
    const common = parsed.common ?? {};
    const formatInfo = parsed.format ?? {};
    const stat = await fs.stat(filePath);
    const sourceTag = readSourceTag(parsed);
    const wavTags = ext === '.wav' ? await probeWavTags(filePath).catch(() => null) : null;
    const hasEmbeddedCover = Array.isArray(common.picture) && common.picture.length > 0;
    const embeddedCoverDataUrl = hasEmbeddedCover ? pictureToDataUrl(common.picture[0]) : '';
    const embeddedCoverPath = hasEmbeddedCover ? await writeEmbeddedCoverTemp(filePath, common.picture[0]) : '';
    const fallbackComment = readCommentTag(parsed);
    const wavComment = wavTags?.comment || '';
    const wavParsed = parseWavCommentAndSource(wavComment);
    const resolvedTitle = ext === '.wav' ? (wavTags?.title || common.title || '') : (common.title || '');
    const resolvedArtist = ext === '.wav' ? (wavTags?.artist || common.artist || '') : (common.artist || '');
    const resolvedAlbum = ext === '.wav' ? (wavTags?.album || common.album || '') : (common.album || '');
    const resolvedYear =
      ext === '.wav'
        ? (wavTags?.year || (common.year ? String(common.year) : ''))
        : (common.year ? String(common.year) : '');
    const resolvedTrackNo = ext === '.wav' ? (wavTags?.trackNo || toTrackNo(common.track)) : toTrackNo(common.track);
    const resolvedNote = ext === '.wav' ? (wavParsed.note || fallbackComment) : fallbackComment;
    const resolvedSource = ext === '.wav' ? (wavParsed.source || sourceTag) : sourceTag;
    const rawTIT2 = ext === '.wav' ? resolvedTitle : (readNativeFirst(parsed, ['TIT2']) || resolvedTitle);
    const rawTPE1 = ext === '.wav' ? resolvedArtist : (readNativeFirst(parsed, ['TPE1']) || resolvedArtist);
    const rawCOMM = ext === '.wav'
      ? resolvedNote
      : (readNativeFirst(parsed, ['COMM', 'TXXX:comment']) || resolvedNote);
    const rawWOAS = ext === '.wav'
      ? resolvedSource
      : (readNativeFirst(parsed, ['WOAS', 'WXXX', 'TXXX:url']) || resolvedSource);

    return {
      id: filePath,
      path: filePath,
      fileName: path.basename(filePath),
      format,
      title: resolvedTitle,
      artist: resolvedArtist,
      album: resolvedAlbum,
      year: resolvedYear,
      note: resolvedNote,
      trackNo: resolvedTrackNo,
      source: resolvedSource,
      rawTIT2,
      rawTPE1,
      rawCOMM,
      rawWOAS,
      codec: formatInfo.codec || '',
      sampleRate: formatInfo.sampleRate ? String(formatInfo.sampleRate) : '',
      bitDepth: formatInfo.bitsPerSample ? String(formatInfo.bitsPerSample) : '',
      durationSec: formatInfo.duration ? String(Math.round(formatInfo.duration)) : '',
      fileSizeBytes: String(stat.size),
      modifiedAt: stat.mtime.toISOString(),
      hasEmbeddedCover,
      embeddedCoverDataUrl,
      embeddedCoverPath,
      coverPath: '',
      removeCover: false,
      rawAttributes: buildRawAttributes(parsed, stat, filePath, resolvedSource),
      dirty: false,
      status: 'clean',
      errorMessage: ''
    };
  } catch {
    return {
      id: filePath,
      path: filePath,
      fileName: path.basename(filePath),
      format,
      title: '',
      artist: '',
      album: '',
      year: '',
      note: '',
      trackNo: '',
      source: '',
      rawTIT2: '',
      rawTPE1: '',
      rawCOMM: '',
      rawWOAS: '',
      codec: '',
      sampleRate: '',
      bitDepth: '',
      durationSec: '',
      fileSizeBytes: '',
      modifiedAt: '',
      hasEmbeddedCover: false,
      embeddedCoverDataUrl: '',
      embeddedCoverPath: '',
      coverPath: '',
      removeCover: false,
      rawAttributes: [
        { key: '路径', value: filePath },
        { key: '格式', value: format },
        { key: '状态', value: '读取标签失败' }
      ],
      dirty: false,
      status: 'error',
      errorMessage: '读取标签失败'
    };
  }
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr || `进程退出码 ${code}`));
    });
  });
}

async function probeMedia(filePath) {
  if (!FFPROBE_PATH) {
    throw new Error('ffprobe 不可用');
  }

  const args = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath];
  const { stdout } = await runProcess(FFPROBE_PATH, args);
  const parsed = JSON.parse(stdout || '{}');

  if (!Array.isArray(parsed.streams) || !parsed.streams.length) {
    throw new Error('文件流解析失败');
  }

  return parsed;
}

function buildMetadataEntries(item, ext) {
  const normalizeValue = (value) => {
    if (typeof value !== 'string') return '';
    return value.trim().normalize('NFC');
  };

  const isRawFirst = ext === '.mp3' || ext === '.wav';
  const title = normalizeValue(isRawFirst ? (item.rawTIT2 || item.title) : item.title);
  const artist = normalizeValue(isRawFirst ? (item.rawTPE1 || item.artist) : item.artist);
  const note = normalizeValue(isRawFirst ? (item.rawCOMM || item.note) : item.note);
  const source = normalizeValue(isRawFirst ? (item.rawWOAS || item.source) : item.source);
  const wavComment = ext === '.wav' ? composeWavComment(note, source) : note;

  const entries = [
    ['title', title],
    ['artist', artist],
    ['album', normalizeValue(item.album)],
    ['date', normalizeValue(item.year)],
    ['comment', wavComment],
    ['source', ext === '.wav' ? '' : source],
    ['track', normalizeValue(item.trackNo)]
  ];

  return entries.filter(([, value]) => value.length > 0);
}

async function writeMetadataWithFfmpegToTarget(item, targetPath) {
  if (!ffmpegPath) {
    throw new Error('ffmpeg 不可用');
  }

  await probeMedia(item.path);

  const tempPath = buildTempOutputPath(targetPath);
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', item.path];
  const ext = path.extname(targetPath).toLowerCase();
  const coverPath = typeof item.coverPath === 'string' ? item.coverPath.trim() : '';
  const withCover = Boolean(coverPath) && ext === '.mp3';

  if (withCover) {
    args.push('-i', coverPath, '-map', '0:a', '-map', '1:v');
  } else {
    args.push('-map', '0');
  }
  args.push('-map_metadata', '-1');

  for (const [key, value] of buildMetadataEntries(item, ext)) {
    args.push('-metadata', `${key}=${value}`);
  }

  if (withCover) {
    args.push('-c:a', 'copy', '-c:v', 'mjpeg', '-disposition:v:0', 'attached_pic');
  } else {
    args.push('-c', 'copy');
  }
  if (ext === '.mp3') {
    args.push('-id3v2_version', '3', '-write_id3v1', '0');
  }

  args.push(tempPath);
  try {
    await runProcess(ffmpegPath, args);
    await fs.rename(tempPath, targetPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function writeMp3WithNodeId3ToTarget(item, targetPath) {
  const tempPath = buildTempOutputPath(targetPath);
  await fs.copyFile(item.path, tempPath);

  if (item.removeCover) {
    NodeID3.removeTags(tempPath);
  }

  const tags = {
    title: item.rawTIT2 || item.title || undefined,
    artist: item.rawTPE1 || item.artist || undefined,
    album: item.album || undefined,
    year: item.year || undefined,
    trackNumber: item.trackNo || undefined,
    audioSourceUrl: item.rawWOAS || item.source || undefined,
    comment: {
      language: 'eng',
      text: item.rawCOMM || item.note || ''
    }
  };

  if (item.coverPath && !item.removeCover) {
    tags.image = item.coverPath;
  }

  const ok = NodeID3.update(tags, tempPath);
  if (!ok) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw new Error('MP3 标签写入失败');
  }
  await fs.rename(tempPath, targetPath);
}

async function resolveUniqueOutputPath(directory, baseName) {
  const parsed = path.parse(baseName);
  let candidate = path.join(directory, baseName);
  let index = 1;

  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(directory, `${parsed.name} (${index})${parsed.ext}`);
      index += 1;
    } catch {
      return candidate;
    }
  }
}

function buildTempOutputPath(targetPath) {
  const dir = path.dirname(targetPath);
  const ext = path.extname(targetPath);
  const name = path.basename(targetPath, ext);
  return path.join(
    dir,
    `${name}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`
  );
}

async function isSameFilePath(a, b) {
  if (!a || !b) return false;
  try {
    const [ra, rb] = await Promise.all([fs.realpath(a), fs.realpath(b)]);
    return ra === rb;
  } catch {
    const pa = path.resolve(a);
    const pb = path.resolve(b);
    if (process.platform === 'win32' || process.platform === 'darwin') {
      return pa.toLowerCase() === pb.toLowerCase();
    }
    return pa === pb;
  }
}

ipcMain.handle('pick-paths', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'openDirectory', 'multiSelections']
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('pick-cover-image', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }
    ]
  });
  return result.canceled || !result.filePaths.length ? '' : result.filePaths[0];
});

ipcMain.handle('import-paths', async (_event, inputPaths) => {
  const { files, skipped } = await collectMediaFiles(inputPaths || []);
  const tracks = await Promise.all(files.map((filePath) => readMetadata(filePath)));
  return { tracks, skipped };
});

ipcMain.handle('get-embedded-cover', async (_event, filePath) => {
  if (!filePath || typeof filePath !== 'string') {
    return { hasEmbeddedCover: false, embeddedCoverPath: '', embeddedCoverDataUrl: '' };
  }
  return getEmbeddedCoverPreview(filePath);
});

ipcMain.handle('save-tracks', async (event, tracks) => {
  const folderResult = await dialog.showOpenDialog({
    title: '选择保存文件夹',
    buttonLabel: '保存到此文件夹',
    properties: ['openDirectory', 'createDirectory']
  });

  if (folderResult.canceled || !folderResult.filePaths.length) {
    return { canceled: true, success: 0, failed: 0, failures: [] };
  }

  const targetDirectory = folderResult.filePaths[0];
  const total = Array.isArray(tracks) ? tracks.length : 0;
  let completed = 0;
  let success = 0;
  const failures = [];

  for (const item of tracks || []) {
    const ext = path.extname(item.path || '').toLowerCase();
    let outputPath = await resolveUniqueOutputPath(targetDirectory, path.basename(item.path || 'untitled'));
    if (await isSameFilePath(item.path || '', outputPath)) {
      const parsed = path.parse(path.basename(item.path || 'untitled'));
      outputPath = await resolveUniqueOutputPath(targetDirectory, `${parsed.name} (copy)${parsed.ext}`);
    }

    if (!WRITABLE_EXTENSIONS.has(ext)) {
      failures.push({ path: item.path, reason: `${ext || '该格式'} 暂不支持写入` });
      completed += 1;
      event.sender.send('save-progress', { completed, total });
      continue;
    }

    try {
      if (ext === '.mp3') {
        await writeMp3WithNodeId3ToTarget(item, outputPath);
      } else {
        await writeMetadataWithFfmpegToTarget(item, outputPath);
      }
      success += 1;
    } catch (error) {
      failures.push({ path: item.path, reason: error instanceof Error ? error.message : '写入异常' });
    }

    completed += 1;
    event.sender.send('save-progress', { completed, total });
  }

  return { canceled: false, targetDirectory, success, failed: failures.length, failures };
});
