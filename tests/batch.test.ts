import { describe, expect, it, vi } from "vitest";
import { createBatchPhotos, processBatch, retryCandidate, type BatchAdapter } from "../src/renderer/batch";
import type { ModelId } from "../src/shared/model";

function fixture() {
  const photos = createBatchPhotos([
    { id: "photo-1", name: "one.png", mimeType: "image/png" },
    { id: "photo-2", name: "two.jpg", mimeType: "image/jpeg" },
  ]);
  const calls: string[] = [];
  let failTiny = true;
  const adapter: BatchAdapter = {
    ensureModel: vi.fn(async (modelId) => "app://model/" + modelId),
    preparePhoto: vi.fn(async () => ({ width: 2, height: 1, thumbnail: new Uint8Array([1]) })),
    colorize: vi.fn(async (photo, modelId) => {
      calls.push(photo.id + ":" + modelId);
      if (modelId === "ddcolor-tiny" && failTiny) throw new Error("model failed");
      return { png: new Uint8Array([2]), thumbnail: new Uint8Array([3]), width: 2, height: 1 };
    }),
    storeCandidate: vi.fn(async () => undefined),
    releasePhoto: vi.fn(async () => undefined),
  };
  return { photos, adapter, calls, stopFailure: () => { failTiny = false; } };
}

describe("batch processing", () => {
  it("runs both models for each photo and continues after a model failure", async () => {
    const { photos, adapter, calls } = fixture();
    await processBatch(photos, adapter, () => false);

    expect(calls).toEqual([
      "photo-1:deoldify-stable", "photo-1:ddcolor-tiny",
      "photo-2:deoldify-stable", "photo-2:ddcolor-tiny",
    ]);
    expect(photos[0].candidates["deoldify-stable"].status).toBe("ready");
    expect(photos[0].candidates["ddcolor-tiny"].status).toBe("failed");
    expect(photos[1].candidates["deoldify-stable"].status).toBe("ready");
    expect(adapter.releasePhoto).toHaveBeenCalledTimes(2);
  });

  it("finishes both model attempts for the current photo before canceling", async () => {
    const { photos, adapter, calls } = fixture();
    let cancel = false;
    adapter.storeCandidate = vi.fn(async () => { cancel = true; });

    const result = await processBatch(photos, adapter, () => cancel);

    expect(result.cancelled).toBe(true);
    expect(calls).toEqual(["photo-1:deoldify-stable", "photo-1:ddcolor-tiny"]);
    expect(photos[1].candidates["deoldify-stable"].status).toBe("pending");
  });

  it("retries only the failed photo and model candidate", async () => {
    const { photos, adapter, calls, stopFailure } = fixture();
    await processBatch(photos, adapter, () => false);
    calls.length = 0;
    stopFailure();

    await retryCandidate(photos[0], "ddcolor-tiny" as ModelId, adapter);

    expect(calls).toEqual(["photo-1:ddcolor-tiny"]);
    expect(photos[0].candidates["deoldify-stable"].status).toBe("ready");
    expect(photos[0].candidates["ddcolor-tiny"].status).toBe("ready");
  });
});
