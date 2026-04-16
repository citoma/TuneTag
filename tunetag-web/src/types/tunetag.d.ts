export type TrackStatus = 'clean' | 'dirty' | 'error';

export type Track = {
  id: string;
  path: string;
  fileName: string;
  format: string;
  title: string;
  artist: string;
  album: string;
  year: string;
  note: string;
  trackNo: string;
  source: string;
  rawTIT2: string;
  rawTPE1: string;
  rawCOMM: string;
  rawWOAS: string;
  codec: string;
  sampleRate: string;
  bitDepth: string;
  durationSec: string;
  fileSizeBytes: string;
  modifiedAt: string;
  hasEmbeddedCover: boolean;
  embeddedCoverDataUrl: string;
  embeddedCoverPath: string;
  coverPath: string;
  removeCover: boolean;
  rawAttributes: Array<{ key: string; value: string }>;
  dirty: boolean;
  status: TrackStatus;
  errorMessage: string;
};

export type ImportResult = {
  tracks: Track[];
  skipped: Array<{ path: string; reason: string }>;
};

declare global {
  interface Window {
    tunetag: {
      pickPaths: () => Promise<string[]>;
      pickCoverImage: () => Promise<string>;
      getPathForFile: (file: File) => string;
      importPaths: (paths: string[]) => Promise<ImportResult>;
      getEmbeddedCover: (filePath: string) => Promise<{
        hasEmbeddedCover: boolean;
        embeddedCoverPath: string;
        embeddedCoverDataUrl: string;
      }>;
      saveTracks: (
        tracks: Array<Pick<Track, 'path' | 'title' | 'artist' | 'album' | 'year' | 'note' | 'source' | 'trackNo' | 'coverPath' | 'removeCover' | 'rawTIT2' | 'rawTPE1' | 'rawCOMM' | 'rawWOAS'>>
      ) => Promise<{
        canceled: boolean;
        targetDirectory?: string;
        success: number;
        failed: number;
        failures: Array<{ path: string; reason: string }>;
      }>;
      onSaveProgress: (callback: (payload: { completed: number; total: number }) => void) => () => void;
    };
  }
}

export {};
