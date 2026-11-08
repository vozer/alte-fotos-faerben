import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const modelBytes = {
  stable: Buffer.from("cached stable weights"),
  tiny: Buffer.from("tiny weights"),
};
vi.mock("../src/shared/model", () => ({
  MODEL_CATALOG: {
    "deoldify-stable": {
      name: "DeOldify Stable", fileName: "stable.onnx", url: "https://models.invalid/stable",
      bytes: 21, sha256: "65762bbcd6b125c25bc92598346f5eb5f6826a0762c99243c693ce70d5be0ede",
    },
    "ddcolor-tiny": {
      name: "DDColor Tiny", fileName: "tiny.onnx", url: "https://models.invalid/tiny",
      bytes: 12, sha256: "1b03e4a529e9e57195c0b59646d59150c2f006489f56b1aea7f02e0ad6703903",
    },
  },
}));

import { ensureModel } from "../src/main/model";

let root: string | undefined;

afterEach(async () => {
  vi.unstubAllGlobals();
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

describe("model cache updates", () => {
  it("reuses a verified cached model and downloads only the missing model", async () => {
    root = await mkdtemp(join(tmpdir(), "deoldify-model-cache-"));
    const cache = join(root, "models");
    await mkdir(cache);
    const stablePath = join(cache, "stable.onnx");
    await writeFile(stablePath, modelBytes.stable);
    const fetch = vi.fn(async () => new Response(modelBytes.tiny));
    vi.stubGlobal("fetch", fetch);
    const window = {
      isDestroyed: () => false,
      webContents: { send: vi.fn() },
    } as unknown as Electron.BrowserWindow;

    expect(await ensureModel(window, cache, "deoldify-stable")).toBe(stablePath);
    expect(fetch).not.toHaveBeenCalled();
    const tinyPath = await ensureModel(window, cache, "ddcolor-tiny");

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith("https://models.invalid/tiny");
    expect([...await readFile(tinyPath)]).toEqual([...modelBytes.tiny]);
    expect([...await readFile(stablePath)]).toEqual([...modelBytes.stable]);
  });
});
