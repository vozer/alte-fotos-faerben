import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { app, BrowserWindow, dialog, ipcMain, protocol } from "electron";
import { ensureModel } from "./model";
import { BatchFileStore } from "./batch";
import { cleanThenLaunch, launchWhenReady } from "./startup";
import { isModelId, MODEL_CATALOG, type ModelId } from "../shared/model";

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

const modelByWindow = new Map<number, Map<ModelId, string>>();
const batchStoreByWindow = new Map<number, BatchFileStore>();
const hasInstanceLock = app.requestSingleInstanceLock();
let mainWindow: BrowserWindow | undefined;

function assertAppWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow {
  const frameUrl = event.senderFrame?.url;
  if (
    event.senderFrame !== event.sender.mainFrame ||
    !frameUrl ||
    new URL(frameUrl).protocol !== "app:" ||
    new URL(frameUrl).host !== "app"
  ) {
    throw new Error("Ungültige App-Anfrage.");
  }
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) throw new Error("Das App-Fenster wurde geschlossen.");
  return window;
}

function batchStore(event: Electron.IpcMainInvokeEvent): { window: BrowserWindow; store: BatchFileStore } {
  const window = assertAppWindow(event);
  const store = batchStoreByWindow.get(event.sender.id);
  if (!store) throw new Error("Das App-Fenster wurde geschlossen.");
  return { window, store };
}

function assertOpaqueId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) throw new Error("Die Fotoauswahl ist nicht mehr gültig.");
}

function assertPngBytes(value: unknown): asserts value is Uint8Array {
  if (!ArrayBuffer.isView(value) || Object.prototype.toString.call(value) !== "[object Uint8Array]" || value.byteLength < 8) {
    throw new Error("Das Ergebnis ist keine gültige PNG-Datei.");
  }
}

async function confirmDiscard(window: BrowserWindow, message: string): Promise<boolean> {
  const result = await dialog.showMessageBox(window, {
    type: "warning",
    title: "Nicht gespeicherte Ergebnisse",
    message,
    buttons: ["Verwerfen", "Weiter bearbeiten"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  return result.response === 0;
}

function contentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".html": return "text/html; charset=utf-8";
    case ".js":
    case ".mjs": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".wasm": return "application/wasm";
    case ".svg": return "image/svg+xml";
    default: return "application/octet-stream";
  }
}

async function streamFile(path: string, headers: Record<string, string> = {}): Promise<Response> {
  const file = await stat(path);
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
    headers: { "content-length": String(file.size), ...headers },
  });
}

