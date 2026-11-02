(function () {
  var stage = document.getElementById("stage");
  var hero = document.querySelector(".hero");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var YELLOW = 0xe6f350;
  var GREEN = 0x88f25d;
  if (!stage || typeof PIXI === "undefined") return;

  function canvasTexture(draw) {
    var canvas = document.createElement("canvas");
    draw(canvas);
    var texture = PIXI.Texture.from(canvas);
    if (texture.source) texture.source.scaleMode = "nearest";
    return texture;
  }

  // Same 16px pair as #frame in web/style.css.
  var checkTex = canvasTexture(function (canvas) {
    canvas.width = 16;
    canvas.height = 16;
    var g = canvas.getContext("2d");
    g.fillStyle = "#1c1c1c";
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = "#2a2a2a";
    g.fillRect(0, 0, 8, 8);
    g.fillRect(8, 8, 8, 8);
  });

  var glowTex = canvasTexture(function (canvas) {
    canvas.width = 256;
    canvas.height = 256;
    var g = canvas.getContext("2d");
    var rad = g.createRadialGradient(128, 128, 16, 128, 128, 128);
    rad.addColorStop(0, "rgba(230,243,80,0.32)");
    rad.addColorStop(0.4, "rgba(136,242,93,0.12)");
    rad.addColorStop(0.72, "rgba(230,243,80,0.04)");
    rad.addColorStop(1, "rgba(26,26,26,0)");
    g.fillStyle = rad;
    g.fillRect(0, 0, 256, 256);
  });

  var app = new PIXI.Application();
  app
    .init({
      background: "#1c1c1c",
      resizeTo: window,
      antialias: false,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    })
    .then(function () {
      app.canvas.setAttribute("aria-hidden", "true");
      stage.appendChild(app.canvas);

      var check = new PIXI.TilingSprite({ texture: checkTex, width: 10, height: 10 });
      var grid = new PIXI.Graphics();
      var glow = new PIXI.Sprite(glowTex);
      glow.anchor.set(0.5);
      glow.blendMode = "add";

      app.stage.addChild(check);
      app.stage.addChild(grid);
      app.stage.addChild(glow);

      function logo() {
        var w = app.screen.width;
        var h = app.screen.height;
        if (!hero) return { cx: w / 2, cy: h * 0.32, r: h * 0.18 };
        var b = hero.getBoundingClientRect();
        return {
          cx: b.left + b.width / 2,
          cy: b.top + b.height / 2,
          r: Math.max(b.width, b.height) / 2,
        };
      }

      function draw(time) {
        var w = app.screen.width;
        var h = app.screen.height;
        if (w < 2 || h < 2) return;
        check.width = w;
        check.height = h;

        var box = logo();
        var cx = box.cx;
        var cy = box.cy;
        var horizon = Math.min(h * 0.78, cy + box.r * 0.92);

        glow.x = cx;
        glow.y = cy;
        glow.width = box.r * 3.4;
        glow.height = box.r * 3.4;

        grid.clear();
        grid.rect(0, horizon - 2, w, 3).fill({ color: GREEN, alpha: 0.16 });
        var scroll = reduced ? 0.4 : (time * 0.5) % 1;
        var row;
        for (row = 0; row < 16; row++) {
          var z = (row + scroll) / 16;
          var gy = horizon + z * z * (h - horizon);
          if (gy > h) continue;
          grid.moveTo(0, gy).lineTo(w, gy).stroke({
            width: 1,
            color: row % 4 === 0 ? GREEN : YELLOW,
            alpha: 0.08 + z * 0.36,
          });
        }
        var col;
        for (col = -8; col <= 8; col++) {
          grid.moveTo(cx, horizon).lineTo(cx + col * w * 0.14, h).stroke({
            width: 1,
            color: YELLOW,
            alpha: 0.2,
          });
        }

        if (reduced) return;
        check.tilePosition.x = -time * 18;
        check.tilePosition.y = time * 7;
      }

      draw(0.4);
      if (hero && !hero.complete) {
        hero.addEventListener("load", function () {
          draw(0.4);
        });
      }
      app.renderer.on("resize", function () {
        if (reduced) draw(0.4);
      });
      if (reduced) return;

      var time = 0.4;
      app.ticker.add(function (ticker) {
        time += Math.min(ticker.deltaMS / 1000, 0.05);
        draw(time);
      });
    })
    .catch(function () {
      if (app.canvas && app.canvas.parentNode) app.canvas.parentNode.removeChild(app.canvas);
    });
})();
