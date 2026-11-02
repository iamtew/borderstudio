---
title: Install from source
nav_order: 3
---

# <span class="ti ti-download" aria-hidden="true"></span>Install from source

Streamers: use the installer on [GitHub Releases](https://github.com/iamtew/borderstudio/releases). This page is for building from a clone.

```
just run
```

Listens on `http://127.0.0.1:8505`. Use the systray for Designer, Effects, Overlay, Copy URL, Clear browser data, About, and Quit. Windows 10/11 already have WebView2; Designer, Effects, and About use it instead of launching Edge.

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
