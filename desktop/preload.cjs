const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("inspectiq", {
  licenseStatus: () => ipcRenderer.invoke("license:status"),
  activate: (form) => ipcRenderer.invoke("license:activate", form),
  renew: () => ipcRenderer.invoke("license:renew"),
  onLicenseInvalid: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("license:invalid", listener);
    return () => ipcRenderer.removeListener("license:invalid", listener);
  },
  openExternal: (url) => ipcRenderer.invoke("app:openExternal", url)
});