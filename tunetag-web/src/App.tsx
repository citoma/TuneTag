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
  trackNo: string;
  rawWOAS: string;
  rawCOMM: string;
};

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
    note: track.note,
    trackNo: track.trackNo,
    source: track.source,
    rawTIT2: track.rawTIT2,
    rawTPE1: track.rawTPE1,
    rawCOMM: track.rawCOMM,
    rawWOAS: track.rawWOAS,
    hasEmbeddedCover: track.hasEmbeddedCover,
    embeddedCoverDataUrl: track.embeddedCoverDataUrl,
    embeddedCoverPath: track.embeddedCoverPath,
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
            candidate.source !== base.source ||
            candidate.rawTIT2 !== base.rawTIT2 ||
            candidate.rawTPE1 !== base.rawTPE1 ||
            candidate.rawCOMM !== base.rawCOMM ||
            candidate.rawWOAS !== base.rawWOAS ||
            candidate.note !== base.note ||
            candidate.trackNo !== base.trackNo ||
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
            candidate.source !== base.source ||
            candidate.rawTIT2 !== base.rawTIT2 ||
            candidate.rawTPE1 !== base.rawTPE1 ||
            candidate.rawCOMM !== base.rawCOMM ||
            candidate.rawWOAS !== base.rawWOAS ||
            candidate.note !== base.note ||
            candidate.trackNo !== base.trackNo ||
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
        source: base.source,
        rawTIT2: base.rawTIT2,
        rawTPE1: base.rawTPE1,
        rawCOMM: base.rawCOMM,
        rawWOAS: base.rawWOAS,
        note: base.note,
        trackNo: base.trackNo,
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
  const [batchForm, setBatchForm] = useState<BatchForm>({
    title: '',
    artist: '',
    album: '',
    year: '',
    trackNo: '',
    rawWOAS: '',
    rawCOMM: ''
  });

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
    setBatchForm({
      title: '',
      artist: '',
      album: '',
      year: '',
      trackNo: '',
      rawWOAS: '',
      rawCOMM: ''
    });
  }, [selectedIds.length]);

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
    const files = Array.from(event.dataTransfer.files);
    const paths = files
      .map((file) => {
        const fromElectron = window.tunetag?.getPathForFile?.(file) || '';
        const fallback = (file as File & { path?: string }).path || '';
        return fromElectron || fallback;
      })
      .filter(Boolean);

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

  function applyBatch() {
    if (!selectedIds.length) return;
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
      trackNo: batchForm.trackNo.trim(),
      rawWOAS: allowSource ? batchForm.rawWOAS.trim() : '',
      rawCOMM: allowNote ? batchForm.rawCOMM.trim() : ''
    };

    bulkUpdate(selectedIds, (track) => {
      const nextTitle = normalized.title ? normalized.title : track.title;
      const nextArtist = normalized.artist ? normalized.artist : track.artist;
      const nextAlbum = normalized.album;
      const nextYear = normalized.year;
      const nextTrackNo = normalized.trackNo;
      const nextSource = allowSource ? normalized.rawWOAS : track.source;
      const nextNote = allowNote ? normalized.rawCOMM : track.note;
      return {
        title: nextTitle,
        artist: nextArtist,
        album: nextAlbum,
        year: nextYear,
        trackNo: nextTrackNo,
        source: nextSource,
        note: nextNote,
        rawTIT2: nextTitle,
        rawTPE1: nextArtist,
        rawCOMM: nextNote,
        rawWOAS: nextSource
      };
    });
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
    updateTrack(trackId, { coverPath, removeCover: false });
  }

  function onRemoveCover(track: Track) {
    if (!getEditableRules(track).coverEditable) return;
    updateTrack(track.id, { coverPath: '', removeCover: true });
  }

  async function onSave() {
    if (!api) {
      setSaveMessage('请在 Electron 桌面应用中运行（浏览器模式不支持写入标签）');
      return;
    }
    const dirtyTracks = tracks.filter((track) => track.dirty);
    if (!dirtyTracks.length || saving) return;

    setSaving(true);
    setSaveFailures([]);
    setProgress({ completed: 0, total: dirtyTracks.length });

    try {
      const payload = dirtyTracks.map((track) => ({
        path: track.path,
        title: track.title,
        artist: track.artist,
        album: track.album,
        year: track.year,
        note: track.note,
        source: track.source,
        coverPath: track.coverPath,
        removeCover: track.removeCover,
        rawTIT2: track.rawTIT2,
        rawTPE1: track.rawTPE1,
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
      const okIds = dirtyTracks.map((t) => t.id).filter((id) => !failedSet.has(id));

      markSaveResult(okIds, result.failures);
      setSaveMessage(
        `已保存到 ${result.targetDirectory || '目标文件夹'}：成功 ${result.success} 个；失败 ${result.failed} 个`
      );
    } catch {
      setSaveMessage('保存异常，请重试');
    } finally {
      setSaving(false);
    }
  }

  function onRemoveSelected() {
    if (!selectedIds.length) return;
    const removeCount = selectedIds.length;
    removeTracks(selectedIds);
    setSaveMessage(`已从列表移出 ${removeCount} 个文件（未删除本地文件）`);
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
        <input disabled={!rules.commonEditable} className={!rules.commonEditable ? 'input-disabled' : ''} value={track.title} onChange={(e) => updateTrack(track.id, { title: e.target.value, rawTIT2: e.target.value })} />
        <label>艺术家</label>
        <input disabled={!rules.commonEditable} className={!rules.commonEditable ? 'input-disabled' : ''} value={track.artist} onChange={(e) => updateTrack(track.id, { artist: e.target.value, rawTPE1: e.target.value })} />
        <label>专辑</label>
        <input disabled={!rules.commonEditable} className={!rules.commonEditable ? 'input-disabled' : ''} value={track.album} onChange={(e) => updateTrack(track.id, { album: e.target.value })} />
        <div className="row-2">
          <div>
            <label>年份</label>
            <input disabled={!rules.commonEditable} className={!rules.commonEditable ? 'input-disabled' : ''} value={track.year} onChange={(e) => updateTrack(track.id, { year: e.target.value })} />
          </div>
          <div>
            <label>曲目号</label>
            <input disabled={!rules.commonEditable} className={!rules.commonEditable ? 'input-disabled' : ''} value={track.trackNo} onChange={(e) => updateTrack(track.id, { trackNo: e.target.value })} />
          </div>
        </div>
        {showSourceField && (
          <>
            <label>原始:WOAS</label>
            <input disabled={!rules.commonEditable} className={!rules.commonEditable ? 'input-disabled' : ''} value={track.rawWOAS} onChange={(e) => updateTrack(track.id, { rawWOAS: e.target.value, source: e.target.value })} />
          </>
        )}
        {showNoteField && (
          <>
            <label>原始:COMM</label>
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
          <span className={!rules.coverEditable ? 'muted' : ''}>
            {track.removeCover
              ? '将删除封面并留空'
              : track.coverPath
              ? track.coverPath.split('/').pop()
              : rules.coverEditable
                ? '未设置'
                : '该格式暂不支持修改封面'}
          </span>
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

        <label>标题</label>
        <input value={batchForm.title} onChange={(e) => setBatchForm((p) => ({ ...p, title: e.target.value }))} />
        <label>艺术家</label>
        <input value={batchForm.artist} onChange={(e) => setBatchForm((p) => ({ ...p, artist: e.target.value }))} />
        <label>专辑</label>
        <input value={batchForm.album} onChange={(e) => setBatchForm((p) => ({ ...p, album: e.target.value }))} />
        <div className="row-2">
          <div>
            <label>年份</label>
            <input value={batchForm.year} onChange={(e) => setBatchForm((p) => ({ ...p, year: e.target.value }))} />
          </div>
          <div>
            <label>曲目号</label>
            <input value={batchForm.trackNo} onChange={(e) => setBatchForm((p) => ({ ...p, trackNo: e.target.value }))} />
          </div>
        </div>
        {showBatchSourceField && (
          <>
            <label>原始:WOAS</label>
            <input value={batchForm.rawWOAS} onChange={(e) => setBatchForm((p) => ({ ...p, rawWOAS: e.target.value }))} />
          </>
        )}
        {showBatchNoteField && (
          <>
            <label>原始:COMM</label>
            <textarea rows={3} value={batchForm.rawCOMM} onChange={(e) => setBatchForm((p) => ({ ...p, rawCOMM: e.target.value }))} />
          </>
        )}

        <button className="primary" onClick={applyBatch}>应用到选中文件</button>
        <p className="field-tip batch-apply-tip">
          标题、艺术家留空：不修改
          <br />
          其它字段留空：清空写入
        </p>
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
            <button className="primary" disabled={!dirtyCount || saving} onClick={onSave}>
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
      </div>
    );
  }

  return hasImported ? renderWorkspace() : renderEmpty();
}

export default App;
