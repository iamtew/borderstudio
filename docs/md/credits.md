# Credits

Border Studio is written by **Mikael 'tew'**. Licensed under the [MIT License](https://github.com/iamtew/borderstudio/blob/master/LICENSE).

## In the tree

| Piece | License | Notes |
| --- | --- | --- |
| [PixiJS](https://pixijs.com/) | MIT | Overlay ink and docs landing grid. Vendored as `web/pixi.min.js` and `docs/vendor/pixi.min.js`. |
| [iro.js](https://iro.js.org/) | MPL-2.0 | Color picker. Vendored as `web/iro.min.js`. |
| [Tabler Icons](https://tabler.io/icons) | MIT | UI, tray, and docs icons. Outline SVGs in `web/icons/` and `docs/assets/icons/`. |
| [Geist](https://vercel.com/font) | OFL-1.1 | Docs site type. Variable `woff2` in `docs/assets/fonts/geist/`. |
| [marked](https://marked.js.org/) | MIT | Docs markdown render. Vendored as `docs/vendor/marked.min.js`. |

Full texts sit next to those files (`web/pixi.LICENSE.txt`, `docs/vendor/pixi.LICENSE.txt`, `web/icons/LICENSE.txt`, `docs/assets/fonts/geist/OFL.txt`, `docs/vendor/marked.LICENSE`).

## Go modules

Direct: [coder/websocket](https://github.com/coder/websocket), [Wails v3](https://v3.wails.io/) (native windows + tray), [modernc.org/sqlite](https://gitlab.com/cznic/sqlite). See `go.mod` for the rest.

## OBS

Owned-scene setup needs [Advanced Masks](https://github.com/FiniteSingularity/obs-advanced-masks) in OBS. Not vendored here.
