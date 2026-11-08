import "./styles.css";
import { defaultAdjustments, type Adjustments, type Curve, type RgbHistogram } from "./adjustments";
import {
  candidateKey,
  createBatchPhotos,
  hasUnsavedChoices,
  markSaved,
  processBatch,
  retryCandidate,
  selectCandidate,
  type BatchAdapter,
  type BatchPhoto,
  type CandidateState,
} from "./batch";
import { MAX_BATCH_PHOTOS, MODEL_CATALOG, type ModelId } from "../shared/model";
import { getWorkerGeneration, requestWorker, terminateWorker } from "./worker-client";
import type { WorkerResponse } from "./worker-protocol";

const $ = <T extends Element = HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
const chooseButton = $<HTMLButtonElement>("#choose-photos");
const startButton = $<HTMLButtonElement>("#start-batch");
const cancelButton = $<HTMLButtonElement>("#cancel-batch");
const saveOneButton = $<HTMLButtonElement>("#save-one");
const saveAllButton = $<HTMLButtonElement>("#save-all");
const saveSelection = $("#save-selection");
const saveSelectionList = $("#save-selection-list");
const confirmSaveSelectionButton = $<HTMLButtonElement>("#confirm-save-selection");
const cancelSaveSelectionButton = $<HTMLButtonElement>("#cancel-save-selection");
const closeButton = $<HTMLButtonElement>("#close-batch");
const batchCount = $("#batch-count");
const status = $("#status");
const progressWrap = $("#progress-wrap");
const progress = $<HTMLProgressElement>("#progress");
const progressLabel = $("#progress-label");
const batchView = $("#batch-view");
const photoList = $("#photo-list");
const editor = $("#editor");
const editorTitle = $("#editor-title");
const editorSubtitle = $("#editor-subtitle");
const editorResult = $<HTMLImageElement>("#editor-result");
const zoomValue = $<HTMLOutputElement>("#zoom-value");
const chooseResultButton = $<HTMLButtonElement>("#choose-result");
const resetButton = $<HTMLButtonElement>("#reset-adjustments");
const zoomInButton = $<HTMLButtonElement>("#zoom-in");
const zoomOutButton = $<HTMLButtonElement>("#zoom-out");
const zoomResetButton = $<HTMLButtonElement>("#zoom-reset");
const curveChannel = $<HTMLSelectElement>("#curve-channel");
const curveGraph = $<SVGSVGElement>("#curve-graph");
const curveLine = $<SVGPathElement>("#curve-line");
const curvePoints = $<SVGGElement>("#curve-points");
const histogramCanvas = $<HTMLCanvasElement>("#histogram");
const histogramDescription = $("#histogram-description");
const sliderIds = ["intensity", "brightness", "warmth", "hue", "black-point", "midtone", "white-point"] as const;
const curveX = [0, 64, 128, 192, 255] as const;

type Operation = "idle" | "processing" | "loading" | "saving";
type CurveChannel = keyof Adjustments["curves"];

let batchId: string | undefined;
let photos: BatchPhoto[] = [];
let activePhotoId: string | undefined;
let activeModelId: ModelId | undefined;
let operation: Operation = "idle";
let stopAfterCurrentPhoto = false;
let stopWasRequested = false;
let downloadingModel: ModelId | undefined;
let activeWorkerPhotoId: string | undefined;
let loadedCandidateKey: string | undefined;
let activePreviewUrl: string | undefined;
let previewTimer: number | undefined;
let previewSequence = 0;
let lastUnsavedState: boolean | undefined;
let draggedCurvePoint: number | undefined;
let imageZoom = 1;

function currentPhoto(): BatchPhoto | undefined {
  return photos.find((photo) => photo.id === activePhotoId);
}

function currentCandidate(): CandidateState | undefined {
  const photo = currentPhoto();
  return photo && activeModelId ? photo.candidates[activeModelId] : undefined;
}

function modelName(modelId: ModelId): string {
  return MODEL_CATALOG[modelId].name;
}

function setStatus(message: string): void {
  status.textContent = message;
}

