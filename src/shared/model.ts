const release = "https://github.com/Makistos/colorize/releases/download/models-v1";

export const MODEL_CATALOG = {
  "deoldify-stable": {
    name: "DeOldify Stable",
    fileName: "deoldify_stable.onnx",
    url: `${release}/deoldify_stable.onnx`,
    bytes: 873_362_263,
    sha256: "37fc9f524f5a6ad13bc4379e3a929829a13fe1015203dcb10f9bfb9a38377cd1",
    inputSize: 560,
    output: "rgb",
  },
  "ddcolor-tiny": {
    name: "DDColor Tiny",
    fileName: "ddcolor_tiny.onnx",
    url: `${release}/ddcolor_tiny.onnx`,
    bytes: 222_200_930,
    sha256: "bc441aba000b9de6a36e0b71ea35924aed344d92e6865b22fa1e62efbe72d0ce",
    inputSize: 512,
    output: "ab",
  },
} as const;

export type ModelId = keyof typeof MODEL_CATALOG;
export const DEFAULT_MODEL_ID: ModelId = "deoldify-stable";

export function isModelId(value: unknown): value is ModelId {
  return typeof value === "string" && Object.hasOwn(MODEL_CATALOG, value);
}

export interface PhotoSelection {
  id: string;
  name: string;
  mimeType: "image/jpeg" | "image/png";
  bytes: Uint8Array;
}

export interface ModelProgress {
  percent: number;
}

export interface DesktopApi {
  selectPhoto(): Promise<PhotoSelection | null>;
  ensureModel(modelId: ModelId): Promise<string>;
  savePhoto(photoId: string, png: Uint8Array): Promise<boolean>;
  onModelProgress(listener: (progress: ModelProgress) => void): () => void;
}