async function serveApp(request: Request): Promise<Response> {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
  const url = new URL(request.url);
  if (url.hostname !== "app") return new Response("Not found", { status: 404 });

  const modelId = Object.keys(MODEL_CATALOG).find(
    (id) => MODEL_CATALOG[id as ModelId].fileName === url.pathname.slice("/model/".length),
  ) as ModelId | undefined;
  if (url.pathname.startsWith("/model/")) {
    if (!modelId) return new Response("Not found", { status: 404 });
    const path = [...modelByWindow.values()].map((models) => models.get(modelId)).find(Boolean);
    if (!path) return new Response("Model not ready", { status: 404 });
    try {
      return await streamFile(path, { "content-type": "application/octet-stream" });
    } catch {
      return new Response("Model not found", { status: 404 });
    }
  }

  const rendererRoot = resolve(app.getAppPath(), "dist/renderer");
  const relativePath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const path = resolve(rendererRoot, relativePath);
  const localPath = relative(rendererRoot, path);
  if (localPath.startsWith(".." + sep) || localPath === ".." || path === rendererRoot) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const headers: Record<string, string> = { "content-type": contentType(path) };
    if (basename(path) === "index.html") {
      headers["content-security-policy"] =
        "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'";
      headers["x-content-type-options"] = "nosniff";
    }
    return await streamFile(path, headers);
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

ipcMain.handle("batch:select", async (event, dirty: unknown) => {
  const { window, store } = batchStore(event);
  if (typeof dirty !== "boolean") throw new Error("Die Fotoauswahl ist nicht mehr gültig.");
  const picked = await dialog.showOpenDialog(window, {
    title: "Fotos auswählen",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Fotos", extensions: ["jpg", "jpeg", "png"] }],
  });
  if (picked.canceled) return null;
  return store.start(picked.filePaths, dirty || store.hasUnsavedWork, () =>
    confirmDiscard(window, "Nicht gespeicherte Ergebnisse gehen verloren. Möchten Sie den Fotostapel verwerfen?"),
  );
});

ipcMain.handle("model:ensure", async (event, value: unknown): Promise<string> => {
  const window = assertAppWindow(event);
  if (!isModelId(value)) throw new Error("Bitte wählen Sie ein verfügbares Farbmodell.");
  const modelId = value;
  const modelPath = await ensureModel(window, join(app.getPath("userData"), "models"), modelId);
  const models = modelByWindow.get(event.sender.id) ?? new Map<ModelId, string>();
  models.set(modelId, modelPath);
  modelByWindow.set(event.sender.id, models);
  return `app://app/model/${MODEL_CATALOG[modelId].fileName}`;
});

ipcMain.handle("batch:read-photo", async (event, batchId: unknown, photoId: unknown) => {
  const { store } = batchStore(event);
  assertOpaqueId(batchId);
  assertOpaqueId(photoId);
  return store.readPhoto(batchId, photoId);
});

ipcMain.handle("batch:write-candidate", async (event, batchId: unknown, photoId: unknown, modelValue: unknown, image: unknown) => {
  const { store } = batchStore(event);
  assertOpaqueId(batchId);
  assertOpaqueId(photoId);
  if (!isModelId(modelValue)) throw new Error("Das Farbmodell ist nicht verfügbar.");
  assertPngBytes(image);
  return store.writeCandidate(batchId, photoId, modelValue, image);
});

ipcMain.handle("batch:read-candidate", async (event, batchId: unknown, photoId: unknown, modelValue: unknown) => {
  const { store } = batchStore(event);
  assertOpaqueId(batchId);
  assertOpaqueId(photoId);
  if (!isModelId(modelValue)) throw new Error("Das Farbmodell ist nicht verfügbar.");
  return store.readCandidate(batchId, photoId, modelValue);
});

ipcMain.handle("batch:save-candidate", async (event, batchId: unknown, photoId: unknown, modelValue: unknown, image: unknown): Promise<boolean> => {
  const { window, store } = batchStore(event);
  assertOpaqueId(batchId);
  assertOpaqueId(photoId);
  if (!isModelId(modelValue)) throw new Error("Das Farbmodell ist nicht verfügbar.");
  assertPngBytes(image);
  const selectedPath = store.photoPath(batchId, photoId);
  const suggestedName = basename(selectedPath, extname(selectedPath)) + "-farbig.png";
  const result = await dialog.showSaveDialog(window, {
    title: "Farbige Kopie speichern",
    defaultPath: join(dirname(selectedPath), suggestedName),
    filters: [{ name: "PNG-Bild", extensions: ["png"] }],
  });
  if (result.canceled || !result.filePath) return false;
  await store.saveIndividual(batchId, photoId, modelValue, image, resolve(result.filePath));
  return true;
});

ipcMain.handle("batch:choose-output", async (event, batchId: unknown): Promise<string | null> => {
  const { window, store } = batchStore(event);
  assertOpaqueId(batchId);
  const result = await dialog.showOpenDialog(window, {
    title: "Ordner zum Speichern auswählen",
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return store.chooseOutputFolder(batchId, result.filePaths[0]);
});

ipcMain.handle("batch:save-output", async (event, batchId: unknown, folderId: unknown, photoId: unknown, modelValue: unknown, image: unknown) => {
  const { store } = batchStore(event);
  assertOpaqueId(batchId);
  assertOpaqueId(folderId);
  assertOpaqueId(photoId);
  if (!isModelId(modelValue)) throw new Error("Das Farbmodell ist nicht verfügbar.");
  assertPngBytes(image);
  return store.saveBatchOutput(batchId, folderId, photoId, modelValue, image);
});

ipcMain.handle("batch:unsaved", async (event, batchId: unknown, dirty: unknown): Promise<void> => {
  const { store } = batchStore(event);
  assertOpaqueId(batchId);
  if (typeof dirty !== "boolean") throw new Error("Der Speicherstatus ist ungültig.");
  store.updateUnsaved(batchId, dirty);
});

ipcMain.handle("batch:close", async (event, batchId: unknown, dirty: unknown): Promise<boolean> => {
  const { window, store } = batchStore(event);
  assertOpaqueId(batchId);
  if (typeof dirty !== "boolean") throw new Error("Der Speicherstatus ist ungültig.");
  return store.close(batchId, dirty || store.hasUnsavedWork, () =>
    confirmDiscard(window, "Nicht gespeicherte Ergebnisse gehen verloren. Möchten Sie den Fotostapel schließen?"),
  );
});

function createWindow(store = new BatchFileStore(app.getPath("userData"))): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 740,
    minHeight: 660,
    title: "Alte Fotos färben",
    webPreferences: {
      preload: join(app.getAppPath(), "dist/preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;
  const windowId = window.webContents.id;
  batchStoreByWindow.set(windowId, store);
  let closeCheckPending = false;
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.on("close", (event) => {
    if (!store.hasBatch) return;
    event.preventDefault();
    if (closeCheckPending) return;
    closeCheckPending = true;
    void (async () => {
      if (store.hasUnsavedWork && !(await confirmDiscard(window, "Nicht gespeicherte Ergebnisse gehen verloren. Möchten Sie die App schließen?"))) {
        closeCheckPending = false;
        return;
      }
      try {
        await store.dispose();
      } catch {
        await dialog.showMessageBox(window, {
          type: "warning",
          title: "Temporäre Dateien",
          message: "Einige temporäre Dateien konnten nicht entfernt werden. Die App versucht es beim nächsten Start erneut.",
          buttons: ["Schließen"],
          noLink: true,
        });
      }
      closeCheckPending = false;
      window.close();
    })();
  });
  window.on("closed", () => {
    batchStoreByWindow.delete(windowId);
    modelByWindow.delete(windowId);
    void store.dispose();
    if (mainWindow === window) mainWindow = undefined;
  });
  void window.loadURL("app://app/index.html");
  return window;
}

void launchWhenReady(hasInstanceLock, app.whenReady(), () => app.quit(), () => {
  app.setName("Alte Fotos färben");
  protocol.handle("app", serveApp);
  const store = new BatchFileStore(app.getPath("userData"));
  void cleanThenLaunch(
    () => store.cleanStale(),
    () => createWindow(store),
    (window) => window.webContents.once("did-finish-load", () => {
      void dialog.showMessageBox(window, {
        type: "warning",
        title: "Temporäre Dateien",
        message: "Einige alte temporäre Dateien konnten nicht entfernt werden. Die App funktioniert weiter und versucht es beim nächsten Start erneut.",
        buttons: ["Weiter"],
        noLink: true,
      });
    }),
  );
});

app.on("second-instance", () => mainWindow?.focus());

app.on("activate", () => {
  if (!hasInstanceLock) return;
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
