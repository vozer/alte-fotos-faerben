import { link, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hasJpegSignature, hasPngSignature, isSameFile, isSamePath, writePngAtomically } from "../src/main/files";

let root: string | undefined;

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

describe("photo file safeguards", () => {
  it("recognizes JPEG and PNG headers", () => {
    expect(hasJpegSignature(new Uint8Array([0xff, 0xd8, 0xff, 0, 1]))).toBe(true);
    expect(hasPngSignature(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
    expect(hasPngSignature(new Uint8Array([0, 1, 2]))).toBe(false);
  });

  it("blocks saving over the selected original path", async () => {
    root = await mkdtemp(join(tmpdir(), "deoldify-files-"));
    const original = join(root, "family.png");
    await writeFile(original, "original");
    expect(await isSamePath(original, original)).toBe(true);
    expect(await isSamePath(original, join(root, "family-color.png"))).toBe(false);
  });

  it("recognizes a hard link to an original as the same file", async () => {
    root = await mkdtemp(join(tmpdir(), "deoldify-files-"));
    const original = join(root, "family.png");
    const alias = join(root, "alias.png");
    await writeFile(original, "original");
    await link(original, alias);
    expect(await isSameFile(original, alias)).toBe(true);
  });

  it("publishes a completed PNG atomically and refuses an existing target", async () => {
    root = await mkdtemp(join(tmpdir(), "deoldify-files-"));
    const output = join(root, "family-farbig.png");
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
    expect(await writePngAtomically(output, png, false)).toBe(true);
    expect(await writePngAtomically(output, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 2]), false)).toBe(false);
    expect([...await readFile(output)]).toEqual([...png]);
    await expect(writePngAtomically(join(root, "invalid.png"), new Uint8Array([1]), false)).rejects.toThrow();
  });
});
