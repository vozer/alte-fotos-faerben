# UC-003: Update the Windows app

Requirement links: FR-002, C-002, and NFR-011.

## Actor

User.

## Preconditions

The previous unsigned Windows x64 version is installed for the current user.
The app may have valid model files in its user-data folder.

## Main flow

1. The user closes the app.
2. The user starts the new unsigned Windows x64 installer.
3. The installer updates the existing app installation.
4. The user starts the app.
5. The app verifies and reuses each valid cached model.
6. The user processes photos offline with both models.

## Alternative flows

- A cached model is missing or has a wrong size or hash: the app downloads and
  verifies that model only.
- A model is invalid and the computer is offline: the app reports that internet
  is needed and does not load the model.
- The user cancels the installer: the existing app and model files remain.

## Postcondition

The app is updated. Valid cached model files remain available. Photo data stays
on the computer.
