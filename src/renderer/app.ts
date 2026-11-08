import "./styles.css";
import { adjustmentPlan, defaultAdjustments, type Adjustments } from "./adjustments";
import { colorizeImage } from "./colorizer";
import { DEFAULT_MODEL_ID, isModelId, MODEL_CATALOG, type ModelId } from "../shared/model";

const chooseButton = document.querySelector<HTMLButtonElement>("#choose-photo")!;
const colorizeButton = document.querySelector<HTMLButtonElement>("#colorize")!;
const saveButton = document.querySelector<HTMLButtonElement>("#save-photo")!;
const modelSelect = document.querySelector<HTMLSelectElement>("#model")!;
const resultModelLabel = document.querySelector<HTMLElement>("#result-model")!;
const fileName = document.querySelector<HTMLElement>("#file-name")!;
const status = document.querySelector<HTMLElement>("#status")!;
const progressWrap = document.querySelector<HTMLElement>("#progress-wrap")!;
const progress = document.querySelector<HTMLProgressElement>("#progress")!;
const progressLabel = document.querySelector<HTMLElement>("#progress-label")!;
const preview = document.querySelector<HTMLElement>("#preview")!;
const original = document.querySelector<HTMLImageElement>("#original")!;
const resultCanvas = document.querySelector<HTMLCanvasElement>("#result")!;
const adjustmentPanel = document.querySelector<HTMLDetailsElement>("#adjustments")!;
const colorizedCanvas = document.createElement("canvas");
const sliders = {
  intensity: document.querySelector<HTMLInputElement>("#intensity")!,
  brightness: document.querySelector<HTMLInputElement>("#brightness")!,
  warmth: document.querySelector<HTMLInputElement>("#warmth")!,
};
const values = {
  intensity: document.querySelector<HTMLOutputElement>("#intensity-value")!,
  brightness: document.querySelector<HTMLOutputElement>("#brightness-value")!,
  warmth: document.querySelector<HTMLOutputElement>("#warmth-value")!,
};
let currentPhoto: { id: string; name: string; bitmap?: ImageBitmap } | undefined;
let imageUrl: string | undefined;
let adjustments: Adjustments = { ...defaultAdjustments };
let busy = false;
let resultModel: ModelId | undefined;

modelSelect.value = DEFAULT_MODEL_ID;

function updateColorizeButton(): void {
  colorizeButton.disabled = busy || !currentPhoto?.bitmap || resultModel === modelSelect.value;
}

function setBusy(value: boolean): void {
  busy = value;
  chooseButton.disabled = value;
  modelSelect.disabled = value;
  updateColorizeButton();
  saveButton.disabled = value;
}

function showError(error: unknown, fallback: string): void {
  status.textContent = error instanceof Error ? error.message : fallback;
  progressWrap.hidden = true;
}

function updateSliderLabels(): void {
  values.intensity.value = sliders.intensity.value + " %";
  values.brightness.value = sliders.brightness.value + " %";
  const warmth = Number(sliders.warmth.value);
  values.warmth.value = warmth === 0 ? "Neutral" : Math.abs(warmth) + (warmth < 0 ? " % kühler" : " % wärmer");
}

function resetAdjustments(): void {
  for (const key of Object.keys(sliders) as (keyof Adjustments)[]) {
    sliders[key].value = String(defaultAdjustments[key]);
  }
  adjustments = { ...defaultAdjustments };
  updateSliderLabels();
}

function clearPhoto(): void {
  currentPhoto?.bitmap?.close();
  currentPhoto = undefined;
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = undefined;
  original.removeAttribute("src");
  preview.hidden = true;
  adjustmentPanel.hidden = true;
  saveButton.hidden = true;
  resultModel = undefined;
  resultModelLabel.textContent = "noch nicht gefärbt";
  fileName.textContent = "Sie haben noch kein Foto ausgewählt.";
  colorizedCanvas.width = 0;
  colorizedCanvas.height = 0;
  resultCanvas.width = 0;
  resultCanvas.height = 0;
}

function paintAdjusted(): void {
  const context = resultCanvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
  const plan = adjustmentPlan(adjustments);
  if (plan.filter === "none" && plan.overlay === null) {
    context.drawImage(colorizedCanvas, 0, 0);
    return;
  }
  context.filter = plan.filter;
  context.drawImage(colorizedCanvas, 0, 0);
  context.filter = "none";
  if (plan.overlay) {
    context.globalCompositeOperation = "soft-light";
    context.globalAlpha = plan.overlay.alpha;
    context.fillStyle = plan.overlay.color;
    context.fillRect(0, 0, resultCanvas.width, resultCanvas.height);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
  }
}

