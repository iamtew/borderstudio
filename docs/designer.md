---
title: Designer
nav_order: 3
---

# Designer

Header tabs switch **Designer** and **Controller**. Designer: Reset restores the default hole; Ctrl+Z / Ctrl+Y undo and redo.

The left sidebar has two tabs.

**Mask** is the camera hole. Shape kind: polygon, rounded rect, circle, or oval. Click a polygon vertex to smooth that corner into a bezier; drag the handles to tune it. Right-click a vertex to delete it; the admin window uses its own menu. Size is the hole; stroke and glow can extend outside it. Preview shows the black/white mask PNG.

**Border** is the overlay decoration: stroke, thickness, glow (halo), blur (softens the stroke and chroma fringes), and motion.

Stroke uses an iro.js picker; **File → Settings** edits custom color palettes. Header **Grid** checkboxes draw framing lines (center, thirds, fifths, action/title safe); vertices, handles, and moved shapes (any edge or center) snap to the canvas edges and to enabled grid lines within 10 screen pixels.

**Border → Motion** is the idle loop on the border (dash, comet, breathe, hue, rainbow, aurora, fire, neon-swap, orbit, chroma, and more). Easing applies per keyframe segment, so `steps` holds each key and dash loops wrap seamlessly. The same panel sets duration, easing, tint, and strength for the selected motion, and **Save as preset** stores that setup under Motion.

Chroma (idle or burst) hides the solid stroke and draws cyan/magenta copies offset 2→5px like SeshHub’s PFP ring, scaled to the shape so the editor and overlay match (blur and glow stay on those copies). Glitch keeps the stroke and adds the same split plus slice bars. Designer tint does not recolor the C/M copies.
