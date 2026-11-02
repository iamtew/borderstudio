---
title: OBS
nav_order: 5
---

# OBS

## Owned scene (WebSocket)

Enable OBS WebSocket (Tools → WebSocket Server Settings) and install [Advanced Masks](https://github.com/FiniteSingularity/obs-advanced-masks). File → Settings → OBS: connect, pick an existing camera, then **Create / Repair scene**. Nest the `Border Studio` scene into your other scenes.

Do not rename `Border Studio`, `BS Camera`, `BS Mask`, or `BS Overlay`.

## Modes

The header pill shows whether OBS is connected (click it for OBS settings). The big switch next to it picks the mode:

- **Designer Mode** deactivates the Border Studio camera in OBS and shows that webcam inside the hole on the Designer stage, masked exactly like OBS will. The mask, overlay, and OBS scene still update live.
- **OBS Mode** releases the webcam back to OBS. **Stream in OBS Mode.** Every window opens in OBS Mode, and closing the last Designer/Controller window hands the camera back to OBS automatically.

## Manual fallback

1. Add your camera source.
2. Filter → Image Mask/Blend. Use the PNG from **File → Download mask** in Designer (white = visible camera, black = cut).
3. Add a Browser Source on top: `http://127.0.0.1:8505/overlay` (same size as the mask, default 1920×1080). Shutdown source when not visible can stay off so SSE stays up. The live mask page is `http://127.0.0.1:8505/mask`. Overlay ink is PixiJS (WebGL inside OBS). If the border is blank, turn on OBS hardware acceleration (Settings → Advanced).
