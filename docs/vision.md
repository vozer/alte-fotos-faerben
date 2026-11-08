# Vision

## Mission

Help a family member add natural-looking color to old photos with one simple,
German-language desktop app.

## Users

The app is for one person using an Apple Silicon Mac or a Windows 10 or 11 x64
laptop. The main user needs large controls and simple German instructions.

## Goals

- Colorize one JPEG or PNG photo at a time with DeOldify Stable by default or DDColor Tiny.
- Keep photos on the computer and work offline after each model download.
- Let the user adjust color intensity, brightness, and warmth after colorizing.
- Save a new PNG without changing the original.

## Scope

The first version supports still JPEG and PNG photos. It has no accounts,
cloud photo processing, batch mode, video mode, restoration tools, analytics,
or automatic updates.

## Constraints

Each model downloads once from a pinned release and is checked by size and SHA-256.
Installers are unsigned and target one Mac arm64 computer and one Windows x64
computer. The app has no Vercel service.

## Success measures

The user can select, colorize, adjust, preview, and save a photo without using
a terminal. Each cached model works offline. Both target installers
build, and each available target computer completes a colorization without a
crash. Record processing time and peak memory on each computer.
