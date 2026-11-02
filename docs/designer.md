---
title: Designer
nav_order: 3
---

# Designer

Header tabs switch **Designer** and **Controller**. Designer: Reset restores the default hole; Ctrl+Z / Ctrl+Y undo and redo.

Shape kind: polygon, rounded rect, circle, or oval. Click a polygon vertex to smooth that corner into a bezier; drag the handles to tune it. Right-click a vertex to delete it; the admin window uses its own menu.

Stroke uses an iro.js picker; **File → Settings** edits custom color palettes. Header **Grid** checkboxes draw framing lines (center, thirds, fifths, action/title safe); vertices, handles, and moved shapes (any edge or center) snap to the canvas edges and to enabled grid lines within 10 screen pixels.

Look sets stroke, thickness, glow (halo), and blur (softens the stroke and chroma fringes).

**Look → Motion** is the idle loop on the border (dash, comet, breathe, hue, rainbow, aurora, fire, neon-swap, orbit, chroma, and more). Easing applies per keyframe segment, so `steps` holds each key and dash loops wrap seamlessly. The same bar sets duration, easing, tint, and strength for the selected motion, and **Save as preset** stores that setup under Motion.

Chroma (idle or burst) hides the solid stroke and draws cyan/magenta copies offset 2→5px like SeshHub’s PFP ring, scaled to the shape so the editor and overlay match (blur and glow stay on those copies). Glitch keeps the stroke and adds the same split plus slice bars. Designer tint does not recolor the C/M copies.

Mask size in Designer is the camera hole; stroke/glow can extend outside it.
