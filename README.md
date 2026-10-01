# Border Studio - Camera border + mask for OBS

Local tray app. Designer draws the camera hole. Overlay is the colored border for OBS Browser Source. Mask is a black/white PNG for an OBS Image Mask/Blend filter.

## Run

```
just run
```

Listens on `http://127.0.0.1:8505`. Systray: Designer, Controller, Overlay, Copy URL, About, Quit.

Header tabs switch **Designer** and **Controller**. Controller fills the window under the header. Designer: Reset restores the default hole; Ctrl+Z / Ctrl+Y undo and redo. Shape kind: polygon, rounded rect, circle, or oval. Stroke uses an iro.js picker; **File → Settings** edits custom color palettes. Header **Grid** checkboxes draw framing lines (center, thirds, fifths, action/title safe); vertices snap to those lines and always to the canvas edges.

## OBS

1. Add your camera source.
2. Filter → Image Mask/Blend. Use the PNG from **Download mask** in Designer (white = visible camera, black = cut).
3. Add a Browser Source on top: `http://127.0.0.1:8505/overlay` (same size as the mask, default 1920×1080). Shutdown source when not visible can stay off so SSE stays up.

Controller buttons fire named events; overlay plays pulse or flash as bound in Controller **Edit**.

Data lives in `border.db` next to the exe (`just run` uses the project folder).
