import { create } from 'zustand';
import type { Track } from './types/tunetag';

export type SortKey = 'fileName' | 'artist' | 'album' | 'year' | 'status';
export type TrackSnapshot = Omit<Track, 'dirty' | 'status' | 'errorMessage'>;

export type BatchForm = {
  title: string;
  artist: string;
  album: string;
  composer: string;
  lyricist: string;
  year: string;
  genre: string;
  lyrics: string;
  trackNo: string;
  rawWOAS: string;
  rawCOMM: string;
};

export type HistoryKey =
  | 'title'
  | 'artist'
  | 'album'
  | 'composer'
  | 'lyricist'
  | 'year'
  | 'genre'
  | 'trackNo'
  | 'rawWOAS';

export type FieldHistory = Record<HistoryKey, string[]>;

export type BatchPreset = {
  id: string;
  name: string;
  form: BatchForm;
  createdAt: number;
  updatedAt: number;
};

export const HISTORY_STORAGE_KEY = 'tunetag.fieldHistory.v1';
export const BATCH_PRESET_STORAGE_KEY = 'tunetag.batchPresets.v1';
export const HISTORY_LIMIT = 8;
export const BATCH_PRESET_LIMIT = 50;

export function emptyFieldHistory(): FieldHistory {
  return {
    title: [],
    artist: [],
    album: [],
    composer: [],
    lyricist: [],
    year: [],
    genre: [],
    trackNo: [],
    rawWOAS: []
  };
}

