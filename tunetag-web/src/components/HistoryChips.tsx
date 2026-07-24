import type { HistoryKey } from '../store';
import { historyLabel } from '../fieldConfig';

type Props = {
  options: string[];
  onPick: (value: string) => void;
  onRemove: (value: string) => void;
};

export default function HistoryChips({ options, onPick, onRemove }: Props) {
  if (!options.length) return null;
  return (
    <div className="history-row">
      {options.map((value) => (
        <div key={value} className="history-chip-wrap">
          <button type="button" className="history-chip" title={value} onClick={() => onPick(value)}>
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
              onRemove(value);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export type { HistoryKey };
