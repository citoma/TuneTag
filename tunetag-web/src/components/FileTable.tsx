import type { Track } from '../types/tunetag';
import type { SortKey } from '../store';
import { statusLabel } from '../fieldConfig';

type Props = {
  tracks: Track[];
  selectedSet: Set<string>;
  onToggleSort: (key: SortKey) => void;
  onSelectAll: (checked: boolean) => void;
  onToggleRow: (id: string, checked: boolean) => void;
  onSelectOnly: (id: string) => void;
  onRevealExported: (track: Track) => void;
};

export default function FileTable({
  tracks,
  selectedSet,
  onToggleSort,
  onSelectAll,
  onToggleRow,
  onSelectOnly,
  onRevealExported
}: Props) {
  return (
    <section className="table-pane">
      <div className="table-toolbar">
        <label className="select-all">
          <input
            type="checkbox"
            checked={tracks.length > 0 && tracks.every((t) => selectedSet.has(t.id))}
            onChange={(e) => onSelectAll(e.target.checked)}
          />
          全选
        </label>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th></th>
              <th onClick={() => onToggleSort('fileName')}>文件名</th>
              <th onClick={() => onToggleSort('artist')}>艺术家</th>
              <th onClick={() => onToggleSort('album')}>专辑</th>
              <th onClick={() => onToggleSort('year')}>年份</th>
              <th onClick={() => onToggleSort('status')}>状态</th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((track) => {
              const selected = selectedSet.has(track.id);
              return (
                <tr
                  key={track.id}
                  className={selected ? 'selected' : ''}
                  onClick={() => onSelectOnly(track.id)}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(e) => onToggleRow(track.id, e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td title={track.fileName}>{track.fileName}</td>
                  <td title={track.artist}>{track.artist}</td>
                  <td title={track.album}>{track.album}</td>
                  <td>{track.year}</td>
                  <td
                    className={
                      track.status === 'error'
                        ? 'status-error'
                        : track.status === 'dirty'
                          ? 'status-dirty'
                          : track.status === 'exported'
                            ? 'status-exported'
                            : ''
                    }
                  >
                    <span className="status-cell">
                      {statusLabel(track)}
                      {track.status === 'exported' && track.exportedPath ? (
                        <button
                          type="button"
                          className="status-folder-btn"
                          title="打开所在文件夹"
                          aria-label="打开所在文件夹"
                          onClick={(event) => {
                            event.stopPropagation();
                            onRevealExported(track);
                          }}
                        >
                          📂
                        </button>
                      ) : null}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