function setOperation(next: Operation): void {
  operation = next;
  const busy = next !== "idle";
  chooseButton.disabled = busy;
  startButton.disabled = busy || !photos.length || !photos.some((photo) => Object.values(photo.candidates).some((candidate) => candidate.status !== "ready"));
  cancelButton.hidden = next !== "processing";
  cancelButton.disabled = stopWasRequested;
  cancelButton.textContent = stopWasRequested ? "Anhalten ist vorgemerkt" : "Nach diesem Foto anhalten";
  saveOneButton.disabled = busy || !currentPhoto()?.selectedModel || currentPhoto()?.candidates[currentPhoto()!.selectedModel!].status !== "ready";
  saveAllButton.disabled = busy || !photos.some((photo) => photo.selectedModel && photo.candidates[photo.selectedModel].status === "ready");
  closeButton.disabled = busy;
  progressWrap.hidden = !busy;
  if (next !== "processing") {
    progress.removeAttribute("value");
    progressLabel.textContent = next === "saving" ? "Speichern läuft." : "";
  }
  updateEditorButtons();
}

function updateEditorButtons(): void {
  const photo = currentPhoto();
  const modelId = activeModelId;
  const candidate = currentCandidate();
  const busy = operation === "saving" || operation === "loading";
  for (const id of sliderIds) $<HTMLInputElement>(`#${id}`).disabled = busy || !candidate || candidate.status !== "ready";
  curveChannel.disabled = busy || !candidate || candidate.status !== "ready";
  resetButton.disabled = busy || !candidate || candidate.status !== "ready";
  chooseResultButton.disabled = busy || !photo || !modelId || candidate?.status !== "ready";
  chooseResultButton.textContent = "Bestätigen";
}

function syncUnsavedState(): void {
  if (!batchId) return;
  const dirty = hasUnsavedChoices(photos);
  if (dirty === lastUnsavedState) return;
  lastUnsavedState = dirty;
  void window.desktop.updateBatchUnsaved(batchId, dirty).catch(() => undefined);
}

function updateCounts(): void {
  const ready = photos.filter((photo) => Object.values(photo.candidates).every((candidate) => candidate.status === "ready")).length;
  const failures = photos.reduce((sum, photo) => sum + Object.values(photo.candidates).filter((candidate) => candidate.status === "failed").length, 0);
  if (!photos.length) {
    batchCount.textContent = `Wählen Sie bis zu ${MAX_BATCH_PHOTOS} Fotos aus.`;
    return;
  }
  batchCount.textContent = `${photos.length} ${photos.length === 1 ? "Foto" : "Fotos"} · ${ready} vollständig · ${failures} fehlgeschlagene Ergebnisse`;
}

function photoStatus(photo: BatchPhoto): string {
  if (photo.validationError) return photo.validationError;
  if (photo.status === "processing") return "Wird gerade gefärbt …";
  const ready = Object.values(photo.candidates).filter((candidate) => candidate.status === "ready").length;
  if (ready === 2) return "Beide Ergebnisse sind fertig.";
  if (ready === 1) return "Ein Ergebnis ist fertig. Das andere kann erneut versucht werden.";
  if (photo.status === "failed") return "Kein Ergebnis fertig. Sie können es erneut versuchen.";
  return "Bereit zum Färben.";
}

function candidateStatus(candidate: CandidateState): string {
  switch (candidate.status) {
    case "pending": return "Wartet auf die Verarbeitung.";
    case "running": return "Wird gerade gefärbt …";
    case "ready": return "Fertig. Sie können das Ergebnis bearbeiten.";
    case "failed": return candidate.errorMessage ?? "Das Ergebnis konnte nicht erstellt werden.";
  }
}

function makeButton(label: string, className: string, handler: () => void, disabled = false): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `button ${className}`;
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", handler);
  return button;
}

