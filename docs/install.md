---
title: Install
nav_order: 2
---

# Install

```
just run
```

Listens on `http://127.0.0.1:8505`. Use the systray for Designer, Controller, Overlay, Copy URL, Clear browser data, About, and Quit. Windows 10/11 already have WebView2; Designer/Controller/About use it instead of launching Edge.

```
just build
```

Writes `dist/borderstudio.exe`.

```
just package
```

Zips the exe with `README.md` and `LICENSE`.

```
just reset-browsers
```

Quit Border Studio first. A running app locks the `webview` folder. This resets `webview` in the project folder and in `dist/` (and leftover `*-chrome` Edge profile dirs from older builds).
