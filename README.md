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

Controller buttons fire named events; overlay plays the bound one-shot (pulse, flash, alert, wipe, glitch, and the rest in Controller **Edit**). Edit a button to set its duration, easing, tint, and strength, and save that as a preset. Designer **Look → Motion** is the idle loop on the border (dash, breathe, hue, rainbow, and more). The same bar sets duration, easing, tint, and strength for the selected motion, and **Save as preset** stores that setup under Motion. Glitch splits the stroke red/blue and throws slice bars across the frame.

Data lives in `border.db` next to the exe (`just run` uses the project folder).
