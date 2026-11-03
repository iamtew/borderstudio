# Quick Start

<p class="req"><strong>Required before anything else:</strong> <a href="https://obsproject.com/">OBS</a> and <a href="https://github.com/FiniteSingularity/obs-advanced-masks">Advanced Masks</a>. Border Studio will not create its OBS scene without the plugin. Install Advanced Masks from that repo (or OBS’s plugin installer), then come back here.</p>

The longer daily loop lives on [Home](home.md). This page is the short path: install the app, connect OBS, draw a hole.

## Install

1. Open the [latest release](https://github.com/iamtew/borderstudio/releases/latest). Download the Windows installer: `borderstudio-*-win-x64.msi` (not the `.zip` unless you want portable).
2. Run the MSI. It is per-user, no admin. Default folder is `%LOCALAPPDATA%\Programs\Border Studio`. Next through; Start Menu shortcut is on, desktop is off unless you tick it.
3. Launch **Border Studio** from Start. A tray icon means it is running. The window that opens is the **Designer** — that is the whole app.

Portable: unzip `borderstudio-*-win-x64.zip` and run `borderstudio.exe`. One instance only; a second launch says it is already running. The local server is `http://127.0.0.1:8505`.

![Designer Mask tab](../assets/screens/designer-mask.png)

## First run

1. In OBS: **Tools → WebSocket Server Settings**. Turn the server on. Port defaults to 4455. Set a password if you want one (Border Studio stores it and auto-connects next launch).
2. In Border Studio: **Border Studio → Settings → OBS**. Host `127.0.0.1`, port, password. **Connect**, pick your camera (DirectShow inputs only), then **Create / Repair scene**. If Advanced Masks is missing, this step errors and the owned scene does not work.
3. On the **Mask** tab, draw the hole (polygon, rounded rect, circle, or oval). Use **Designer mode** in the header so you see the webcam in the cut while you edit.
4. On the **Border** tab, pick color, thickness, glow, and any idle motion.
5. In OBS, nest the `Border Studio` scene into the scene you actually stream. Do not rename `Border Studio`, `BS Camera`, `BS Mask`, or `BS Overlay`.
6. Switch the header to **OBS mode** before you go live so OBS keeps the camera. Closing the last Designer window also hands the camera back.

Effects, grids, palettes, and a last-ditch PNG fallback live on the other pages.

See [Designer](designer.md), [Effects](effects.md), and [OBS](obs.md). Building from a git clone is on [For Developers](install.md).
