import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const projectDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: resolve(projectDir, "src/renderer"),
  base: "./",
  publicDir: resolve(projectDir, "public"),
  build: {
    outDir: resolve(projectDir, "dist/renderer"),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        assetFileNames: (asset) =>
          asset.name === "ort-wasm-simd-threaded.wasm"
            ? "runtime/ort-wasm-simd-threaded.wasm"
            : "assets/[name]-[hash][extname]",
      },
    },
  },
  test: {
    environment: "jsdom",
    include: [resolve(projectDir, "tests/**/*.test.ts")],
  },
});
