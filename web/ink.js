// Pixi ink for overlay and Designer.
// SVG still owns handles / hole / camera clip. Recipes stay in shared.js.

function easeUnit(name, t) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const steps = /^steps\((\d+)/.exec(name || "");
  if (steps) {
    const n = Math.max(1, Number(steps[1]) || 1);
    return t >= 1 ? 1 : Math.floor(t * n) / n;
  }
  if (name === "linear") return t;
  if (name === "ease-in") return t * t;
  if (name === "ease-out") return 1 - (1 - t) * (1 - t);
  if (name === "ease-in-out") return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  // CSS ease ~ cubic-bezier(0.25, 0.1, 0.25, 1)
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerp(a, b, t) { return a + (b - a) * t; }

function hexRgb(c) {
  c = String(c || "#e6f350");
  if (c[0] !== "#") c = "#" + c;
  if (c.length === 4) c = "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
  const n = parseInt(c.slice(1, 7), 16);
  if (n !== n) return { r: 230, g: 243, b: 80 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbHex(r, g, b) {
  const h = (n) => ("0" + Math.max(0, Math.min(255, Math.round(n))).toString(16)).slice(-2);
  return "#" + h(r) + h(g) + h(b);
}

function lerpHex(a, b, t) {
  const A = hexRgb(a), B = hexRgb(b);
  return rgbHex(lerp(A.r, B.r, t), lerp(A.g, B.g, t), lerp(A.b, B.b, t));
}

function hueShift(hex, deg) {
  if (!deg) return hex;
  const { r, g, b } = hexRgb(hex);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0, s = 0, l = (max + min) / 510;
  if (d) {
    s = l > 0.5 ? d / (510 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  h = ((h + deg) % 360 + 360) % 360;
  const C = (1 - Math.abs(2 * l - 1)) * s;
  const X = C * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - C / 2;
  let R = 0, G = 0, B = 0;
  if (h < 60) { R = C; G = X; }
  else if (h < 120) { R = X; G = C; }
  else if (h < 180) { G = C; B = X; }
  else if (h < 240) { G = X; B = C; }
  else if (h < 300) { R = X; B = C; }
  else { R = C; B = X; }
  return rgbHex((R + m) * 255, (G + m) * 255, (B + m) * 255);
}

function colorNum(c) {
  try { return new PIXI.Color(c || "#e6f350").toNumber(); }
  catch (e) { return 0xe6f350; }
}

function bez(a, c1, c2, b, t) {
  const u = 1 - t, uu = u * u, tt = t * t;
  return {
    x: uu * u * a.x + 3 * uu * t * c1.x + 3 * u * tt * c2.x + tt * t * b.x,
    y: uu * u * a.y + 3 * uu * t * c1.y + 3 * u * tt * c2.y + tt * t * b.y,
  };
}

function pushLine(raw, x1, y1, x2, y2, step) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 0; i < n; i++) {
    const t = i / n;
    raw.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
  }
}

function pushCubic(raw, a, c1, c2, b, step) {
  const est = Math.hypot(c1.x - a.x, c1.y - a.y) + Math.hypot(c2.x - c1.x, c2.y - c1.y) + Math.hypot(b.x - c2.x, b.y - c2.y);
  const n = Math.max(4, Math.ceil(est / step));
  for (let i = 0; i < n; i++) raw.push(bez(a, c1, c2, b, i / n));
}

function pushArc(raw, cx, cy, rx, ry, a0, a1, step) {
  const arc = Math.abs(a1 - a0) * Math.max(rx, ry);
  const n = Math.max(4, Math.ceil(arc / step));
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    raw.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
}

function sampleDesign(d, step) {
  step = step || 6;
  const raw = [];
  const k = kindOf(d);
  if (k === "circle" || k === "oval") {
    const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
    const rx = k === "circle" ? Math.min(d.w, d.h) / 2 : d.w / 2;
    const ry = k === "circle" ? rx : d.h / 2;
    pushArc(raw, cx, cy, rx, ry, 0, Math.PI * 2, step);
  } else if (k === "roundrect") {
    const x = d.x, y = d.y, w = d.w, h = d.h;
    const r = Math.max(0, Math.min(d.r || 0, Math.min(w, h) / 2));
    if (r < 0.5) {
      pushLine(raw, x + r, y, x + w - r, y, step);
      pushLine(raw, x + w, y + r, x + w, y + h - r, step);
      pushLine(raw, x + w - r, y + h, x + r, y + h, step);
      pushLine(raw, x, y + h - r, x, y + r, step);
    } else {
      pushLine(raw, x + r, y, x + w - r, y, step);
      pushArc(raw, x + w - r, y + r, r, r, -Math.PI / 2, 0, step);
      pushLine(raw, x + w, y + r, x + w, y + h - r, step);
      pushArc(raw, x + w - r, y + h - r, r, r, 0, Math.PI / 2, step);
      pushLine(raw, x + w - r, y + h, x + r, y + h, step);
      pushArc(raw, x + r, y + h - r, r, r, Math.PI / 2, Math.PI, step);
      pushLine(raw, x, y + h - r, x, y + r, step);
      pushArc(raw, x + r, y + r, r, r, Math.PI, Math.PI * 1.5, step);
    }
  } else {
    const pts = d.points || [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (!isSmooth(a) && !isSmooth(b)) pushLine(raw, a.x, a.y, b.x, b.y, step);
      else pushCubic(raw, a, ctrlOut(a), ctrlIn(b), b, step);
    }
  }
  if (raw.length < 2) return { pts: [], length: 0, cx: 0, cy: 0, maxDim: 1 };
  let length = 0, minX = raw[0].x, minY = raw[0].y, maxX = raw[0].x, maxY = raw[0].y;
  const pts = raw.map((p, i) => {
    if (i) length += Math.hypot(p.x - raw[i - 1].x, p.y - raw[i - 1].y);
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    return { x: p.x, y: p.y, s: length };
  });
  const last = raw[raw.length - 1], first = raw[0];
  length += Math.hypot(first.x - last.x, first.y - last.y);
  return {
    pts, length,
    cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
    maxDim: Math.max(maxX - minX, maxY - minY, 1),
    minX, minY, maxX, maxY,
  };
}

function atLen(poly, s) {
  const L = poly.length, pts = poly.pts, n = pts.length;
  if (!n || !L) return { x: 0, y: 0, s: 0, tx: 1, ty: 0 };
  s = ((s % L) + L) % L;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const aS = a.s, bS = i === n - 1 ? L : b.s;
    if (s + 1e-9 >= aS && s <= bS + 1e-9) {
      const seg = bS - aS;
      const t = seg ? (s - aS) / seg : 0;
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: a.x + dx * t, y: a.y + dy * t, s, tx: dx / len, ty: dy / len };
    }
  }
  return { x: pts[0].x, y: pts[0].y, s, tx: 1, ty: 0 };
}

function traceSpan(g, poly, s0, s1) {
  const L = poly.length, pts = poly.pts;
  if (!pts.length) return;
  if (s1 - s0 >= L - 0.5) {
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.lineTo(pts[0].x, pts[0].y);
    return;
  }
  if (s1 < s0) { traceSpan(g, poly, s0, L); traceSpan(g, poly, 0, s1); return; }
  const a = atLen(poly, s0);
  g.moveTo(a.x, a.y);
  for (let i = 0; i < pts.length; i++) {
    const s = pts[i].s;
    if (s > s0 && s < s1) g.lineTo(pts[i].x, pts[i].y);
  }
  const b = atLen(poly, s1);
  g.lineTo(b.x, b.y);
}

function dashWalk(poly, dash, offset, onSeg) {
  const pat = String(dash || "").trim().split(/[\s,]+/).map(Number).filter(v => v > 0);
  const L = poly.length;
  if (!L) return;
  if (!pat.length) { onSeg(0, L); return; }
  let period = pat.reduce((a, b) => a + b, 0);
  if (pat.length % 2) period *= 2;
  let s = 0;
  while (s < L - 0.01) {
    let u = (s + offset) % period;
    if (u < 0) u += period;
    let acc = 0, idx = 0;
    const twice = pat.length * 2;
    while (idx < twice && acc + pat[idx % pat.length] <= u + 1e-9) {
      acc += pat[idx % pat.length];
      idx++;
    }
    const rest = pat[idx % pat.length] - (u - acc);
    const take = Math.min(Math.max(rest, 0.5), L - s);
    if (idx % 2 === 0) onSeg(s, s + take);
    s += take;
  }
}

function keysOf(recipe) {
  const keys = ((recipe && recipe.keys) || [{ t: 0 }, { t: 1 }]).slice().sort((a, b) => a.t - b.t);
  if (recipe && recipe.loop && recipe.dash && keys.length > 1) {
    const last = keys.length - 1;
    const from = keys[0].offset || 0;
    keys[last] = Object.assign({}, keys[last], { offset: seamOffset(recipe.dash, from, keys[last].offset || 0) });
  }
  return keys;
}

function poseAt(recipe, design, u) {
  const stroke = (design && design.stroke) || "#e6f350";
  const keys = keysOf(recipe || {});
  const has = (p) => keys.some(k => k[p] != null && k[p] !== "");
  const def = (k, p, rest) => k[p] != null && k[p] !== "" ? k[p] : rest;
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t < u) i++;
  const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
  const span = (b.t - a.t) || 1;
  const e = easeUnit((recipe && recipe.ease) || "ease", span ? (u - a.t) / span : 1);
  const width = has("width") ? lerp(def(a, "width", 1), def(b, "width", 1), e) : 1;
  const glow = has("glow") ? lerp(def(a, "glow", 0), def(b, "glow", 0), e) : 0;
  const opacity = has("opacity") ? lerp(def(a, "opacity", 1), def(b, "opacity", 1), e) : 1;
  const offset = has("offset") ? lerp(def(a, "offset", 0), def(b, "offset", 0), e) : 0;
  const x = has("x") ? lerp(def(a, "x", 0), def(b, "x", 0), e) : 0;
  const y = has("y") ? lerp(def(a, "y", 0), def(b, "y", 0), e) : 0;
  const rot = has("rot") ? lerp(def(a, "rot", 0), def(b, "rot", 0), e) : 0;
  const hue = has("hue") ? lerp(def(a, "hue", 0), def(b, "hue", 0), e) : 0;
  const color = hueShift(has("color") ? lerpHex(def(a, "color", stroke), def(b, "color", stroke), e) : stroke, hue);
  return { t: u, width, glow, opacity, offset, x, y, rot, hue, color };
}

