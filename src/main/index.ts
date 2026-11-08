import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { app, BrowserWindow, dialog, ipcMain, protocol } from "electron";
import { ensureModel } from "./model";
import { hasJpegSignature, hasPngSignature, isSamePath } from "./files";
import { isModelId, MODEL_CATALOG, type ModelId, type PhotoSelection } from "../shared/model";

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

const photoByWindow = new Map<number, { id: string; path: string }>();
const modelByWindow = new Map<number, Map<ModelId, string>>();
const maxPhotoBytes = 250 * 1024 * 1024;
const maxOutputBytes = 500 * 1024 * 1024;
const hasInstanceLock = app.requestSingleInstanceLock();
let mainWindow: BrowserWindow | undefined;
if (!hasInstanceLock) app.quit();

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

ipcMain.handle("photo:select", async (event): Promise<PhotoSelection | null> => {
  const window = assertAppWindow(event);
  const picked = await dialog.showOpenDialog(window, {
    title: "Foto auswählen",
    properties: ["openFile"],
    filters: [{ name: "Fotos", extensions: ["jpg", "jpeg", "png"] }],
  });
  if (picked.canceled || !picked.filePaths[0]) return null;

  const path = picked.filePaths[0];
  const extension = extname(path).toLowerCase();
  if (![".jpg", ".jpeg", ".png"].includes(extension)) throw new Error("Bitte wählen Sie eine JPEG- oder PNG-Datei.");
  const info = await stat(path);
  if (info.size > maxPhotoBytes) throw new Error("Die Datei ist zu groß. Bitte wählen Sie ein kleineres Foto.");
  const bytes = await readFile(path);
  const png = hasPngSignature(bytes);
  const jpeg = hasJpegSignature(bytes);
  if ((!png && !jpeg) || (extension === ".png" && !png) || (extension !== ".png" && !jpeg)) {
    throw new Error("Die Datei ist kein gültiges JPEG- oder PNG-Foto.");
  }
  const id = randomUUID();
  photoByWindow.set(event.sender.id, { id, path });
  return { id, name: basename(path), mimeType: png ? "image/png" : "image/jpeg", bytes };
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

ipcMain.handle("photo:save", async (event, photoId: unknown, image: unknown): Promise<boolean> => {
  const window = assertAppWindow(event);
  const selected = photoByWindow.get(event.sender.id);
  if (
    !selected ||
    photoId !== selected.id ||
    !(image instanceof Uint8Array) ||
    image.byteLength < 8 ||
    image.byteLength > maxOutputBytes ||
    !hasPngSignature(image)
  ) {
    throw new Error("Das Foto kann nicht gespeichert werden. Wählen Sie es erneut aus.");
  }

  const suggestedName = basename(selected.path, extname(selected.path)) + "-farbig.png";
  const result = await dialog.showSaveDialog(window, {
    title: "Farbige Kopie speichern",
    defaultPath: join(dirname(selected.path), suggestedName),
    filters: [{ name: "PNG-Bild", extensions: ["png"] }],
  });
  if (result.canceled || !result.filePath) return false;
  if (extname(result.filePath).toLowerCase() !== ".png") {
    throw new Error("Bitte speichern Sie die Datei mit der Endung .png.");
  }

  const outputPath = resolve(result.filePath);
  if (await isSamePath(outputPath, selected.path)) {
    throw new Error("Das Original bleibt unverändert. Wählen Sie einen anderen Dateinamen.");
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, image);
  return true;
});

function createWindow(): void {
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
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.on("closed", () => {
    photoByWindow.delete(windowId);
    modelByWindow.delete(windowId);
    if (mainWindow === window) mainWindow = undefined;
  });
  void window.loadURL("app://app/index.html");
}

app.whenReady().then(() => {
  if (!hasInstanceLock) return;
  app.setName("Alte Fotos färben");
  protocol.handle("app", serveApp);
  createWindow();
});

app.on("second-instance", () => mainWindow?.focus());

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
