# UC-002: Colorize, compare, and save a batch

Requirement links: FR-001, FR-003 through FR-007, FR-009 through FR-013,
NFR-001, NFR-008 through NFR-017.

## Actor

User.

## Preconditions

The app is installed. The user has 1 to 20 JPEG or PNG photos. A first model
download needs an internet connection.

## Main flow

1. The user selects several photos in one native file picker.
2. The app validates each file and shows its name and status.
3. The user starts processing.
4. The app runs Stable and Tiny for each photo, one photo at a time.
5. The app continues when a photo or one model result fails.
6. The user may cancel. The app completes both model attempts for the current
   photo and stops before the next one.
7. The user reviews both results for each photo.
   The colorized results are larger than the original thumbnail.
8. The user opens one result in a dedicated editing view. The photo preview,
   Tonwertkorrektur, and other color controls appear together. The view shows
   only the colorized photo, with zoom controls. The photo uses the full preview area.
9. The user edits each result independently and confirms one result per photo.
   The editor closes after confirmation.
10. The user may save one chosen result. For multiple photos, the app opens a
    selection view with a checked list of chosen results.
11. The user confirms the photos and selects one output folder.
12. The app reports saved, skipped, and failed photos.
13. The user closes the batch. The app clears its temporary files.

## Alternative flows

- More than 20 photos are selected: the app rejects the selection and keeps the
  current batch unchanged.
- A file is invalid or too large: the app marks that photo and continues with
  valid photos.
- A model download fails: the app marks affected results and offers a retry.
- The image worker crashes: the app reports the interrupted action, keeps completed candidates, replaces the worker, and lets the user retry.
- Model initialization fails: the app reports the candidate failure and replaces the worker before retrying.
- Startup cleanup fails: the app opens, warns that old temporary files remain, and retries cleanup at the next launch.
- A completed candidate is stored before the renderer updates its dirty state: main treats it as unsaved until the renderer confirms that chosen results were saved.
- The user retries one result: the app reruns only that photo and model.
- The user selects a new batch while unsaved work exists: the app asks before
  discarding the current batch.
- No result is chosen for a photo: bulk save skips it and reports the photo.
- A bulk filename exists: the app chooses a numbered filename without
  replacing the existing file.
- A write fails: the app reports the failure and keeps other results.
- A bulk write is interrupted: no incomplete output appears as a saved PNG.
- The computer is offline with valid model caches: the bundled runtime loads
  locally and the app processes photos without network requests.

## Postcondition

Saved PNGs exist only where the user requested them. Source photos remain
unchanged. Temporary batch files are removed when the batch closes.
