---
title: Install
nav_order: 2
---

# Install

```
just run
```

Listens on `http://127.0.0.1:8505`. Use the systray for Designer, Controller, Overlay, Copy URL, Clear browser data, About, and Quit.

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

Quit Border Studio first. A running Edge locks the profile folders. This resets `designer-chrome`, `controller-chrome`, and `about-chrome` in the project folder and in `dist/`.
