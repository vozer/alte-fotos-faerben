import { colorizeImage } from "./colorizer";
import { adjustPixels, histogram } from "./adjustments";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol";

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;
let sourcePhoto: { id: string; bitmap: ImageBitmap } | undefined;
let candidate: { key: string; bitmap: ImageBitmap } | undefined;

function closePhoto(): void {
  sourcePhoto?.bitmap.close();
  sourcePhoto = undefined;
}

function closeCandidate(): void {
  candidate?.bitmap.close();
  candidate = undefined;
}

function canvasFor(width: number, height: number): OffscreenCanvas {
  return new OffscreenCanvas(width, height);
}

function contextFor(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Das Foto kann nicht geöffnet werden.");
  return context;
}

async function pngBytes(canvas: OffscreenCanvas): Promise<ArrayBuffer> {
  return (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer();
}

async function thumbnail(source: ImageBitmap | OffscreenCanvas, maxSize = 360): Promise<ArrayBuffer> {
  const scale = Math.min(1, maxSize / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = canvasFor(width, height);
  contextFor(canvas).drawImage(source, 0, 0, width, height);
  return pngBytes(canvas);
}

async function handle(request: WorkerRequest): Promise<WorkerResponse> {
  switch (request.type) {
    case "prepare-photo": {
      closePhoto();
      closeCandidate();
      const bitmap = await createImageBitmap(new Blob([request.bytes], { type: request.mimeType }));
      if (bitmap.width * bitmap.height > 24_000_000) {
        bitmap.close();
        throw new Error("Dieses Foto ist zu groß. Bitte wählen Sie ein Foto mit höchstens 24 Megapixeln.");
      }
      try {
        const preview = await thumbnail(bitmap);
        sourcePhoto = { id: request.photoId, bitmap };
        return {
          id: request.id,
          type: "prepared",
          width: bitmap.width,
          height: bitmap.height,
          thumbnail: preview,
        };
      } catch (error) {
        bitmap.close();
        throw error;
      }
    }
    case "colorize": {
      if (sourcePhoto?.id !== request.photoId) throw new Error("Das Foto ist nicht mehr verfügbar.");
      try {
        const result = await colorizeImage(sourcePhoto.bitmap, request.modelId, request.modelUrl);
        const canvas = canvasFor(result.width, result.height);
        contextFor(canvas).putImageData(result, 0, 0);
        const png = await pngBytes(canvas);
        const preview = await thumbnail(canvas);
        canvas.width = 0;
        canvas.height = 0;
        return { id: request.id, type: "candidate", width: result.width, height: result.height, png, thumbnail: preview };
      } catch {
        throw new Error("Das Foto konnte mit diesem Modell nicht gefärbt werden. Sie können das Ergebnis später erneut versuchen.");
      }
    }
    case "release-photo": {
      if (sourcePhoto?.id === request.photoId) closePhoto();
      closeCandidate();
      return { id: request.id, type: "released" };
    }
    case "load-candidate": {
      closeCandidate();
      const bitmap = await createImageBitmap(new Blob([request.bytes], { type: "image/png" }));
      if (bitmap.width * bitmap.height > 24_000_000) {
        bitmap.close();
        throw new Error("Dieses Ergebnis ist zu groß, um es zu bearbeiten.");
      }
      candidate = { key: request.key, bitmap };
      return { id: request.id, type: "candidate-ready", width: bitmap.width, height: bitmap.height };
    }
    case "preview": {
      if (!candidate) throw new Error("Wählen Sie zuerst ein Ergebnis aus.");
      const scale = Math.min(1, 1200 / Math.max(candidate.bitmap.width, candidate.bitmap.height));
      const width = Math.max(1, Math.round(candidate.bitmap.width * scale));
      const height = Math.max(1, Math.round(candidate.bitmap.height * scale));
      const canvas = canvasFor(width, height);
      const context = contextFor(canvas);
      context.drawImage(candidate.bitmap, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height);
      pixels.data.set(adjustPixels(pixels.data, request.adjustments));
      const rgbHistogram = histogram(pixels.data);
      context.putImageData(pixels, 0, 0);
      const png = await pngBytes(canvas);
      canvas.width = 0;
      canvas.height = 0;
      return { id: request.id, type: "preview", width, height, png, histogram: rgbHistogram };
    }
    case "export": {
      if (!candidate) throw new Error("Wählen Sie zuerst ein Ergebnis aus.");
      try {
        const canvas = canvasFor(candidate.bitmap.width, candidate.bitmap.height);
        const context = contextFor(canvas);
        context.drawImage(candidate.bitmap, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        pixels.data.set(adjustPixels(pixels.data, request.adjustments));
        context.putImageData(pixels, 0, 0);
        const png = await pngBytes(canvas);
        canvas.width = 0;
        canvas.height = 0;
        return { id: request.id, type: "export", png };
      } catch {
        throw new Error("Die PNG-Kopie konnte nicht erstellt werden. Prüfen Sie den freien Speicherplatz.");
      }
    }
  }
}

scope.onmessage = async (event) => {
  const request = event.data;
  try {
    const response = await handle(request);
    const transfer: Transferable[] = [];
    if ("png" in response) transfer.push(response.png);
    if ("thumbnail" in response) transfer.push(response.thumbnail);
    scope.postMessage(response, transfer);
  } catch (error) {
    scope.postMessage({
      id: request.id,
      type: "error",
      error: error instanceof Error ? error.message : "Die Bildverarbeitung ist fehlgeschlagen.",
    });
  }
};
