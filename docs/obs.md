---
title: OBS
nav_order: 6
---

# <span class="ti ti-broadcast" aria-hidden="true"></span>OBS

## Owned scene (WebSocket)

Enable OBS WebSocket (**Tools → WebSocket Server Settings**) and install [Advanced Masks](https://github.com/FiniteSingularity/obs-advanced-masks). In the Designer: **Border Studio → Settings → OBS**. Connect, pick an existing camera, then **Create / Repair scene**. Nest the `Border Studio` scene into your other scenes.

Do not rename `Border Studio`, `BS Camera`, `BS Mask`, or `BS Overlay`.

## Modes

The header pill shows whether OBS is connected (click it for OBS settings). The switch next to it is **OBS mode** (left) and **Designer mode** (right):

- **Designer mode** deactivates the Border Studio camera in OBS and shows that webcam inside the hole on the Designer stage, masked exactly like OBS will. The mask, overlay, and OBS scene still update live.
- **OBS mode** releases the webcam back to OBS. **Stream in OBS mode.** Closing the last Designer window hands the camera back to OBS automatically.

**Border Studio → Settings → Mode** sets the default when a window opens, whether to switch when OBS goes offline (Designer) or comes online (OBS mode), and a grace delay in seconds so a brief blip does not flip the camera. Auto-switch only follows OBS going online or offline; it does not override a manual click while OBS stays in the same state. New installs default to OBS mode, both auto-switches on, grace 0.

## Manual fallback

1. Add your camera source.
2. Filter → Image Mask/Blend. Use the PNG from **Border Studio → Download mask** in the Designer (white = visible camera, black = cut).
3. Add a Browser Source on top: `http://127.0.0.1:8505/overlay` (same size as the mask, default 1920×1080). Shutdown source when not visible can stay off so SSE stays up. The live mask page is `http://127.0.0.1:8505/mask`. Overlay ink is PixiJS (WebGL inside OBS). If the border is blank, turn on OBS hardware acceleration (**Settings → Advanced**).
