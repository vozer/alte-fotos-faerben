import type { ModelId } from "../shared/model";
import type { Adjustments, RgbHistogram } from "./adjustments";

export type WorkerCommand =
  | { type: "prepare-photo"; photoId: string; bytes: ArrayBuffer; mimeType: string }
  | { type: "colorize"; photoId: string; modelId: ModelId; modelUrl: string }
  | { type: "release-photo"; photoId: string }
  | { type: "load-candidate"; key: string; bytes: ArrayBuffer }
  | { type: "preview"; adjustments: Adjustments }
  | { type: "export"; adjustments: Adjustments };

export type WorkerRequest = WorkerCommand & { id: number };

export type WorkerResponse =
  | { id: number; type: "prepared"; width: number; height: number; thumbnail: ArrayBuffer }
  | { id: number; type: "candidate"; width: number; height: number; png: ArrayBuffer; thumbnail: ArrayBuffer }
  | { id: number; type: "candidate-ready"; width: number; height: number }
  | { id: number; type: "preview"; width: number; height: number; png: ArrayBuffer; histogram: RgbHistogram }
  | { id: number; type: "export"; png: ArrayBuffer }
  | { id: number; type: "released" }
  | { id: number; type: "error"; error: string };
