# Effects

Idle motion lives on **Border → Motion** and loops forever. **Effects** are one-shots: click a button, the overlay plays it once, and the Designer stage previews the same burst.

The **Effects** tab lists those buttons beside the stage. Drag the grip to reorder. The wrench (`Edit effect`) opens that effect’s panel. **Add effect** is at the bottom of the list.

The pad at `http://127.0.0.1:8505/effects` is a grid of the same buttons, in that order. Open it in a small window, on a phone, or as a dock. **Show URLs** overlays each button’s trigger URL so you can copy it onto a Stream Deck.

**Boards**, at the top of the list, are separate from the design. A board is only the effect buttons. Click a name to load that set. The hole and the border stay. **Save** stores the current buttons under **Name** (same name overwrites). **Delete** removes the selected board. **Reset** puts the stock buttons back and leaves saved boards alone. The control window opens on this tab, so you switch boards there without touching the look.

![Designer Effects tab](../assets/screens/designer-effects.png)

A new install already has buttons: Pulse, Double pulse, Heartbeat, Flash, Rainbow, Boom, Success, Warn, Alert, Strobe, Shake, Wipe, Spark, Chroma burst, Glitch. **Add effect** names the new button `Group-Label` (for example `Pulse-Pulse`) until you rename it.

The tray **Effects** item opens a second window already on this tab. Same app, same overlay, same effect buttons. File **Close** on that window only closes the extra window.

## Edit panel

The wrench opens:

- **Back** — return to the button list.
- **Play** — audition on overlay and stage (same as clicking the button).
- **Name** — label on the button.
- **Button** — muted color chip for the list and the pad (gradient to a darker shade). Not the animation tint.
- **Trigger URL** — `http://127.0.0.1:8505/fx/<id>`. GET fires that button. Copy it for Stream Deck.
- **Animation** — which recipe to play (table below).
- **Duration**, **Easing**, **Tint**, **Strength** — same controls as idle motion; sliders have a reset.
- **Preset name** / **Save as preset** / **Delete preset** — custom recipes only; built-in ids cannot be stolen. Motion presets and effect presets share one store, split by whether they loop.
- **Delete effect** — remove this button.

Right-click an effect row for **Delete effect** as well.

## Animations

| Group | One-shots |
| --- | --- |
| Pulse | Pulse soft, Pulse, Pulse hard, Pulse double, Heartbeat, Swell, Snap, Shockwave |
| Flash | Flash, Flash white, Flash hot, Flash cold, Rainbow burst, Whiteout, Boom, Lightning |
| Status | Success, Warn, Alert |
| Blink | Blink, Flicker, Strobe |
| Move | Jolt, Shake |
| Sweep | Wipe, Reverse wipe, Spark |
| Glitch | Chroma burst, Glitch |

Chroma burst hides the solid stroke and draws soft cyan and magenta copies that thicken as they split. Glitch tears the stroke into chunks along the path. Shockwave sends a ring outward; the border itself only flares a little. See [Designer](designer.md) for idle Chroma, Fire, and Glitch notes.

Fire a button while OBS is on the `Border Studio` scene (or any scene that nests it) to see it on stream. The overlay URL must stay alive: leave **Shutdown source when not visible** off on the browser source.

Each button also fires with a GET to `/fx/<id>` (same as **Play** / a pad click). `POST /api/event` with `{"name":"<id>"}` still works.
