# Research: batch colorization and advanced editing

- Date: 2026-11-08
- Question: Plan local batches of up to 20 photos, both models, per-result editing, and individual or bulk saves.
- Primary: plan-mode-advanced
- Supporting: research, codebase-design
- Source of truth: current `deoldify-desktop` source and requirements, user decisions in this conversation, and official Electron, Node.js, and Canvas documentation
- Current state: local Mac and Windows 0.2.3 installers are built. The corrected Mac app opened on the target Mac. Windows update and offline validation remain pending.
- Validation outstanding: target-device testing remains with the user.

## Finding

The app currently handles one photo and one model result at a time. A batch needs a small queue, per-photo Stable and Tiny candidates, independent edit settings for each candidate, and app-owned temporary result files. The lowest-risk design processes one photo at a time and keeps only one model session active. It preserves the user's cancellation rule and current memory pattern, but it reloads the model when switching between candidates.

The renderer can use the existing Canvas pixel APIs for histogram and color adjustments. The main process should keep owning native file dialogs, selected paths, temporary files, and output writes. It should expose these actions through the existing narrow preload bridge, with no arbitrary paths exposed to the renderer.

## Scope and method

I inspected the renderer, main process, preload bridge, shared types, model runtime, requirements, use cases, entities, tests, package versions, and Git state. The repository was clean at `8b53567` before this research. I read current Electron, Node.js, and Canvas documentation on 2026-11-08.

This research record began as planning evidence. The implementation outcomes and validation limits are recorded below. The existing four-photo model comparison is summarized in `docs/research/ddcolor-tiny-2026-11-08.md`.

## Evidence

