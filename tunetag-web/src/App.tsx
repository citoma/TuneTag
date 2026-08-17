import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import type { Track } from './types/tunetag';
import {
  useStore,
  loadFieldHistory,
  loadBatchPresets,
  emptyBatchForm,
  normalizeBatchForm,
  hasAnyBatchValue,
  pushHistoryEntries,
  HISTORY_STORAGE_KEY,
  BATCH_PRESET_STORAGE_KEY,
  BATCH_PRESET_LIMIT,
  type SortKey,
  type BatchForm,
  type BatchPreset,
  type FieldHistory,
  type HistoryKey
} from './store';
import { statusLabel, getEditableRules, buildHistoryEntries } from './fieldConfig';
import EmptyState from './components/EmptyState';
import FileTable from './components/FileTable';
import SingleEditor from './components/SingleEditor';
import BatchEditor from './components/BatchEditor';
import PresetNameModal from './components/PresetNameModal';

export default function App() {
  const api = window.tunetag;
  const [bootPaths] = useState<string[]>(() => (api && typeof api.getInitialOpenPaths === 'function' ? api.getInitialOpenPaths() : []));
  const isMac = navigator.userAgent.toLowerCase().includes('mac');
  const {
    tracks,
    originals,
    selectedIds,
    appendTracks,
    setSelectedIds,
    updateTrack,
    mergeResolvedTags,
    bulkUpdate,
    removeTracks,
    resetDirty,
    markSaveResult
  } = useStore();

  const [sortKey, setSortKey] = useState<SortKey>('fileName');
  const [sortAsc, setSortAsc] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [saveMessage, setSaveMessage] = useState('');
  const [saveFailures, setSaveFailures] = useState<Array<{ path: string; reason: string }>>([]);
  const [saveWarnings, setSaveWarnings] = useState<Array<{ path: string; reason: string }>>([]);
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

  useEffect(() => {
    if (!api) return;
    const unsubscribe = api.onSaveProgress((payload) => setProgress(payload));
    return unsubscribe;
  }, [api]);

  useEffect(() => {
    if (!api?.setCloseGuardHasFiles) return;
    api.setCloseGuardHasFiles(tracks.length > 0).catch(() => {});
  }, [api, tracks.length]);

  useEffect(() => {
    const preventDefault = (event: globalThis.DragEvent) => {
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
  const hasImported = tracks.length > 0 || bootPaths.length > 0;

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

  const importPaths = useCallback(
    async (paths: string[]) => {
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
    },
    [api, appendTracks]
  );

  useEffect(() => {
    if (!api?.onExternalOpenPaths) return;
    const unsubscribe = api.onExternalOpenPaths((paths) => {
      if (!paths.length) return;
      importPaths(paths).catch(() => {
        setSaveMessage('通过“打开方式”导入文件失败，请重试');
      });
    });
    return unsubscribe;
  }, [api, importPaths]);

  // 后台 ffprobe 解析完成后，主进程把补充到的 WAV 标签差量推回，合并进对应曲目（不误标 dirty）。
  useEffect(() => {
    if (!api?.onWavTagsResolved) return;
    const unsubscribe = api.onWavTagsResolved((payload) => {
      if (!payload || !payload.path || !payload.tags) return;
      mergeResolvedTags(payload.path, payload.tags);
    });
    return unsubscribe;
  }, [api, mergeResolvedTags]);

  const bootImportedRef = useRef(false);
  useEffect(() => {
    if (bootImportedRef.current) return;
    if (!bootPaths.length) return;
    bootImportedRef.current = true;
    importPaths(bootPaths).catch(() => {});
  }, [bootPaths, importPaths]);

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

  async function onDropFiles(event: DragEvent<HTMLDivElement>) {
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
      composer: batchForm.composer.trim(),
      lyricist: batchForm.lyricist.trim(),
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
      const nextComposer = normalized.composer;
      const nextLyricist = normalized.lyricist;
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
        composer: nextComposer,
        lyricist: nextLyricist,
        year: nextYear,
        genre: nextGenre,
        lyrics: nextLyrics,
        trackNo: nextTrackNo,
        source: nextSource,
        note: nextNote,
        rawTIT2: nextTitle,
        rawTPE1: nextArtist,
        rawTCOM: nextComposer,
        rawTEXT: nextLyricist,
        rawTCON: nextGenre,
        rawUSLT: nextLyrics,
        rawCOMM: nextNote,
        rawWOAS: nextSource
      };
    };

    return { normalized, updater };
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
    setSaveWarnings([]);
    setProgress({ completed: 0, total: targetTracks.length });

    try {
      const payload = targetTracks.map((track) => ({
        path: track.path,
        title: track.title,
        artist: track.artist,
        album: track.album,
        composer: track.composer,
        lyricist: track.lyricist,
        year: track.year,
        genre: track.genre,
        lyrics: track.lyrics,
        note: track.note,
        source: track.source,
        coverPath: track.coverPath,
        removeCover: track.removeCover,
        rawTIT2: track.rawTIT2,
        rawTPE1: track.rawTPE1,
        rawTCOM: track.rawTCOM,
        rawTEXT: track.rawTEXT,
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
      setSaveWarnings(result.warnings || []);
      const failedSet = new Set(result.failures.map((f) => f.path));
      const okIds = targetTracks.map((t) => t.id).filter((id) => !failedSet.has(id));

      markSaveResult(okIds, result.failures, result.exported || []);
      for (const track of targetTracks) {
        rememberHistory(buildHistoryEntries(track));
      }
      const warningCount = Array.isArray(result.warnings) ? result.warnings.length : 0;
      const warningSuffix = warningCount > 0 ? `；系统属性同步警告 ${warningCount} 个` : '';
      setSaveMessage(
        `${messagePrefix} ${result.targetDirectory || '目标文件夹'}：成功 ${result.success} 个；失败 ${result.failed} 个${warningSuffix}`
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

  async function onRevealExported(track: Track) {
    const targetPath = String(track.exportedPath || '').trim();
    if (!targetPath) return;
    const ok = await api?.revealInFolder?.(targetPath);
    if (!ok) {
      setSaveMessage('无法打开导出文件所在位置');
    }
  }

  function buildDefaultPresetName(form: BatchForm) {
    const pairs: Array<[string, string]> = [
      ['标题', form.title],
      ['艺术家', form.artist],
      ['专辑', form.album],
      ['曲作者', form.composer],
      ['词作者', form.lyricist],
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

  function renderWorkspace() {
    return (
      <>
        <header className="topbar">
          <h1>乐签 TuneTag</h1>
          <div className="actions">
            <button className="ghost" onClick={onPickFiles}>
              继续导入
            </button>
            <button className="ghost" disabled={!selectedIds.length || saving} onClick={onRemoveSelected}>
              移出列表
            </button>
            <button
              className="primary"
              disabled={!canSave}
              onClick={onSave}
              title="将带新标签的文件导出到所选文件夹（非原地写回；目标为源目录并选“覆盖”时原地改写）"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </header>

        <main className="workspace">
          <FileTable
            tracks={filteredSorted}
            selectedSet={selectedSet}
            onToggleSort={toggleSort}
            onSelectAll={selectAllCurrent}
            onToggleRow={toggleRow}
            onSelectOnly={selectOnly}
            onRevealExported={onRevealExported}
          />

          <aside className="side-pane">
            {selectedTracks.length === 1 && (
              <SingleEditor
                track={selectedTracks[0]}
                original={originals[selectedTracks[0].id]}
                fieldHistory={fieldHistory}
                updateTrack={updateTrack}
                rememberHistory={rememberHistory}
                removeHistoryEntry={removeHistoryEntry}
                onPickCover={onPickCover}
                onRemoveCover={onRemoveCover}
              />
            )}
            {selectedTracks.length > 1 && (
              <BatchEditor
                selectedIds={selectedIds}
                selectedTracks={selectedTracks}
                originals={originals}
                fieldHistory={fieldHistory}
                batchForm={batchForm}
                setBatchForm={setBatchForm}
                activeBatchPresetId={activeBatchPresetId}
                batchPresets={batchPresets}
                onSelectPreset={selectPreset}
                onApplyPreset={onApplyBatchPreset}
                onOpenSavePresetDialog={onOpenSavePresetDialog}
                onDeletePreset={onDeleteBatchPreset}
                rememberHistory={rememberHistory}
                removeHistoryEntry={removeHistoryEntry}
              />
            )}
            {selectedTracks.length === 0 && <p className="placeholder">请选择一个或多个文件</p>}
          </aside>
        </main>

        <footer className="footer">
          <div>
            已导入 {tracks.length} 个文件，待保存 {dirtyCount} 个
            {saving && progress.total > 0 ? `（${progress.completed}/${progress.total}）` : ''}
            <span className="footer-hint"> · 保存＝导出到所选文件夹</span>
          </div>
          <div className="footer-actions">
            <button className="ghost" onClick={resetDirty} disabled={!dirtyCount || saving}>
              取消修改
            </button>
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
        {saveWarnings.length > 0 && (
          <div className="failure-panel">
            <div className="failure-title">系统属性同步警告（{saveWarnings.length}）</div>
            <ul>
              {saveWarnings.map((item) => (
                <li key={`${item.path}-${item.reason}-warning`}>
                  <span title={item.path}>{item.path}</span>
                  <strong>{item.reason}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}

        {saveMessage && <div className="toast">{saveMessage}</div>}
        <PresetNameModal
          show={showPresetNameModal}
          pendingName={pendingPresetName}
          setPendingName={setPendingPresetName}
          onSave={onSaveBatchPreset}
          onClose={() => setShowPresetNameModal(false)}
        />
      </>
    );
  }

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
      {hasImported ? renderWorkspace() : (
        <EmptyState
          dragging={dragging}
          setDragging={setDragging}
          onDropFiles={onDropFiles}
          onPickFiles={onPickFiles}
          onLandingBrandClick={onLandingBrandClick}
        />
      )}
    </div>
  );
}
