# Requirements

| ID | Requirement |
|---|---|
| FR-001 | The user can select one JPEG or PNG photo with a native file dialog. |
| FR-002 | On first use of a model, the app downloads that pinned model, shows progress, verifies its size and SHA-256, and caches it locally. |
| FR-003 | The app colorizes the selected photo on-device with DeOldify Stable or DDColor Tiny. |
| FR-004 | The user can adjust color intensity from 50% to 150%, brightness from 80% to 120%, and warmth around a neutral center. |
| FR-005 | Neutral adjustment values preserve the selected model's result. Reset restores that result. Adjustments do not run inference again. |
| FR-006 | The user can preview the original and adjusted result, see which model made it, then save a PNG copy. |
| FR-007 | The app never overwrites the selected original. It asks before replacing a different existing output file. |
| FR-008 | The user can switch models and rerun the same open photo without selecting it again. |
| NFR-001 | Photo bytes never leave the computer. Network downloads come only from the two pinned model URLs. |
| NFR-002 | Each cached model works offline after its download. |
| NFR-003 | The German interface uses readable text, large controls, clear progress, and actionable error messages. |
| NFR-004 | The app validates image type and size, model checksum, IPC sender, and output path. Its content policy permits WebAssembly only for model inference. |
| NFR-005 | The selected model needs internet for its first download. Caching both models needs about 1.2 GB of free disk space. |
| NFR-006 | The app safely rejects photos larger than 24 megapixels with a clear German message. |
| NFR-007 | Only one app instance can download a model or process a photo at a time. |
| C-001 | The app supports JPEG and PNG only in version one. |
| C-002 | Build unsigned Windows x64 and macOS arm64 installers for two private computers. |
| C-003 | Version one offers only the pinned DeOldify Stable and DDColor Tiny models. |
