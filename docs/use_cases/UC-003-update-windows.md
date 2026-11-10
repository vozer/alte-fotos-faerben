# UC-003: Update the Windows app

Requirement links: FR-002, C-002, and NFR-011.

## Actor

User.

## Preconditions

The previous unsigned Windows x64 version is installed for the current user.
The app may have valid model files in its user-data folder.

## Main flow

1. The user closes the app.
2. If the existing uninstaller matches a known damaged release, the user
   replaces it with the corrected uninstaller from the Windows test release.
3. The user starts the Windows x64 installer.
4. The installer updates the existing app installation.
5. The user starts the app.
6. The app verifies and reuses each valid cached model.
7. The user processes photos offline with both models.

## Alternative flows

- The installed uninstaller matches a known damaged release: use its matching
  corrected uninstaller from the test release before installing the update.
- The installed uninstaller does not match a known release: stop and check its
  identity before replacing it.
- A cached model is missing or has a wrong size or hash: the app downloads and
  verifies that model only.
- A model is invalid and the computer is offline: the app reports that internet
  is needed and does not load the model.
- The user cancels the installer: the existing app and model files remain.

## Postcondition

The app is updated. Valid cached model files remain available. Photo data stays
on the computer.
