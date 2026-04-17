import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import type { Track } from './types/tunetag';

type SortKey = 'fileName' | 'artist' | 'album' | 'year' | 'status';
type TrackSnapshot = Omit<Track, 'dirty' | 'status' | 'errorMessage'>;
type BatchForm = {
  title: string;
  artist: string;
  album: string;
  year: string;
  genre: string;
  lyrics: string;
  trackNo: string;
  rawWOAS: string;
  rawCOMM: string;
};

type HistoryKey = 'title' | 'artist' | 'album' | 'year' | 'genre' | 'trackNo' | 'rawWOAS';
type FieldHistory = Record<HistoryKey, string[]>;
type BatchPreset = {
  id: string;
  name: string;
  form: BatchForm;
  createdAt: number;
  updatedAt: number;
};

const HISTORY_STORAGE_KEY = 'tunetag.fieldHistory.v1';
const BATCH_PRESET_STORAGE_KEY = 'tunetag.batchPresets.v1';
const HISTORY_LIMIT = 8;
const BATCH_PRESET_LIMIT = 50;

function emptyFieldHistory(): FieldHistory {
  return {
    title: [],
    artist: [],
    album: [],
    year: [],
    genre: [],
    trackNo: [],
    rawWOAS: []
  };
}

function normalizeHistoryValue(value: string) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function loadFieldHistory(): FieldHistory {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return emptyFieldHistory();
    const parsed = JSON.parse(raw);
    const base = emptyFieldHistory();
    for (const key of Object.keys(base) as HistoryKey[]) {
      const list = Array.isArray(parsed?.[key]) ? parsed[key] : [];
      base[key] = list
        .map((item: string) => normalizeHistoryValue(item))
        .filter(Boolean)
        .slice(0, HISTORY_LIMIT);
    }
    return base;
  } catch {
    return emptyFieldHistory();
  }
}

function pushHistoryEntries(history: FieldHistory, entries: Array<[HistoryKey, string]>) {
  const next: FieldHistory = {
    title: [...history.title],
    artist: [...history.artist],
    album: [...history.album],
    year: [...history.year],
    genre: [...history.genre],
    trackNo: [...history.trackNo],
    rawWOAS: [...history.rawWOAS]
  };

  for (const [key, rawValue] of entries) {
    const value = normalizeHistoryValue(rawValue);
    if (!value) continue;
    next[key] = [value, ...next[key].filter((item) => item !== value)].slice(0, HISTORY_LIMIT);
  }
  return next;
}

function emptyBatchForm(): BatchForm {
  return {
    title: '',
    artist: '',
    album: '',
    year: '',
    genre: '',
    lyrics: '',
    trackNo: '',
    rawWOAS: '',
    rawCOMM: ''
  };
}

function normalizeBatchForm(form: BatchForm): BatchForm {
  return {
    title: String(form.title || ''),
    artist: String(form.artist || ''),
    album: String(form.album || ''),
    year: String(form.year || ''),
    genre: String(form.genre || ''),
    lyrics: String(form.lyrics || ''),
    trackNo: String(form.trackNo || ''),
    rawWOAS: String(form.rawWOAS || ''),
    rawCOMM: String(form.rawCOMM || '')
  };
}

function hasAnyBatchValue(form: BatchForm) {
  return Object.values(form).some((value) => String(value || '').trim().length > 0);
}

function loadBatchPresets(): BatchPreset[] {
  try {
    const raw = localStorage.getItem(BATCH_PRESET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const id = String(item?.id || '');
        const name = String(item?.name || '').trim();
        if (!id || !name) return null;
        return {
          id,
          name,
          form: normalizeBatchForm(item?.form || emptyBatchForm()),
          createdAt: Number(item?.createdAt || Date.now()),
          updatedAt: Number(item?.updatedAt || Date.now())
        } satisfies BatchPreset;
      })
      .filter((item): item is BatchPreset => Boolean(item))
      .slice(0, BATCH_PRESET_LIMIT);
  } catch {
    return [];
  }
}

function toSnapshot(track: Track): TrackSnapshot {
  return {
    id: track.id,
    path: track.path,
    fileName: track.fileName,
    format: track.format,
    title: track.title,
    artist: track.artist,
    album: track.album,
    year: track.year,
    genre: track.genre,
    lyrics: track.lyrics,
    note: track.note,
    trackNo: track.trackNo,
    source: track.source,
    rawTIT2: track.rawTIT2,
    rawTPE1: track.rawTPE1,
    rawTCON: track.rawTCON,
    rawUSLT: track.rawUSLT,
    rawCOMM: track.rawCOMM,
    rawWOAS: track.rawWOAS,
    hasEmbeddedCover: track.hasEmbeddedCover,
    embeddedCoverDataUrl: track.embeddedCoverDataUrl,
    embeddedCoverPath: track.embeddedCoverPath,
    coverDataUrl: track.coverDataUrl,
    coverPath: track.coverPath,
    removeCover: track.removeCover,
    rawAttributes: track.rawAttributes,
    codec: track.codec,
    sampleRate: track.sampleRate,
    bitDepth: track.bitDepth,
    durationSec: track.durationSec,
    fileSizeBytes: track.fileSizeBytes,
    modifiedAt: track.modifiedAt
  };
}

type AppState = {
  tracks: Track[];
  originals: Record<string, TrackSnapshot>;
  selectedIds: string[];
  setTracks: (tracks: Track[]) => void;
  appendTracks: (tracks: Track[]) => { added: number; duplicates: number };
  setSelectedIds: (ids: string[]) => void;
  updateTrack: (id: string, patch: Partial<Track>) => void;
  bulkUpdate: (ids: string[], updater: (track: Track) => Partial<Track>) => void;
  removeTracks: (ids: string[]) => void;
  resetDirty: () => void;
  markSaveResult: (okIds: string[], failures: Array<{ path: string; reason: string }>) => void;
};