function renderCandidateCard(photo: BatchPhoto, modelId: ModelId): HTMLElement {
  const candidate = photo.candidates[modelId];
  const card = document.createElement("section");
  card.className = "candidate-card" + (photo.selectedModel === modelId ? " is-selected" : "");
  const title = document.createElement("h3");
  title.textContent = modelName(modelId);
  card.append(title);
  if (candidate.status === "ready" && candidate.thumbnailUrl) {
    const image = document.createElement("img");
    image.src = candidate.thumbnailUrl;
    image.alt = `${modelName(modelId)}-Ergebnis für ${photo.name}`;
    card.append(image);
  }
  const state = document.createElement("p");
  state.className = "candidate-state";
  state.textContent = candidateStatus(candidate);
  card.append(state);

  const actions = document.createElement("div");
  actions.className = "candidate-actions";
  if (candidate.status === "ready") {
    const editButton = makeButton("Bearbeiten", "button-small", () => void openEditor(photo, modelId), operation === "saving" || operation === "loading");
    editButton.dataset.action = "edit";
    editButton.dataset.model = modelId;
    actions.append(editButton);
    const label = document.createElement("label");
    label.className = "candidate-choice";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = `winner-${photo.id}`;
    radio.checked = photo.selectedModel === modelId;
    radio.setAttribute("aria-label", `${modelName(modelId)} für ${photo.name} auswählen`);
    radio.disabled = operation === "saving" || operation === "loading";
    radio.addEventListener("change", () => {
      selectCandidate(photo, modelId);
      activePhotoId = photo.id;
      renderBatchList();
      syncUnsavedState();
      updateCounts();
      updateEditorButtons();
      void openEditor(photo, modelId);
    });
    label.append(radio, document.createTextNode("Als Ergebnis auswählen"));
    actions.append(label);
  } else if (candidate.status === "failed") {
    actions.append(makeButton("Erneut versuchen", "button-small", () => void retryOne(photo, modelId), operation !== "idle"));
  }
  card.append(actions);
  return card;
}

function renderBatchList(): void {
  photoList.replaceChildren();
  for (const photo of photos) {
    const card = document.createElement("article");
    card.className = "photo-card";
    const header = document.createElement("div");
    header.className = "photo-card-header";
    const title = document.createElement("h2");
    title.textContent = photo.name;
    header.append(title);
    const meta = document.createElement("span");
    meta.className = "photo-size";
    meta.textContent = photo.width && photo.height ? `${photo.width} × ${photo.height}` : "";
    header.append(meta);
    card.append(header);
    const state = document.createElement("p");
    state.className = "photo-status";
    state.textContent = photoStatus(photo);
    card.append(state);
    if (photo.originalThumbnailUrl) {
      const original = document.createElement("img");
      original.className = "photo-original-thumb";
      original.src = photo.originalThumbnailUrl;
      original.alt = `Original: ${photo.name}`;
      card.append(original);
    }
    const candidates = document.createElement("div");
    candidates.className = "candidate-grid";
    candidates.append(renderCandidateCard(photo, "deoldify-stable"), renderCandidateCard(photo, "ddcolor-tiny"));
    card.append(candidates);
    photoList.append(card);
  }
  updateCounts();
  setOperation(operation);
}

function blobUrl(buffer: ArrayBuffer, mimeType: string): string {
  return URL.createObjectURL(new Blob([buffer], { type: mimeType }));
}

function transferBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer as ArrayBuffer;
}

function expectWorkerResponse<T extends WorkerResponse["type"]>(response: WorkerResponse, type: T): Extract<WorkerResponse, { type: T }> {
  if ("error" in response) throw new Error(response.error);
  if (!response.type || response.type !== type) throw new Error(`Die Bildverarbeitung hat kein ${type}-Ergebnis geliefert.`);
  return response as Extract<WorkerResponse, { type: T }>;
}

function createBatchAdapter(id: string): BatchAdapter {
  return {
    ensureModel: async (modelId) => {
      downloadingModel = modelId;
      const index = photos.findIndex((photo) => photo.status === "processing");
      progressLabel.textContent = `Foto ${index + 1} von ${photos.length} · ${modelName(modelId)} wird geprüft oder geladen.`;
      try {
        return await window.desktop.ensureModel(modelId);
      } finally {
        downloadingModel = undefined;
      }
    },
    preparePhoto: async (photo) => {
      loadedCandidateKey = undefined;
      activeWorkerPhotoId = photo.id;
      const source = await window.desktop.readPhoto(id, photo.id);
      const bytes = transferBuffer(source.bytes);
      const response = expectWorkerResponse(
        await requestWorker({ type: "prepare-photo", photoId: photo.id, bytes, mimeType: source.mimeType }, [bytes]),
        "prepared",
      );
      return {
        width: response.width,
        height: response.height,
        thumbnail: new Uint8Array(response.thumbnail),
      };
    },
    colorize: async (photo, modelId, modelUrl) => {
      progressLabel.textContent = `Foto ${photos.indexOf(photo) + 1} von ${photos.length} · ${modelName(modelId)} färbt.`;
      const response = expectWorkerResponse(
        await requestWorker({ type: "colorize", photoId: photo.id, modelId, modelUrl }),
        "candidate",
      );
      return {
        width: response.width,
        height: response.height,
        png: new Uint8Array(response.png),
        thumbnail: new Uint8Array(response.thumbnail),
      };
    },
    storeCandidate: (photo, modelId, png) => window.desktop.writeCandidate(id, photo.id, modelId, png),
    releasePhoto: async (photo) => {
      if (activeWorkerPhotoId === photo.id) activeWorkerPhotoId = undefined;
      loadedCandidateKey = undefined;
      await requestWorker({ type: "release-photo", photoId: photo.id });
    },
  };
}

