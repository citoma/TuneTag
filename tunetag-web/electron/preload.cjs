const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('tunetag', {
  pickPaths: () => ipcRenderer.invoke('pick-paths'),
  pickCoverImage: () => ipcRenderer.invoke('pick-cover-image'),
  readImageDataUrl: (filePath) => ipcRenderer.invoke('read-image-data-url', filePath),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
  importPaths: (paths) => ipcRenderer.invoke('import-paths', paths),
  setCloseGuardHasFiles: (hasFiles) => ipcRenderer.invoke('set-close-guard-has-files', hasFiles),
  getEmbeddedCover: (filePath) => ipcRenderer.invoke('get-embedded-cover', filePath),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  revealInFolder: (filePath) => ipcRenderer.invoke('reveal-in-folder', filePath),
  saveTracks: (tracks) => ipcRenderer.invoke('save-tracks', tracks),
  onSaveProgress: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('save-progress', handler);
    return () => ipcRenderer.removeListener('save-progress', handler);
  },
  onExternalOpenPaths: (callback) => {
    const handler = (_event, paths) => callback(Array.isArray(paths) ? paths : []);
    ipcRenderer.on('external-open-paths', handler);
    return () => ipcRenderer.removeListener('external-open-paths', handler);
  }
});
