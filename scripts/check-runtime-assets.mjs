import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const file of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) {
  const artifact = resolve(root, "dist/renderer/runtime", file);
  const info = await stat(artifact).catch(() => undefined);
  if (!info?.isFile() || info.size === 0) throw new Error(`Missing ONNX Runtime asset: ${artifact}`);
}
