import { MODEL_CATALOG, type ModelId } from "../shared/model";
import { defaultAdjustments, type Adjustments } from "./adjustments";

export type CandidateStatus = "pending" | "running" | "ready" | "failed";
export type PhotoStatus = "queued" | "processing" | "ready" | "partial" | "failed";

export interface CandidateState {
  status: CandidateStatus;
  adjustments: Adjustments;
  thumbnailUrl?: string;
  errorMessage?: string;
  revision: number;
  editRevision: number;
}

export interface BatchPhoto {
  id: string;
  name: string;
  mimeType?: "image/jpeg" | "image/png";
  validationError?: string;
  status: PhotoStatus;
  width?: number;
  height?: number;
  originalThumbnailUrl?: string;
  selectedModel?: ModelId;
  savedKey?: string;
  candidates: Record<ModelId, CandidateState>;
}

export interface PreparedPhoto {
  width: number;
  height: number;
  thumbnail: Uint8Array;
}

export interface ColorizedCandidate extends PreparedPhoto {
  png: Uint8Array;
}

export interface BatchAdapter {
  ensureModel(modelId: ModelId): Promise<string>;
  preparePhoto(photo: BatchPhoto): Promise<PreparedPhoto>;
  colorize(photo: BatchPhoto, modelId: ModelId, modelUrl: string): Promise<ColorizedCandidate>;
  storeCandidate(photo: BatchPhoto, modelId: ModelId, png: Uint8Array): Promise<void>;
  releasePhoto(photo: BatchPhoto): Promise<void>;
}

export interface BatchPhotoInput {
  id: string;
  name: string;
  mimeType?: "image/jpeg" | "image/png";
  errorMessage?: string;
}

const modelIds = Object.keys(MODEL_CATALOG) as ModelId[];

function pngBlob(bytes: Uint8Array): Blob {
  return new Blob([Uint8Array.from(bytes).buffer], { type: "image/png" });
}

function newCandidate(errorMessage?: string): CandidateState {
  return {
    status: errorMessage ? "failed" : "pending",
    adjustments: structuredClone(defaultAdjustments),
    errorMessage,
    revision: 0,
    editRevision: 0,
  };
}

export function createBatchPhotos(items: BatchPhotoInput[]): BatchPhoto[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    mimeType: item.mimeType,
    validationError: item.errorMessage,
    status: item.errorMessage ? "failed" : "queued",
    candidates: {
      "deoldify-stable": newCandidate(item.errorMessage),
      "ddcolor-tiny": newCandidate(item.errorMessage),
    },
  }));
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Das Ergebnis konnte nicht erstellt werden.";
}

function updatePhotoStatus(photo: BatchPhoto): void {
  if (photo.status === "processing") return;
  const states = modelIds.map((modelId) => photo.candidates[modelId].status);
  const ready = states.filter((state) => state === "ready").length;
  photo.status = ready === states.length ? "ready" : ready ? "partial" : states.every((state) => state === "failed") ? "failed" : "queued";
}

async function runCandidate(
  photo: BatchPhoto,
  modelId: ModelId,
  adapter: BatchAdapter,
  modelUrl: string | undefined,
): Promise<string | undefined> {
  const candidate = photo.candidates[modelId];
  if (candidate.status === "ready") return modelUrl;
  candidate.status = "running";
  candidate.errorMessage = undefined;
  updatePhotoStatus(photo);

  try {
    const url = modelUrl ?? await adapter.ensureModel(modelId);
    const result = await adapter.colorize(photo, modelId, url);
    photo.width = result.width;
    photo.height = result.height;
    await adapter.storeCandidate(photo, modelId, result.png);
    if (candidate.thumbnailUrl) URL.revokeObjectURL(candidate.thumbnailUrl);
    candidate.thumbnailUrl = URL.createObjectURL(pngBlob(result.thumbnail));
    candidate.status = "ready";
    candidate.errorMessage = undefined;
    candidate.revision += 1;
    return url;
  } catch (error) {
    candidate.status = "failed";
    candidate.errorMessage = errorText(error);
    return undefined;
  } finally {
    updatePhotoStatus(photo);
  }
}

