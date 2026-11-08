import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as ort from "onnxruntime-web/wasm";
import { MODEL_CATALOG } from "../src/shared/model";

async function main(): Promise<void> {
  const model = MODEL_CATALOG["deoldify-stable"];
  const modelPath = resolve(process.env.DEOLDIFY_STABLE_MODEL ?? `.cache/${model.fileName}`);
  if ((await stat(modelPath)).size !== model.bytes) throw new Error("Stable model size does not match.");

  const files = resolve("node_modules/onnxruntime-web/dist");
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = {
    mjs: pathToFileURL(resolve(files, "ort-wasm-simd-threaded.mjs")).href,
    wasm: pathToFileURL(resolve(files, "ort-wasm-simd-threaded.wasm")).href,
  };
  const bytes = await readFile(modelPath);
  if (createHash("sha256").update(bytes).digest("hex") !== model.sha256) {
    throw new Error("Stable model checksum does not match.");
  }

  console.log("Loading the 873 MB model into ONNX Runtime Web...");
  const session = await ort.InferenceSession.create(bytes, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
  const side = 256;
  const plane = side * side;
  const input = new Float32Array(plane * 3).fill(0.5);
  console.log("Running a synthetic grayscale inference...");
  const started = Date.now();
  const result = await session.run({
    gray: new ort.Tensor("float32", input, [1, 3, side, side]),
  });
  const rgb = result.rgb?.data;
  if (!(rgb instanceof Float32Array) || rgb.length !== plane * 3) {
    throw new Error("The model returned an unexpected output tensor.");
  }
  let min = Infinity;
  let max = -Infinity;
  for (const value of rgb) {
    if (!Number.isFinite(value)) throw new Error("The model returned a non-finite value.");
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (min < 0 || max > 1 || max - min < 0.001) {
    throw new Error("The model output is outside its expected range.");
  }
  await session.release();
  console.log("ONNX Runtime Web passed. Output range: " + min.toFixed(4) + " to " + max.toFixed(4));
  console.log("Inference time: " + ((Date.now() - started) / 1000).toFixed(1) + " seconds.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
