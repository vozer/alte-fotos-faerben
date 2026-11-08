import { beforeEach, describe, expect, it, vi } from "vitest";

const colorizeImage = vi.fn(async () => ({
  width: 1,
  height: 1,
  data: new Uint8ClampedArray(4),
}));

vi.mock("../src/renderer/colorizer", () => ({ colorizeImage }));

describe("model switching", () => {
  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = `
      <select id="model"><option value="ddcolor-tiny">Tiny</option><option value="deoldify-stable">Stable</option></select>
      <button id="choose-photo"></button><button id="colorize"></button><button id="save-photo"></button>
      <span id="result-model"></span><span id="file-name"></span><p id="status"></p>
      <div id="progress-wrap"><progress id="progress"></progress><span id="progress-label"></span></div>
      <section id="preview" hidden><img id="original" /><canvas id="result"></canvas></section>
      <details id="adjustments" hidden>
        <input id="intensity" type="range" min="50" max="150" value="100" />
        <input id="brightness" type="range" min="80" max="120" value="100" />
        <input id="warmth" type="range" min="-100" max="100" value="0" />
        <output id="intensity-value"></output><output id="brightness-value"></output><output id="warmth-value"></output>
        <button id="reset-adjustments"></button>
      </details>`;

    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1, height: 1, close: vi.fn() })));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      putImageData: vi.fn(),
      filter: "none",
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D);

    window.desktop = {
      selectPhoto: vi.fn(async () => ({
        id: "photo-1",
        name: "family.jpg",
        mimeType: "image/jpeg" as const,
        bytes: new Uint8Array([1]),
      })),
      ensureModel: vi.fn(async (modelId) => modelId),
      savePhoto: vi.fn(async () => true),
      onModelProgress: vi.fn(() => () => undefined),
    };

    await import("../src/renderer/app");
  });

  it("recolors the same open photo and resets slider labels with the new result", async () => {
    const model = document.querySelector<HTMLSelectElement>("#model")!;
    expect(model.value).toBe("deoldify-stable");

    document.querySelector<HTMLButtonElement>("#choose-photo")!.click();
    await vi.waitFor(() => expect(document.querySelector("#file-name")!.textContent).toContain("family.jpg"));
    document.querySelector<HTMLButtonElement>("#colorize")!.click();
    await vi.waitFor(() => expect(document.querySelector("#result-model")!.textContent).toBe("DeOldify Stable"));

    const intensity = document.querySelector<HTMLInputElement>("#intensity")!;
    const brightness = document.querySelector<HTMLInputElement>("#brightness")!;
    const warmth = document.querySelector<HTMLInputElement>("#warmth")!;
    intensity.value = "150";
    brightness.value = "105";
    warmth.value = "31";
    for (const slider of [intensity, brightness, warmth]) slider.dispatchEvent(new Event("input", { bubbles: true }));

    model.value = "ddcolor-tiny";
    model.dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector<HTMLButtonElement>("#colorize")!.click();
    await vi.waitFor(() => expect(document.querySelector("#result-model")!.textContent).toBe("DDColor Tiny"));

    expect(window.desktop.selectPhoto).toHaveBeenCalledTimes(1);
    expect(intensity.value).toBe("100");
    expect(brightness.value).toBe("100");
    expect(warmth.value).toBe("0");
    expect(document.querySelector("#intensity-value")!.textContent).toBe("100 %");
    expect(document.querySelector("#brightness-value")!.textContent).toBe("100 %");
    expect(document.querySelector("#warmth-value")!.textContent).toBe("Neutral");
  });
});
