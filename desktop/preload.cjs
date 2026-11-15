const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("inspectiq", {
  licenseStatus: () => ipcRenderer.invoke("license:status"),
  activate: (form) => ipcRenderer.invoke("license:activate", form),
  renew: () => ipcRenderer.invoke("license:renew"),
  openExternal: (url) => ipcRenderer.invoke("app:openExternal", url)
});