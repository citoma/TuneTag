import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { parseFile } from 'music-metadata';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import NodeID3 from 'node-id3';

const SUPPORTED_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.m4a']);
const WRITABLE_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.m4a']);
const FFPROBE_PATH = ffprobeStatic?.path;
const FFMPEG_PATH = ffmpegPath;
const WAV_SOURCE_PREFIX = '[TuneTagSource] ';
const WAV_META_PREFIX = '[TuneTagMeta] ';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ICON_CANDIDATES = [
  path.join(__dirname, 'assets', 'app-icon.png'),
  path.join(__dirname, '..', 'electron', 'assets', 'app-icon.png'),
  path.join(__dirname, '..', 'public', 'app-icon.png'),
  path.join(process.resourcesPath, 'app-icon.png')
];
const APP_ICON_PATH = APP_ICON_CANDIDATES.find((candidate) => existsSync(candidate));
let mainWindowRef = null;
const pendingOpenPaths = [];
let hasImportedFiles = false;
let allowWindowClose = false;
let closeConfirmDisabled = false;
const SETTINGS_PATH = path.join(app.getPath('userData'), 'tunetag-settings.json');
const runtimeBinaryCache = new Map();

async function ensureExecutableBinary(sourcePath, binaryName) {
  const source = String(sourcePath || '').trim();
  if (!source) return '';

  const unpackedCandidate = source.includes(`${path.sep}app.asar${path.sep}`)
    ? source.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`)
    : '';

  if (unpackedCandidate && existsSync(unpackedCandidate)) {
    return unpackedCandidate;
  }

  if (existsSync(source) && !source.includes(`${path.sep}app.asar${path.sep}`)) {
    return source;
  }

  const cacheKey = `${binaryName}:${source}`;
  const cached = runtimeBinaryCache.get(cacheKey);
  if (cached && existsSync(cached)) return cached;

  const digest = crypto.createHash('sha1').update(source).digest('hex').slice(0, 12);
  const outDir = path.join(app.getPath('temp'), 'tunetag-binaries');
  const outPath = path.join(outDir, `${binaryName}-${process.arch}-${digest}`);

  if (existsSync(outPath)) {
    runtimeBinaryCache.set(cacheKey, outPath);
    return outPath;
  }

  await fs.mkdir(outDir, { recursive: true });
  const bytes = await fs.readFile(source);
  await fs.writeFile(outPath, bytes, { mode: 0o755 });
  await fs.chmod(outPath, 0o755).catch(() => {});
  runtimeBinaryCache.set(cacheKey, outPath);
  return outPath;
}

async function getFfprobeExecutablePath() {
  try {
    const resolved = await ensureExecutableBinary(FFPROBE_PATH, 'ffprobe');
    if (resolved) return resolved;
  } catch {
    // fallback to system ffprobe
  }
  return 'ffprobe';
}

async function getFfmpegExecutablePath() {
  try {
    const resolved = await ensureExecutableBinary(FFMPEG_PATH, 'ffmpeg');
    if (resolved) return resolved;
  } catch {
    // fallback to system ffmpeg
  }
  return 'ffmpeg';
}

app.setName('TuneTag');

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

function enqueueOpenPaths(rawPaths) {
  const candidates = Array.isArray(rawPaths) ? rawPaths : [];
  for (const rawPath of candidates) {
    const normalized = path.resolve(String(rawPath || '').trim());
    if (!normalized || !existsSync(normalized)) continue;
    let stat;
    try {
      stat = statSync(normalized);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    const ext = path.extname(normalized).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
    if (!pendingOpenPaths.includes(normalized)) {
      pendingOpenPaths.push(normalized);
    }
  }
}

function extractPathsFromArgv(argv = []) {
  const out = [];
  for (const token of argv) {
    const value = String(token || '').trim();
    if (!value || value.startsWith('-')) continue;
    const resolved = path.resolve(value);
    if (!existsSync(resolved)) continue;
    out.push(resolved);
  }
  return out;
}

function flushPendingOpenPaths() {
  if (!mainWindowRef || !pendingOpenPaths.length) return;
  if (mainWindowRef.isDestroyed()) return;
  const payload = [...pendingOpenPaths];
  pendingOpenPaths.length = 0;
  mainWindowRef.webContents.send('external-open-paths', payload);
}

async function loadSettings() {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    closeConfirmDisabled = Boolean(parsed?.closeConfirmDisabled);
  } catch {
    closeConfirmDisabled = false;
  }
}

async function saveSettings() {
  const payload = { closeConfirmDisabled };
  await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true }).catch(() => {});
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(payload, null, 2), 'utf8').catch(() => {});
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  enqueueOpenPaths([filePath]);
  if (app.isReady()) {
    if (!mainWindowRef || mainWindowRef.isDestroyed()) {
      createWindow();
      return;
    }
    if (mainWindowRef.isMinimized()) mainWindowRef.restore();
    mainWindowRef.focus();
    flushPendingOpenPaths();
  }
});

app.on('second-instance', (_event, argv) => {
  enqueueOpenPaths(extractPathsFromArgv(argv));
  if (!mainWindowRef || mainWindowRef.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindowRef.isMinimized()) mainWindowRef.restore();
  mainWindowRef.focus();
  flushPendingOpenPaths();
});

function createWindow() {
  const devUrl = 'http://localhost:5173';
  const isDev = !app.isPackaged;
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 1100,
    minHeight: 700,
    title: 'TuneTag',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    ...(APP_ICON_PATH ? { icon: APP_ICON_PATH } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindowRef = mainWindow;
  allowWindowClose = false;

  mainWindow.on('close', async (event) => {
    if (allowWindowClose) return;
    if (!hasImportedFiles || closeConfirmDisabled) return;

    event.preventDefault();
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['取消', '关闭'],
      defaultId: 0,
      cancelId: 0,
      title: '确认关闭',
      message: '当前列表还有文件，确定要关闭 TuneTag 吗？',
      checkboxLabel: '不再提示',
      checkboxChecked: false
    });

    if (result.response !== 1) return;

    if (result.checkboxChecked) {
      closeConfirmDisabled = true;
      void saveSettings();
    }

    allowWindowClose = true;
    mainWindow.close();
  });

  mainWindow.on('closed', () => {
    if (mainWindowRef === mainWindow) {
      mainWindowRef = null;
    }
    hasImportedFiles = false;
  });

  const prodPath = path.join(__dirname, '..', 'dist', 'index.html');

  const openExternalIfNeeded = (targetUrl) => {
    const url = String(targetUrl || '');
    if (!/^https?:\/\//i.test(url)) return false;
    if (isDev && url.startsWith(devUrl)) return false;
    shell.openExternal(url).catch(() => {});
    return true;
  };

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (openExternalIfNeeded(url)) return { action: 'deny' };
    return { action: 'allow' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (openExternalIfNeeded(url)) {
      event.preventDefault();
    }
  });

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
    mainWindow.webContents.on('did-finish-load', () => {
      flushPendingOpenPaths();
    });
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  if (!existsSync(prodPath)) {
    throw new Error(`未找到生产构建文件: ${prodPath}`);
  }

  mainWindow.loadFile(prodPath);
  mainWindow.webContents.on('did-finish-load', () => {
    flushPendingOpenPaths();
  });
}

app.whenReady().then(async () => {
  await loadSettings();
  if (process.platform === 'darwin' && APP_ICON_PATH) {
    const dockIcon = nativeImage.createFromPath(APP_ICON_PATH);
    if (!dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon);
    }
  }

  enqueueOpenPaths(extractPathsFromArgv(process.argv));
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
  const queue = [...(Array.isArray(inputPaths) ? inputPaths : [])];

  while (queue.length) {
    const currentPath = queue.shift();
    if (!currentPath) continue;

    let stat;
    try {
      stat = await fs.stat(currentPath);
    } catch {
      skipped.push({ path: currentPath, reason: '文件不可访问' });
      continue;
    }

    if (stat.isDirectory()) {
      let entries = [];
      try {
        entries = await fs.readdir(currentPath, { withFileTypes: true });
      } catch {
        skipped.push({ path: currentPath, reason: '目录不可访问' });
        continue;
      }

      for (const entry of entries) {
        queue.push(path.join(currentPath, entry.name));
      }
      continue;
    }

    if (!stat.isFile()) continue;

    const ext = path.extname(currentPath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      skipped.push({ path: currentPath, reason: '格式不支持' });
      continue;
    }

    const normalized = path.resolve(currentPath);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }

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
    const value = toDisplayValue(common.comment[0]);
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
  const candidates = [
    'IARL',
    'SOURCE',
    'TSRC',
    'TXXX:SOURCE',
    'TXXX:Source',
    '----:com.apple.iTunes:SOURCE',
    'WOAS',
    'WXXX',
    'TXXX:url',
    'TXXX:URL',
    'TXXX:WOAS'
  ];

  for (const group of Object.values(native)) {
    for (const tag of group || []) {
      const id = String(tag?.id || '');
      if (!candidates.includes(id)) continue;

      const value = tag?.value;
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (Array.isArray(value) && value.length) {
        const first = value[0];
        const parsedFirst = toDisplayValue(first);
        if (parsedFirst) return parsedFirst;
      }
      const parsedValue = toDisplayValue(value);
      if (parsedValue) return parsedValue;
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

function normalizeTagText(value) {
  if (value == null) return '';
  return String(value)
    .replace(/\u0000/g, '')
    .trim()
    .normalize('NFC');
}

function looksLikeMojibake(value) {
  const text = normalizeTagText(value);
  if (!text) return false;
  if (/[\u0000-\u001f]/u.test(text)) return true;
  const weirdCount = (text.match(/[�]/gu) || []).length;
  return weirdCount >= 2;
}

function decodeBufferToText(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return '';
  const hasUtf16Bom =
    buffer.length >= 2 &&
    ((buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff));
  try {
    if (hasUtf16Bom) {
      return normalizeTagText(buffer.toString('utf16le'));
    }
    return normalizeTagText(buffer.toString('utf8'));
  } catch {
    return '';
  }
}

function toDisplayValue(value) {
  if (value == null) return '';
  if (typeof value === 'string') return normalizeTagText(value);
  if (Buffer.isBuffer(value)) return decodeBufferToText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => toDisplayValue(item)).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return normalizeTagText(value.text);
    if (typeof value.url === 'string') return normalizeTagText(value.url);
    if (typeof value.description === 'string') return normalizeTagText(value.description);
    if (typeof value.value === 'string') return normalizeTagText(value.value);
    if (typeof value.no === 'number' && typeof value.of === 'number') return `${value.no}/${value.of}`;
    if (typeof value.no === 'number') return String(value.no);
    return '';
  }
  return '';
}

function readCommonText(common, key) {
  const raw = common?.[key];
  if (Array.isArray(raw)) {
    if (!raw.length) return '';
    return toDisplayValue(raw[0]);
  }
  return toDisplayValue(raw);
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = toDisplayValue(value);
    if (text) return text;
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

async function readImageAsDataUrl(filePath) {
  if (!filePath || typeof filePath !== 'string') return '';
  try {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp'
    };
    const mime = mimeMap[ext];
    if (!mime) return '';
    const bytes = await fs.readFile(filePath);
    return `data:${mime};base64,${bytes.toString('base64')}`;
  } catch {
    return '';
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
  push('曲作者', Array.isArray(common.composer) ? common.composer[0] : common.composer);
  push('词作者', Array.isArray(common.lyricist) ? common.lyricist[0] : common.lyricist);
  push('年份', common.year);
  push('曲目号', toTrackNo(common.track));
  push('流派', Array.isArray(common.genre) ? common.genre[0] : '');
  push('歌词', Array.isArray(common.lyrics) ? common.lyrics[0] : '');
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
    return { title: '', artist: '', album: '', year: '', trackNo: '', note: '', source: '', genre: '', lyrics: '' };
  }

  const metaLine = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.startsWith(WAV_META_PREFIX));

  if (metaLine) {
    try {
      const payload = JSON.parse(Buffer.from(metaLine.slice(WAV_META_PREFIX.length).trim(), 'base64').toString('utf8'));
      return {
        title: '',
        artist: '',
        album: '',
        year: '',
        trackNo: '',
        note: normalizeTagText(payload?.note),
        source: normalizeTagText(payload?.source),
        genre: '',
        lyrics: ''
      };
    } catch {
      // fallback to legacy format
    }
  }

  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith(WAV_META_PREFIX));

  const sourceLine = lines.find((line) => line.startsWith(WAV_SOURCE_PREFIX)) || '';
  const source = sourceLine.slice(WAV_SOURCE_PREFIX.length).trim();
  const note = lines.filter((line) => !line.startsWith(WAV_SOURCE_PREFIX)).join('\n').trim();

  return { title: '', artist: '', album: '', year: '', trackNo: '', note, source, genre: '', lyrics: '' };
}

function composeWavComment(payload) {
  // Standard-compat mode: do not write private metadata blob into WAV comment.
  // Keep legacy TuneTagMeta read compatibility only.
  return toDisplayValue(payload?.note);
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
    composer: get('composer'),
    lyricist: get('lyricist'),
    year: get('date', 'year'),
    genre: get('genre'),
    lyrics: get('lyrics', 'lyric', 'comment'),
    comment: get('comment', 'description'),
    source: get('IARL', 'source', 'url', 'website'),
    trackNo: get('track')
  };
}

function readWavId3Tags(filePath) {
  try {
    const parsed = NodeID3.read(filePath) || {};
    const comment = parsed?.comment?.text || '';
    const lyrics = parsed?.unsynchronisedLyrics?.text || '';
    return {
      title: normalizeTagText(parsed?.title),
      artist: normalizeTagText(parsed?.artist),
      album: normalizeTagText(parsed?.album),
      composer: normalizeTagText(parsed?.composer),
      lyricist: normalizeTagText(parsed?.lyricist),
      year: normalizeTagText(parsed?.year),
      trackNo: normalizeTagText(parsed?.trackNumber),
      genre: normalizeTagText(parsed?.genre),
      note: normalizeTagText(comment),
      source: normalizeTagText(parsed?.audioSourceUrl),
      lyrics: normalizeTagText(lyrics),
      rawTitle: normalizeTagText(parsed?.raw?.TIT2),
      rawArtist: normalizeTagText(parsed?.raw?.TPE1),
      rawComposer: normalizeTagText(parsed?.raw?.TCOM),
      rawLyricist: normalizeTagText(parsed?.raw?.TEXT),
      rawGenre: normalizeTagText(parsed?.raw?.TCON),
      rawLyrics: normalizeTagText(parsed?.raw?.USLT?.text || ''),
      rawComment: normalizeTagText(parsed?.raw?.COMM?.text || ''),
      rawSource: normalizeTagText(parsed?.raw?.WOAS)
    };
  } catch {
    return {
      title: '',
      artist: '',
      album: '',
      composer: '',
      lyricist: '',
      year: '',
      trackNo: '',
      genre: '',
      note: '',
      source: '',
      lyrics: '',
      rawTitle: '',
      rawArtist: '',
      rawComposer: '',
      rawLyricist: '',
      rawGenre: '',
      rawLyrics: '',
      rawComment: '',
      rawSource: ''
    };
  }
}

async function readWhereFroms(filePath) {
  if (process.platform !== 'darwin') return '';
  try {
    const { stdout } = await runProcess('mdls', ['-raw', '-name', 'kMDItemWhereFroms', filePath]);
    const raw = String(stdout || '').trim();
    if (!raw || raw === '(null)') return '';
    const quoted = raw.match(/"([^"]+)"/u);
    if (quoted?.[1]) return normalizeTagText(quoted[1]);
    const plain = raw.replace(/[()\n]/g, ' ').trim();
    return normalizeTagText(plain);
  } catch {
    return '';
  }
}

async function readMetadata(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const format = ext.replace('.', '').toUpperCase();
  const fileStem = path.parse(filePath).name;

  try {
    // Performance: avoid full-duration scan and cover pre-processing during import.
    // Cover preview is loaded lazily when a row is selected.
    const parsed = await parseFile(filePath, { skipCovers: false, duration: false });
    const common = parsed.common ?? {};
    const formatInfo = parsed.format ?? {};
    const stat = await fs.stat(filePath);
    const sourceTag = readSourceTag(parsed);
    const whereFromSource = await readWhereFroms(filePath);
    const wavTags = ext === '.wav' ? await probeWavTags(filePath).catch(() => null) : null;
    const wavId3 = ext === '.wav' ? readWavId3Tags(filePath) : null;
    const hasEmbeddedCover = Array.isArray(common.picture) && common.picture.length > 0;
    const embeddedCoverDataUrl = '';
    const embeddedCoverPath = '';
    const fallbackComment = readCommentTag(parsed);
    const wavComment = firstNonEmpty(wavTags?.comment, fallbackComment);
    const wavParsed = parseWavCommentAndSource(wavComment);
    const commonTitle = readCommonText(common, 'title');
    const commonArtist = readCommonText(common, 'artist');
    const commonAlbum = readCommonText(common, 'album');
    const commonComposer = readCommonText(common, 'composer');
    const commonLyricist = readCommonText(common, 'lyricist');
    const commonGenre = readCommonText(common, 'genre');
    const commonLyrics = readCommonText(common, 'lyrics');
    const wavNativeTitle = readNativeFirst(parsed, ['TIT2']);
    const wavNativeArtist = readNativeFirst(parsed, ['TPE1']);
    const wavNativeAlbum = readNativeFirst(parsed, ['TALB']);
    const wavNativeComposer = readNativeFirst(parsed, ['TCOM']);
    const wavNativeLyricist = readNativeFirst(parsed, ['TEXT']);
    const wavNativeGenre = readNativeFirst(parsed, ['TCON']);
    const wavNativeLyrics = readNativeFirst(parsed, ['USLT']);
    const wavNativeTrackNo = readNativeFirst(parsed, ['TRCK']);
    const wavNativeSource = readNativeFirst(parsed, ['WOAS', 'WXXX', 'TXXX:url', 'SOURCE', 'TXXX:SOURCE']);
    const resolvedTitle = ext === '.wav'
      ? (
        wavId3?.title ||
        wavTags?.title ||
        (!looksLikeMojibake(wavNativeTitle) ? wavNativeTitle : '') ||
        (!looksLikeMojibake(commonTitle) ? commonTitle : '') ||
        fileStem
      )
      : (commonTitle || fileStem);
    const resolvedArtist = ext === '.wav'
      ? (
        wavId3?.artist ||
        wavTags?.artist ||
        (!looksLikeMojibake(wavNativeArtist) ? wavNativeArtist : '') ||
        (!looksLikeMojibake(commonArtist) ? commonArtist : '') ||
        ''
      )
      : (commonArtist || '');
    const resolvedAlbum = ext === '.wav'
      ? (
        wavId3?.album ||
        wavTags?.album ||
        (!looksLikeMojibake(wavNativeAlbum) ? wavNativeAlbum : '') ||
        (!looksLikeMojibake(commonAlbum) ? commonAlbum : '') ||
        ''
      )
      : (commonAlbum || '');
    const resolvedComposer = ext === '.wav'
      ? (wavId3?.composer || wavTags?.composer || wavNativeComposer || commonComposer || '')
      : (commonComposer || '');
    const resolvedLyricist = ext === '.wav'
      ? (wavId3?.lyricist || wavTags?.lyricist || wavNativeLyricist || commonLyricist || '')
      : (commonLyricist || '');
    const resolvedYear =
      ext === '.wav'
        ? (wavId3?.year || wavTags?.year || (common.year ? String(common.year) : '') || '')
        : (common.year ? String(common.year) : '');
    const resolvedTrackNo = ext === '.wav'
      ? (wavId3?.trackNo || wavTags?.trackNo || wavNativeTrackNo || toTrackNo(common.track) || '')
      : toTrackNo(common.track);
    const resolvedGenre = ext === '.wav'
      ? (wavId3?.genre || wavTags?.genre || wavNativeGenre || commonGenre || '')
      : (commonGenre || '');
    const resolvedLyrics = ext === '.wav'
      ? (wavId3?.lyrics || wavNativeLyrics || wavTags?.lyrics || commonLyrics || '')
      : (commonLyrics || '');
    const resolvedNote = ext === '.wav' ? (wavId3?.note || wavParsed.note || wavTags?.comment || fallbackComment) : fallbackComment;
    const resolvedSource = ext === '.wav'
      ? (wavId3?.source || wavTags?.source || wavParsed.source || wavNativeSource || sourceTag || whereFromSource)
      : (sourceTag || whereFromSource);
    const rawTIT2 = ext === '.wav' ? (wavId3?.rawTitle || resolvedTitle) : (readNativeFirst(parsed, ['TIT2']) || resolvedTitle);
    const rawTPE1 = ext === '.wav' ? (wavId3?.rawArtist || resolvedArtist) : (readNativeFirst(parsed, ['TPE1']) || resolvedArtist);
    const rawTCOM = ext === '.wav' ? (wavId3?.rawComposer || resolvedComposer) : (readNativeFirst(parsed, ['TCOM']) || resolvedComposer);
    const rawTEXT = ext === '.wav' ? (wavId3?.rawLyricist || resolvedLyricist) : (readNativeFirst(parsed, ['TEXT']) || resolvedLyricist);
    const rawTCON = ext === '.wav' ? (wavId3?.rawGenre || resolvedGenre) : (readNativeFirst(parsed, ['TCON']) || resolvedGenre);
    const rawUSLT = ext === '.wav' ? (wavId3?.rawLyrics || resolvedLyrics) : (readNativeFirst(parsed, ['USLT']) || resolvedLyrics);
    const rawCOMM = ext === '.wav'
      ? (wavId3?.rawComment || resolvedNote)
      : (readNativeFirst(parsed, ['COMM', 'TXXX:comment']) || resolvedNote);
    const rawWOAS = ext === '.wav'
      ? (wavId3?.rawSource || resolvedSource)
      : (readNativeFirst(parsed, ['WOAS', 'WXXX', 'TXXX:url']) || resolvedSource);

    return {
      id: filePath,
      path: filePath,
      fileName: path.basename(filePath),
      format,
      title: resolvedTitle,
      artist: resolvedArtist,
      album: resolvedAlbum,
      composer: resolvedComposer,
      lyricist: resolvedLyricist,
      year: resolvedYear,
      genre: resolvedGenre,
      lyrics: resolvedLyrics,
      note: resolvedNote,
      trackNo: resolvedTrackNo,
      source: resolvedSource,
      rawTIT2,
      rawTPE1,
      rawTCOM,
      rawTEXT,
      rawTCON,
      rawUSLT,
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
      coverDataUrl: '',
      coverPath: '',
      exportedPath: '',
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
      composer: '',
      lyricist: '',
      year: '',
      genre: '',
      lyrics: '',
      note: '',
      trackNo: '',
      source: '',
      rawTIT2: '',
      rawTPE1: '',
      rawTCOM: '',
      rawTEXT: '',
      rawTCON: '',
      rawUSLT: '',
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
      coverDataUrl: '',
      coverPath: '',
      exportedPath: '',
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
  const ffprobeExecutablePath = await getFfprobeExecutablePath();

  const args = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath];
  const { stdout } = await runProcess(ffprobeExecutablePath, args);
  const parsed = JSON.parse(stdout || '{}');

  if (!Array.isArray(parsed.streams) || !parsed.streams.length) {
    throw new Error('文件流解析失败');
  }

  return parsed;
}

function buildMetadataEntries(item, ext) {
  const normalizeValue = (value) => normalizeTagText(value);
  const asciiSafe = (value) => {
    const text = normalizeValue(value);
    return /^[\x00-\x7F]*$/u.test(text) ? text : '';
  };

  const title = normalizeValue(item.title || item.rawTIT2);
  const artist = normalizeValue(item.artist || item.rawTPE1);
  const composer = normalizeValue(item.composer || item.rawTCOM);
  const lyricist = normalizeValue(item.lyricist || item.rawTEXT);
  const genre = normalizeValue(item.genre || item.rawTCON);
  const lyrics = normalizeValue(item.lyrics || item.rawUSLT);
  const note = normalizeValue(item.note || item.rawCOMM);
  const source = normalizeValue(item.source || item.rawWOAS);
  const wavComment = ext === '.wav'
    ? composeWavComment({
      title,
      artist,
      album: normalizeValue(item.album),
      year: normalizeValue(item.year),
      trackNo: normalizeValue(item.trackNo),
      note,
      source,
      genre,
      lyrics
    })
    : note;

  if (ext === '.wav') {
    // RIFF INFO text encoding interoperability is poor for CJK.
    // Keep WAV tags conservative and ASCII-safe to avoid mojibake and playback regressions.
    const entries = [
      ['title', asciiSafe(title)],
      ['artist', asciiSafe(artist)],
      ['album', asciiSafe(normalizeValue(item.album))],
      ['composer', asciiSafe(composer)],
      ['lyricist', asciiSafe(lyricist)],
      ['date', asciiSafe(normalizeValue(item.year))],
      ['genre', asciiSafe(genre)],
      ['comment', asciiSafe(wavComment)],
      ['track', asciiSafe(normalizeValue(item.trackNo))]
    ].filter((entry) => entry[1]);
    const safeSource = asciiSafe(source);
    if (safeSource) {
      entries.push(['IARL', safeSource]);
    }
    return entries;
  }

  return [
    ['title', title],
    ['artist', artist],
    ['album', normalizeValue(item.album)],
    ['composer', composer],
    ['lyricist', lyricist],
    ['date', normalizeValue(item.year)],
    ['genre', genre],
    ['lyrics', lyrics],
    ['comment', note],
    ['source', source],
    ['track', normalizeValue(item.trackNo)]
  ];
}

async function writeMetadataWithFfmpegToTarget(item, targetPath) {
  const ffmpegExecutablePath = await getFfmpegExecutablePath();

  const ext = path.extname(targetPath).toLowerCase();
  const coverPath = typeof item.coverPath === 'string' ? item.coverPath.trim() : '';
  const withCover = Boolean(coverPath) && ext === '.mp3';
  const isWav = ext === '.wav';
  const buildArgs = (tempPath, forcePcmForWav = false) => {
    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', item.path];

    if (isWav) {
      args.push('-map', '0:a:0');
    } else if (withCover) {
      args.push('-i', coverPath, '-map', '0:a', '-map', '1:v');
    } else {
      args.push('-map', '0');
    }
    args.push('-map_metadata', isWav ? '-1' : '0');

    for (const [key, value] of buildMetadataEntries(item, ext)) {
      args.push('-metadata', `${key}=${value}`);
    }

    if (withCover) {
      args.push('-c:a', 'copy', '-c:v', 'mjpeg', '-disposition:v:0', 'attached_pic');
    } else if (isWav && forcePcmForWav) {
      args.push('-c:a', 'pcm_s16le');
    } else if (isWav) {
      // Keep original WAV codec first for max downstream compatibility (e.g., smart speakers).
      args.push('-c', 'copy');
    } else if (forcePcmForWav && ext === '.wav') {
      args.push('-map', '0:a:0', '-c:a', 'pcm_s16le');
    } else {
      args.push('-c', 'copy');
    }
    if (ext === '.mp3') {
      args.push('-id3v2_version', '3', '-write_id3v1', '0');
    }

    args.push(tempPath);
    return args;
  };

  const tempPath = buildTempOutputPath(targetPath);
  try {
    await runProcess(ffmpegExecutablePath, buildArgs(tempPath, false));
    await replaceFileFromTemp(tempPath, targetPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    if (ext === '.wav') {
      const retryTempPath = buildTempOutputPath(targetPath);
      try {
        await runProcess(ffmpegExecutablePath, buildArgs(retryTempPath, true));
        await replaceFileFromTemp(retryTempPath, targetPath);
        return;
      } catch (retryError) {
        await fs.rm(retryTempPath, { force: true }).catch(() => {});
        throw retryError;
      }
    }
    throw error;
  }
}

async function writeMp3WithNodeId3ToTarget(item, targetPath) {
  const tempPath = buildTempOutputPath(targetPath);
  if (item.removeCover) {
    const ffmpegExecutablePath = await getFfmpegExecutablePath();
    const stripCoverArgs = [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      item.path,
      '-map',
      '0:a',
      '-map_metadata',
      '0',
      '-c:a',
      'copy',
      tempPath
    ];
    await runProcess(ffmpegExecutablePath, stripCoverArgs);
  } else {
    await fs.copyFile(item.path, tempPath);
  }

  const tags = {
    title: normalizeTagText(item.title || item.rawTIT2) || undefined,
    artist: normalizeTagText(item.artist || item.rawTPE1) || undefined,
    album: normalizeTagText(item.album) || undefined,
    composer: normalizeTagText(item.composer || item.rawTCOM) || undefined,
    lyricist: normalizeTagText(item.lyricist || item.rawTEXT) || undefined,
    year: normalizeTagText(item.year) || undefined,
    genre: normalizeTagText(item.genre || item.rawTCON) || undefined,
    trackNumber: normalizeTagText(item.trackNo) || undefined,
    audioSourceUrl: normalizeTagText(item.source || item.rawWOAS) || undefined,
    unsynchronisedLyrics: {
      language: 'eng',
      text: normalizeTagText(item.lyrics || item.rawUSLT)
    },
    comment: {
      language: 'eng',
      text: normalizeTagText(item.note || item.rawCOMM)
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
  await replaceFileFromTemp(tempPath, targetPath);
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

async function replaceFileFromTemp(tempPath, targetPath) {
  try {
    await fs.rename(tempPath, targetPath);
    return;
  } catch (error) {
    const code = error && typeof error === 'object' ? error.code : '';
    if (code !== 'EEXIST' && code !== 'EPERM' && code !== 'EBUSY' && code !== 'EXDEV') {
      throw error;
    }
  }

  await fs.rm(targetPath, { force: true }).catch(() => {});
  try {
    await fs.rename(tempPath, targetPath);
    return;
  } catch (error) {
    const code = error && typeof error === 'object' ? error.code : '';
    if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EXDEV') {
      throw error;
    }
  }

  await fs.copyFile(tempPath, targetPath);
  await fs.rm(tempPath, { force: true }).catch(() => {});
}

async function syncMacSpotlightMetadata(targetPath, item) {
  if (process.platform !== 'darwin') return;

  const title = normalizeTagText(item.title || item.rawTIT2);
  const artist = normalizeTagText(item.artist || item.rawTPE1);
  const album = normalizeTagText(item.album);
  const note = normalizeTagText(item.note || item.rawCOMM);
  const source = normalizeTagText(item.source || item.rawWOAS);
  const genre = normalizeTagText(item.genre || item.rawTCON);
  const yearText = normalizeTagText(item.year);
  const year = /^\d{4}$/u.test(yearText) ? Number(yearText) : null;

  const payload = {
    kMDItemTitle: title || null,
    kMDItemAuthors: artist ? [artist] : null,
    kMDItemAlbum: album || null,
    kMDItemComment: note || null,
    kMDItemFinderComment: note || null,
    kMDItemMusicalGenre: genre || null,
    kMDItemRecordingYear: Number.isFinite(year) ? year : null,
    kMDItemWhereFroms: source ? [source] : null
  };

  const script = `
import sys, json, plistlib, binascii, subprocess
path = sys.argv[1]
payload = json.loads(sys.argv[2])
for key, value in payload.items():
    attr = f"com.apple.metadata:{key}"
    if value is None or value == "" or value == []:
        subprocess.run(["xattr", "-d", attr, path], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        continue
    data = plistlib.dumps(value, fmt=plistlib.FMT_BINARY)
    hexv = binascii.hexlify(data).decode("ascii")
    subprocess.check_call(["xattr", "-wx", attr, hexv, path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
`.trim();

  await runProcess('python3', ['-c', script, targetPath, JSON.stringify(payload)]);
  await runProcess('mdimport', [targetPath]).catch(() => {});
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

ipcMain.handle('read-image-data-url', async (_event, filePath) => {
  return readImageAsDataUrl(filePath);
});

ipcMain.handle('open-external-url', async (_event, url) => {
  const target = typeof url === 'string' ? url.trim() : '';
  if (!/^https?:\/\//i.test(target)) return false;
  try {
    await shell.openExternal(target);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('reveal-in-folder', async (_event, filePath) => {
  const target = typeof filePath === 'string' ? filePath.trim() : '';
  if (!target) return false;
  try {
    shell.showItemInFolder(target);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('import-paths', async (_event, inputPaths) => {
  const { files, skipped } = await collectMediaFiles(inputPaths || []);
  const tracks = await Promise.all(files.map((filePath) => readMetadata(filePath)));
  return { tracks, skipped };
});

ipcMain.handle('set-close-guard-has-files', async (_event, hasFiles) => {
  hasImportedFiles = Boolean(hasFiles);
  return true;
});

ipcMain.handle('get-embedded-cover', async (_event, filePath) => {
  if (!filePath || typeof filePath !== 'string') {
    return { hasEmbeddedCover: false, embeddedCoverPath: '', embeddedCoverDataUrl: '' };
  }
  return getEmbeddedCoverPreview(filePath);
});

ipcMain.handle('save-tracks', async (event, tracks) => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender) || undefined;
  const folderResult = await dialog.showOpenDialog({
    title: '选择保存文件夹',
    buttonLabel: '保存到此文件夹',
    properties: ['openDirectory', 'createDirectory']
  });

  if (folderResult.canceled || !folderResult.filePaths.length) {
    return { canceled: true, success: 0, failed: 0, failures: [], warnings: [] };
  }

  const targetDirectory = folderResult.filePaths[0];
  const total = Array.isArray(tracks) ? tracks.length : 0;
  let completed = 0;
  let success = 0;
  const failures = [];
  const warnings = [];
  const exported = [];
  let conflictPolicy = null; // 'overwrite' | 'keep-both' | 'skip'

  for (const item of tracks || []) {
    const ext = path.extname(item.path || '').toLowerCase();
    const baseName = path.basename(item.path || 'untitled');
    const directOutputPath = path.join(targetDirectory, baseName);
    let outputPath = directOutputPath;
    let exists = false;
    try {
      await fs.access(directOutputPath);
      exists = true;
    } catch {
      exists = false;
    }

    if (exists) {
      const sameAsSource = await isSameFilePath(item.path || '', directOutputPath);
      let decision = conflictPolicy;

      if (!decision) {
        const conflictAnswer = await dialog.showMessageBox(ownerWindow, {
          type: 'question',
          buttons: ['覆盖', '保留', '跳过'],
          defaultId: 0,
          cancelId: 2,
          title: '文件名冲突',
          message: `目标文件已存在：${baseName}`,
          detail: sameAsSource
            ? '该文件与原文件是同一路径。请选择“覆盖”以直接改写原文件。'
            : '你希望如何处理这个同名文件？',
          checkboxLabel: '全部应用',
          checkboxChecked: false
        });

        if (conflictAnswer.response === 0) decision = 'overwrite';
        else if (conflictAnswer.response === 1) decision = 'keep-both';
        else decision = 'skip';

        if (conflictAnswer.checkboxChecked) {
          conflictPolicy = decision;
        }
      }

      if (decision === 'overwrite') {
        outputPath = directOutputPath;
      } else if (decision === 'keep-both') {
        outputPath = await resolveUniqueOutputPath(targetDirectory, baseName);
      } else {
        failures.push({ path: item.path, reason: '已跳过（同名未覆盖）' });
        completed += 1;
        event.sender.send('save-progress', { completed, total });
        continue;
      }
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
      try {
        await syncMacSpotlightMetadata(outputPath, item);
      } catch (syncError) {
        warnings.push({
          path: item.path,
          reason: syncError instanceof Error ? syncError.message : '系统属性同步失败'
        });
      }
      success += 1;
      exported.push({ sourcePath: item.path, outputPath });
    } catch (error) {
      console.error('[TuneTag] save failed:', {
        input: item.path,
        output: outputPath,
        error: error instanceof Error ? error.message : String(error)
      });
      failures.push({ path: item.path, reason: error instanceof Error ? error.message : '写入异常' });
    }

    completed += 1;
    event.sender.send('save-progress', { completed, total });
  }

  return {
    canceled: false,
    targetDirectory,
    success,
    failed: failures.length,
    failures,
    warnings,
    exported
  };
});
