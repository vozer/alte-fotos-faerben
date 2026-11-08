import { beforeEach, describe, expect, it, vi } from "vitest";

const workers: FakeWorker[] = [];

class FakeWorker extends EventTarget {
  messages: Array<{ id: number }> = [];

  constructor() {
    super();
    workers.push(this);
  }

  postMessage(message: { id: number }): void {
    this.messages.push(message);
  }

  terminate(): void {}
}

describe("worker recovery", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("Worker", FakeWorker);
    workers.length = 0;
  });

  it("replaces a crashed worker so later retries can finish", async () => {
    const client = await import("../src/renderer/worker-client");
    const active = client.requestWorker({ type: "release-photo", photoId: "one" });
    const queued = client.requestWorker({ type: "release-photo", photoId: "two" });

    workers[0].dispatchEvent(new Event("error"));

    await expect(active).rejects.toThrow("Bildverarbeitung wurde unterbrochen");
    await expect(queued).rejects.toThrow("Bildverarbeitung wurde unterbrochen");
    expect(workers).toHaveLength(2);

    const retry = client.requestWorker({ type: "release-photo", photoId: "retry" });
    const request = workers[1].messages[0];
    workers[1].dispatchEvent(new MessageEvent("message", {
      data: { id: request.id, type: "released" },
    }));

    await expect(retry).resolves.toMatchObject({ type: "released" });
    client.terminateWorker();
  });

  it("replaces the worker after model initialization fails", async () => {
    const client = await import("../src/renderer/worker-client");
    const failed = client.requestWorker({
      type: "colorize",
      photoId: "one",
      modelId: "ddcolor-tiny",
      modelUrl: "app://app/model/ddcolor_tiny.onnx",
    });
    const request = workers[0].messages[0];
    workers[0].dispatchEvent(new MessageEvent("message", {
      data: { id: request.id, type: "error", error: "runtime initialization failed" },
    }));

    await expect(failed).rejects.toThrow("runtime initialization failed");
    expect(workers).toHaveLength(2);
    expect(client.getWorkerGeneration()).toBe(1);

    const retry = client.requestWorker({ type: "release-photo", photoId: "retry" });
    const retryRequest = workers[1].messages[0];
    workers[1].dispatchEvent(new MessageEvent("message", {
      data: { id: retryRequest.id, type: "released" },
    }));
    await expect(retry).resolves.toMatchObject({ type: "released" });
    client.terminateWorker();
  });
});
