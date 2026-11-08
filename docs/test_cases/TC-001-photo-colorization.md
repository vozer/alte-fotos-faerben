# TC-001: Colorize, adjust, and save a photo

Use case: UC-001. Requirements: FR-001 through FR-008, NFR-001 through
NFR-007.

| Step | Action | Expected result |
|---|---|---|
| 1 | Open a synthetic grayscale PNG. | The original appears. No network request contains photo bytes. |
| 2 | Select DeOldify Stable with an empty cache and internet access. | The 873 MB model downloads with progress, passes its size and SHA-256 checks, and is cached. |
| 3 | Colorize the image with DeOldify Stable. | A result appears at the original dimensions and identifies its model. |
| 4 | Select DDColor Tiny and colorize the same open image again. | The 222 MB model downloads with progress and passes its size and SHA-256 checks. A new result replaces the previous result. |
| 5 | Move each adjustment slider. | The preview changes without another model inference. |
| 6 | Reset adjustments. | The exact result from the currently named model returns. |
| 7 | Save to a new path. | A PNG is written; the source file hash is unchanged. |
| 8 | Restart offline with both models cached. | Either model can colorize a photo without internet. |
| 9 | Try a corrupt image, bad model hash, and original output path. | Each action fails safely with a German message. |
| 10 | Try a photo larger than 24 megapixels. | The app explains that the photo is too large and leaves the current photo unchanged. |
| 11 | Open the app a second time during a download. | The open window comes forward. Only one model download runs. |
