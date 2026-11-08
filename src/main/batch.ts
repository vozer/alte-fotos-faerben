import { randomUUID } from "node:crypto";
import { open, readFile, readdir, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { MAX_BATCH_PHOTOS, type BatchPhotoInfo, type BatchSelection, type ModelId, type PhotoBytes } from "../shared/model";
import { hasJpegSignature, hasPngSignature, isSameFile, writePngAtomically } from "./files";

const maxPhotoBytes = 250 * 1024 * 1024;
const maxOutputBytes = 500 * 1024 * 1024;
const ownerFile = ".alte-fotos-faerben-owned";
const ownerValue = "batch-v1";

interface StoredPhoto {
  info: BatchPhotoInfo;
  path: string;
  candidates: Map<ModelId, string>;
}

interface StoredBatch {
  id: string;
  directory: string;
  photos: Map<string, StoredPhoto>;
  outputFolders: Map<string, string>;
}

async function inspectPhoto(path: string): Promise<BatchPhotoInfo> {
  const info: BatchPhotoInfo = { id: randomUUID(), name: basename(path) };
  const extension = extname(path).toLowerCase();
  if (![".jpg", ".jpeg", ".png"].includes(extension)) {
    info.errorMessage = "Diese Datei ist kein JPEG- oder PNG-Foto.";
    return info;
  }
  let file;
  try {
    file = await open(path, "r");
    const metadata = await file.stat();
    if (!metadata.isFile() || metadata.size < 8) throw new Error("invalid");
    if (metadata.size > maxPhotoBytes) {
      info.errorMessage = "Die Datei ist zu groß. Wählen Sie ein Foto unter 250 MB.";
      return info;
    }
    const header = Buffer.alloc(8);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    const bytes = header.subarray(0, bytesRead);
    const png = hasPngSignature(bytes);
    const jpeg = hasJpegSignature(bytes);
    if ((!png && !jpeg) || (extension === ".png" && !png) || (extension !== ".png" && !jpeg)) {
      info.errorMessage = "Die Datei ist kein gültiges JPEG- oder PNG-Foto.";
      return info;
    }
    info.mimeType = png ? "image/png" : "image/jpeg";
  } catch {
    info.errorMessage = "Die Datei kann nicht gelesen werden. Wählen Sie ein anderes Foto.";
  } finally {
    await file?.close().catch(() => undefined);
  }
  return info;
}

function validatePng(bytes: Uint8Array): void {
  if (!ArrayBuffer.isView(bytes) || bytes.byteLength < 8 || bytes.byteLength > maxOutputBytes || !hasPngSignature(bytes)) {
    throw new Error("Das Ergebnis ist keine gültige PNG-Datei.");
  }
}

export class BatchFileStore {
  private readonly root: string;
  private batch: StoredBatch | undefined;
  private unsaved = false;

  constructor(userDataPath: string) {
    this.root = join(userDataPath, "batch-temp");
  }

  get hasBatch(): boolean {
    return Boolean(this.batch);
  }

  get activeBatchId(): string | undefined {
    return this.batch?.id;
  }

  get hasUnsavedWork(): boolean {
    return this.unsaved;
  }

  async cleanStale(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const entries = await readdir(this.root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("batch-")) continue;
      const directory = join(this.root, entry.name);
      try {
        if ((await readFile(join(directory, ownerFile), "utf8")) !== ownerValue) continue;
        await rm(directory, { recursive: true, force: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }

  async start(
    paths: string[],
    hasUnsavedWork: boolean,
    confirmDiscard: () => Promise<boolean>,
  ): Promise<BatchSelection | null> {
    if (paths.length > MAX_BATCH_PHOTOS) throw new Error("Sie können höchstens 20 Fotos auf einmal auswählen.");
    if (!paths.length) return null;
    const info = await Promise.all(paths.map(inspectPhoto));
    if (this.batch && hasUnsavedWork && !(await confirmDiscard())) return null;

    await mkdir(this.root, { recursive: true });
    const directory = await mkdtemp(join(this.root, "batch-"));
    try {
      await writeFile(join(directory, ownerFile), ownerValue, { flag: "wx", mode: 0o600 });
      const photos = new Map<string, StoredPhoto>();
      for (let index = 0; index < paths.length; index += 1) {
        photos.set(info[index].id, { info: info[index], path: paths[index], candidates: new Map() });
      }
      const next: StoredBatch = { id: randomUUID(), directory, photos, outputFolders: new Map() };
      const previous = this.batch;
      if (previous) await rm(previous.directory, { recursive: true, force: true });
      this.batch = next;
      this.unsaved = false;
      return { id: next.id, photos: info };
    } catch (error) {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  async readPhoto(batchId: string, photoId: string): Promise<PhotoBytes> {
    const photo = this.getPhoto(batchId, photoId);
    if (photo.info.errorMessage || !photo.info.mimeType) throw new Error(photo.info.errorMessage ?? "Das Foto ist nicht verfügbar.");
    try {
      const metadata = await stat(photo.path);
      if (!metadata.isFile() || metadata.size > maxPhotoBytes) throw new Error("invalid");
      const bytes = await readFile(photo.path);
      const valid = photo.info.mimeType === "image/png" ? hasPngSignature(bytes) : hasJpegSignature(bytes);
      if (!valid) throw new Error("invalid");
      return { mimeType: photo.info.mimeType, bytes };
    } catch {
      throw new Error("Die Datei kann nicht mehr gelesen werden. Prüfen Sie, ob sie noch vorhanden ist.");
    }
  }

  async writeCandidate(batchId: string, photoId: string, modelId: ModelId, png: Uint8Array): Promise<void> {
    validatePng(png);
    const batch = this.getBatch(batchId);
    const photo = this.getPhoto(batchId, photoId);
    const path = join(batch.directory, `${photo.info.id}-${modelId}.png`);
    await writePngAtomically(path, png, true);
    photo.candidates.set(modelId, path);
    this.unsaved = true;
  }

  async readCandidate(batchId: string, photoId: string, modelId: ModelId): Promise<Uint8Array> {
    const photo = this.getPhoto(batchId, photoId);
    const path = photo.candidates.get(modelId);
    if (!path) throw new Error("Dieses Ergebnis ist nicht verfügbar.");
    const bytes = await readFile(path);
    validatePng(bytes);
    return bytes;
  }

  photoPath(batchId: string, photoId: string): string {
    return this.getPhoto(batchId, photoId).path;
  }

  async saveIndividual(batchId: string, photoId: string, modelId: ModelId, png: Uint8Array, path: string): Promise<void> {
    validatePng(png);
    const batch = this.getBatch(batchId);
    const selected = this.getPhoto(batchId, photoId);
    if (!selected.candidates.has(modelId)) throw new Error("Wählen Sie zuerst ein fertiges Ergebnis aus.");
    if (extname(path).toLowerCase() !== ".png") throw new Error("Bitte speichern Sie das Ergebnis als PNG-Datei.");
    for (const photo of batch.photos.values()) {
      if (await isSameFile(path, photo.path)) throw new Error("Das Original bleibt unverändert. Wählen Sie einen anderen Dateinamen.");
    }
    await writePngAtomically(path, png, true);
  }

  async chooseOutputFolder(batchId: string, path: string): Promise<string> {
    const batch = this.getBatch(batchId);
    if (!(await stat(path)).isDirectory()) throw new Error("Der gewählte Ordner ist nicht verfügbar.");
    const id = randomUUID();
    batch.outputFolders.set(id, path);
    return id;
  }

  async saveBatchOutput(
    batchId: string,
    folderId: string,
    photoId: string,
    modelId: ModelId,
    png: Uint8Array,
  ): Promise<string> {
    validatePng(png);
    const batch = this.getBatch(batchId);
    const photo = this.getPhoto(batchId, photoId);
    if (!photo.candidates.has(modelId)) throw new Error("Wählen Sie zuerst ein fertiges Ergebnis aus.");
    const folder = batch.outputFolders.get(folderId);
    if (!folder) throw new Error("Wählen Sie den Speicherordner erneut aus.");
    const stem = Array.from(basename(photo.path, extname(photo.path))).slice(0, 180).join("") || "Foto";
    const originals = [...batch.photos.values()].map((item) => item.path);
    for (let suffix = 1; suffix <= 1000; suffix += 1) {
      const name = `${stem}-farbig${suffix === 1 ? "" : `-${suffix}`}.png`;
      const output = join(folder, name);
      if (await Promise.all(originals.map((source) => isSameFile(output, source))).then((matches) => matches.some(Boolean))) continue;
      if (await writePngAtomically(output, png, false)) return name;
    }
    throw new Error("Es konnte kein freier Dateiname gefunden werden.");
  }

  async close(batchId: string, hasUnsavedWork: boolean, confirmDiscard: () => Promise<boolean>): Promise<boolean> {
    const batch = this.getBatch(batchId);
    if (hasUnsavedWork && !(await confirmDiscard())) return false;
    await rm(batch.directory, { recursive: true, force: true });
    this.batch = undefined;
    this.unsaved = false;
    return true;
  }

  updateUnsaved(batchId: string, hasUnsavedWork: boolean): void {
    this.getBatch(batchId);
    this.unsaved = hasUnsavedWork;
  }

  async dispose(): Promise<void> {
    if (!this.batch) return;
    const batch = this.batch;
    this.batch = undefined;
    this.unsaved = false;
    await rm(batch.directory, { recursive: true, force: true });
  }

  private getBatch(batchId: string): StoredBatch {
    if (!this.batch || this.batch.id !== batchId) throw new Error("Der Fotostapel ist nicht mehr geöffnet.");
    return this.batch;
  }

  private getPhoto(batchId: string, photoId: string): StoredPhoto {
    const photo = this.getBatch(batchId).photos.get(photoId);
    if (!photo) throw new Error("Das Foto gehört nicht zu diesem Fotostapel.");
    return photo;
  }
}
