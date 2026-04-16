const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('tunetag', {
  pickPaths: () => ipcRenderer.invoke('pick-paths'),
  pickCoverImage: () => ipcRenderer.invoke('pick-cover-image'),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
  importPaths: (paths) => ipcRenderer.invoke('import-paths', paths),
  getEmbeddedCover: (filePath) => ipcRenderer.invoke('get-embedded-cover', filePath),
  saveTracks: (tracks) => ipcRenderer.invoke('save-tracks', tracks),
  onSaveProgress: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('save-progress', handler);
    return () => ipcRenderer.removeListener('save-progress', handler);
  }
});
