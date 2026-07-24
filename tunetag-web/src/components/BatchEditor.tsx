import type { Track } from '../types/tunetag';
import type { TrackSnapshot, BatchForm, BatchPreset, HistoryKey, FieldHistory } from '../store';
import HistoryChips from './HistoryChips';

type Props = {
  selectedIds: string[];
  selectedTracks: Track[];
  originals: Record<string, TrackSnapshot>;
  fieldHistory: FieldHistory;
  batchForm: BatchForm;
  setBatchForm: (updater: (prev: BatchForm) => BatchForm) => void;
  activeBatchPresetId: string;
  batchPresets: BatchPreset[];
  onSelectPreset: (id: string) => void;
  onApplyPreset: () => void;
  onOpenSavePresetDialog: () => void;
  onDeletePreset: () => void;
  rememberHistory: (entries: Array<[HistoryKey, string]>) => void;
  removeHistoryEntry: (field: HistoryKey, value: string) => void;
};

export default function BatchEditor({
  selectedIds,
  selectedTracks,
  originals,
  fieldHistory,
  batchForm,
  setBatchForm,
  activeBatchPresetId,
  batchPresets,
  onSelectPreset,
  onApplyPreset,
  onOpenSavePresetDialog,
  onDeletePreset,
  rememberHistory,
  removeHistoryEntry
}: Props) {
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
          <select value={activeBatchPresetId} onChange={(e) => onSelectPreset(e.target.value)}>
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
            onClick={onApplyPreset}
          >
            应用
          </button>
          <button type="button" className="ghost" onClick={onOpenSavePresetDialog}>
            保存
          </button>
          <button type="button" className="ghost" disabled={!activeBatchPresetId} onClick={onDeletePreset}>
            删除
          </button>
        </div>
      </div>

      <label>标题</label>
      <input
        value={batchForm.title}
        onChange={(e) => setBatchForm((p) => ({ ...p, title: e.target.value }))}
        onBlur={(e) => rememberHistory([['title', e.target.value]])}
      />
      <HistoryChips
        options={fieldHistory.title}
        onPick={(value) => setBatchForm((p) => ({ ...p, title: value }))}
        onRemove={(value) => removeHistoryEntry('title', value)}
      />
      <label>艺术家</label>
      <input
        value={batchForm.artist}
        onChange={(e) => setBatchForm((p) => ({ ...p, artist: e.target.value }))}
        onBlur={(e) => rememberHistory([['artist', e.target.value]])}
      />
      <HistoryChips
        options={fieldHistory.artist}
        onPick={(value) => setBatchForm((p) => ({ ...p, artist: value }))}
        onRemove={(value) => removeHistoryEntry('artist', value)}
      />
      <label>专辑</label>
      <input
        value={batchForm.album}
        onChange={(e) => setBatchForm((p) => ({ ...p, album: e.target.value }))}
        onBlur={(e) => rememberHistory([['album', e.target.value]])}
      />
      <HistoryChips
        options={fieldHistory.album}
        onPick={(value) => setBatchForm((p) => ({ ...p, album: value }))}
        onRemove={(value) => removeHistoryEntry('album', value)}
      />
      <label>曲作者</label>
      <input
        value={batchForm.composer}
        onChange={(e) => setBatchForm((p) => ({ ...p, composer: e.target.value }))}
        onBlur={(e) => rememberHistory([['composer', e.target.value]])}
      />
      <HistoryChips
        options={fieldHistory.composer}
        onPick={(value) => setBatchForm((p) => ({ ...p, composer: value }))}
        onRemove={(value) => removeHistoryEntry('composer', value)}
      />
      <label>词作者</label>
      <input
        value={batchForm.lyricist}
        onChange={(e) => setBatchForm((p) => ({ ...p, lyricist: e.target.value }))}
        onBlur={(e) => rememberHistory([['lyricist', e.target.value]])}
      />
      <HistoryChips
        options={fieldHistory.lyricist}
        onPick={(value) => setBatchForm((p) => ({ ...p, lyricist: value }))}
        onRemove={(value) => removeHistoryEntry('lyricist', value)}
      />
      <label>流派</label>
      <input
        value={batchForm.genre}
        onChange={(e) => setBatchForm((p) => ({ ...p, genre: e.target.value }))}
        onBlur={(e) => rememberHistory([['genre', e.target.value]])}
      />
      <HistoryChips
        options={fieldHistory.genre}
        onPick={(value) => setBatchForm((p) => ({ ...p, genre: value }))}
        onRemove={(value) => removeHistoryEntry('genre', value)}
      />
      <div className="row-2">
        <div>
          <label>年份</label>
          <input
            value={batchForm.year}
            onChange={(e) => setBatchForm((p) => ({ ...p, year: e.target.value }))}
            onBlur={(e) => rememberHistory([['year', e.target.value]])}
          />
          <HistoryChips
            options={fieldHistory.year}
            onPick={(value) => setBatchForm((p) => ({ ...p, year: value }))}
            onRemove={(value) => removeHistoryEntry('year', value)}
          />
        </div>
        <div>
          <label>曲目号</label>
          <input
            value={batchForm.trackNo}
            onChange={(e) => setBatchForm((p) => ({ ...p, trackNo: e.target.value }))}
            onBlur={(e) => rememberHistory([['trackNo', e.target.value]])}
          />
          <HistoryChips
            options={fieldHistory.trackNo}
            onPick={(value) => setBatchForm((p) => ({ ...p, trackNo: value }))}
            onRemove={(value) => removeHistoryEntry('trackNo', value)}
          />
        </div>
      </div>
      <label>歌词</label>
      <textarea
        className="lyrics-textarea"
        rows={8}
        value={batchForm.lyrics}
        onChange={(e) => setBatchForm((p) => ({ ...p, lyrics: e.target.value }))}
      />
      {showBatchSourceField && (
        <>
          <label>自定义</label>
          <input
            value={batchForm.rawWOAS}
            onChange={(e) => setBatchForm((p) => ({ ...p, rawWOAS: e.target.value }))}
            onBlur={(e) => rememberHistory([['rawWOAS', e.target.value]])}
          />
          <HistoryChips
            options={fieldHistory.rawWOAS}
            onPick={(value) => setBatchForm((p) => ({ ...p, rawWOAS: value }))}
            onRemove={(value) => removeHistoryEntry('rawWOAS', value)}
          />
        </>
      )}
      {showBatchNoteField && (
        <>
          <label>备注</label>
          <textarea
            rows={3}
            value={batchForm.rawCOMM}
            onChange={(e) => setBatchForm((p) => ({ ...p, rawCOMM: e.target.value }))}
          />
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
