const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dotnetAPI', {
  getTemplates: () => ipcRenderer.invoke('get-dotnet-templates'),
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),

  getDefaultDocumentsPath: () => ipcRenderer.invoke('get-default-documents-path'),
  chooseProjectFolder: (startPath) => ipcRenderer.invoke('choose-project-folder', startPath),
  chooseEditorFile: (startPath) => ipcRenderer.invoke('choose-editor-file', startPath),

  createProject: (data) => ipcRenderer.invoke('create-project', data),
  openInVSCode: (projectPath) => ipcRenderer.invoke('open-in-vscode', projectPath),

  addRecentProject: (p) => ipcRenderer.invoke('add-recent-project', p),
  deleteProjectFolder: (projectPath) => ipcRenderer.invoke('delete-project-folder', projectPath),
  
  cloneRepository: (data) => ipcRenderer.invoke('clone-repository', data),

  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (s) => ipcRenderer.invoke('set-settings', s),
})