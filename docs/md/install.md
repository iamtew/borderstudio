# Install from source

Streamers: use the MSI (`borderstudio-*-win-x64.msi`) on [GitHub Releases](https://github.com/iamtew/borderstudio/releases/latest). This page is for building from a clone.

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

Zips the exe with `README.md` and `LICENSE` as `dist/borderstudio-<ver>-win-x64.zip`. `<ver>` is the latest numeric git tag (`0.1.0`, no `v`), or `0.0.0` if none.

```
just msi
```

Builds a per-user MSI (`dist/borderstudio-<ver>-win-x64.msi`). Default install is `%LOCALAPPDATA%\Programs\Border Studio`; you can change the folder. Start Menu shortcut is on, desktop shortcut is off. Needs [WiX](https://wixtoolset.org/) 5 on PATH (`dotnet tool install -g wix`). `just build-dist` makes the zip and the MSI. A numeric git tag (`0.1.1`, no `v`) builds both and publishes a GitHub Release with the zip and MSI attached.

```
just reset-browsers
```

Quit Border Studio first. A running app locks the `webview` folder. This resets `webview` in the project folder and in `dist/` (and leftover `*-chrome` Edge profile dirs from older builds).