async function mountInk(host) {
  if (!host || !window.PIXI || !PIXI.Application) {
    console.error("pixi missing");
    return null;
  }
  const w = Math.max(1, host.clientWidth || 1);
  const h = Math.max(1, host.clientHeight || 1);
  async function makeApp(pref) {
    const app = new PIXI.Application();
    await app.init({
      preference: pref,
      backgroundAlpha: 0,
      antialias: pref !== "canvas",
      autoDensity: true,
      resolution: 1,
      width: w,
      height: h,
    });
    return app;
  }
  let app;
  try {
    app = await makeApp("webgl");
  } catch (e) {
    try { app = await makeApp("canvas"); }
    catch (e2) { console.error("pixi", e2); return null; }
  }
  const canvas = app.canvas;
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block;background:transparent";
  host.appendChild(canvas);

  const world = new PIXI.Container();
  const pad = new PIXI.Container();
  const inkRoot = new PIXI.Container();
  const halo = new PIXI.Graphics();
  const core = new PIXI.Graphics();
  const extras = new PIXI.Graphics();
  const fx = new PIXI.Graphics();
  halo.blendMode = "add";
  extras.blendMode = "add";
  fx.blendMode = "screen";
  inkRoot.addChild(halo, core, extras);
  pad.addChild(fx, inkRoot);
  world.addChild(pad);
  app.stage.addChild(world);

  const useGL = app.renderer.type !== 4;
  const Blur = PIXI.BlurFilter;
  const blur = useGL && Blur ? new Blur({ strength: 0, quality: 2 }) : null;

  const ink = {
    design: null,
    view: {},
    recipe: null,
    once: false,
    tMs: 0,
    token: 0,
    poly: { pts: [], length: 0, cx: 0, cy: 0, maxDim: 1 },
    sparks: [],
  };

  function fit() {
    const w = Math.max(1, host.clientWidth || 1);
    const h = Math.max(1, host.clientHeight || 1);
    try { app.renderer.resize(w, h); } catch (e) {}
    const res = app.renderer.resolution || 1;
    const rw = app.renderer.width / res, rh = app.renderer.height / res;
    const d = ink.design;
    const vw = ink.view.overlayW || (d && d.width) || 1920;
    const vh = ink.view.overlayH || (d && d.height) || 1080;
    world.scale.set(rw / vw, rh / vh);
    pad.position.set(ink.view.padX || 0, ink.view.padY || 0);
    pad.scale.set(ink.view.scale || 1);
  }

  function needTick() {
    return !!(ink.recipe && (ink.once || ink.recipe.loop));
  }

  function present() {
    draw(0);
    try { app.renderer.render(app.stage); } catch (e) {}
  }

  function syncTicker() {
    if (needTick()) app.ticker.start();
    else {
      present();
      app.ticker.stop();
    }
  }

  function drawPath(g, poly, dash, offset, s0, s1) {
    if (dash && parseFloat(dash) < 1000) {
      dashWalk(poly, dash, offset, (a, b) => {
        const from = Math.max(a, s0), to = Math.min(b, s1);
        if (to > from) traceSpan(g, poly, from, to);
      });
      return;
    }
    traceSpan(g, poly, s0, s1);
  }

  function spanFor(recipe, pose, poly) {
    const L = poly.length;
    const d0 = parseFloat(recipe && recipe.dash);
    if (d0 >= 1000) {
      const frac = Math.max(0, Math.min(1, recipe.id === "reverse-wipe" ? (pose.offset || 0) / 2000 : 1 - (pose.offset || 0) / 2000));
      if (recipe.id === "reverse-wipe") return { s0: L * (1 - frac), s1: L };
      return { s0: 0, s1: L * frac };
    }
    return { s0: 0, s1: L };
  }

  function strokeStyle(width, color, alpha, join) {
    return { width: Math.max(0.5, width), color: colorNum(color), alpha, cap: "round", join: join || "round" };
  }

  function alongHue(id) {
    return id === "hue" || id === "rainbow" || id === "aurora" || id === "rainbow-burst";
  }

  function drawAlong(g, poly, s0, s1, width, alpha, colorAt) {
    const L = poly.length;
    let s = s0;
    const step = Math.max(8, L / 180);
    while (s < s1) {
      const n = Math.min(s1, s + step);
      const mid = (s + n) / 2;
      g.moveTo(atLen(poly, s).x, atLen(poly, s).y);
      g.lineTo(atLen(poly, n).x, atLen(poly, n).y);
      g.stroke(strokeStyle(width, colorAt(mid / L), alpha));
      s = n;
    }
  }

  function bead(g, p, r, color, alpha) {
    g.circle(p.x, p.y, r);
    g.fill({ color: colorNum(color), alpha });
  }

  function draw(u) {
    try { drawInk(u); } catch (e) { console.error("ink", e); }
  }

  function drawInk(u) {
    const d = ink.design;
    const poly = ink.poly;
    halo.clear(); core.clear(); extras.clear(); fx.clear();
    if (!d || !poly.pts.length) return;
    const recipe = ink.recipe;
    const pose = recipe ? poseAt(recipe, d, u) : { t: 0, width: 1, glow: 0, opacity: 1, offset: 0, x: 0, y: 0, rot: 0, hue: 0, color: d.stroke || "#e6f350" };
    const id = (recipe && recipe.id) || "none";
    const sw = (d.strokeWidth || 12) * pose.width;
    const baseGlow = (d.glow || 0) + pose.glow;
    const blurPx = d.blur || 0;
    let alpha = Math.max(0, Math.min(1, pose.opacity));
    const color = pose.color;
    inkRoot.position.set(poly.cx + pose.x, poly.cy + pose.y);
    inkRoot.pivot.set(poly.cx, poly.cy);
    inkRoot.rotation = pose.rot * Math.PI / 180;
    inkRoot.alpha = 1;

    const chroma = recipe && fxOf(recipe, "chroma");
    const ghost = !!(chroma && (id === "chroma" || id === "chroma-burst"));
    const split0 = chroma && chroma.px ? (ghost ? chroma.px * (poly.maxDim / 192) : chroma.px) : 0;
    const split = split0 ? split0 * (ghost ? 1 + 0.5 * Math.sin(u * Math.PI * 2) : 1) : 0;

    if (id === "neon") extras.blendMode = "add";
    const fireFlick = id === "fire" ? 0.88 + 0.08 * Math.sin(ink.tMs * 0.05) + 0.06 * Math.sin(ink.tMs * 0.13) : 1;
    const glowPx = Math.max(0, baseGlow * fireFlick);

    if (blur) {
      const b = Math.max(0, blurPx);
      blur.blur = b;
      if ("strength" in blur) blur.strength = b;
      inkRoot.filters = b > 0 ? [blur] : null;
    }
    halo.visible = glowPx > 0;
    if (halo.visible && !ghost) {
      const span = spanFor(recipe, pose, poly);
      drawPath(halo, poly, recipe && recipe.dash, pose.offset, span.s0, span.s1);
      halo.stroke(strokeStyle(sw + glowPx * 1.6, color, Math.min(0.85, alpha * 0.55)));
    }

    if (!ghost) {
      const span = spanFor(recipe, pose, poly);
      if (alongHue(id)) {
        drawAlong(core, poly, span.s0, span.s1, sw, alpha, (tt) => hueShift(color, tt * 360));
      } else if (id === "neon-swap") {
        drawPath(core, poly, "", 0, span.s0, span.s1);
        core.stroke(strokeStyle(sw, color, alpha));
        extras.clear();
        const other = color.toLowerCase() === "#00ffff" ? "#FF00FF" : "#00FFFF";
        drawPath(extras, poly, "", 0, span.s0, span.s1);
        extras.stroke(strokeStyle(sw * 0.85, other, 0.35 * alpha));
      } else if (recipe && recipe.dash && parseFloat(recipe.dash) < 1000) {
        drawPath(core, poly, recipe.dash, pose.offset, span.s0, span.s1);
        core.stroke(strokeStyle(sw, color, alpha));
      } else {
        core.poly(poly.pts, true);
        core.stroke(strokeStyle(sw, color, alpha));
      }
    }

    // Traveling dash heads
    if (recipe && recipe.dash && parseFloat(recipe.dash) < 1000 && !ghost) {
      dashWalk(poly, recipe.dash, pose.offset, (a, b) => {
        const head = atLen(poly, id.indexOf("rev") >= 0 ? a : b);
        const r = Math.max(2, sw * (id === "comet" ? 1.1 : 0.45));
        bead(extras, head, r, id === "spark" || id === "comet" ? "#fff" : color, alpha);
        if (id === "scan" || id === "comet") {
          for (let k = 1; k <= 5; k++) {
            const p = atLen(poly, (id.indexOf("rev") >= 0 ? a : b) - k * 14);
            bead(extras, p, r * (1 - k / 6), color, alpha * (1 - k / 6) * 0.5);
          }
        }
      });
    }

    if (id === "comet") {
      const headS = -pose.offset;
      if (ink.sparks.length < 28) {
        ink.sparks.push({ s: headS, life: 1, r: 2 + (ink.tMs % 7) * 0.3 });
      }
      ink.sparks = ink.sparks.filter(p => {
        p.life -= 0.035;
        p.s -= 8;
        if (p.life <= 0) return false;
        bead(extras, atLen(poly, p.s), p.r * p.life, "#fff", p.life * 0.7);
        return true;
      });
    } else if (ink.sparks.length) ink.sparks = [];

    if (id === "orbit") {
      const s = -pose.offset;
      bead(extras, atLen(poly, s), sw * 0.7, pose.color, alpha);
      bead(extras, atLen(poly, s + poly.length / 2), sw * 0.7, pose.color === "#F20D0D" ? "#E5F20D" : "#F20D0D", alpha);
    }

    if (id === "shimmer") {
      bead(extras, atLen(poly, (u * poly.length)), sw * 0.6, "#fff", 0.45 * alpha);
    }

    if (id === "spark") {
      bead(extras, atLen(poly, -pose.offset), sw * 0.8, "#fff", alpha);
      bead(extras, atLen(poly, -pose.offset + 40), sw * 0.45, color, alpha * 0.6);
    }

    const pulse = /pulse|heartbeat|swell|snap|boom|whiteout|shockwave/.test(id);
    if (pulse && pose.width > 1.05) {
      const boom = pose.width - 1;
      drawPath(extras, poly, "", 0, 0, poly.length);
      extras.stroke(strokeStyle(sw * (1 + boom), "#fff", Math.min(0.5, (pose.width - 1) * 0.35) * alpha));
    }
    if (id === "shockwave") {
      const boom = Math.min(1, u / 0.45);
      drawPath(extras, poly, "", 0, 0, poly.length);
      extras.stroke(strokeStyle(sw * (1 + boom * 5), "#fff", 0.55 * (1 - boom) * alpha));
    }

    if (/^flash|lightning|success|warn|alert/.test(id) && pose.glow > 2) {
      drawPath(extras, poly, "", 0, 0, poly.length);
      extras.stroke(strokeStyle(sw * 1.2, color, Math.min(0.7, pose.glow / 40) * alpha));
    }
    if (id === "lightning" && pose.glow > 10) {
      const seed = Math.floor(u * 40);
      for (let i = 0; i < 4; i++) {
        const p = atLen(poly, (seed * 97 + i * 211) % poly.length);
        const nx = -p.ty, ny = p.tx;
        const len = 18 + ((seed + i * 3) % 24);
        extras.moveTo(p.x, p.y);
        extras.lineTo(p.x + nx * len, p.y + ny * len);
        extras.stroke(strokeStyle(2, "#fff", 0.8 * alpha));
      }
    }

    if (split) {
      [[-1, "#00FFFF"], [1, "#FF00FF"]].forEach(([dir, col]) => {
        const op = { pts: poly.pts.map(p => ({ x: p.x + dir * split, y: p.y, s: p.s })), length: poly.length };
        drawPath(fx, op, ghost ? "" : (recipe && recipe.dash), pose.offset, 0, poly.length);
        fx.stroke(strokeStyle(ghost ? sw * 1.4 : sw, col, alpha * 0.85));
      });
    }

    const slices = recipe && fxOf(recipe, "slices");
    if (slices && slices.n) {
      const tick = Math.floor(ink.tMs / Math.max(40, (recipe.ms || 500) / 6));
      const b = poly;
      const w = (b.maxX - b.minX) || 1920, h = (b.maxY - b.minY) || 1080;
      const cols = ["#ffffff", "#7ad7ff", "#ff4d2e", "#ff00ff"];
      for (let i = 0; i < slices.n; i++) {
        const r = ((tick * 13 + i * 47) % 1000) / 1000;
        const r2 = ((tick * 29 + i * 91) % 1000) / 1000;
        fx.rect(b.minX - w * 0.05 + (r - 0.5) * w * 0.08, b.minY + r2 * h, w * 1.1, h * (0.005 + r * 0.025));
        fx.fill({ color: colorNum(cols[i % cols.length]), alpha: 0.5 + r * 0.4 });
      }
    }
  }

  app.ticker.add((tk) => {
    if (!ink.recipe) return;
    ink.tMs += tk.deltaMS;
    const dur = Math.max(100, ink.recipe.ms || 600);
    if (ink.once) {
      const u = ink.tMs / dur;
      if (u >= 1) {
        ink.playIdle(ink.design);
        return;
      }
      draw(u);
    } else {
      draw((ink.tMs / dur) % 1);
    }
  });
  app.ticker.stop();

  ink.setView = function (view) {
    ink.view = view || {};
    fit();
  };
  ink.play = function (recipe, once) {
    ink.recipe = recipe || null;
    ink.once = !!once && !!recipe;
    ink.tMs = 0;
    ink.token++;
    ink.sparks = [];
    if (!ink.recipe) { present(); app.ticker.stop(); return; }
    if (needTick()) { app.ticker.start(); draw(0); }
    else { present(); app.ticker.stop(); }
  };
  ink.playIdle = function (d) {
    ink.design = d;
    liveDesign = d;
    ink.poly = sampleDesign(d);
    fit();
    ink.play(d ? recipeForMotion(d) : null, false);
  };
  ink.destroy = function () {
    try { app.destroy(true); } catch (e) {}
  };

  const ro = new ResizeObserver(() => fit());
  ro.observe(host);
  fit();
  return ink;
}

(function inkCheck() {
  if (Math.abs(easeUnit("linear", 0.5) - 0.5) > 1e-9) throw new Error("ink ease linear");
  if (easeUnit("steps(1, end)", 0.4) !== 0) throw new Error("ink steps");
  if (lerpHex("#000000", "#ffffff", 0.5) !== "#808080") throw new Error("ink lerp");
})();
