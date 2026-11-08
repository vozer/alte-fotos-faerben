# Entity model

The app has no database. It keeps no photo library.

| Entity | Attributes | Lifecycle |
|---|---|---|
| BatchSession | opaque ID, temporary root, photo count, processing status | One batch exists per app window. It lasts until the user closes the batch or the app exits. |
| BatchPhoto | opaque ID, source path, safe display name, original dimensions, candidate results, chosen model, save status | Paths stay in main. The batch holds up to 20 photos and clears its temporary results when closed. |
| CandidateResult | model ID, status, temporary PNG path, edit settings, error message | One candidate exists per photo and model. A failed candidate can be retried independently. |
| AdjustmentSet | intensity, brightness, warmth, hue, black point, midtone, white point, master curve, red curve, green curve, blue curve | Belongs to one CandidateResult. Preview and export use the same values. |
| ModelCache | model ID, file name, pinned URL, expected size, expected SHA-256, verified file path | One cache per model in the operating system user-data folder. It survives app updates and supports offline work. |
| SavedCopy | output path, PNG bytes | Created only when the user saves a chosen result. The original file remains unchanged. |

Relationships: one BatchSession owns 1 to 20 BatchPhoto records. Each BatchPhoto
has up to two CandidateResult records and may choose one. Each candidate uses
either verified ModelCache and may create a SavedCopy. No entity stores
personal photos after the app closes.
