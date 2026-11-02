---
title: Home
nav_order: 1
---

# Border Studio

Local tray app. Designer draws the camera hole. Overlay is the colored border for OBS Browser Source. Mask is a black/white PNG for an OBS Image Mask/Blend filter.

Listens on `http://127.0.0.1:8505`. Systray: Designer, Controller, Overlay, Copy URL, Clear browser data, About, Quit. Designer, Controller, and About open in our own WebView2 windows (same engine as Edge, our process). Overlay stays a Browser Source URL for OBS.

Data lives in `border.db` next to the exe (`just run` uses the project folder). WebView2 user data lives in a `webview` folder beside that: tray **Clear browser data** resets the running copy, and `just reset-browsers` resets the project folder and `dist/`.

- <span class="ti ti-download" aria-hidden="true"></span>[Install](install.md)
- <span class="ti ti-pencil" aria-hidden="true"></span>[Designer](designer.md)
- <span class="ti ti-layout-grid" aria-hidden="true"></span>[Controller](controller.md)
- <span class="ti ti-broadcast" aria-hidden="true"></span>[OBS](obs.md)
- <span class="ti ti-sparkles" aria-hidden="true"></span>[Credits](credits.md)