export async function processBatch(
  photos: BatchPhoto[],
  adapter: BatchAdapter,
  cancelRequested: () => boolean,
  onChange: (photo: BatchPhoto) => void = () => undefined,
): Promise<{ cancelled: boolean }> {
  const modelUrls = new Map<ModelId, string>();
  const unavailable = new Map<ModelId, string>();

  for (const photo of photos) {
    if (cancelRequested()) return { cancelled: true };
    if (photo.validationError) continue;

    photo.status = "processing";
    onChange(photo);
    let prepared = false;
    try {
      const source = await adapter.preparePhoto(photo);
      prepared = true;
      photo.width = source.width;
      photo.height = source.height;
      photo.originalThumbnailUrl = URL.createObjectURL(pngBlob(source.thumbnail));
    } catch (error) {
      const message = errorText(error);
      for (const modelId of modelIds) {
        photo.candidates[modelId].status = "failed";
        photo.candidates[modelId].errorMessage = message;
      }
    }

    if (prepared) {
      try {
        for (const modelId of modelIds) {
          const candidate = photo.candidates[modelId];
          if (candidate.status === "ready") continue;
          if (unavailable.has(modelId)) {
            candidate.status = "failed";
            candidate.errorMessage = unavailable.get(modelId);
            continue;
          }
          let url = modelUrls.get(modelId);
          if (!url) {
            try {
              url = await adapter.ensureModel(modelId);
              modelUrls.set(modelId, url);
            } catch (error) {
              const message = errorText(error);
              unavailable.set(modelId, message);
              candidate.status = "failed";
              candidate.errorMessage = message;
              onChange(photo);
              continue;
            }
          }
          await runCandidate(photo, modelId, adapter, url);
          onChange(photo);
        }
      } finally {
        await adapter.releasePhoto(photo).catch(() => undefined);
      }
    }

    photo.status = "queued";
    updatePhotoStatus(photo);
    onChange(photo);
    if (cancelRequested()) return { cancelled: true };
  }
  return { cancelled: false };
}

export async function retryCandidate(
  photo: BatchPhoto,
  modelId: ModelId,
  adapter: BatchAdapter,
): Promise<void> {
  const candidate = photo.candidates[modelId];
  if (candidate.status === "running") return;
  candidate.status = "running";
  candidate.errorMessage = undefined;
  photo.status = "processing";
  updatePhotoStatus(photo);
  let prepared = false;
  try {
    const source = await adapter.preparePhoto(photo);
    prepared = true;
    photo.width = source.width;
    photo.height = source.height;
    photo.originalThumbnailUrl ??= URL.createObjectURL(pngBlob(source.thumbnail));
    await runCandidate(photo, modelId, adapter, undefined);
  } catch (error) {
    candidate.status = "failed";
    candidate.errorMessage = errorText(error);
  } finally {
    if (prepared) await adapter.releasePhoto(photo).catch(() => undefined);
    photo.status = "queued";
    updatePhotoStatus(photo);
  }
}

export function candidateKey(photo: BatchPhoto, modelId: ModelId): string {
  return `${photo.id}:${modelId}:${photo.candidates[modelId].revision}`;
}

export function hasUnsavedChoices(photos: BatchPhoto[]): boolean {
  return photos.some((photo) => {
    if (!photo.selectedModel) return modelIds.some((id) => photo.candidates[id].status === "ready");
    const candidate = photo.candidates[photo.selectedModel];
    return photo.savedKey !== `${candidateKey(photo, photo.selectedModel)}:${candidate.editRevision}`;
  });
}

export function selectCandidate(photo: BatchPhoto, modelId: ModelId): void {
  if (photo.candidates[modelId].status === "ready") photo.selectedModel = modelId;
}

export function markSaved(photo: BatchPhoto): void {
  if (photo.selectedModel) {
    const candidate = photo.candidates[photo.selectedModel];
    photo.savedKey = `${candidateKey(photo, photo.selectedModel)}:${candidate.editRevision}`;
  }
}
