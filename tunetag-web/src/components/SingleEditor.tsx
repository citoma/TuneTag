import type { Track } from '../types/tunetag';
import type { TrackSnapshot, HistoryKey, FieldHistory } from '../store';
import { getEditableRules } from '../fieldConfig';
import HistoryChips from './HistoryChips';

type Props = {
  track: Track;
  original?: TrackSnapshot;
  fieldHistory: FieldHistory;
  updateTrack: (id: string, patch: Partial<Track>) => void;
  rememberHistory: (entries: Array<[HistoryKey, string]>) => void;
  removeHistoryEntry: (field: HistoryKey, value: string) => void;
  onPickCover: (id: string) => void;
  onRemoveCover: (track: Track) => void;
};

export default function SingleEditor({
  track,
  original,
  fieldHistory,
  updateTrack,
  rememberHistory,
  removeHistoryEntry,
  onPickCover,
  onRemoveCover
}: Props) {
  const rules = getEditableRules(track);
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
      <HistoryChips
        options={fieldHistory.title}
        onPick={(value) => updateTrack(track.id, { title: value, rawTIT2: value })}
        onRemove={(value) => removeHistoryEntry('title', value)}
      />
      <label>艺术家</label>
      <input
        disabled={!rules.commonEditable}
        className={!rules.commonEditable ? 'input-disabled' : ''}
        value={track.artist}
        onChange={(e) => updateTrack(track.id, { artist: e.target.value, rawTPE1: e.target.value })}
        onBlur={(e) => rememberHistory([['artist', e.target.value]])}
      />
      <HistoryChips
        options={fieldHistory.artist}
        onPick={(value) => updateTrack(track.id, { artist: value, rawTPE1: value })}
        onRemove={(value) => removeHistoryEntry('artist', value)}
      />
      <label>专辑</label>
      <input
        disabled={!rules.commonEditable}
        className={!rules.commonEditable ? 'input-disabled' : ''}
        value={track.album}
        onChange={(e) => updateTrack(track.id, { album: e.target.value })}
        onBlur={(e) => rememberHistory([['album', e.target.value]])}
      />
      <HistoryChips
        options={fieldHistory.album}
        onPick={(value) => updateTrack(track.id, { album: value })}
        onRemove={(value) => removeHistoryEntry('album', value)}
      />
      <label>曲作者</label>
      <input
        disabled={!rules.commonEditable}
        className={!rules.commonEditable ? 'input-disabled' : ''}
        value={track.composer}
        onChange={(e) => updateTrack(track.id, { composer: e.target.value, rawTCOM: e.target.value })}
        onBlur={(e) => rememberHistory([['composer', e.target.value]])}
      />
      <HistoryChips
        options={fieldHistory.composer}
        onPick={(value) => updateTrack(track.id, { composer: value, rawTCOM: value })}
        onRemove={(value) => removeHistoryEntry('composer', value)}
      />
      <label>词作者</label>
      <input
        disabled={!rules.commonEditable}
        className={!rules.commonEditable ? 'input-disabled' : ''}
        value={track.lyricist}
        onChange={(e) => updateTrack(track.id, { lyricist: e.target.value, rawTEXT: e.target.value })}
        onBlur={(e) => rememberHistory([['lyricist', e.target.value]])}
      />
      <HistoryChips
        options={fieldHistory.lyricist}
        onPick={(value) => updateTrack(track.id, { lyricist: value, rawTEXT: value })}
        onRemove={(value) => removeHistoryEntry('lyricist', value)}
      />
      <label>流派</label>
      <input
        disabled={!rules.commonEditable}
        className={!rules.commonEditable ? 'input-disabled' : ''}
        value={track.genre}
        onChange={(e) => updateTrack(track.id, { genre: e.target.value, rawTCON: e.target.value })}
        onBlur={(e) => rememberHistory([['genre', e.target.value]])}
      />
      <HistoryChips
        options={fieldHistory.genre}
        onPick={(value) => updateTrack(track.id, { genre: value, rawTCON: value })}
        onRemove={(value) => removeHistoryEntry('genre', value)}
      />
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
          <HistoryChips
            options={fieldHistory.year}
            onPick={(value) => updateTrack(track.id, { year: value })}
            onRemove={(value) => removeHistoryEntry('year', value)}
          />
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
          <HistoryChips
            options={fieldHistory.trackNo}
            onPick={(value) => updateTrack(track.id, { trackNo: value })}
            onRemove={(value) => removeHistoryEntry('trackNo', value)}
          />
        </div>
      </div>
      <label>歌词</label>
      <textarea
        disabled={!rules.commonEditable}
        className={`lyrics-textarea ${!rules.commonEditable ? 'input-disabled' : ''}`}
        value={track.lyrics}
        onChange={(e) => updateTrack(track.id, { lyrics: e.target.value, rawUSLT: e.target.value })}
        rows={10}
      />
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
          <HistoryChips
            options={fieldHistory.rawWOAS}
            onPick={(value) => updateTrack(track.id, { rawWOAS: value, source: value })}
            onRemove={(value) => removeHistoryEntry('rawWOAS', value)}
          />
        </>
      )}
      {showNoteField && (
        <>
          <label>备注</label>
          <textarea
            disabled={!rules.commonEditable}
            className={!rules.commonEditable ? 'input-disabled' : ''}
            value={track.rawCOMM}
            onChange={(e) => updateTrack(track.id, { rawCOMM: e.target.value, note: e.target.value })}
            rows={4}
          />
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
        <button
          className="ghost"
          disabled={!rules.coverEditable}
          onClick={() => onPickCover(track.id)}
        >
          {track.coverPath ? '更换封面' : '选择封面'}
        </button>
        <button
          className="ghost"
          disabled={!rules.coverEditable || (!track.coverPath && !track.hasEmbeddedCover)}
          onClick={() => onRemoveCover(track)}
        >
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
          {track.errorMessage ? (
            <div>
              <span>状态</span>
              <strong>{track.errorMessage}</strong>
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
