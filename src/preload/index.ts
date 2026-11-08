import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi, ModelId, ModelProgress, PhotoSelection } from "../shared/model";

const api: DesktopApi = {
  selectPhoto: () => ipcRenderer.invoke("photo:select") as Promise<PhotoSelection | null>,
  ensureModel: (modelId: ModelId) => ipcRenderer.invoke("model:ensure", modelId) as Promise<string>,
  savePhoto: (photoId, png) =>
    ipcRenderer.invoke("photo:save", photoId, png) as Promise<boolean>,
  onModelProgress: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, progress: ModelProgress) =>
      listener(progress);
    ipcRenderer.on("model:progress", wrapped);
    return () => ipcRenderer.removeListener("model:progress", wrapped);
  },
};

contextBridge.exposeInMainWorld("desktop", api);