async function choosePhotos(): Promise<void> {
  if (operation !== "idle") return;
  setOperation("loading");
  setStatus("Wählen Sie bis zu 20 Fotos aus.");
  try {
    const selection = await window.desktop.selectBatch(hasUnsavedChoices(photos));
    if (!selection) return;
    await requestWorker({ type: "release-photo", photoId: activeWorkerPhotoId ?? "" }).catch(() => undefined);
    clearBatchState();
    batchId = selection.id;
    lastUnsavedState = undefined;
    photos = createBatchPhotos(selection.photos.map((photo) => ({
      id: photo.id,
      name: photo.name,
      mimeType: photo.mimeType,
      errorMessage: photo.errorMessage,
    })));
    batchView.hidden = false;
    editor.hidden = true;
    closeButton.hidden = false;
    activePhotoId = photos[0]?.id;
    activeModelId = undefined;
    renderBatchList();
    syncUnsavedState();
    setStatus(`${photos.length} ${photos.length === 1 ? "Foto wurde" : "Fotos wurden"} ausgewählt. Starten Sie beide Farbmodelle.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Die Fotos konnten nicht ausgewählt werden.");
  } finally {
    setOperation("idle");
  }
}

function clearBatchState(): void {
  for (const photo of photos) {
    if (photo.originalThumbnailUrl) URL.revokeObjectURL(photo.originalThumbnailUrl);
    for (const candidate of Object.values(photo.candidates)) {
      if (candidate.thumbnailUrl) URL.revokeObjectURL(candidate.thumbnailUrl);
    }
  }
  if (activePreviewUrl) URL.revokeObjectURL(activePreviewUrl);
  activePreviewUrl = undefined;
  activePhotoId = undefined;
  activeModelId = undefined;
  activeWorkerPhotoId = undefined;
  loadedCandidateKey = undefined;
  photos = [];
  photoList.replaceChildren();
  batchView.hidden = true;
  editor.hidden = true;
  closeButton.hidden = true;
  updateCounts();
}

async function startBatch(): Promise<void> {
  if (!batchId || operation !== "idle") return;
  stopAfterCurrentPhoto = false;
  stopWasRequested = false;
  setOperation("processing");
  setStatus("Das Färben kann dauern. Sie können währenddessen weiterarbeiten.");
  progressWrap.hidden = false;
  progress.removeAttribute("value");
  const adapter = createBatchAdapter(batchId);
  try {
    const result = await processBatch(photos, adapter, () => stopAfterCurrentPhoto, () => {
      renderBatchList();
      syncUnsavedState();
    });
    const ready = photos.reduce((sum, photo) => sum + Object.values(photo.candidates).filter((candidate) => candidate.status === "ready").length, 0);
    const failed = photos.reduce((sum, photo) => sum + Object.values(photo.candidates).filter((candidate) => candidate.status === "failed").length, 0);
    setStatus(result.cancelled ? `Angehalten. ${ready} Ergebnisse bleiben erhalten. Sie können später fortsetzen.` : `Fertig. ${ready} Ergebnisse sind bereit${failed ? `; ${failed} Ergebnisse brauchen einen neuen Versuch` : ""}.`);
    if (!activeModelId) {
      const first = photos.find((photo) => photo.candidates["deoldify-stable"].status === "ready") ?? photos.find((photo) => photo.candidates["ddcolor-tiny"].status === "ready");
      if (first) void openEditor(first, first.candidates["deoldify-stable"].status === "ready" ? "deoldify-stable" : "ddcolor-tiny");
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Die Verarbeitung wurde unterbrochen.");
  } finally {
    stopAfterCurrentPhoto = false;
    stopWasRequested = false;
    setOperation("idle");
    renderBatchList();
    syncUnsavedState();
  }
}

function cancelBatch(): void {
  if (operation !== "processing" || stopWasRequested) return;
  stopAfterCurrentPhoto = true;
  stopWasRequested = true;
  cancelButton.disabled = true;
  cancelButton.textContent = "Anhalten ist vorgemerkt";
  setStatus("Beide Modelle für dieses Foto werden fertig. Danach hält die Verarbeitung an.");
}

async function retryOne(photo: BatchPhoto, modelId: ModelId): Promise<void> {
  if (!batchId || operation !== "idle") return;
  setOperation("loading");
  setStatus(`${modelName(modelId)} wird für ${photo.name} erneut versucht.`);
  try {
    await retryCandidate(photo, modelId, createBatchAdapter(batchId));
    setStatus(photo.candidates[modelId].status === "ready" ? `${modelName(modelId)} ist fertig.` : candidateStatus(photo.candidates[modelId]));
  } finally {
    setOperation("idle");
    renderBatchList();
    syncUnsavedState();
  }
}

async function ensureWorkerCandidate(photo: BatchPhoto, modelId: ModelId): Promise<string> {
  if (!batchId) throw new Error("Der Fotostapel ist nicht mehr geöffnet.");
  const key = candidateKey(photo, modelId);
  const cachedKey = `${getWorkerGeneration()}:${key}`;
  if (loadedCandidateKey === cachedKey) return key;
  const bytes = transferBuffer(await window.desktop.readCandidate(batchId, photo.id, modelId));
  const response = expectWorkerResponse(
    await requestWorker({ type: "load-candidate", key, bytes }, [bytes]),
    "candidate-ready",
  );
  loadedCandidateKey = cachedKey;
  return key;
}

function updateEditorLabels(candidate: CandidateState): void {
  const values = candidate.adjustments;
  $<HTMLOutputElement>("#intensity-value").value = `${values.intensity} %`;
  $<HTMLOutputElement>("#brightness-value").value = `${values.brightness} %`;
  $<HTMLOutputElement>("#warmth-value").value = values.warmth === 0 ? "Neutral" : `${Math.abs(values.warmth)} % ${values.warmth < 0 ? "kühler" : "wärmer"}`;
  $<HTMLOutputElement>("#hue-value").value = `${values.hue}°`;
  $<HTMLOutputElement>("#black-point-value").value = String(values.blackPoint);
  $<HTMLOutputElement>("#midtone-value").value = values.midtone.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  $<HTMLOutputElement>("#white-point-value").value = String(values.whitePoint);
  for (const id of sliderIds) {
    const key = id === "black-point" ? "blackPoint" : id === "white-point" ? "whitePoint" : id as keyof Omit<Adjustments, "curves">;
    $<HTMLInputElement>(`#${id}`).value = String(values[key]);
  }
}

function activeCurve(candidate: CandidateState): Curve {
  return candidate.adjustments.curves[curveChannel.value as CurveChannel];
}

function curvePath(values: Curve): string {
  return values.map((value, index) => `${index ? "L" : "M"}${curveX[index]} ${255 - value}`).join("");
}

function renderCurvePoints(candidate: CandidateState): void {
  const values = activeCurve(candidate);
  curveLine.setAttribute("d", curvePath(values));
  curvePoints.replaceChildren();
  values.forEach((value, index) => {
    const point = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    point.classList.add("curve-point");
    point.setAttribute("cx", String(curveX[index]));
    point.setAttribute("cy", String(255 - value));
    point.setAttribute("r", "8");
    point.setAttribute("tabindex", "0");
    point.setAttribute("role", "slider");
    point.setAttribute("aria-label", `${curveChannel.options[curveChannel.selectedIndex].text} Kurvenpunkt ${index + 1}`);
    point.setAttribute("aria-valuemin", "0");
    point.setAttribute("aria-valuemax", "255");
    point.setAttribute("aria-valuenow", String(value));
    point.dataset.index = String(index);
    curvePoints.append(point);
  });
}

function setCurvePoint(index: number, value: number): void {
  const candidate = currentCandidate();
  if (!candidate || operation === "saving" || operation === "loading") return;
  activeCurve(candidate)[index] = Math.max(0, Math.min(255, value)) as Curve[number];
  candidate.editRevision += 1;
  const point = curvePoints.querySelector<SVGCircleElement>(`circle[data-index="${index}"]`);
  if (point) {
    point.setAttribute("cy", String(255 - activeCurve(candidate)[index]));
    point.setAttribute("aria-valuenow", String(activeCurve(candidate)[index]));
  }
  curveLine.setAttribute("d", curvePath(activeCurve(candidate)));
  syncUnsavedState();
  schedulePreview();
}

function updateHistogram(data: RgbHistogram): void {
  const context = histogramCanvas.getContext("2d");
  if (!context) return;
  const width = histogramCanvas.width;
  const height = histogramCanvas.height;
  context.clearRect(0, 0, width, height);
  const max = Math.max(1, ...data.red, ...data.green, ...data.blue);
  const channels = [
    { values: data.red, color: "rgba(181, 61, 53, 0.8)" },
    { values: data.green, color: "rgba(40, 113, 71, 0.75)" },
    { values: data.blue, color: "rgba(49, 94, 171, 0.75)" },
  ];
  for (const channel of channels) {
    context.beginPath();
    context.strokeStyle = channel.color;
    context.lineWidth = 3;
    channel.values.forEach((value, index) => {
      const x = index * width / channel.values.length;
      const y = height - value * (height - 8) / max;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }
  const peak = (values: number[]) => {
    const index = values.indexOf(Math.max(...values));
    return `${index * 4}–${Math.min(255, index * 4 + 3)}`;
  };
  histogramDescription.textContent = `Stärkster Bereich: Rot ${peak(data.red)}, Grün ${peak(data.green)}, Blau ${peak(data.blue)}. Links dunkel, rechts hell.`;
}

function schedulePreview(): void {
  if (previewTimer !== undefined) window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => void renderPreview(), 100);
}

async function renderPreview(): Promise<void> {
  const photo = currentPhoto();
  const modelId = activeModelId;
  const candidate = currentCandidate();
  if (!photo || !modelId || !candidate || candidate.status !== "ready") return;
  const sequence = ++previewSequence;
  const key = candidateKey(photo, modelId);
  try {
    await ensureWorkerCandidate(photo, modelId);
    const response = expectWorkerResponse(
      await requestWorker({ type: "preview", adjustments: structuredClone(candidate.adjustments) }),
      "preview",
    );
    if (sequence !== previewSequence || activePhotoId !== photo.id || activeModelId !== modelId || key !== candidateKey(photo, modelId)) return;
    if (activePreviewUrl) URL.revokeObjectURL(activePreviewUrl);
    activePreviewUrl = blobUrl(response.png, "image/png");
    editorResult.src = activePreviewUrl;
    editorResult.alt = `Vorschau von ${modelName(modelId)} für ${photo.name}`;
    updateHistogram(response.histogram);
  } catch (error) {
    if (sequence === previewSequence) editorSubtitle.textContent = error instanceof Error ? error.message : "Die Vorschau konnte nicht angezeigt werden.";
  }
}

async function openEditor(photo: BatchPhoto, modelId: ModelId): Promise<void> {
  if (photo.candidates[modelId].status !== "ready") return;
  activePhotoId = photo.id;
  activeModelId = modelId;
  editor.hidden = false;
  imageZoom = 1;
  updateZoom();
  editorTitle.textContent = `${photo.name} bearbeiten`;
  editorSubtitle.textContent = `${modelName(modelId)} · eigene Einstellungen für dieses Ergebnis`;
  if (activePreviewUrl) {
    URL.revokeObjectURL(activePreviewUrl);
    activePreviewUrl = undefined;
  }
  editorResult.removeAttribute("src");
  const candidate = photo.candidates[modelId];
  updateEditorLabels(candidate);
  renderCurvePoints(candidate);
  updateEditorButtons();
  renderBatchList();
  schedulePreview();
}

function closeEditor(): void {
  editor.hidden = true;
  previewSequence += 1;
  if (activePreviewUrl) URL.revokeObjectURL(activePreviewUrl);
  activePreviewUrl = undefined;
}

function updateZoom(): void {
  editorResult.style.transform = `scale(${imageZoom})`;
  zoomValue.value = `${Math.round(imageZoom * 100)} %`;
  zoomOutButton.disabled = imageZoom <= 1;
  zoomInButton.disabled = imageZoom >= 3;
}

function openSaveSelection(): void {
  saveSelectionList.replaceChildren();
  const eligible = photos.filter((photo) => photo.selectedModel && photo.candidates[photo.selectedModel].status === "ready");
  for (const photo of eligible) {
    const modelId = photo.selectedModel!;
    const label = document.createElement("label");
    label.className = "save-photo-choice";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.value = photo.id;
    const name = document.createElement("span");
    name.textContent = `${photo.name} · ${modelName(modelId)}`;
    label.append(checkbox, name);
    saveSelectionList.append(label);
  }
  confirmSaveSelectionButton.disabled = eligible.length === 0;
  saveSelection.hidden = false;
}

function updateCurrentSettings(input: HTMLInputElement): void {
  const candidate = currentCandidate();
  if (!candidate || operation === "saving" || operation === "loading") return;
  const id = input.id;
  const key = id === "black-point" ? "blackPoint" : id === "white-point" ? "whitePoint" : id as keyof Omit<Adjustments, "curves">;
  candidate.adjustments[key] = Number(input.value) as never;
  candidate.editRevision += 1;
  updateEditorLabels(candidate);
  syncUnsavedState();
  schedulePreview();
}

function updateCurrentCurvePointer(event: PointerEvent): void {
  if (draggedCurvePoint === undefined) return;
  const rect = curveGraph.getBoundingClientRect();
  if (!rect.height) return;
  const value = Math.round(255 - (event.clientY - rect.top) * 256 / rect.height);
  setCurvePoint(draggedCurvePoint, value);
}

async function exportCandidate(photo: BatchPhoto, modelId: ModelId): Promise<Uint8Array> {
  await ensureWorkerCandidate(photo, modelId);
  const candidate = photo.candidates[modelId];
  const response = expectWorkerResponse(
    await requestWorker({ type: "export", adjustments: structuredClone(candidate.adjustments) }),
    "export",
  );
  return new Uint8Array(response.png);
}

async function saveOne(): Promise<void> {
  const photo = currentPhoto();
  const modelId = photo?.selectedModel;
  if (!batchId || !photo || !modelId || operation !== "idle") return;
  setOperation("saving");
  setStatus(`${photo.name} wird als PNG gespeichert.`);
  try {
    const png = await exportCandidate(photo, modelId);
    const saved = await window.desktop.saveCandidate(batchId, photo.id, modelId, png);
    if (saved) {
      markSaved(photo);
      syncUnsavedState();
      setStatus(`${photo.name} wurde gespeichert.`);
    } else {
      setStatus("Speichern wurde abgebrochen.");
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Die Kopie konnte nicht gespeichert werden.");
  } finally {
    setOperation("idle");
    renderBatchList();
  }
}

async function saveAll(): Promise<void> {
  if (!batchId || operation !== "idle") return;
  const selected = new Set([...saveSelectionList.querySelectorAll<HTMLInputElement>("input:checked")].map((input) => input.value));
  if (!selected.size) {
    setStatus("Wählen Sie mindestens ein Foto aus.");
    return;
  }
  saveSelection.hidden = true;
  setOperation("saving");
  try {
    const folderId = await window.desktop.chooseOutputFolder(batchId);
    if (!folderId) {
      setStatus("Speichern wurde abgebrochen.");
      return;
    }
    let saved = 0;
    let skipped = 0;
    const failures: string[] = [];
    for (const photo of photos) {
      if (!selected.has(photo.id)) continue;
      const modelId = photo.selectedModel;
      if (!modelId || photo.candidates[modelId].status !== "ready") {
        skipped += 1;
        continue;
      }
      try {
        setStatus(`${photo.name} wird gespeichert.`);
        const png = await exportCandidate(photo, modelId);
        await window.desktop.saveBatchOutput(batchId, folderId, photo.id, modelId, png);
        markSaved(photo);
        saved += 1;
        syncUnsavedState();
      } catch {
        failures.push(photo.name);
      }
    }
    const details = [
      `${saved} gespeichert`,
      skipped ? `${skipped} ohne Auswahl ausgelassen` : "",
      failures.length ? `Fehler bei ${failures.join(", ")}` : "",
    ].filter(Boolean).join(". ");
    setStatus(details + ".");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Die Ergebnisse konnten nicht gespeichert werden.");
  } finally {
    saveSelection.hidden = true;
    setOperation("idle");
    renderBatchList();
  }
}

async function closeBatch(): Promise<void> {
  if (!batchId || operation !== "idle") return;
  setOperation("loading");
  try {
    const closed = await window.desktop.closeBatch(batchId, hasUnsavedChoices(photos));
    if (!closed) return;
    await requestWorker({ type: "release-photo", photoId: activeWorkerPhotoId ?? "" }).catch(() => undefined);
    clearBatchState();
    batchId = undefined;
    lastUnsavedState = undefined;
    setStatus("Der Fotostapel wurde geschlossen. Temporäre Ergebnisse wurden gelöscht.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Der Fotostapel konnte nicht geschlossen werden.");
  } finally {
    setOperation("idle");
  }
}

chooseButton.addEventListener("click", () => void choosePhotos());
startButton.addEventListener("click", () => void startBatch());
cancelButton.addEventListener("click", cancelBatch);
saveOneButton.addEventListener("click", () => void saveOne());
saveAllButton.addEventListener("click", openSaveSelection);
closeButton.addEventListener("click", () => void closeBatch());
chooseResultButton.addEventListener("click", () => {
  const photo = currentPhoto();
  if (!photo || !activeModelId) return;
  selectCandidate(photo, activeModelId);
  renderBatchList();
  syncUnsavedState();
  updateEditorButtons();
  setStatus(`${modelName(activeModelId)} ist für ${photo.name} ausgewählt.`);
  closeEditor();
});
zoomInButton.addEventListener("click", () => { imageZoom = Math.min(3, imageZoom + 0.25); updateZoom(); });
zoomOutButton.addEventListener("click", () => { imageZoom = Math.max(1, imageZoom - 0.25); updateZoom(); });
zoomResetButton.addEventListener("click", () => { imageZoom = 1; updateZoom(); });
confirmSaveSelectionButton.addEventListener("click", () => void saveAll());
cancelSaveSelectionButton.addEventListener("click", () => { saveSelection.hidden = true; });
resetButton.addEventListener("click", () => {
  const candidate = currentCandidate();
  if (!candidate || operation === "saving" || operation === "loading") return;
  candidate.adjustments = structuredClone(defaultAdjustments);
  candidate.editRevision += 1;
  updateEditorLabels(candidate);
  renderCurvePoints(candidate);
  syncUnsavedState();
  schedulePreview();
});

for (const id of sliderIds) {
  $<HTMLInputElement>(`#${id}`).addEventListener("input", (event) => updateCurrentSettings(event.currentTarget as HTMLInputElement));
}

curveChannel.addEventListener("change", () => {
  const candidate = currentCandidate();
  if (candidate) renderCurvePoints(candidate);
});

curveGraph.addEventListener("pointerdown", (event) => {
  const target = event.target;
  if (!(target instanceof SVGCircleElement) || target.dataset.index === undefined) return;
  draggedCurvePoint = Number(target.dataset.index);
  target.setPointerCapture(event.pointerId);
  updateCurrentCurvePointer(event);
  event.preventDefault();
});
curveGraph.addEventListener("pointermove", updateCurrentCurvePointer);
curveGraph.addEventListener("pointerup", () => { draggedCurvePoint = undefined; });
curveGraph.addEventListener("pointercancel", () => { draggedCurvePoint = undefined; });
curveGraph.addEventListener("keydown", (event) => {
  const target = event.target;
  if (!(target instanceof SVGCircleElement) || target.dataset.index === undefined) return;
  const index = Number(target.dataset.index);
  const current = Number(target.getAttribute("aria-valuenow"));
  const step = event.shiftKey ? 10 : 1;
  const next = event.key === "ArrowUp" || event.key === "ArrowRight" ? current + step
    : event.key === "ArrowDown" || event.key === "ArrowLeft" ? current - step
      : event.key === "Home" ? 0
        : event.key === "End" ? 255
          : undefined;
  if (next === undefined) return;
  event.preventDefault();
  setCurvePoint(index, next);
});

window.desktop.onModelProgress(({ percent }) => {
  if (operation !== "processing" || !downloadingModel) return;
  progress.value = percent;
  progressLabel.textContent = `${modelName(downloadingModel)} wird einmalig geladen: ${percent} %`;
});

window.addEventListener("beforeunload", () => {
  if (activePreviewUrl) URL.revokeObjectURL(activePreviewUrl);
  for (const photo of photos) {
    if (photo.originalThumbnailUrl) URL.revokeObjectURL(photo.originalThumbnailUrl);
    for (const candidate of Object.values(photo.candidates)) {
      if (candidate.thumbnailUrl) URL.revokeObjectURL(candidate.thumbnailUrl);
    }
  }
  terminateWorker();
});

function initialize(): void {
  updateCounts();
  setOperation("idle");
}

initialize();
