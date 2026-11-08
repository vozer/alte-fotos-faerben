# UC-001: Colorize and save a photo

Requirement links: FR-001 through FR-008, FR-013, NFR-001, NFR-002,
NFR-016, and NFR-017.

## Actor

User.

## Preconditions

The app is installed. The user has a JPEG or PNG photo. The first run needs an
internet connection to download both models.

## Main flow

1. The user chooses one photo in the native multi-file picker.
2. The app checks the file type and size, then displays the original.
3. The user starts colorization.
4. If a model is missing, the app downloads it and shows progress.
5. The app colorizes the photo with DeOldify Stable and DDColor Tiny.
6. The user compares both results and chooses one.
7. The user may edit each result separately with simple and advanced color tools.
8. The user may reset one result to its original model output.
9. The user saves the chosen result as a PNG.
10. The app writes a new file and leaves the original unchanged.

## Alternative flows

- The download fails: the app reports the issue and offers a retry.
- A model download or inference fails: the app keeps the other result and offers a retry.
- Model initialization fails: the app replaces the worker before retrying.
- The checksum differs: the app rejects the model file and does not load it.
- The image is invalid or too large: the app explains how to choose another
  image.
- The image has more than 24 megapixels: the app asks the user to choose a
  smaller image.
- The user cancels a dialog: the current batch remains unchanged.
- The output path is the original: the app rejects it.
- Another output file exists: the system save window asks before replacing it.
- Both models are cached and the computer is offline: the bundled runtime loads
  locally and colorization continues without network requests.
- A model is missing and the computer is offline: the app explains that
  internet is needed for that model and keeps any completed result.

## Postcondition

The original is unchanged. A separate PNG exists only if the user saved it.
