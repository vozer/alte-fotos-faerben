# TC-003: Update Windows without downloading valid models again

Use case: UC-003. Requirements: C-002, FR-002, NFR-002, and NFR-011.

| Step | Action | Expected result |
|---|---|---|
| 1 | Install the previous unsigned Windows x64 release for the current user. Download both models and save their file sizes and SHA-256 hashes. | The app and both verified models work. The cache is under the app's user-data folder. |
| 2 | Install the new unsigned Windows x64 package over the existing app without uninstalling first. | The installer updates the same app ID and product name. It keeps the per-user app data. |
| 3 | Disconnect from the internet and start the updated app. | The app verifies and reuses both model files without a download. |
| 4 | Colorize one photo with both models and save the chosen PNG. | Both models work offline. The original remains unchanged. |
| 5 | Compare both model cache files with the saved values from step 1. | File sizes and SHA-256 hashes match. |
| 6 | Remove or corrupt only one model cache, reconnect, and use that model. | The app downloads and verifies only the missing or invalid model. The other model stays cached. |

The 0.1.0 uninstaller repair was confirmed by the Windows user. The user
confirmed that the old version reached uninstall. The user has not yet
confirmed installation of the test installer, model reuse, or colorization.

The 0.2.3 test installer and corrected uninstaller are published at
`https://github.com/vozer/alte-fotos-faerben/releases/tag/v0.2.3-windows-test-1`.
The release is a prerelease. It has not been tested on Windows. Verify install,
model reuse, offline colorization, and uninstall before making a stable release.