async function choosePhoto(): Promise<void> {
  if (busy) return;
  setBusy(true);
  try {
    const photo = await window.desktop.selectPhoto();
    if (!photo) return;
    clearPhoto();
    const bytes = new ArrayBuffer(photo.bytes.byteLength);
    new Uint8Array(bytes).set(photo.bytes);
    const blob = new Blob([bytes], { type: photo.mimeType });
    const nextUrl = URL.createObjectURL(blob);
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob);
    } catch {
      URL.revokeObjectURL(nextUrl);
      throw new Error("Das Foto konnte nicht geöffnet werden. Bitte wählen Sie ein anderes Foto.");
    }
    if (bitmap.width * bitmap.height > 24_000_000) {
      bitmap.close();
      URL.revokeObjectURL(nextUrl);
      throw new Error("Dieses Foto ist zu groß. Bitte wählen Sie ein kleineres Foto aus.");
    }

    if (imageUrl) URL.revokeObjectURL(imageUrl);
    if (currentPhoto?.bitmap) currentPhoto.bitmap.close();
    imageUrl = nextUrl;
    currentPhoto = { id: photo.id, name: photo.name, bitmap };
    original.src = imageUrl;
    fileName.textContent = photo.name + " · " + bitmap.width + " × " + bitmap.height + " Pixel";
    preview.hidden = false;
    adjustmentPanel.hidden = true;
    saveButton.hidden = true;
    updateColorizeButton();
    colorizedCanvas.width = 0;
    colorizedCanvas.height = 0;
    resultCanvas.width = 0;
    resultCanvas.height = 0;
    resetAdjustments();
    status.textContent = "Das Foto ist bereit. Wählen Sie „Mit diesem Modell färben“.";
  } catch (error) {
    showError(error, "Das Foto konnte nicht geöffnet werden.");
  } finally {
    setBusy(false);
  }
}

async function addColor(): Promise<void> {
  if (busy || !currentPhoto?.bitmap || !isModelId(modelSelect.value)) return;
  const modelId = modelSelect.value;
  const model = MODEL_CATALOG[modelId];
  setBusy(true);
  progressWrap.hidden = false;
  progress.removeAttribute("value");
  progressLabel.textContent = "";
  status.textContent = "Das Färben mit " + model.name + " kann etwas dauern. Bitte lassen Sie das Fenster geöffnet.";
  let downloading = true;
  const stopProgress = window.desktop.onModelProgress(({ percent }) => {
    progress.value = percent;
    progressLabel.textContent = percent + " %";
    status.textContent = model.name + " wird einmalig geladen.";
  });
  try {
    const modelUrl = await window.desktop.ensureModel(modelId);
    downloading = false;
    progressWrap.hidden = true;
    status.textContent = "Das Foto wird gefärbt. Bitte warten Sie.";
    const bitmap = currentPhoto.bitmap;
    const image = await colorizeImage(bitmap, modelId, modelUrl);
    colorizedCanvas.width = image.width;
    colorizedCanvas.height = image.height;
    colorizedCanvas.getContext("2d")!.putImageData(image, 0, 0);
    resultCanvas.width = image.width;
    resultCanvas.height = image.height;
    resetAdjustments();
    paintAdjusted();
    resultModel = modelId;
    resultModelLabel.textContent = model.name;
    adjustmentPanel.hidden = false;
    saveButton.hidden = false;
    status.textContent = "Fertig mit " + model.name + ". Sie können die Farben anpassen oder das andere Modell ausprobieren.";
  } catch (error) {
    showError(
      downloading ? error : new Error("Das Foto konnte nicht gefärbt werden. Prüfen Sie den freien Speicher und versuchen Sie es erneut."),
      "Das Foto konnte nicht gefärbt werden.",
    );
  } finally {
    stopProgress();
    if (downloading) progressWrap.hidden = true;
    setBusy(false);
  }
}

async function savePhoto(): Promise<void> {
  if (busy || !currentPhoto) return;
  setBusy(true);
  status.textContent = "Die farbige Kopie wird gespeichert.";
  try {
    const blob = await new Promise<Blob>((resolve, reject) => {
      resultCanvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG-Erstellung fehlgeschlagen")), "image/png");
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const saved = await window.desktop.savePhoto(currentPhoto.id, bytes);
    status.textContent = saved ? "Die farbige Kopie wurde gespeichert." : "Speichern wurde abgebrochen.";
  } catch (error) {
    showError(error, "Die Kopie konnte nicht gespeichert werden.");
  } finally {
    setBusy(false);
  }
}

chooseButton.addEventListener("click", () => void choosePhoto());
colorizeButton.addEventListener("click", () => void addColor());
saveButton.addEventListener("click", () => void savePhoto());
modelSelect.addEventListener("change", () => {
  updateColorizeButton();
  if (resultModel && isModelId(modelSelect.value) && resultModel !== modelSelect.value) {
    status.textContent = "Modell gewechselt. Wählen Sie „Mit diesem Modell färben“, um dasselbe Foto neu zu färben.";
  }
});
document.querySelector<HTMLButtonElement>("#reset-adjustments")!.addEventListener("click", () => {
  resetAdjustments();
  paintAdjusted();
});
for (const key of Object.keys(sliders) as (keyof Adjustments)[]) {
  sliders[key].addEventListener("input", () => {
    adjustments[key] = Number(sliders[key].value);
    updateSliderLabels();
    paintAdjusted();
  });
}

window.addEventListener("beforeunload", () => {
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  currentPhoto?.bitmap?.close();
});
