import * as ort from "onnxruntime-web/wasm";
import { MODEL_CATALOG, type ModelId } from "../shared/model";

let activeModel: ModelId | undefined;
let session: ort.InferenceSession | undefined;

export type ResizeMode = "area" | "cubic";

interface Contribution {
  index: number;
  weight: number;
}

function linearize(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function labTransfer(value: number): number {
  return value > 216 / 24389 ? Math.cbrt(value) : (841 / 108) * value + 4 / 29;
}

function toLinearRgb(r: number, g: number, b: number): [number, number, number] {
  return [linearize(r), linearize(g), linearize(b)];
}

function rgbToLabParts(r: number, g: number, b: number): [number, number, number] {
  const [red, green, blue] = toLinearRgb(r, g, b);
  const x = labTransfer((red * 0.4124564 + green * 0.3575761 + blue * 0.1804375) / 0.95047);
  const y = labTransfer(red * 0.2126729 + green * 0.7151522 + blue * 0.072175);
  const z = labTransfer((red * 0.0193339 + green * 0.119192 + blue * 0.9503041) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function rgbToLabLightness(r: number, g: number, b: number): number {
  const red = linearize(r);
  const green = linearize(g);
  const blue = linearize(b);
  return 116 * labTransfer(red * 0.2126729 + green * 0.7151522 + blue * 0.072175) - 16;
}

function rgbToLabChroma(
  r: number,
  g: number,
  b: number,
  outputA: Float32Array,
  outputB: Float32Array,
  index: number,
): void {
  const red = linearize(r);
  const green = linearize(g);
  const blue = linearize(b);
  const x = labTransfer((red * 0.4124564 + green * 0.3575761 + blue * 0.1804375) / 0.95047);
  const y = labTransfer(red * 0.2126729 + green * 0.7151522 + blue * 0.072175);
  const z = labTransfer((red * 0.0193339 + green * 0.119192 + blue * 0.9503041) / 1.08883);
  outputA[index] = 500 * (x - y);
  outputB[index] = 200 * (y - z);
}

export function rgbToLab(r: number, g: number, b: number): { l: number; a: number; b: number } {
  const values = rgbToLabParts(r, g, b);
  return { l: values[0], a: values[1], b: values[2] };
}

function labInverse(value: number): number {
  const cube = value ** 3;
  return cube > 216 / 24389 ? cube : (116 * value - 16) / (24389 / 27);
}

function gamma(value: number): number {
  const safe = Math.max(0, value);
  return Math.min(1, safe <= 0.0031308 ? 12.92 * safe : 1.055 * safe ** (1 / 2.4) - 0.055);
}

function labToRgbParts(l: number, a: number, b: number): [number, number, number] {
  const y = (l + 16) / 116;
  const x = y + a / 500;
  const z = y - b / 200;
  const X = 0.95047 * labInverse(x);
  const Y = labInverse(y);
  const Z = 1.08883 * labInverse(z);
  return [
    gamma(3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z),
    gamma(-0.969266 * X + 1.8760108 * Y + 0.041556 * Z),
    gamma(0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z),
  ];
}

export function labToRgb(l: number, a: number, b: number): [number, number, number] {
  return labToRgbParts(l, a, b);
}

export function extractModelChroma(modelId: ModelId, output: Float32Array, planeSize: number): {
  a: Float32Array;
  b: Float32Array;
} {
  const model = MODEL_CATALOG[modelId];
  const channels = model.output === "rgb" ? 3 : 2;
  if (output.length !== planeSize * channels) {
    throw new Error("Das Farbmodell hat ein unerwartetes Ergebnis geliefert.");
  }
  for (const value of output) {
    if (!Number.isFinite(value)) throw new Error("Das Farbmodell hat ein unerwartetes Ergebnis geliefert.");
  }
  if (model.output === "ab") {
    return { a: output.slice(0, planeSize), b: output.slice(planeSize) };
  }

  const a = new Float32Array(planeSize);
  const b = new Float32Array(planeSize);
  for (let i = 0; i < planeSize; i += 1) {
    rgbToLabChroma(output[i], output[planeSize + i], output[planeSize * 2 + i], a, b, i);
  }
  return { a, b };
}

function cubic(value: number): number {
  const distance = Math.abs(value);
  const a = -0.75;
  if (distance < 1) return (a + 2) * distance ** 3 - (a + 3) * distance ** 2 + 1;
  if (distance < 2) return a * distance ** 3 - 5 * a * distance ** 2 + 8 * a * distance - 4 * a;
  return 0;
}

function resizeContributions(inputSize: number, outputSize: number, mode: ResizeMode): Contribution[][] {
  const scale = inputSize / outputSize;
  return Array.from({ length: outputSize }, (_, output) => {
    const combined = new Map<number, number>();
    if (mode === "area") {
      const start = output * scale;
      const end = (output + 1) * scale;
      for (let source = Math.floor(start); source < Math.ceil(end); source += 1) {
        const overlap = Math.max(0, Math.min(end, source + 1) - Math.max(start, source));
        const index = Math.min(inputSize - 1, Math.max(0, source));
        combined.set(index, (combined.get(index) ?? 0) + overlap / scale);
      }
    } else {
      const center = (output + 0.5) * scale - 0.5;
      const left = Math.floor(center) - 1;
      const right = left + 3;
      for (let source = left; source <= right; source += 1) {
        const index = Math.min(inputSize - 1, Math.max(0, source));
        const weight = cubic(center - source);
        combined.set(index, (combined.get(index) ?? 0) + weight);
      }
    }
    const total = [...combined.values()].reduce((sum, weight) => sum + weight, 0);
    return [...combined].map(([index, weight]) => ({ index, weight: weight / total }));
  });
}

export function resizePlane(
  input: Float32Array,
  inputWidth: number,
  inputHeight: number,
  outputWidth: number,
  outputHeight: number,
  mode: ResizeMode,
): Float32Array {
  if (inputWidth === outputWidth && inputHeight === outputHeight) return input.slice();
  const horizontal = resizeContributions(inputWidth, outputWidth, mode);
  const vertical = resizeContributions(inputHeight, outputHeight, mode);
  const intermediate = new Float32Array(inputHeight * outputWidth);
  for (let y = 0; y < inputHeight; y += 1) {
    const row = y * inputWidth;
    const outRow = y * outputWidth;
    for (let x = 0; x < outputWidth; x += 1) {
      let value = 0;
      for (const contribution of horizontal[x]) {
        value += input[row + contribution.index] * contribution.weight;
      }
      intermediate[outRow + x] = value;
    }
  }

  const output = new Float32Array(outputWidth * outputHeight);
  for (let y = 0; y < outputHeight; y += 1) {
    const outRow = y * outputWidth;
    for (let x = 0; x < outputWidth; x += 1) {
      let value = 0;
      for (const contribution of vertical[y]) {
        value += intermediate[contribution.index * outputWidth + x] * contribution.weight;
      }
      output[outRow + x] = value;
    }
  }
  return output;
}

function writeLabRgb(
  l: number,
  a: number,
  b: number,
  output: Float32Array,
  index: number,
  planeSize: number,
): void {
  const [r, g, blue] = labToRgbParts(l, a, b);
  output[index] = r;
  output[planeSize + index] = g;
  output[planeSize * 2 + index] = blue;
}

function writeLabRgba(
  l: number,
  a: number,
  b: number,
  output: Uint8ClampedArray,
  index: number,
): void {
  const y = (l + 16) / 116;
  const x = y + a / 500;
  const z = y - b / 200;
  const X = 0.95047 * labInverse(x);
  const Y = labInverse(y);
  const Z = 1.08883 * labInverse(z);
  output[index] = gamma(3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z) * 255;
  output[index + 1] = gamma(-0.969266 * X + 1.8760108 * Y + 0.041556 * Z) * 255;
  output[index + 2] = gamma(0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z) * 255;
  output[index + 3] = 255;
}

function sourceLightness(image: ImageData): Float32Array {
  const count = image.width * image.height;
  const lightness = new Float32Array(count);
  const pixels = image.data;
  for (let i = 0, pixel = 0; i < pixels.length; i += 4, pixel += 1) {
    lightness[pixel] = rgbToLabLightness(pixels[i] / 255, pixels[i + 1] / 255, pixels[i + 2] / 255);
  }
  return lightness;
}

function modelInput(
  lightness: Float32Array,
  width: number,
  height: number,
  modelSize: number,
  mode: ResizeMode,
): Float32Array {
  return resizePlane(lightness, width, height, modelSize, modelSize, mode);
}

export async function colorizeImage(bitmap: ImageBitmap, modelId: ModelId, modelUrl: string): Promise<ImageData> {
  const model = MODEL_CATALOG[modelId];
  const modelSize = model.inputSize;
  const { width, height } = bitmap;

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) throw new Error("Das Foto kann nicht geöffnet werden.");
  sourceContext.drawImage(bitmap, 0, 0);
  const sourcePixels = sourceContext.getImageData(0, 0, width, height);
  const lightness = sourceLightness(sourcePixels);

  const mode: ResizeMode = modelSize < Math.max(width, height) ? "area" : "cubic";
  const inputL = modelInput(lightness, width, height, modelSize, mode);
  const planeSize = modelSize * modelSize;
  const input = new Float32Array(planeSize * 3);
  for (let i = 0; i < planeSize; i += 1) writeLabRgb(inputL[i], 0, 0, input, i, planeSize);

  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  const runtime = new URL("runtime/", window.location.href);
  ort.env.wasm.wasmPaths = {
    mjs: new URL("ort-wasm-simd-threaded.mjs", runtime).href,
    wasm: new URL("ort-wasm-simd-threaded.wasm", runtime).href,
  };
  if (activeModel !== modelId) {
    await session?.release();
    session = undefined;
    activeModel = undefined;
    session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
    activeModel = modelId;
  }
  const result = await session!.run({
    gray: new ort.Tensor("float32", input, [1, 3, modelSize, modelSize]),
  });
  const tensorData = result[model.output]?.data;
  if (!(tensorData instanceof Float32Array)) {
    throw new Error("Das Farbmodell hat ein unerwartetes Ergebnis geliefert.");
  }
  const { a, b } = extractModelChroma(modelId, tensorData, planeSize);
  const fullA = resizePlane(a, modelSize, modelSize, width, height, "cubic");
  const fullB = resizePlane(b, modelSize, modelSize, width, height, "cubic");
  const imageData = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, pixel = 0; pixel < lightness.length; i += 4, pixel += 1) {
    writeLabRgba(lightness[pixel], fullA[pixel], fullB[pixel], imageData, i);
  }
  return new ImageData(imageData, width, height);
}
