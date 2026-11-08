# TC-002: Process and save a batch

Use case: UC-002. Requirements: FR-001, FR-003 through FR-007, FR-009 through
FR-013, NFR-001, and NFR-008 through NFR-017.

| Step | Action | Expected result |
|---|---|---|
| 1 | Select 20 synthetic JPEG and PNG photos. | The app accepts all 20 and shows each photo. |
| 2 | Select 21 photos while a batch is open. | The app rejects the full selection and keeps the open batch unchanged. |
| 3 | Process the 20-photo batch with both verified models. | The app processes one photo at a time and creates both candidates for every valid photo. |
| 4 | Cause one photo decode to fail and one model run to fail. | The app marks each failure and continues with the remaining work. |
| 5 | Retry one failed model result. | Only that photo and model run again. Successful candidates remain unchanged. |
| 6 | Cancel while the first photo is processing. | Both model attempts for that photo finish. No next photo starts. Completed candidates remain available. |
| 7 | Edit both results for one photo with different settings. | Each candidate keeps its own settings. Preview changes without inference. |
| 8 | Choose one model result for selected photos and leave another photo unchosen. | Each choice is independent. Bulk save reports the photo without a choice. |
| 9 | Bulk save to a folder with colliding names and an existing hard link to an original. | The app uses unique names, protects every original, and reports saved, skipped, and failed items. |
| 10 | Fill the destination disk or interrupt a write. | The app reports the affected item. It preserves previous files and completed results. |
| 11 | Attempt to replace a batch with unsaved results and then cancel the confirmation. | The current batch and all temporary results stay available. |
| 12 | Confirm closing the batch. | Only the app-owned temporary directory for that batch is removed. |
| 13 | Restart after leaving a marked temporary batch directory from a simulated crash. | Startup removes only the stale, marked directory under the app's batch root. |
| 14 | Make stale-directory cleanup fail during startup. | The app still opens, reports the cleanup issue, and retries cleanup on the next launch. |
| 15 | Crash the image worker during one model run, then retry that result. | The failed run is reported. A replacement worker processes the retry. |
| 16 | Crash the image worker after a result is ready, then change an edit setting. | The app reloads the saved result into the replacement worker and shows the edited preview. |
| 17 | Close the app immediately after a candidate is stored, before the renderer reports dirty state. | Main treats the batch as unsaved and asks for confirmation before discarding it. |
| 18 | Inspect network activity while processing synthetic photos. | Requests contain model data only. No photo bytes or photo paths leave the computer. |
| 19 | Run both cached model pipelines offline on one synthetic photo. | Both candidates finish. Runtime code and the WebAssembly binary load locally. |
| 20 | Fail model initialization once, then retry the failed candidate. | The app replaces the worker. The retry succeeds without restarting the app. |
