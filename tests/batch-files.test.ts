import { link, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BatchFileStore } from "../src/main/batch";

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
let root: string | undefined;

async function fixture() {
  root = await mkdtemp(join(tmpdir(), "deoldify-batch-"));
  const source = join(root, "family.png");
  await writeFile(source, png);
  return { store: new BatchFileStore(root), source };
}

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

describe("local batch files", () => {
  it("keeps paths private and reads one selected photo and candidate by opaque IDs", async () => {
    const { store, source } = await fixture();
    const batch = await store.start([source], false, async () => true);
    expect(batch?.photos[0]).toMatchObject({ name: "family.png", mimeType: "image/png" });
    expect(JSON.stringify(batch)).not.toContain(root);
    const photo = batch!.photos[0];
    expect([...((await store.readPhoto(batch!.id, photo.id)).bytes)]).toEqual([...png]);
    await store.writeCandidate(batch!.id, photo.id, "deoldify-stable", png);
    expect([...await store.readCandidate(batch!.id, photo.id, "deoldify-stable")]).toEqual([...png]);
  });

  it("marks a written candidate unsaved before renderer state synchronization", async () => {
    const { store, source } = await fixture();
    const batch = await store.start([source], false, async () => true);
    await store.writeCandidate(batch!.id, batch!.photos[0].id, "deoldify-stable", png);
    expect(store.hasUnsavedWork).toBe(true);
    store.updateUnsaved(batch!.id, false);
    expect(store.hasUnsavedWork).toBe(false);
  });

  it("rejects more than 20 photos without replacing the active batch", async () => {
    const { store, source } = await fixture();
    const batch = await store.start([source], false, async () => true);
    const tooMany = Array.from({ length: 21 }, (_, index) => join(root!, `missing-${index}.png`));
    await expect(store.start(tooMany, false, async () => true)).rejects.toThrow("höchstens 20");
    expect([...((await store.readPhoto(batch!.id, batch!.photos[0].id)).bytes)]).toEqual([...png]);
  });

  it("keeps the open batch when the user declines to discard it", async () => {
    const { store, source } = await fixture();
    const batch = await store.start([source], false, async () => true);
    const confirm = vi.fn(async () => false);
    expect(await store.start([source], true, confirm)).toBeNull();
    expect(confirm).toHaveBeenCalledOnce();
    expect([...((await store.readPhoto(batch!.id, batch!.photos[0].id)).bytes)]).toEqual([...png]);
  });

  it("uses a new name when the bulk target is a hard link to an original", async () => {
    const { store, source } = await fixture();
    const output = join(root!, "output");
    await mkdir(output);
    await link(source, join(output, "family-farbig.png"));
    const batch = await store.start([source], false, async () => true);
    await store.writeCandidate(batch!.id, batch!.photos[0].id, "deoldify-stable", png);
    const folderId = await store.chooseOutputFolder(batch!.id, output);
    const fileName = await store.saveBatchOutput(batch!.id, folderId, batch!.photos[0].id, "deoldify-stable", png);
    expect(fileName).toBe("family-farbig-2.png");
    expect([...await readFile(source)]).toEqual([...png]);
    expect((await stat(join(output, fileName))).size).toBe(png.length);
  });

  it("clears only marked stale batch directories", async () => {
    const { store } = await fixture();
    const batchRoot = join(root!, "batch-temp");
    const stale = join(batchRoot, "batch-stale");
    const other = join(batchRoot, "batch-other");
    await mkdir(stale, { recursive: true });
    await mkdir(other, { recursive: true });
    await writeFile(join(stale, ".alte-fotos-faerben-owned"), "batch-v1");
    await writeFile(join(other, "family.png"), png);

    await store.cleanStale();

    await expect(stat(stale)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await readFile(join(other, "family.png"))).length).toBe(png.length);
    expect((await readdir(batchRoot))).toEqual(["batch-other"]);
  });
});
