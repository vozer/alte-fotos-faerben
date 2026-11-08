import { randomUUID } from "node:crypto";
import { link, mkdtemp, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export function hasPngSignature(bytes: Uint8Array): boolean {
  return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
}

export function hasJpegSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

async function canonicalPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return join(await realpath(dirname(path)), basename(path));
  }
}

export async function isSamePath(first: string, second: string): Promise<boolean> {
  const [left, right] = await Promise.all([canonicalPath(first), canonicalPath(second)]);
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

export async function isSameFile(first: string, second: string): Promise<boolean> {
  try {
    const [left, right] = await Promise.all([stat(first), stat(second)]);
    if (left.dev !== 0 && left.ino !== 0 && left.dev === right.dev && left.ino === right.ino) return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return isSamePath(first, second);
}

export async function writePngAtomically(path: string, bytes: Uint8Array, replace: boolean): Promise<boolean> {
  if (bytes.byteLength < 8 || !hasPngSignature(bytes)) throw new Error("Das Ergebnis ist keine gültige PNG-Datei.");
  const tempDirectory = await mkdtemp(join(dirname(path), ".alte-fotos-faerben-"));
  const stagedPath = join(tempDirectory, basename(path) + ".tmp");
  try {
    await writeFile(stagedPath, bytes, { flag: "wx", mode: 0o600 });
    if (replace) {
      await rename(stagedPath, path);
      return true;
    }
    try {
      await link(stagedPath, path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw error;
    }
  } finally {
    await rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}