const useStore = create<AppState>((set, get) => ({
  tracks: [],
  originals: {},
  selectedIds: [],
  setTracks: (tracks) => {
    const originals = Object.fromEntries(
      tracks.map((track) => [track.id, toSnapshot(track)])
    );
    set({ tracks, originals, selectedIds: tracks.length ? [tracks[0].id] : [] });
  },
  appendTracks: (incoming) => {
    const { tracks, originals, selectedIds } = get();
    const existing = new Set(tracks.map((t) => t.id));
    const newTracks = incoming.filter((t) => !existing.has(t.id));

    if (!newTracks.length) {
      return { added: 0, duplicates: incoming.length };
    }

    const nextTracks = [...tracks, ...newTracks];
    const nextOriginals = { ...originals };
    for (const track of newTracks) {
      nextOriginals[track.id] = toSnapshot(track);
    }

    const nextSelected = selectedIds.length ? selectedIds : [nextTracks[0].id];
    set({ tracks: nextTracks, originals: nextOriginals, selectedIds: nextSelected });
    return { added: newTracks.length, duplicates: incoming.length - newTracks.length };
  },
  setSelectedIds: (ids) => set({ selectedIds: ids }),
  updateTrack: (id, patch) => {
    const { tracks, originals } = get();
    const next = tracks.map((track) => {
      if (track.id !== id) return track;
      const candidate = { ...track, ...patch };
      const base = originals[id];
      const dirty = Boolean(
        base &&
          (candidate.title !== base.title ||
            candidate.artist !== base.artist ||
            candidate.album !== base.album ||
            candidate.year !== base.year ||
            candidate.genre !== base.genre ||
            candidate.lyrics !== base.lyrics ||
            candidate.source !== base.source ||
            candidate.rawTIT2 !== base.rawTIT2 ||
            candidate.rawTPE1 !== base.rawTPE1 ||
            candidate.rawTCON !== base.rawTCON ||
            candidate.rawUSLT !== base.rawUSLT ||
            candidate.rawCOMM !== base.rawCOMM ||
            candidate.rawWOAS !== base.rawWOAS ||
            candidate.note !== base.note ||
            candidate.trackNo !== base.trackNo ||
            candidate.coverDataUrl !== base.coverDataUrl ||
            candidate.coverPath !== base.coverPath ||
            candidate.removeCover !== base.removeCover)
      );
      return {
        ...candidate,
        dirty,
        status: dirty ? ('dirty' as const) : (track.status === 'exported' ? ('exported' as const) : ('clean' as const)),
        errorMessage: ''
      };
    });
    set({ tracks: next });
  },
  bulkUpdate: (ids, updater) => {
    const setIds = new Set(ids);
    const { tracks, originals } = get();
    const next = tracks.map((track) => {
      if (!setIds.has(track.id)) return track;
      const candidate = { ...track, ...updater(track) };
      const base = originals[track.id];
      const dirty = Boolean(
        base &&
          (candidate.title !== base.title ||
            candidate.artist !== base.artist ||
            candidate.album !== base.album ||
            candidate.year !== base.year ||
            candidate.genre !== base.genre ||
            candidate.lyrics !== base.lyrics ||
            candidate.source !== base.source ||
            candidate.rawTIT2 !== base.rawTIT2 ||
            candidate.rawTPE1 !== base.rawTPE1 ||
            candidate.rawTCON !== base.rawTCON ||
            candidate.rawUSLT !== base.rawUSLT ||
            candidate.rawCOMM !== base.rawCOMM ||
            candidate.rawWOAS !== base.rawWOAS ||
            candidate.note !== base.note ||
            candidate.trackNo !== base.trackNo ||
            candidate.coverDataUrl !== base.coverDataUrl ||
            candidate.coverPath !== base.coverPath ||
            candidate.removeCover !== base.removeCover)
      );
      return {
        ...candidate,
        dirty,
        status: dirty ? ('dirty' as const) : (track.status === 'exported' ? ('exported' as const) : ('clean' as const)),
        errorMessage: ''
      };
    });
    set({ tracks: next });
  },
  removeTracks: (ids) => {
    const removeSet = new Set(ids);
    const { tracks, originals, selectedIds } = get();

    const nextTracks = tracks.filter((track) => !removeSet.has(track.id));
    const nextOriginals = Object.fromEntries(
      Object.entries(originals).filter(([id]) => !removeSet.has(id))
    );
    const nextSelected = selectedIds.filter((id) => !removeSet.has(id));

    set({ tracks: nextTracks, originals: nextOriginals, selectedIds: nextSelected });
  },
  resetDirty: () => {
    const { tracks, originals } = get();
    const reset = tracks.map((track) => {
      const base = originals[track.id];
      if (!base) return track;
      return {
        ...track,
        title: base.title,
        artist: base.artist,
        album: base.album,
        year: base.year,
        genre: base.genre,
        lyrics: base.lyrics,
        source: base.source,
        rawTIT2: base.rawTIT2,
        rawTPE1: base.rawTPE1,
        rawTCON: base.rawTCON,
        rawUSLT: base.rawUSLT,
        rawCOMM: base.rawCOMM,
        rawWOAS: base.rawWOAS,
        note: base.note,
        trackNo: base.trackNo,
        coverDataUrl: base.coverDataUrl,
        coverPath: base.coverPath,
        removeCover: base.removeCover,
        dirty: false,
        status: 'clean' as const,
        errorMessage: ''
      };
    });
    set({ tracks: reset });
  },
  markSaveResult: (okIds, failures) => {
    const okSet = new Set(okIds);
    const failMap = new Map(failures.map((item) => [item.path, item.reason]));

    const { tracks, originals } = get();
    const nextTracks = tracks.map((track) => {
      if (okSet.has(track.id)) {
        return { ...track, dirty: false, status: 'exported' as const, errorMessage: '' };
      }
      const reason = failMap.get(track.path);
      if (reason) {
        return { ...track, status: 'error' as const, errorMessage: reason };
      }
      return track;
    });

    const nextOriginals = { ...originals };
    for (const track of nextTracks) {
      if (!track.dirty && !track.errorMessage) {
        nextOriginals[track.id] = toSnapshot(track);
      }
    }

    set({ tracks: nextTracks, originals: nextOriginals });
  }
}));

