# Entity model

The app has no database. It keeps no photo library.

| Entity | Attributes | Lifecycle |
|---|---|---|
| PhotoSession | original image bytes, width, height, selected model ID, result model ID, model result, color intensity, brightness, warmth | Exists in memory while one photo is open. Cleared when another photo is chosen or the app closes. |
| ModelCache | model ID, file name, pinned URL, expected size, expected SHA-256, verified file path | One cache per model in the operating system user-data folder. Reused for offline work. |
| SavedCopy | output path, PNG bytes | Created only when the user chooses Save. The original file remains unchanged. |

Relationships: one PhotoSession may use either verified ModelCache in turn and
may create one SavedCopy. No entity stores personal photos after the app closes.
