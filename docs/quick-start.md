---
title: Quick Start
nav_order: 2
---

# <span class="ti ti-player-play" aria-hidden="true"></span>Quick Start

Stub. We will flesh this out as the installer settles. The steps below are enough to get on stream.

## Install

1. Open [GitHub Releases](https://github.com/iamtew/borderstudio/releases) and download the Windows installer from the latest release.
2. Run the installer, then launch Border Studio.
3. A tray icon means it is running. The window that opens is the **Designer** — that is the whole app.

![Designer Mask tab]({{ '/assets/screens/designer-mask.png' | relative_url }})

## First run

1. In OBS: **Tools → WebSocket Server Settings**. Turn the server on. Install [Advanced Masks](https://github.com/FiniteSingularity/obs-advanced-masks) if you do not have it.
2. In Border Studio: click the logo name **Border Studio → Settings → OBS**. Connect, pick your camera, then **Create / Repair scene**.
3. On the **Mask** tab, draw the hole (polygon, rounded rect, circle, or oval).
4. On the **Border** tab, pick color, thickness, glow, and any idle motion.
5. In OBS, nest the `Border Studio` scene into the scene you actually stream.
6. Switch the header to **OBS mode** before you go live so OBS keeps the camera.

Effects, grids, palettes, and the fallback mask PNG live on the other pages.

See [Designer](designer.md), [Effects](effects.md), and [OBS](obs.md). Building from a git clone is on [Install from source](install.md).
