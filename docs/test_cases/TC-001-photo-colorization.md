# TC-001: Compare, edit, and save one photo

Use case: UC-001. Requirements: FR-001 through FR-008, FR-013, NFR-001
through NFR-013, and NFR-016 through NFR-019.

| Step | Action | Expected result |
|---|---|---|
| 1 | Select one synthetic grayscale PNG. | The original appears. The app keeps its path in main and sends no photo bytes over the network. |
| 2 | Start colorization with both model caches empty and internet access. | Both pinned models download with progress, pass size and SHA-256 checks, and are cached. |
| 3 | Wait for both model runs to finish. | Two candidates appear at the decoded image dimensions and identify their models. |
| 4 | Edit Stable with intensity, brightness, warmth, hue, levels, and master and RGB curves. | Only Stable changes. Tiny keeps its own settings. The histogram describes the active candidate. |
| 5 | Reset Stable. | The exact Stable result returns. |
| 6 | Choose Tiny and save the result to a new path. | A PNG is written with the same edits as the preview. The source file hash is unchanged. |
| 7 | Restart offline with both valid models cached. | Both models load the bundled runtime and colorize without network requests. |
| 8 | Try a corrupt image, bad model hash, and original output path. | Each action fails safely with a German message. |
| 9 | Try a photo larger than 24 megapixels. | The app explains that the photo is too large and leaves the open batch unchanged. |
| 10 | Open the app a second time during a download. | The open window comes forward. Only one model download runs. |
| 11 | Colorize a PNG with transparent pixels and a rotated JPEG. | The saved output keeps transparency and the decoded orientation. |
| 12 | Launch a second app process while the first holds the instance lock. | The second process exits after Electron is ready. The first window stays open and neither process crashes. |
| 13 | Open the packaged Mac app from its build folder. | The app opens its German interface and its graphics helper starts without a crash. |
