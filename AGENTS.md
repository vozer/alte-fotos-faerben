# Alte Fotos färben

This local Electron app colorizes one JPEG or PNG photo with DeOldify Stable
or DDColor Tiny. Keep photos on the device. Do not add cloud upload, analytics,
accounts, or photo-library storage.

Before changing app behavior, update the affected AI Unified Process documents
in `docs/`. Keep requirement, use-case, and test IDs stable. Run
`bash scripts/check-aiup-docs.sh` and
`python3 -B -m unittest discover -s tests -p 'test_aiup_docs_gate.py'`.

The renderer must not access Node.js or arbitrary file paths. Expose only the
file selection, save, model status, and progress actions through preload.
Download only the two pinned ONNX models listed in `src/shared/model.ts`.
Verify each model's size and SHA-256 before use, and keep it in the operating
system user-data folder. Never send photos to a network service. Keep the
original file unchanged, including when saving.

Keep model weights, `.reference/`, user photos, secrets, and build output out of
Git and app packages. Preserve upstream license notices. Build only the
unsigned Windows x64 installer and macOS arm64 disk image for the two private
computers. The public source repository is
https://github.com/vozer/alte-fotos-faerben, and installers are published on
https://github.com/vozer/alte-fotos-faerben/releases. No Vercel deployment is
configured.
