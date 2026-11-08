import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { BrowserWindow } from "electron";
import { MODEL_CATALOG, type ModelId } from "../shared/model";

const verifiedPaths = new Map<ModelId, string>();

async function fileHash(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function ensureModel(
  window: BrowserWindow,
  cacheRoot: string,
  modelId: ModelId,
): Promise<string> {
  const model = MODEL_CATALOG[modelId];
  const cached = verifiedPaths.get(modelId);
  if (cached) return cached;

  const path = join(cacheRoot, model.fileName);
  await mkdir(cacheRoot, { recursive: true });
  try {
    if ((await stat(path)).size === model.bytes && (await fileHash(path)) === model.sha256) {
      verifiedPaths.set(modelId, path);
      return path;
    }
  } catch {
    // The cache is empty on first use.
  }

  const partial = join(cacheRoot, basename(path) + ".download");
  await rm(partial, { force: true });
  try {
    const response = await fetch(model.url);
    if (!response.ok || !response.body) throw new Error("download failed");
    const expectedSize = Number(response.headers.get("content-length"));
    if (expectedSize && expectedSize !== model.bytes) throw new Error("unexpected model size");

    const hash = createHash("sha256");
    let received = 0;
    const progress = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        hash.update(chunk);
        if (!window.isDestroyed()) {
          window.webContents.send("model:progress", {
            percent: Math.min(99, Math.floor((received / model.bytes) * 100)),
          });
        }
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.from(response.body as unknown as AsyncIterable<Uint8Array>),
      progress,
      createWriteStream(partial, { flags: "wx" }),
    );

    if (received !== model.bytes || hash.digest("hex") !== model.sha256) {
      throw new Error("model checksum failed");
    }
    await rm(path, { force: true });
    await rename(partial, path);
    verifiedPaths.set(modelId, path);
    if (!window.isDestroyed()) window.webContents.send("model:progress", { percent: 100 });
    return path;
  } catch (error) {
    await rm(partial, { force: true });
    throw new Error(
      `${model.name} konnte nicht geladen werden. Prüfen Sie Internet und freien Speicherplatz, dann versuchen Sie es erneut.`,
      { cause: error },
    );
  }
}