function statusLabel(track: Track) {
  if (track.status === 'error') return '保存失败';
  if (track.status === 'dirty') return '已修改';
  if (track.status === 'exported') return '已导出';
  return '未修改';
}

function App() {
  const api = window.tunetag;
  const isMac = navigator.userAgent.toLowerCase().includes('mac');
  const { tracks, originals, selectedIds, appendTracks, setSelectedIds, updateTrack, bulkUpdate, removeTracks, resetDirty, markSaveResult } = useStore();

  const [sortKey, setSortKey] = useState<SortKey>('fileName');
  const [sortAsc, setSortAsc] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [saveMessage, setSaveMessage] = useState('');
  const [saveFailures, setSaveFailures] = useState<Array<{ path: string; reason: string }>>([]);
  const [fieldHistory, setFieldHistory] = useState<FieldHistory>(() => loadFieldHistory());
  const [batchPresets, setBatchPresets] = useState<BatchPreset[]>(() => loadBatchPresets());
  const [activeBatchPresetId, setActiveBatchPresetId] = useState('');
  const [showPresetNameModal, setShowPresetNameModal] = useState(false);
  const [pendingPresetName, setPendingPresetName] = useState('');
  const [batchForm, setBatchForm] = useState<BatchForm>(() => emptyBatchForm());

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(fieldHistory));
    } catch {
      // ignore storage write failures
    }
  }, [fieldHistory]);

  useEffect(() => {
    try {
      localStorage.setItem(BATCH_PRESET_STORAGE_KEY, JSON.stringify(batchPresets));
    } catch {
      // ignore storage write failures
    }
  }, [batchPresets]);

  useEffect(() => {
    if (!activeBatchPresetId) return;
    if (batchPresets.some((preset) => preset.id === activeBatchPresetId)) return;
    setActiveBatchPresetId('');
  }, [batchPresets, activeBatchPresetId]);

  function rememberHistory(entries: Array<[HistoryKey, string]>) {
    if (!entries.length) return;
    setFieldHistory((prev) => pushHistoryEntries(prev, entries));
  }

  function removeHistoryEntry(field: HistoryKey, value: string) {
    setFieldHistory((prev) => ({
      ...prev,
      [field]: prev[field].filter((item) => item !== value)
    }));
  }

  function historyLabel(value: string) {
    if (value.length <= 16) return value;
    return `${value.slice(0, 16)}…`;
  }

  useEffect(() => {
    if (!api) return;
    const unsubscribe = api.onSaveProgress((payload) => setProgress(payload));
    return unsubscribe;
  }, [api]);

  useEffect(() => {
    const preventDefault = (event: DragEvent) => {
      event.preventDefault();
    };
    window.addEventListener('dragover', preventDefault);
    window.addEventListener('drop', preventDefault);
    return () => {
      window.removeEventListener('dragover', preventDefault);
      window.removeEventListener('drop', preventDefault);
    };
  }, []);

  useEffect(() => {
    if (!saveMessage) return;
    const timer = setTimeout(() => setSaveMessage(''), 3200);
    return () => clearTimeout(timer);
  }, [saveMessage]);

  useEffect(() => {
    setBatchForm(emptyBatchForm());
    setActiveBatchPresetId('');
  }, [selectedIds.length]);

  useEffect(() => {
    if (!showPresetNameModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowPresetNameModal(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showPresetNameModal]);

  useEffect(() => {
    if (!tracks.length) return;
    if (!selectedIds.length || !tracks.some((t) => t.id === selectedIds[0])) {
      setSelectedIds([tracks[0].id]);
    }
  }, [tracks, selectedIds, setSelectedIds]);

  const filteredSorted = useMemo(() => {
    return [...tracks].sort((a, b) => {
      const aValue = sortKey === 'status' ? statusLabel(a) : (a[sortKey] as string);
      const bValue = sortKey === 'status' ? statusLabel(b) : (b[sortKey] as string);
      const result = aValue.localeCompare(bValue, 'zh-CN', { numeric: true, sensitivity: 'base' });
      return sortAsc ? result : -result;
    });
  }, [tracks, sortKey, sortAsc]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedTracks = tracks.filter((track) => selectedSet.has(track.id));
  const dirtyCount = tracks.filter((t) => t.dirty).length;
  const hasBatchInput = hasAnyBatchValue(batchForm);
  const canSave = selectedTracks.length > 1 ? hasBatchInput && !saving : dirtyCount > 0 && !saving;
  const hasImported = tracks.length > 0;

  useEffect(() => {
    if (!api) return;
    if (selectedTracks.length !== 1) return;
    const track = selectedTracks[0];
    if (!track.hasEmbeddedCover) return;
    if (track.embeddedCoverDataUrl) return;

    let canceled = false;
    api.getEmbeddedCover(track.path).then((cover) => {
      if (canceled || !cover?.hasEmbeddedCover) return;
      updateTrack(track.id, {
        embeddedCoverPath: cover.embeddedCoverPath || '',
        embeddedCoverDataUrl: cover.embeddedCoverDataUrl || ''
      });
    }).catch(() => {});

    return () => {
      canceled = true;
    };
  }, [api, selectedTracks, updateTrack]);

  async function importPaths(paths: string[]) {
    if (!api) {
      setSaveMessage('请在 Electron 桌面应用中运行（浏览器模式不支持本地文件能力）');
      return;
    }
    if (!paths.length) return;
    const { tracks: incoming, skipped } = await api.importPaths(paths);
    const { added, duplicates } = appendTracks(incoming);
    const parts = [`已新增 ${added} 个文件`];
    if (duplicates > 0) parts.push(`重复 ${duplicates} 个`);
    if (skipped.length > 0) parts.push(`跳过 ${skipped.length} 个（不支持或不可访问）`);
    setSaveMessage(parts.join('，'));
  }

  async function onLandingBrandClick() {
    const target = 'https://fengsound.top/';
    if (api?.openExternalUrl) {
      const ok = await api.openExternalUrl(target);
      if (!ok) window.open(target, '_blank', 'noopener,noreferrer');
      return;
    }
    window.open(target, '_blank', 'noopener,noreferrer');
  }

  async function onPickFiles() {
    if (!api) {
      setSaveMessage('请在 Electron 桌面应用中运行（浏览器模式不支持选择本地文件）');
      return;
    }
    const paths = await api.pickPaths();
    await importPaths(paths);
  }

  async function onDropFiles(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const addPath = (set: Set<string>, raw: string) => {
      const normalized = String(raw || '').trim();
      if (!normalized) return;
      if (normalized.startsWith('file://')) {
        try {
          set.add(decodeURI(new URL(normalized).pathname));
          return;
        } catch {
          // ignore malformed url
        }
      }
      set.add(normalized);
    };

    const pathSet = new Set<string>();
    const files = Array.from(event.dataTransfer.files || []);
    for (const file of files) {
      const fromElectron = window.tunetag?.getPathForFile?.(file) || '';
      const fallback = (file as File & { path?: string }).path || '';
      addPath(pathSet, fromElectron || fallback);
    }

    const items = Array.from(event.dataTransfer.items || []);
    for (const item of items) {
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (!file) continue;
      const fromElectron = window.tunetag?.getPathForFile?.(file) || '';
      const fallback = (file as File & { path?: string }).path || '';
      addPath(pathSet, fromElectron || fallback);
    }

    const uriList = event.dataTransfer.getData('text/uri-list') || '';
    if (uriList) {
      for (const line of uriList.split(/\r?\n/u)) {
        const value = line.trim();
        if (!value || value.startsWith('#')) continue;
        addPath(pathSet, value);
      }
    }

    const plainText = event.dataTransfer.getData('text/plain') || '';
    if (plainText.includes('file://')) {
      for (const token of plainText.split(/\s+/u)) {
        if (token.startsWith('file://')) addPath(pathSet, token);
      }
    }

    const paths = Array.from(pathSet);

    if (!paths.length) {
      setSaveMessage('拖拽成功但未读取到文件路径，请改用“选择文件”或继续导入');
      return;
    }

    await importPaths(paths);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((prev) => !prev);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function toggleRow(id: string, checked: boolean) {
    const next = checked ? Array.from(new Set([...selectedIds, id])) : selectedIds.filter((v) => v !== id);
    setSelectedIds(next);
  }

  function selectOnly(id: string) {
    setSelectedIds([id]);
  }

  function selectAllCurrent(checked: boolean) {
    if (!checked) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(filteredSorted.map((t) => t.id));
  }

  function buildBatchUpdater() {
    const allowSource = selectedTracks.some((track) => {
      const original = originals[track.id];
      return Boolean(original?.rawWOAS?.trim() || track.rawWOAS?.trim());
    });
    const allowNote = selectedTracks.some((track) => {
      const original = originals[track.id];
      return Boolean(original?.rawCOMM?.trim() || track.rawCOMM?.trim());
    });
    const normalized: BatchForm = {
      title: batchForm.title.trim(),
      artist: batchForm.artist.trim(),
      album: batchForm.album.trim(),
      year: batchForm.year.trim(),
      genre: batchForm.genre.trim(),
      lyrics: batchForm.lyrics.trim(),
      trackNo: batchForm.trackNo.trim(),
      rawWOAS: allowSource ? batchForm.rawWOAS.trim() : '',
      rawCOMM: allowNote ? batchForm.rawCOMM.trim() : ''
    };

    const updater = (track: Track): Partial<Track> => {
      const nextTitle = normalized.title ? normalized.title : track.title;
      const nextArtist = normalized.artist ? normalized.artist : track.artist;
      const nextAlbum = normalized.album;
      const nextYear = normalized.year;
      const nextGenre = normalized.genre;
      const nextLyrics = normalized.lyrics;
      const nextTrackNo = normalized.trackNo;
      const nextSource = allowSource ? normalized.rawWOAS : track.source;
      const nextNote = allowNote ? normalized.rawCOMM : track.note;
      return {
        title: nextTitle,
        artist: nextArtist,
        album: nextAlbum,
        year: nextYear,
        genre: nextGenre,
        lyrics: nextLyrics,
        trackNo: nextTrackNo,
        source: nextSource,
        note: nextNote,
        rawTIT2: nextTitle,
        rawTPE1: nextArtist,
        rawTCON: nextGenre,
        rawUSLT: nextLyrics,
        rawCOMM: nextNote,
        rawWOAS: nextSource
      };
    };

    return { normalized, updater };
  }

  function getEditableRules(track: Track) {
    const ext = track.path.toLowerCase().split('.').pop() || '';
    const commonEditable = ext === 'mp3' || ext === 'flac' || ext === 'm4a' || ext === 'wav';
    return {
      commonEditable,
      coverEditable: ext === 'mp3'
    };
  }

  async function onPickCover(trackId: string) {
    if (!api) return;
    const coverPath = await api.pickCoverImage();
    if (!coverPath) return;
    const coverDataUrl = await api.readImageDataUrl(coverPath);
    updateTrack(trackId, { coverPath, coverDataUrl, removeCover: false });
  }

  function onRemoveCover(track: Track) {
    if (!getEditableRules(track).coverEditable) return;
    updateTrack(track.id, { coverPath: '', coverDataUrl: '', removeCover: true });
  }

  async function saveTrackList(targetTracks: Track[], messagePrefix = '已保存到') {
    if (!api) {
      setSaveMessage('请在 Electron 桌面应用中运行（浏览器模式不支持写入标签）');
      return;
    }
    if (!targetTracks.length || saving) return;

    setSaving(true);
    setSaveFailures([]);
    setProgress({ completed: 0, total: targetTracks.length });

    try {
      const payload = targetTracks.map((track) => ({
        path: track.path,
        title: track.title,
        artist: track.artist,
        album: track.album,
        year: track.year,
        genre: track.genre,
        lyrics: track.lyrics,
        note: track.note,
        source: track.source,
        coverPath: track.coverPath,
        removeCover: track.removeCover,
        rawTIT2: track.rawTIT2,
        rawTPE1: track.rawTPE1,
        rawTCON: track.rawTCON,
        rawUSLT: track.rawUSLT,
        rawCOMM: track.rawCOMM,
        rawWOAS: track.rawWOAS,
        trackNo: track.trackNo
      }));

      const result = await api.saveTracks(payload);
      if (result.canceled) {
        setSaveMessage('已取消保存');
        return;
      }
      setSaveFailures(result.failures || []);
      const failedSet = new Set(result.failures.map((f) => f.path));
      const okIds = targetTracks.map((t) => t.id).filter((id) => !failedSet.has(id));

      markSaveResult(okIds, result.failures);
      rememberHistory(
        targetTracks.flatMap((track) => ([
          ['title', track.title],
          ['artist', track.artist],
          ['album', track.album],
          ['year', track.year],
          ['genre', track.genre],
          ['trackNo', track.trackNo],
          ['rawWOAS', track.rawWOAS]
        ] as Array<[HistoryKey, string]>))
      );
      setSaveMessage(
        `${messagePrefix} ${result.targetDirectory || '目标文件夹'}：成功 ${result.success} 个；失败 ${result.failed} 个`
      );
    } catch {
      setSaveMessage('保存异常，请重试');
    } finally {
      setSaving(false);
    }
  }

  async function onSave() {
    if (saving) return;
    if (selectedTracks.length > 1) {
      if (!selectedIds.length) return;
      const { updater } = buildBatchUpdater();
      bulkUpdate(selectedIds, updater);
      const selectedSetForSave = new Set(selectedIds);
      const updatedSelected = useStore.getState().tracks.filter((track) => selectedSetForSave.has(track.id));
      await saveTrackList(updatedSelected, '已应用并保存到');
      return;
    }

    const dirtyTracks = tracks.filter((track) => track.dirty);
    if (!dirtyTracks.length) return;
    await saveTrackList(dirtyTracks, '已保存到');
  }

  function onRemoveSelected() {
    if (!selectedIds.length) return;
    const removeCount = selectedIds.length;
    removeTracks(selectedIds);
      setSaveMessage(`已从列表移出 ${removeCount} 个文件（未删除本地文件）`);
  }

  function buildDefaultPresetName(form: BatchForm) {
    const pairs: Array<[string, string]> = [
      ['标题', form.title],
      ['艺术家', form.artist],
      ['专辑', form.album],
      ['流派', form.genre],
      ['年份', form.year]
    ];
    const firstNonEmpty = pairs.find(([, value]) => String(value || '').trim());
    if (firstNonEmpty) return `${firstNonEmpty[0]}-${String(firstNonEmpty[1]).trim().slice(0, 12)}`;
    return `预设-${new Date().toLocaleDateString('zh-CN')}`;
  }

  function selectPreset(id: string) {
    setActiveBatchPresetId(id);
  }

  function onOpenSavePresetDialog() {
    const normalized = normalizeBatchForm(batchForm);
    if (!hasAnyBatchValue(normalized)) {
      setSaveMessage('请先填写至少一个批量字段，再保存预设');
      return;
    }
    setPendingPresetName(buildDefaultPresetName(normalized));
    setShowPresetNameModal(true);
  }

  function onSaveBatchPreset() {
    const normalized = normalizeBatchForm(batchForm);
    if (!hasAnyBatchValue(normalized)) {
      setSaveMessage('请先填写至少一个批量字段，再保存预设');
      setShowPresetNameModal(false);
      return;
    }

    const name = pendingPresetName.trim() || buildDefaultPresetName(normalized);
    if (!name) {
      setSaveMessage('预设名称不能为空');
      return;
    }

    const now = Date.now();
    const normalizedName = name.slice(0, 32);
    const existing = batchPresets.find((preset) => preset.name.toLowerCase() === normalizedName.toLowerCase());
    if (existing) {
      setBatchPresets((prev) =>
        prev.map((preset) =>
          preset.id === existing.id
            ? { ...preset, name: normalizedName, form: normalized, updatedAt: now }
            : preset
        )
      );
      setActiveBatchPresetId(existing.id);
      setSaveMessage(existing.id === activeBatchPresetId ? `已更新预设：${normalizedName}` : `同名预设已覆盖：${normalizedName}`);
      setShowPresetNameModal(false);
      return;
    }

    const created: BatchPreset = {
      id: `${now}-${Math.random().toString(16).slice(2, 8)}`,
      name: normalizedName,
      form: normalized,
      createdAt: now,
      updatedAt: now
    };
    setBatchPresets((prev) => [created, ...prev].slice(0, BATCH_PRESET_LIMIT));
    setActiveBatchPresetId(created.id);
    setSaveMessage(`已保存预设：${normalizedName}`);
    setShowPresetNameModal(false);
  }

  function onApplyBatchPreset() {
    if (!activeBatchPresetId) return;
    const preset = batchPresets.find((item) => item.id === activeBatchPresetId);
    if (!preset) return;
    setBatchForm(normalizeBatchForm(preset.form));
    setSaveMessage(`已应用预设：${preset.name}`);
  }

  function onDeleteBatchPreset() {
    if (!activeBatchPresetId) return;
    const preset = batchPresets.find((item) => item.id === activeBatchPresetId);
    if (!preset) return;
    setBatchPresets((prev) => prev.filter((item) => item.id !== activeBatchPresetId));
    setActiveBatchPresetId('');
    setSaveMessage(`已删除预设：${preset.name}`);
  }

  function renderHistoryChips(field: HistoryKey, onPick: (value: string) => void) {
    const options = fieldHistory[field];
    if (!options.length) return null;
    return (
      <div className="history-row">
        {options.map((value) => (
          <div key={`${field}-${value}`} className="history-chip-wrap">
            <button
              type="button"
              className="history-chip"
              title={value}
              onClick={() => onPick(value)}
            >
              {historyLabel(value)}
            </button>
            <button
              type="button"
              className="history-chip-remove"
              title="删除该历史记录"
              aria-label="删除该历史记录"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                removeHistoryEntry(field, value);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    );
  }

  function renderEmpty() {
    return (
      <div
        className={`shell ${isMac ? 'macos-shell' : ''} ${dragging ? 'dragging-shell' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDropFiles}
      >
        <header className="topbar">
          <h1>乐签 TuneTag</h1>
        </header>
        <main className="empty-main">
          <div
            className={`drop-zone ${dragging ? 'dragging' : ''}`}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragging(false);
            }}
            onDrop={onDropFiles}
          >
            <div className="drop-card">
              <div className="drop-icon">📁</div>
              <h2>音乐标签修改大师</h2>
              <p>拖入媒体文件或文件夹开始工作</p>
              <button className="primary" onClick={onPickFiles}>选择文件</button>
            </div>
          </div>
          <div className="hint-row">
            <span>支持 MP3 / FLAC / WAV / M4A</span>
            <span>支持批量导入</span>
          </div>
          <button type="button" className="landing-brand-link" onClick={onLandingBrandClick}>
            奇趣实验室 X 风声 联合出品
          </button>
        </main>
      </div>
    );
  }

  function renderSingleEditor(track: Track) {
    const rules = getEditableRules(track);
    const original = originals[track.id];
    const showSourceField = Boolean(original?.rawWOAS?.trim() || track.rawWOAS?.trim());
    const showNoteField = Boolean(original?.rawCOMM?.trim() || track.rawCOMM?.trim());
    const coverSrc = track.removeCover
      ? ''
      : track.coverDataUrl
        ? track.coverDataUrl
        : track.coverPath
          ? `file://${encodeURI(track.coverPath)}`
        : track.embeddedCoverDataUrl
          ? track.embeddedCoverDataUrl
          : track.embeddedCoverPath
            ? `file://${encodeURI(track.embeddedCoverPath)}`
            : '';
    return (
      <div className="panel-group">
        <h3>可编辑标签</h3>
        <label>标题</label>
        <input
          disabled={!rules.commonEditable}
          className={!rules.commonEditable ? 'input-disabled' : ''}
          value={track.title}
          onChange={(e) => updateTrack(track.id, { title: e.target.value, rawTIT2: e.target.value })}
          onBlur={(e) => rememberHistory([['title', e.target.value]])}
        />
        {renderHistoryChips('title', (value) => updateTrack(track.id, { title: value, rawTIT2: value }))}
        <label>艺术家</label>
        <input
          disabled={!rules.commonEditable}
          className={!rules.commonEditable ? 'input-disabled' : ''}
          value={track.artist}
          onChange={(e) => updateTrack(track.id, { artist: e.target.value, rawTPE1: e.target.value })}
          onBlur={(e) => rememberHistory([['artist', e.target.value]])}
        />
        {renderHistoryChips('artist', (value) => updateTrack(track.id, { artist: value, rawTPE1: value }))}
        <label>专辑</label>
        <input
          disabled={!rules.commonEditable}
          className={!rules.commonEditable ? 'input-disabled' : ''}
          value={track.album}
          onChange={(e) => updateTrack(track.id, { album: e.target.value })}
          onBlur={(e) => rememberHistory([['album', e.target.value]])}
        />
        {renderHistoryChips('album', (value) => updateTrack(track.id, { album: value }))}
        <label>流派</label>
        <input
          disabled={!rules.commonEditable}
          className={!rules.commonEditable ? 'input-disabled' : ''}
          value={track.genre}
          onChange={(e) => updateTrack(track.id, { genre: e.target.value, rawTCON: e.target.value })}
          onBlur={(e) => rememberHistory([['genre', e.target.value]])}
        />
        {renderHistoryChips('genre', (value) => updateTrack(track.id, { genre: value, rawTCON: value }))}
        <div className="row-2">
          <div>
            <label>年份</label>
            <input
              disabled={!rules.commonEditable}
              className={!rules.commonEditable ? 'input-disabled' : ''}
              value={track.year}
              onChange={(e) => updateTrack(track.id, { year: e.target.value })}
              onBlur={(e) => rememberHistory([['year', e.target.value]])}
            />
            {renderHistoryChips('year', (value) => updateTrack(track.id, { year: value }))}
          </div>
          <div>
            <label>曲目号</label>
            <input
              disabled={!rules.commonEditable}
              className={!rules.commonEditable ? 'input-disabled' : ''}
              value={track.trackNo}
              onChange={(e) => updateTrack(track.id, { trackNo: e.target.value })}
              onBlur={(e) => rememberHistory([['trackNo', e.target.value]])}
            />
            {renderHistoryChips('trackNo', (value) => updateTrack(track.id, { trackNo: value }))}
          </div>
        </div>
        <label>歌词</label>
        <textarea disabled={!rules.commonEditable} className={`lyrics-textarea ${!rules.commonEditable ? 'input-disabled' : ''}`} value={track.lyrics} onChange={(e) => updateTrack(track.id, { lyrics: e.target.value, rawUSLT: e.target.value })} rows={10} />
        {showSourceField && (
          <>
            <label>自定义</label>
            <input
              disabled={!rules.commonEditable}
              className={!rules.commonEditable ? 'input-disabled' : ''}
              value={track.rawWOAS}
              onChange={(e) => updateTrack(track.id, { rawWOAS: e.target.value, source: e.target.value })}
              onBlur={(e) => rememberHistory([['rawWOAS', e.target.value]])}
            />
            {renderHistoryChips('rawWOAS', (value) => updateTrack(track.id, { rawWOAS: value, source: value }))}
          </>
        )}
        {showNoteField && (
          <>
            <label>备注</label>
            <textarea disabled={!rules.commonEditable} className={!rules.commonEditable ? 'input-disabled' : ''} value={track.rawCOMM} onChange={(e) => updateTrack(track.id, { rawCOMM: e.target.value, note: e.target.value })} rows={4} />
            <p className="field-tip">这里会按原始标签写回文件。</p>
          </>
        )}

        <label>封面图片</label>
        {coverSrc ? (
          <div className="cover-preview">
            <img src={coverSrc} alt="封面预览" />
          </div>
        ) : (
          <div className="cover-preview cover-preview-empty">暂无封面</div>
        )}
        <div className="cover-row">
          <button className="ghost" disabled={!rules.coverEditable} onClick={() => onPickCover(track.id)}>
            {track.coverPath ? '更换封面' : '选择封面'}
          </button>
          <button className="ghost" disabled={!rules.coverEditable || (!track.coverPath && !track.hasEmbeddedCover)} onClick={() => onRemoveCover(track)}>
            删除封面
          </button>
        </div>

        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>原始属性（参考）</summary>
          <div className="meta-list" style={{ marginTop: 10 }}>
            {track.rawAttributes.map((item) => (
              <div key={`${item.key}-${item.value}`}>
                <span>{item.key}</span>
                <strong title={item.value}>{item.value}</strong>
              </div>
            ))}
            {track.errorMessage ? <div><span>状态</span><strong>{track.errorMessage}</strong></div> : null}
          </div>
        </details>
      </div>
    );
  }

  function renderBatchEditor() {
    const showBatchSourceField = selectedTracks.some((track) => {
      const original = originals[track.id];
      return Boolean(original?.rawWOAS?.trim() || track.rawWOAS?.trim());
    });
    const showBatchNoteField = selectedTracks.some((track) => {
      const original = originals[track.id];
      return Boolean(original?.rawCOMM?.trim() || track.rawCOMM?.trim());
    });
    return (
      <div className="panel-group">
        <h3>批量编辑（可编辑标签）</h3>
        <p className="batch-tip">已选中 {selectedIds.length} 个文件，当前为批量编辑模式</p>
        <div className="preset-toolbar">
          <label>规则模板预设</label>
          <div className="preset-select-row">
            <select
              value={activeBatchPresetId}
              onChange={(e) => selectPreset(e.target.value)}
            >
              <option value="">选择已保存预设</option>
              {batchPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </div>
          <div className="preset-action-buttons">
            <button
              type="button"
              className={activeBatchPresetId ? 'primary' : 'ghost'}
              disabled={!activeBatchPresetId}
              onClick={onApplyBatchPreset}
            >
              应用
            </button>
            <button type="button" className="ghost" onClick={onOpenSavePresetDialog}>保存</button>
            <button type="button" className="ghost" disabled={!activeBatchPresetId} onClick={onDeleteBatchPreset}>删除</button>
          </div>
        </div>

        <label>标题</label>
        <input
          value={batchForm.title}
          onChange={(e) => setBatchForm((p) => ({ ...p, title: e.target.value }))}
          onBlur={(e) => rememberHistory([['title', e.target.value]])}
        />
        {renderHistoryChips('title', (value) => setBatchForm((p) => ({ ...p, title: value })))}
        <label>艺术家</label>
        <input
          value={batchForm.artist}
          onChange={(e) => setBatchForm((p) => ({ ...p, artist: e.target.value }))}
          onBlur={(e) => rememberHistory([['artist', e.target.value]])}
        />
        {renderHistoryChips('artist', (value) => setBatchForm((p) => ({ ...p, artist: value })))}
        <label>专辑</label>
        <input
          value={batchForm.album}
          onChange={(e) => setBatchForm((p) => ({ ...p, album: e.target.value }))}
          onBlur={(e) => rememberHistory([['album', e.target.value]])}
        />
        {renderHistoryChips('album', (value) => setBatchForm((p) => ({ ...p, album: value })))}
        <label>流派</label>
        <input
          value={batchForm.genre}
          onChange={(e) => setBatchForm((p) => ({ ...p, genre: e.target.value }))}
          onBlur={(e) => rememberHistory([['genre', e.target.value]])}
        />
        {renderHistoryChips('genre', (value) => setBatchForm((p) => ({ ...p, genre: value })))}
        <div className="row-2">
          <div>
            <label>年份</label>
            <input
              value={batchForm.year}
              onChange={(e) => setBatchForm((p) => ({ ...p, year: e.target.value }))}
              onBlur={(e) => rememberHistory([['year', e.target.value]])}
            />
            {renderHistoryChips('year', (value) => setBatchForm((p) => ({ ...p, year: value })))}
          </div>
          <div>
            <label>曲目号</label>
            <input
              value={batchForm.trackNo}
              onChange={(e) => setBatchForm((p) => ({ ...p, trackNo: e.target.value }))}
              onBlur={(e) => rememberHistory([['trackNo', e.target.value]])}
            />
            {renderHistoryChips('trackNo', (value) => setBatchForm((p) => ({ ...p, trackNo: value })))}
          </div>
        </div>
        <label>歌词</label>
        <textarea className="lyrics-textarea" rows={8} value={batchForm.lyrics} onChange={(e) => setBatchForm((p) => ({ ...p, lyrics: e.target.value }))} />
        {showBatchSourceField && (
          <>
            <label>自定义</label>
            <input
              value={batchForm.rawWOAS}
              onChange={(e) => setBatchForm((p) => ({ ...p, rawWOAS: e.target.value }))}
              onBlur={(e) => rememberHistory([['rawWOAS', e.target.value]])}
            />
            {renderHistoryChips('rawWOAS', (value) => setBatchForm((p) => ({ ...p, rawWOAS: value })))}
          </>
        )}
        {showBatchNoteField && (
          <>
            <label>备注</label>
            <textarea rows={3} value={batchForm.rawCOMM} onChange={(e) => setBatchForm((p) => ({ ...p, rawCOMM: e.target.value }))} />
          </>
        )}

        <p className="field-tip batch-apply-tip">
          批量模式下点击右上角“保存”，将自动应用并保存当前选中文件
          <br />
          标题、艺术家留空：不修改
          <br />
          其它字段留空：清空写入
        </p>
      </div>
    );
  }

  function renderPresetNameModal() {
    if (!showPresetNameModal) return null;
    return (
      <div className="modal-mask" onClick={() => setShowPresetNameModal(false)}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <h4>保存批量预设</h4>
          <p>请输入预设名称</p>
          <input
            type="text"
            autoFocus
            value={pendingPresetName}
            onChange={(e) => setPendingPresetName(e.target.value)}
            maxLength={32}
            placeholder="例如：电音专辑标准化"
          />
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={() => setShowPresetNameModal(false)}>取消</button>
            <button type="button" className="primary" onClick={onSaveBatchPreset}>确认保存</button>
          </div>
        </div>
      </div>
    );
  }

  function renderWorkspace() {
    return (
      <div
        className={`shell ${isMac ? 'macos-shell' : ''} ${dragging ? 'dragging-shell' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDropFiles}
      >
        <header className="topbar">
          <h1>乐签 TuneTag</h1>
          <div className="actions">
            <button className="ghost" onClick={onPickFiles}>继续导入</button>
            <button className="ghost" disabled={!selectedIds.length || saving} onClick={onRemoveSelected}>
              移出列表
            </button>
            <button className="primary" disabled={!canSave} onClick={onSave}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </header>

        <main className="workspace">
          <section className="table-pane">
            <div className="table-toolbar">
              <label className="select-all">
                <input
                  type="checkbox"
                  checked={filteredSorted.length > 0 && filteredSorted.every((t) => selectedSet.has(t.id))}
                  onChange={(e) => selectAllCurrent(e.target.checked)}
                />
                全选
              </label>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th onClick={() => toggleSort('fileName')}>文件名</th>
                    <th onClick={() => toggleSort('artist')}>艺术家</th>
                    <th onClick={() => toggleSort('album')}>专辑</th>
                    <th onClick={() => toggleSort('year')}>年份</th>
                    <th onClick={() => toggleSort('status')}>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSorted.map((track) => {
                    const selected = selectedSet.has(track.id);
                    return (
                      <tr key={track.id} className={selected ? 'selected' : ''} onClick={() => selectOnly(track.id)}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => toggleRow(track.id, e.target.checked)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        <td title={track.fileName}>{track.fileName}</td>
                        <td title={track.artist}>{track.artist}</td>
                        <td title={track.album}>{track.album}</td>
                        <td>{track.year}</td>
                        <td className={track.status === 'error' ? 'status-error' : track.status === 'dirty' ? 'status-dirty' : track.status === 'exported' ? 'status-exported' : ''}>
                          {statusLabel(track)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="side-pane">
            {selectedTracks.length === 1 && renderSingleEditor(selectedTracks[0])}
            {selectedTracks.length > 1 && renderBatchEditor()}
            {selectedTracks.length === 0 && <p className="placeholder">请选择一个或多个文件</p>}
          </aside>
        </main>

        <footer className="footer">
          <div>
            已导入 {tracks.length} 个文件，待保存 {dirtyCount} 个
            {saving && progress.total > 0 ? `（${progress.completed}/${progress.total}）` : ''}
          </div>
          <div className="footer-actions">
            <button className="ghost" onClick={resetDirty} disabled={!dirtyCount || saving}>取消修改</button>
          </div>
        </footer>

        {saveFailures.length > 0 && (
          <div className="failure-panel">
            <div className="failure-title">保存失败详情（{saveFailures.length}）</div>
            <ul>
              {saveFailures.map((item) => (
                <li key={`${item.path}-${item.reason}`}>
                  <span title={item.path}>{item.path}</span>
                  <strong>{item.reason}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}

        {saveMessage && <div className="toast">{saveMessage}</div>}
        {renderPresetNameModal()}
      </div>
    );
  }

  return hasImported ? renderWorkspace() : renderEmpty();
}

export default App;
