import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const worker = vi.hoisted(() => ({ request: vi.fn(), generation: 0 }));
vi.mock("../src/renderer/worker-client", () => ({
  requestWorker: worker.request,
  terminateWorker: vi.fn(),
  getWorkerGeneration: () => worker.generation,
}));

const signature = [137, 80, 78, 71, 13, 10, 26, 10, 1];
const buffer = () => Uint8Array.from(signature).buffer;

function previewResponse() {
  return {
    id: 1,
    type: "preview",
    width: 1,
    height: 1,
    png: buffer(),
    histogram: { red: Array(64).fill(1), green: Array(64).fill(1), blue: Array(64).fill(1) },
  };
}

describe("batch photo editing", () => {
  beforeEach(async () => {
    vi.resetModules();
    const html = await readFile(resolve(process.cwd(), "src/renderer/index.html"), "utf8");
    document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "";
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1, height: 1, close: vi.fn() })));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
      lineWidth: 1, strokeStyle: "",
    } as unknown as CanvasRenderingContext2D);

    worker.request.mockReset();
    worker.request.mockImplementation(async (command: { type: string }) => {
      switch (command.type) {
        case "prepare-photo": return { id: 1, type: "prepared", width: 1, height: 1, thumbnail: buffer() };
        case "colorize": return { id: 1, type: "candidate", width: 1, height: 1, png: buffer(), thumbnail: buffer() };
        case "load-candidate": return { id: 1, type: "candidate-ready", width: 1, height: 1 };
        case "preview": return previewResponse();
        case "export": return { id: 1, type: "export", png: buffer() };
        default: return { id: 1, type: "released" };
      }
    });

    window.desktop = {
      selectBatch: vi.fn(async () => ({
        id: "00000000-0000-4000-8000-000000000010",
        photos: [{ id: "00000000-0000-4000-8000-000000000001", name: "family.png", mimeType: "image/png" as const }],
      })),
      readPhoto: vi.fn(async () => ({ mimeType: "image/png" as const, bytes: new Uint8Array(signature) })),
      ensureModel: vi.fn(async (modelId) => `app://app/model/${modelId}`),
      writeCandidate: vi.fn(async () => undefined),
      readCandidate: vi.fn(async () => new Uint8Array(signature)),
      saveCandidate: vi.fn(async () => true),
      chooseOutputFolder: vi.fn(async () => "00000000-0000-4000-8000-000000000020"),
      saveBatchOutput: vi.fn(async () => "family-farbig.png"),
      updateBatchUnsaved: vi.fn(async () => undefined),
      closeBatch: vi.fn(async () => true),
      onModelProgress: vi.fn(() => () => undefined),
    };

    await import("../src/renderer/app");
  });

  it("processes both models for one photo, edits each result independently, and saves the chosen one", async () => {
    document.querySelector<HTMLButtonElement>("#choose-photos")!.click();
    await vi.waitFor(() => expect(document.querySelector(".photo-card h2")?.textContent).toBe("family.png"));
    document.querySelector<HTMLButtonElement>("#start-batch")!.click();
    await vi.waitFor(() => expect(document.querySelectorAll(".candidate-card img")).toHaveLength(2));
    await vi.waitFor(() => expect(document.querySelector<HTMLButtonElement>("#cancel-batch")!.hidden).toBe(true));

    expect(window.desktop.ensureModel).toHaveBeenNthCalledWith(1, "deoldify-stable");
    expect(window.desktop.ensureModel).toHaveBeenNthCalledWith(2, "ddcolor-tiny");
    await vi.waitFor(() => expect((document.querySelector("#editor") as HTMLElement).hidden).toBe(false));
    expect(document.querySelector("#adjustments h3")?.textContent).toBe("Farben anpassen");
    expect(document.querySelector("#black-point")).not.toBeNull();
    expect(document.querySelector("#editor-original")).toBeNull();
    document.querySelector<HTMLButtonElement>("#zoom-in")!.click();
    expect(document.querySelector("#zoom-value")?.textContent).toBe("125 %");
    document.querySelector<HTMLButtonElement>("#zoom-reset")!.click();
    expect(document.querySelector("#zoom-value")?.textContent).toBe("100 %");

    const intensity = document.querySelector<HTMLInputElement>("#intensity")!;
    intensity.value = "125";
    intensity.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => expect(worker.request).toHaveBeenCalledWith(expect.objectContaining({ type: "preview" })));
    const loadsBeforeRestart = worker.request.mock.calls.filter(([command]) => command.type === "load-candidate").length;
    worker.generation += 1;
    intensity.value = "126";
    intensity.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => expect(worker.request.mock.calls.filter(([command]) => command.type === "load-candidate")).toHaveLength(loadsBeforeRestart + 1));

    document.querySelector<HTMLButtonElement>('[data-action="edit"][data-model="ddcolor-tiny"]')?.click();
    await vi.waitFor(() => expect(document.querySelector("#editor-title")?.textContent).toContain("family.png"));
    expect(intensity.value).toBe("100");
    document.querySelector<HTMLButtonElement>("#choose-result")!.click();
    document.querySelector<HTMLButtonElement>("#save-one")!.click();

    await vi.waitFor(() => expect(window.desktop.saveCandidate).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000010",
      "00000000-0000-4000-8000-000000000001",
      "ddcolor-tiny",
      expect.any(Uint8Array),
    ));
    expect((document.querySelector("#editor") as HTMLElement).hidden).toBe(true);
    document.querySelector<HTMLButtonElement>("#save-all")!.click();
    expect((document.querySelector("#save-selection") as HTMLElement).hidden).toBe(false);
    expect(document.querySelectorAll("#save-selection-list input:checked")).toHaveLength(1);
    document.querySelector<HTMLButtonElement>("#confirm-save-selection")!.click();
    await vi.waitFor(() => expect(window.desktop.saveBatchOutput).toHaveBeenCalled());
  });

  it("re-enables a failed candidate retry after it finishes", async () => {
    worker.request.mockImplementation(async (command: { type: string }) => {
      if (command.type === "colorize") throw new Error("mock inference failure");
      return { id: 1, type: command.type === "prepare-photo" ? "prepared" : "released", width: 1, height: 1, thumbnail: buffer() };
    });

    document.querySelector<HTMLButtonElement>("#choose-photos")!.click();
    await vi.waitFor(() => expect(document.querySelector(".photo-card h2")?.textContent).toBe("family.png"));
    document.querySelector<HTMLButtonElement>("#start-batch")!.click();
    await vi.waitFor(() => expect(worker.request.mock.calls.filter(([command]) => command.type === "colorize")).toHaveLength(2));
    await vi.waitFor(() => expect(document.querySelectorAll(".candidate-card img")).toHaveLength(0));
    const retryButton = () => {
      const card = [...document.querySelectorAll<HTMLElement>(".candidate-card")]
        .find((item) => item.querySelector("h3")?.textContent === "DeOldify Stable");
      return card?.querySelector<HTMLButtonElement>("button");
    };
    await vi.waitFor(() => expect(retryButton()?.disabled).toBe(false));

    retryButton()!.click();
    await vi.waitFor(() => expect(worker.request.mock.calls.filter(([command]) => command.type === "colorize")).toHaveLength(3));
    await vi.waitFor(() => expect(retryButton()?.disabled).toBe(false));
  });
});