| Claim | Source | Exact fragment or location | Interpretation |
|---|---|---|---|
| The current app selects one photo and stores one photo ID per window. | [`src/main/index.ts`](../../src/main/index.ts#L15), [`src/main/index.ts`](../../src/main/index.ts#L96), [`src/renderer/app.ts`](../../src/renderer/app.ts#L31) | `photoByWindow` maps a window to one `{ id, path }`; the dialog uses `properties: ["openFile"]`; the renderer stores one `currentPhoto`. | Batch selection needs a per-window photo collection and opaque IDs. |
| The current app transfers full source bytes through IPC and rejects inputs above 250 MB. | [`src/main/index.ts`](../../src/main/index.ts#L17), [`src/main/index.ts`](../../src/main/index.ts#L108), [`src/shared/model.ts`](../../src/shared/model.ts#L31) | Main reads one full file and returns `bytes: Uint8Array`; the source size cap is `250 * 1024 * 1024`. | Do not return all selected photo bytes at once. Load one photo for inference at a time. |
| A photo above 24 megapixels is rejected in the renderer. | [`src/renderer/app.ts`](../../src/renderer/app.ts#L124) | The renderer decodes an `ImageBitmap`, then checks `bitmap.width * bitmap.height > 24_000_000`. | Keep the current per-photo size limit during batch processing. Show an item-level error and continue with other photos. |
| The runtime keeps only one active model session and releases it when the model changes. | [`src/renderer/colorizer.ts`](../../src/renderer/colorizer.ts#L4), [`src/renderer/colorizer.ts`](../../src/renderer/colorizer.ts#L269) | `activeModel` and `session` are single values; switching model calls `session.release()` before creating the next session. | Running one photo through Stable and Tiny in turn matches the existing memory pattern. Repeated session loading is a performance risk to measure. |
| Current edits are only CSS canvas filters and one overlay. | [`src/renderer/adjustments.ts`](../../src/renderer/adjustments.ts#L1), [`src/renderer/adjustments.ts`](../../src/renderer/adjustments.ts#L18) | The adjustment model has intensity, brightness, and warmth; `adjustmentPlan()` returns a CSS filter and optional overlay. | Curves, levels, hue, and per-channel correction need pixel-based transforms and new tests. |
| The current renderer can encode one result as PNG and ask main to save it. | [`src/renderer/app.ts`](../../src/renderer/app.ts#L204), [`src/main/index.ts`](../../src/main/index.ts#L132) | Renderer calls `canvas.toBlob(..., "image/png")` and passes a `Uint8Array` to `photo:save`; main checks the PNG signature and a 500 MB cap. | Reuse this one-result-at-a-time flow for individual saves and batch export. |
| The preload currently exposes only select-one, ensure-model, save-one, and model progress. | [`src/preload/index.ts`](../../src/preload/index.ts#L4), [`src/shared/model.ts`](../../src/shared/model.ts#L42) | The `DesktopApi` contains four narrow methods. | Add explicit batch and progress actions. Keep IDs opaque and keep paths in main. |
| Electron supports native multi-file selection and directory selection. | [Electron dialog docs](https://www.electronjs.org/docs/latest/api/dialog) | `showOpenDialog` supports `openFile`, `openDirectory`, and `multiSelections`. | Use one native multi-file picker for photo input and one directory picker for bulk output. Reject a 21-photo selection as a whole before loading files. |
| Electron custom protocols can serve controlled local files, and Electron recommends IPC sender validation. | [Electron protocol docs](https://www.electronjs.org/docs/latest/api/protocol), [Electron security guide](https://www.electronjs.org/docs/latest/tutorial/security) | `protocol.handle` routes requests through an application handler; the security guide says to validate IPC senders. | If local preview streaming is needed, serve only app-owned temporary results through the existing `app:` scheme. Keep all write and path decisions in main. |
| Node supports unique temporary directories and exclusive file creation. | [Node.js filesystem docs](https://nodejs.org/api/fs.html#fspromisesmkdtempprefix-options), [file system flags](https://nodejs.org/api/fs.html#file-system-flags) | `mkdtemp()` creates a unique directory; `'wx'` fails when the target file already exists. | Use one app-owned temporary directory per batch. Use exclusive creation or a suffix for bulk outputs so an existing file is never silently replaced. |
| Canvas exposes pixel data and can paint edited pixel data back to a canvas. | [Canvas `getImageData()`](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData), [Canvas `putImageData()`](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/putImageData) | `getImageData()` returns canvas pixel data; `putImageData()` paints an `ImageData` object. | A small TypeScript lookup-table pipeline can compute RGB histograms and non-destructive pixel adjustments without adding a dependency. |
| Stable inference was slow on the test Mac and Windows speed is unknown. | [`docs/research/ddcolor-tiny-2026-11-08.md`](./ddcolor-tiny-2026-11-08.md) | The app-level Stable run on one portrait exceeded a 30-second observation window before completing; Windows timing and memory remain unverified. | Batch progress must show the current photo and model. Validate a small batch on both target devices before calling the feature ready. |
| Existing AIUP documents describe one-photo and one-result behavior. | [`docs/requirements.md`](../../docs/requirements.md#L5), [`docs/use_cases/UC-001-photo-colorization.md`](../../docs/use_cases/UC-001-photo-colorization.md#L14), [`docs/entity_model.md`](../../docs/entity_model.md#L5), [`docs/test_cases/TC-001-photo-colorization.md`](../../docs/test_cases/TC-001-photo-colorization.md#L6) | FR-001 and UC-001 describe one photo; `PhotoSession` stores one model result and three adjustments. | Update existing requirements and use-case IDs before implementation. Add batch entities and acceptance examples without renumbering existing IDs. |

## User decisions captured

- Select JPEG and PNG files in one picker. Accept at most 20 photos. Reject more than 20 as one selection and ask for fewer.
- Run both pinned models on every selected photo. Edit each model result separately, then choose a winner for each photo.
- Continue after a photo or model run fails. Keep the other results and allow a failed model result to be retried.
- When canceled, finish both model runs for the current photo, then stop before the next photo. Keep completed results.
- Save one photo at a time or save chosen results in bulk to one selected folder with automatic filenames.
- Keep working results only on this computer and clear them when the batch closes.
- The editor should include curves, histograms, and separate controls for each color channel. Keep the interface in German and easy to follow.

## Contradictions and unknowns

- The current code caps each source at 250 MB and 24 megapixels. The batch maximum does not change either per-photo limit.
- Caching both models uses about 1.1 GB of model files. Temporary full-resolution candidate PNGs add variable storage use. The app must report disk-write failures per photo and keep completed results; available-space estimates cannot guarantee the run will finish.
- Pairing two models for each photo follows the requested cancellation rule but changes the active model repeatedly. Holding both sessions could reduce reloads but uses more memory. The target Windows laptop's RAM is not recorded. Keep one session active and measure the actual reload cost on both devices.
- The source path may become unavailable while a batch is open. The main process should treat a read failure as an item-level failure and continue.
- The current app has no advanced editor, temporary-batch store, bulk file export, or batch-progress event. These are new behaviors, not existing patterns.

## Recommendation

Use one active batch with one through 20 photos. Keep paths and file actions in main. Return opaque IDs. Load or save one image at a time. Store generated candidates in an app-owned temporary directory. Run both models serially for each photo. This preserves the current one-session-at-a-time runtime. Keep edits and the winner in batch state. Save only chosen results. Add a suffix when a bulk-save name already exists. Never overwrite. Delete temporary files when the batch closes or the app shuts down. On launch, remove only stale directories under the app's temporary root.

Do not add a database, cloud service, third-party image-editing package, model, or file format. Do not store a persistent photo library.

## Implementation and validation update

The user approved implementation. The app now supports up to 20 JPEG or PNG photos per batch. It runs Stable and Tiny for each photo, keeps each result editable, and lets the user select one result per photo. It supports individual and bulk PNG saves, retry after failures, cancellation after the current photo pair, and app-owned temporary result cleanup.

The German editor includes color strength, brightness, warmth, hue, levels, histograms, and master and per-channel curves. A later layout update gives editing its own view, keeps the image beside the controls, and places Tonwertkorrektur at the top. Windows updates retain the existing application ID, per-user install, user data location, and model cache. Uninstall does not delete app data.

Local checks passed: 37 JavaScript tests across 11 files, 14 AIUP document tests, TypeScript checks, the production build, and Stable model inference. The Stable smoke test used the cached model and reported output values from 0.4769 to 0.5486. Both cached model files match the configured SHA-256 hashes.

After the user reported four failures for two photos, the Electron log showed that the app could not load `ort-wasm-simd-threaded.wasm`: the build copied the JavaScript runtime but omitted its WebAssembly binary. The build now copies both files and checks that both exist. A failed model initialization also left its worker unusable. The app now replaces that worker after an inference error, and retry controls become active again after a failed retry.

The runtime asset check and a direct packaged-app asset request passed. The request returned the WebAssembly MIME type, a valid WASM signature, and 14,848,852 bytes. A fresh DDColor Tiny worker inference returned a 64×64 candidate. In the open development app, both selected local photos completed both model runs: four results were ready with zero failures. This verifies the development build on this Mac, not the packaged installers or Windows device.

Unsigned version 0.2.3 installers were built for macOS arm64 and Windows x64. The user accepted unsigned installers for two private laptops. No Apple Developer ID signing identity or notarization setup is configured. A corrected Mac build opened its German interface on the target Mac.

The Windows installer has not been run on the target Windows 10 or 11 laptop. Model reuse after installation, offline colorization, Tiny inference, 20-photo batch performance, and target-device memory remain unverified. The local PlantUML renderer returned HTTP 404 for the updated diagram and a minimal example. Visual diagram validation remains pending.

The local, unsigned artifacts are:

- `release/0.2.3-mac-final-2026-11-08/DeOldify-macOS-arm64.dmg`
- `release/0.2.3-windows-ready-2026-11-08/DeOldify-Windows-x64-Setup.exe`

The 0.2.0 and 0.1.0 crash reports ended within a second of launch. Version 0.2.3 also crashed with no other instance running, which disproved the initial duplicate-instance theory. Electron's matching debug symbols place the failure in `ElectronBrowserClient::AppendExtraCommandLineSwitches` while starting the GPU helper. The [Electron source](https://github.com/electron/electron/blob/v45.2.3/shell/browser/electron_browser_client.cc) checks that the helper path matches the expected path.

An unsigned build with the German product name crashed. Ad hoc signing and disabling ASAR did not stop the crash. Changing the Mac bundle and helper names to ASCII made the app open. The Mac packaging script now uses that ASCII product name while preserving the German display name and the existing app ID. The working app used the existing `alte-fotos-faerben` user-data directory.

The 0.2.3 installers were built locally. See the README for release downloads. No Vercel project is configured.
