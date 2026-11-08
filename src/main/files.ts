import { realpath } from "node:fs/promises";
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
  return (await canonicalPath(first)) === (await canonicalPath(second));
}
