# Border Studio - Camera border + mask for OBS

Local tray app. Designer draws the camera hole. Overlay is the colored border for OBS Browser Source. Mask is a black/white PNG for an OBS Image Mask/Blend filter.

## Run

```
just run
```

Listens on `http://127.0.0.1:8505`. Systray: Designer, Controller, Overlay, Copy URL, About, Quit.

Header tabs switch **Designer** and **Controller**. Controller fills the window under the header. Designer: Reset restores the default hole; Ctrl+Z / Ctrl+Y undo and redo. Shape kind: polygon, rounded rect, circle, or oval. Click a polygon vertex to smooth that corner into a bezier; drag the handles to tune it. Right-click a vertex to delete it; the admin window uses its own menu. Stroke uses an iro.js picker; **File → Settings** edits custom color palettes. Header **Grid** checkboxes draw framing lines (center, thirds, fifths, action/title safe); vertices, handles, and moved shapes (any edge or center) snap to the canvas edges and to enabled grid lines within 10 screen pixels.

## OBS

**Owned scene (WebSocket):** enable OBS WebSocket (Tools → WebSocket Server Settings) and install [Advanced Masks](https://github.com/FiniteSingularity/obs-advanced-masks). File → Settings → OBS: connect, pick an existing camera, then **Create / Repair scene**. Nest the `Border Studio` scene into your other scenes. Mask size in Designer is the camera hole; stroke/glow can extend outside it. Do not rename `Border Studio`, `BS Camera`, `BS Mask`, or `BS Overlay`.

**Modes:** the header pill shows whether OBS is connected (click it for OBS settings). The big switch next to it picks the mode:

- **Designer Mode** deactivates the Border Studio camera in OBS and shows that webcam inside the hole on the Designer stage, masked exactly like OBS will. The mask, overlay, and OBS scene still update live.
- **OBS Mode** releases the webcam back to OBS. **Stream in OBS Mode.** Every window opens in OBS Mode, and closing the last Designer/Controller window hands the camera back to OBS automatically.

**Manual fallback:**

1. Add your camera source.
2. Filter → Image Mask/Blend. Use the PNG from **File → Download mask** in Designer (white = visible camera, black = cut).
3. Add a Browser Source on top: `http://127.0.0.1:8505/overlay` (same size as the mask, default 1920×1080). Shutdown source when not visible can stay off so SSE stays up. The live mask page is `http://127.0.0.1:8505/mask`.

Controller buttons fire named events; overlay plays the bound one-shot (pulse, shockwave, flash, lightning, alert, wipe, glitch, chroma-burst, and the rest in Controller **Edit**). Edit a button to set its duration, easing, tint, and strength, and save that as a preset. Look sets stroke, thickness, glow (halo), and blur (softens the stroke and chroma fringes). Designer **Look → Motion** is the idle loop on the border (dash, comet, breathe, hue, rainbow, aurora, fire, neon-swap, orbit, chroma, and more). Easing applies per keyframe segment, so `steps` holds each key and dash loops wrap seamlessly. The same bar sets duration, easing, tint, and strength for the selected motion, and **Save as preset** stores that setup under Motion. Chroma (idle or burst) hides the solid stroke and draws cyan/magenta copies offset 2→5px like SeshHub’s PFP ring, scaled to the shape so the editor and overlay match (blur and glow stay on those copies). Glitch keeps the stroke and adds the same split plus slice bars. Designer tint does not recolor the C/M copies.

Data lives in `border.db` next to the exe (`just run` uses the project folder).
