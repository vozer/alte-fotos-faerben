# Alte Fotos färben

This desktop app runs locally on up to 20 JPEG or PNG photos. It creates a
DeOldify Stable and a DDColor Tiny result for each photo. Choose and edit each
photo's result, then save one or all chosen images as PNG files. It leaves the
originals unchanged.

The editor includes color strength, brightness, warmth, hue, levels, RGB
histograms, and master or per-channel curves. Photos and temporary results stay
on the computer.

The app supports Apple Silicon Macs and Windows 10 or 11 laptops with x64
processors. It does not use Vercel or send photos over the internet.

## Download

Download v0.2.3 from [GitHub Releases](https://github.com/vozer/alte-fotos-faerben/releases/tag/v0.2.3):
[macOS Apple Silicon installer (156 MiB)](https://github.com/vozer/alte-fotos-faerben/releases/download/v0.2.3/DeOldify-macOS-arm64.dmg) or
[Windows x64 installer (143 MiB)](https://github.com/vozer/alte-fotos-faerben/releases/download/v0.2.3/DeOldify-Windows-x64-Setup.exe).
Both installers are unsigned, so macOS or Windows may show a security warning.

The v0.2.3 Windows installer keeps the existing app identity and per-user data
folder. Run it over the installed app without uninstalling first. It reuses
each model that passes its size and SHA-256 checks. The target Windows laptop
still needs an install-and-offline test.

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
user-data folder and verifies each model's size and SHA-256 hash. Updates reuse
valid cached files.

See [the German installation guide](docs/install-de.md) for the two users.
See [third-party notices](docs/third-party-notices.md) for source and license
details.
