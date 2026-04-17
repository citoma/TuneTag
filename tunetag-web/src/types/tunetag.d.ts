export type TrackStatus = 'clean' | 'dirty' | 'exported' | 'error';

export type Track = {
  id: string;
  path: string;
  fileName: string;
  format: string;
  title: string;
  artist: string;
  album: string;
  year: string;
  genre: string;
  lyrics: string;
  note: string;
  trackNo: string;
  source: string;
  rawTIT2: string;
  rawTPE1: string;
  rawTCON: string;
  rawUSLT: string;
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
  coverDataUrl: string;
  coverPath: string;
  exportedPath: string;
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
      readImageDataUrl: (filePath: string) => Promise<string>;
      getPathForFile: (file: File) => string;
      importPaths: (paths: string[]) => Promise<ImportResult>;
      setCloseGuardHasFiles: (hasFiles: boolean) => Promise<boolean>;
      openExternalUrl: (url: string) => Promise<boolean>;
      revealInFolder: (filePath: string) => Promise<boolean>;
      getEmbeddedCover: (filePath: string) => Promise<{
        hasEmbeddedCover: boolean;
        embeddedCoverPath: string;
        embeddedCoverDataUrl: string;
      }>;
      saveTracks: (
        tracks: Array<Pick<Track, 'path' | 'title' | 'artist' | 'album' | 'year' | 'genre' | 'lyrics' | 'note' | 'source' | 'trackNo' | 'coverPath' | 'removeCover' | 'rawTIT2' | 'rawTPE1' | 'rawTCON' | 'rawUSLT' | 'rawCOMM' | 'rawWOAS'>>
      ) => Promise<{
        canceled: boolean;
        targetDirectory?: string;
        success: number;
        failed: number;
        failures: Array<{ path: string; reason: string }>;
        exported: Array<{ sourcePath: string; outputPath: string }>;
      }>;
      onSaveProgress: (callback: (payload: { completed: number; total: number }) => void) => () => void;
      onExternalOpenPaths: (callback: (paths: string[]) => void) => () => void;
    };
  }
}

export {};