export function normalizeHistoryValue(value: string) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function loadFieldHistory(): FieldHistory {
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

export function pushHistoryEntries(history: FieldHistory, entries: Array<[HistoryKey, string]>) {
  const next: FieldHistory = {
    title: [...history.title],
    artist: [...history.artist],
    album: [...history.album],
    composer: [...history.composer],
    lyricist: [...history.lyricist],
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

export function emptyBatchForm(): BatchForm {
  return {
    title: '',
    artist: '',
    album: '',
    composer: '',
    lyricist: '',
    year: '',
    genre: '',
    lyrics: '',
    trackNo: '',
    rawWOAS: '',
    rawCOMM: ''
  };
}

export function normalizeBatchForm(form: BatchForm): BatchForm {
  return {
    title: String(form.title || ''),
    artist: String(form.artist || ''),
    album: String(form.album || ''),
    composer: String(form.composer || ''),
    lyricist: String(form.lyricist || ''),
    year: String(form.year || ''),
    genre: String(form.genre || ''),
    lyrics: String(form.lyrics || ''),
    trackNo: String(form.trackNo || ''),
    rawWOAS: String(form.rawWOAS || ''),
    rawCOMM: String(form.rawCOMM || '')
  };
}

export function hasAnyBatchValue(form: BatchForm) {
  return Object.values(form).some((value) => String(value || '').trim().length > 0);
}

export function loadBatchPresets(): BatchPreset[] {
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

export function toSnapshot(track: Track): TrackSnapshot {
  return {
    id: track.id,
    path: track.path,
    fileName: track.fileName,
    format: track.format,
    title: track.title,
    artist: track.artist,
    album: track.album,
    composer: track.composer,
    lyricist: track.lyricist,
    year: track.year,
    genre: track.genre,
    lyrics: track.lyrics,
    note: track.note,
    trackNo: track.trackNo,
    source: track.source,
    rawTIT2: track.rawTIT2,
    rawTPE1: track.rawTPE1,
    rawTCOM: track.rawTCOM,
    rawTEXT: track.rawTEXT,
    rawTCON: track.rawTCON,
    rawUSLT: track.rawUSLT,
    rawCOMM: track.rawCOMM,
    rawWOAS: track.rawWOAS,
    hasEmbeddedCover: track.hasEmbeddedCover,
    embeddedCoverDataUrl: track.embeddedCoverDataUrl,
    embeddedCoverPath: track.embeddedCoverPath,
    coverDataUrl: track.coverDataUrl,
    coverPath: track.coverPath,
    exportedPath: track.exportedPath,
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

export const DIRTY_FIELDS: Array<keyof TrackSnapshot> = [
  'title',
  'artist',
  'album',
  'composer',
  'lyricist',
  'year',
  'genre',
  'lyrics',
  'source',
  'rawTIT2',
  'rawTPE1',
  'rawTCOM',
  'rawTEXT',
  'rawTCON',
  'rawUSLT',
  'rawCOMM',
  'rawWOAS',
  'note',
  'trackNo',
  'coverDataUrl',
  'coverPath',
  'removeCover'
];

export function computeDirty(track: Track, base: TrackSnapshot | undefined): boolean {
  if (!base) return false;
  return DIRTY_FIELDS.some((field) => track[field] !== base[field]);
}

export type AppState = {
  tracks: Track[];
  originals: Record<string, TrackSnapshot>;
  selectedIds: string[];
  setTracks: (tracks: Track[]) => void;
  appendTracks: (tracks: Track[]) => { added: number; duplicates: number };
  setSelectedIds: (ids: string[]) => void;
  updateTrack: (id: string, patch: Partial<Track>) => void;
  // 后台 ffprobe 补推的标签合并：同时写入 tracks 与 originals 基线，避免被误标 dirty。
  mergeResolvedTags: (id: string, patch: Partial<Track>) => void;
  bulkUpdate: (ids: string[], updater: (track: Track) => Partial<Track>) => void;
  removeTracks: (ids: string[]) => void;
  resetDirty: () => void;
  markSaveResult: (
    okIds: string[],
    failures: Array<{ path: string; reason: string }>,
    exported: Array<{ sourcePath: string; outputPath: string }>
  ) => void;
};

export const useStore = create<AppState>((set, get) => ({
  tracks: [],
  originals: {},
  selectedIds: [],
  setTracks: (tracks) => {
    const originals = Object.fromEntries(tracks.map((track) => [track.id, toSnapshot(track)]));
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
      const dirty = computeDirty(candidate, base);
      return {
        ...candidate,
        dirty,
        exportedPath: dirty ? '' : track.exportedPath,
        status: dirty
          ? ('dirty' as const)
          : track.status === 'exported'
            ? ('exported' as const)
            : ('clean' as const),
        errorMessage: ''
      };
    });
    set({ tracks: next });
  },
  mergeResolvedTags: (id, patch) => {
    // 后台补推（ffprobe 独有标签）：并入显示值，同时并入 originals 基线，
    // 使 computeDirty 仍与“导入快照”比较 → 不会因补充标签而误标 dirty。
    const { tracks, originals } = get();
    const nextTracks = tracks.map((track) => (track.id === id ? { ...track, ...patch } : track));
    const base = originals[id];
    const nextOriginals = base ? { ...originals, [id]: { ...base, ...patch } } : originals;
    set({ tracks: nextTracks, originals: nextOriginals });
  },
  bulkUpdate: (ids, updater) => {
    const setIds = new Set(ids);
    const { tracks, originals } = get();
    const next = tracks.map((track) => {
      if (!setIds.has(track.id)) return track;
      const candidate = { ...track, ...updater(track) };
      const base = originals[track.id];
      const dirty = computeDirty(candidate, base);
      return {
        ...candidate,
        dirty,
        exportedPath: dirty ? '' : track.exportedPath,
        status: dirty
          ? ('dirty' as const)
          : track.status === 'exported'
            ? ('exported' as const)
            : ('clean' as const),
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
        composer: base.composer,
        lyricist: base.lyricist,
        year: base.year,
        genre: base.genre,
        lyrics: base.lyrics,
        source: base.source,
        rawTIT2: base.rawTIT2,
        rawTPE1: base.rawTPE1,
        rawTCOM: base.rawTCOM,
        rawTEXT: base.rawTEXT,
        rawTCON: base.rawTCON,
        rawUSLT: base.rawUSLT,
        rawCOMM: base.rawCOMM,
        rawWOAS: base.rawWOAS,
        note: base.note,
        trackNo: base.trackNo,
        coverDataUrl: base.coverDataUrl,
        coverPath: base.coverPath,
        exportedPath: '',
        removeCover: base.removeCover,
        dirty: false,
        status: 'clean' as const,
        errorMessage: ''
      };
    });
    set({ tracks: reset });
  },
  markSaveResult: (okIds, failures, exported) => {
    const okSet = new Set(okIds);
    const failMap = new Map(failures.map((item) => [item.path, item.reason]));
    const exportedMap = new Map(exported.map((item) => [item.sourcePath, item.outputPath]));

    const { tracks, originals } = get();
    const nextTracks = tracks.map((track) => {
      if (okSet.has(track.id)) {
        return {
          ...track,
          dirty: false,
          status: 'exported' as const,
          errorMessage: '',
          exportedPath: exportedMap.get(track.path) || track.exportedPath || ''
        };
      }
      const reason = failMap.get(track.path);
      if (reason) {
        return { ...track, status: 'error' as const, errorMessage: reason, exportedPath: '' };
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
