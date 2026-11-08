import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "node_modules/onnxruntime-web/dist");
const target = resolve(root, "public/runtime");
const files = ["ort-wasm-simd-threaded.mjs"];

await mkdir(target, { recursive: true });
for (const file of files) await copyFile(resolve(source, file), resolve(target, file));
