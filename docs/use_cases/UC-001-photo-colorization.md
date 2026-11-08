# UC-001: Colorize and save a photo

Requirement links: FR-001 through FR-008.

## Actor

User.

## Preconditions

The app is installed. The user has a JPEG or PNG photo. The first run needs an
internet connection to download the model.

## Main flow

1. The user chooses a photo.
2. The user chooses DeOldify Stable or DDColor Tiny.
3. If that model is missing, the app downloads it and shows progress.
4. The user chooses “Farbe hinzufügen”.
5. The app colorizes the photo and displays the original and result model.
6. The user may choose the other model and colorize the same open photo again.
7. The user may open “Farben anpassen” and change three sliders.
8. The user may reset the sliders to the selected model's result.
9. The user chooses “Farbige Kopie speichern”.
10. The app writes a new PNG and leaves the original unchanged.

## Alternative flows

- The download fails: the app reports the issue and offers a retry.
- The checksum differs: the app rejects the file and does not load it.
- The image is invalid or too large: the app explains how to choose another
  image.
- The image has more than 24 megapixels: the app asks the user to choose a
  smaller image.
- The user cancels a dialog: the current photo remains unchanged.
- The output path is the original: the app rejects it.
- Another output file exists: the system save window asks before replacing it.
- The model is cached and the computer is offline: colorization continues.
- The chosen model is not cached and the computer is offline: the app explains
  that internet is needed for that model.

## Postcondition

The original is unchanged. A separate PNG exists only if the user saved it.
