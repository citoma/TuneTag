import type { Track } from './types/tunetag';
import type { HistoryKey } from './store';

export function statusLabel(track: Track): string {
  if (track.status === 'error') return '保存失败';
  if (track.status === 'dirty') return '已修改';
  if (track.status === 'exported') return '已导出';
  return '未修改';
}

export function getEditableRules(track: Track) {
  const ext = track.path.toLowerCase().split('.').pop() || '';
  const commonEditable = ext === 'mp3' || ext === 'flac' || ext === 'm4a' || ext === 'wav';
  return {
    commonEditable,
    coverEditable: ext === 'mp3'
  };
}

export function historyLabel(value: string) {
  if (value.length <= 16) return value;
  return `${value.slice(0, 16)}…`;
}

export function buildHistoryEntries(track: Track): Array<[HistoryKey, string]> {
  return [
    ['title', track.title],
    ['artist', track.artist],
    ['album', track.album],
    ['composer', track.composer],
    ['lyricist', track.lyricist],
    ['year', track.year],
    ['genre', track.genre],
    ['trackNo', track.trackNo],
    ['rawWOAS', track.rawWOAS]
  ];
}
