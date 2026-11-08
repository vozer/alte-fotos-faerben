# Alte Fotos färben

This desktop app colorizes one local JPEG or PNG photo with DeOldify Stable by
default. Choose DDColor Tiny for stronger color, or compare both on the same
photo. It saves a separate PNG and leaves the original unchanged.

The app supports Apple Silicon Macs and Windows 10 or 11 laptops with x64
processors. It does not use Vercel or send photos over the internet.

## Download

Download v0.1.0 from [GitHub Releases](https://github.com/vozer/alte-fotos-faerben/releases/tag/v0.1.0):
[macOS Apple Silicon installer (153 MB)](https://github.com/vozer/alte-fotos-faerben/releases/download/v0.1.0/DeOldify-macOS-arm64.dmg) or
[Windows x64 installer (140 MB)](https://github.com/vozer/alte-fotos-faerben/releases/download/v0.1.0/DeOldify-Windows-x64-Setup.exe).
Both installers are unsigned, so macOS or Windows may show a security warning.

## Build

Use Node 26 and npm.

~~~sh
npm ci
npm test
npm run typecheck
npm run build
~~~

Build the unsigned installers on macOS:

~~~sh
npm run package:mac
npm run package:win
~~~

Each model downloads the first time you use it. DeOldify Stable needs 873 MB.
DDColor Tiny needs 222 MB. The app stores both in the operating system's
user-data folder and verifies each model's size and SHA-256 hash.

See [the German installation guide](docs/install-de.md) for the two users.
See [third-party notices](docs/third-party-notices.md) for source and license
details.
