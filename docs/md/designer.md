# Designer

The Designer is the app. One window: logo + **Border Studio** file menu on the left, grids and OBS controls on the right, a three-tab sidebar, and the stage.

![Designer Mask tab](../assets/screens/designer-mask.png)

Reset restores the default hole; Ctrl+Z / Ctrl+Y undo and redo. Numeric fields use a slider, a number, and a reset to the default.

## Chrome

Click the hex mark and **Border Studio** for **Save**, **Reset**, **Download mask**, **Settings**, **Close** (window stays in the tray), and **Quit**. Version sits at the bottom of that menu.

![File menu](../assets/screens/designer-file.png)

**Grid** checkboxes draw framing lines (center, thirds, fifths, action/title safe). Vertices, handles, and moved shapes snap to the canvas edges and to enabled grid lines within 10 screen pixels.

The header pill shows OBS online or offline (click it for OBS settings). Next to it: **OBS mode** (camera stays with OBS) and **Designer mode** (webcam in the hole so you can see the cut). Stream in OBS mode. Details: [OBS](obs.md).

**File → Settings** has **OBS**, **Mode**, and **Color palettes**. Stroke color uses an iro.js picker; palettes live under Settings.

## Sidebar tabs

**Mask** is the camera hole. Shape kind: polygon, rounded rect, circle, or oval. Click a polygon vertex to smooth that corner into a bezier; drag the handles to tune it. Right-click a vertex to delete it; the Designer uses its own menu. Size is the hole; stroke and glow can extend outside it. **Feather** blurs the hole edge (soft mask). Preview shows the black/white mask PNG.

**Border** is the overlay decoration: stroke, thickness, glow (halo), blur (softens the stroke), and motion.

![Designer Border tab](../assets/screens/designer-border.png)

**Effects** is the one-shot board. See [Effects](effects.md).

The stage is a dark checkerboard (transparent). Glow and blur read against it. Designer mode still shows the webcam in the hole, using the same feathered mask as OBS.

## Motion

**Border → Motion** is the idle loop on the border (dash, comet, breathe, hue, rainbow, aurora, fire, neon-swap, orbit, chroma, and more). Easing applies per keyframe segment, so `steps` holds each key and dash loops wrap seamlessly. The same panel sets duration, easing, tint, and strength for the selected motion, and **Save as preset** stores that setup under Motion. Reset on Motion returns to a solid stroke (None).

Chroma (idle or burst) hides the solid stroke and draws cyan/magenta stroke copies offset 2→5px, scaled to the shape so the editor and overlay match. Glitch keeps the stroke and adds the same split plus slice bars. Designer tint does not recolor the C/M copies.
