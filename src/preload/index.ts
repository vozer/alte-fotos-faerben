import { contextBridge, ipcRenderer } from "electron";
import type { BatchSelection, DesktopApi, ModelId, ModelProgress, PhotoBytes } from "../shared/model";

const api: DesktopApi = {
  selectBatch: (hasUnsavedWork) =>
    ipcRenderer.invoke("batch:select", hasUnsavedWork) as Promise<BatchSelection | null>,
  readPhoto: (batchId, photoId) =>
    ipcRenderer.invoke("batch:read-photo", batchId, photoId) as Promise<PhotoBytes>,
  ensureModel: (modelId: ModelId) => ipcRenderer.invoke("model:ensure", modelId) as Promise<string>,
  writeCandidate: (batchId, photoId, modelId, png) =>
    ipcRenderer.invoke("batch:write-candidate", batchId, photoId, modelId, png) as Promise<void>,
  readCandidate: (batchId, photoId, modelId) =>
    ipcRenderer.invoke("batch:read-candidate", batchId, photoId, modelId) as Promise<Uint8Array>,
  saveCandidate: (batchId, photoId, modelId, png) =>
    ipcRenderer.invoke("batch:save-candidate", batchId, photoId, modelId, png) as Promise<boolean>,
  chooseOutputFolder: (batchId) =>
    ipcRenderer.invoke("batch:choose-output", batchId) as Promise<string | null>,
  saveBatchOutput: (batchId, folderId, photoId, modelId, png) =>
    ipcRenderer.invoke("batch:save-output", batchId, folderId, photoId, modelId, png) as Promise<string>,
  updateBatchUnsaved: (batchId, hasUnsavedWork) =>
    ipcRenderer.invoke("batch:unsaved", batchId, hasUnsavedWork) as Promise<void>,
  closeBatch: (batchId, hasUnsavedWork) =>
    ipcRenderer.invoke("batch:close", batchId, hasUnsavedWork) as Promise<boolean>,
  onModelProgress: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, progress: ModelProgress) =>
      listener(progress);
    ipcRenderer.on("model:progress", wrapped);
    return () => ipcRenderer.removeListener("model:progress", wrapped);
  },
};

contextBridge.exposeInMainWorld("desktop", api);
