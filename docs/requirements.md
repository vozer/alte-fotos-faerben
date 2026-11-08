# Requirements

| ID | Requirement |
|---|---|
| FR-001 | The user can select 1 to 20 JPEG or PNG photos with one native file dialog. A selection above 20 is rejected as a whole. |
| FR-002 | On first use of a model, the app downloads that pinned model, shows progress, verifies its size and SHA-256, and caches it locally. |
| FR-003 | The app runs DeOldify Stable and DDColor Tiny on each selected photo. The user chooses one result for each photo. |
| FR-004 | The user can adjust intensity, brightness, warmth, hue, levels, and master or RGB curves for each result. |
| FR-005 | Neutral settings preserve the model result. Reset restores that result. Adjustments do not run inference again. |
| FR-006 | The user can compare the original and both results, see a histogram, edit each result, and save one or all chosen PNGs. |
| FR-007 | The app never overwrites a source or batch original. Individual save asks before replacing a different output. Bulk save uses unique names and never replaces a file. |
| FR-008 | The user can compare both models for the same open photo without selecting it again. |
| FR-009 | The app continues the batch after a photo or model run fails. The user can retry a failed result without rerunning successful results. |
| FR-010 | The user can cancel a batch. The app finishes both model attempts for the current photo, then stops and keeps completed results. |
| FR-011 | The user can save a chosen result alone or save all chosen results to one folder. The app reports saved, skipped, and failed photos. |
| FR-012 | The app asks before closing a batch with unsaved choices or edits. Closing clears only that batch's temporary files. |
| FR-013 | The app keeps one independent adjustment set for each model result. The same settings drive preview and full-resolution PNG output. |
| NFR-001 | Photo bytes never leave the computer. Network downloads come only from the two pinned model URLs. |
| NFR-002 | Each cached model works offline after its download. |
| NFR-003 | The German interface uses readable text, large controls, clear progress, and actionable error messages. |
| NFR-004 | The app validates image type and size, model checksum, IPC sender, and output path. Its content policy permits WebAssembly only for model inference. |
| NFR-005 | The selected model needs internet for its first download. Caching both models needs about 1.2 GB of free disk space. |
| NFR-006 | The app safely rejects photos larger than 24 megapixels with a clear German message. |
| NFR-007 | Only one app instance can download a model or process a photo at a time. |
| NFR-008 | The app processes photos one at a time in a worker. The interface and cancel action stay responsive during inference and image edits. A worker crash reports the interrupted action, preserves completed results, and allows a retry with a fresh worker. |
| NFR-009 | Batch source paths and temporary full-size results stay in the main process and local user-data folder. The renderer receives opaque IDs only. |
| NFR-010 | The app uses at most one model session at a time and does not load all batch images into memory together. |
| NFR-011 | The Windows update keeps the existing app ID, product name, per-user install, and user-data path. It reuses each valid cached model and downloads only a missing or invalid model. |
| NFR-012 | PNG transparency and decoded image orientation are preserved in colorized and edited output. |
| NFR-013 | Temporary writes do not appear as completed results until the write succeeds. Disk-full and interrupted writes leave existing files unchanged. |
| NFR-014 | If stale temporary-file cleanup fails at startup, the app still opens, reports the issue, and retries cleanup on the next launch. |
| NFR-015 | Main marks a stored candidate as unsaved before acknowledging the write. Closing cannot race a renderer update and silently discard a completed result. |
| NFR-016 | The app bundles the ONNX Runtime WebAssembly code and binary, serves them locally, and never fetches runtime assets from the network. |
| NFR-017 | After model initialization or inference fails, the app replaces the worker before retrying so a failed runtime cannot block later results. |
| NFR-018 | A duplicate app process exits only after Electron is ready and does not start cleanup, model, or window initialization. |
| NFR-019 | The Mac executable and helper names use ASCII so Electron can start on macOS with decomposed file names. The app keeps its German display name and existing data location. |
| C-001 | The app supports JPEG and PNG only in version one, with up to 20 photos per batch. |
| C-002 | Build unsigned Windows x64 and macOS arm64 installers for two private computers. The Windows package updates the existing per-user installation. |
| C-003 | Version one offers only the pinned DeOldify Stable and DDColor Tiny models. |
