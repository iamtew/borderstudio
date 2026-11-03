function applyOverlayBackground() {
  if (/OBS/i.test(navigator.userAgent)) document.body.classList.add("obs");
}

function bustFavicon(v) {
  const l = document.querySelector('link[rel="icon"]');
  if (l) l.href = "/favicon.ico?v=" + encodeURIComponent(v || Date.now());
}
fetch("/api/version").then(r => r.json()).then(d => bustFavicon(d.run || d.version)).catch(() => bustFavicon());

function isSmooth(p) { return !!(p && p.smooth); }
function ctrlOut(p) { return isSmooth(p) ? { x: p.ox, y: p.oy } : p; }
function ctrlIn(p) { return isSmooth(p) ? { x: p.ix, y: p.iy } : p; }

// Closed polygon. A smooth vertex uses its handles; a corner is a line.
function pathD(d) {
  const pts = d.points || [];
  if (!pts.length) return "";
  let s = "M" + pts[0].x + " " + pts[0].y;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (!isSmooth(a) && !isSmooth(b)) s += "L" + b.x + " " + b.y;
    else {
      const c1 = ctrlOut(a), c2 = ctrlIn(b);
      s += "C" + c1.x + " " + c1.y + " " + c2.x + " " + c2.y + " " + b.x + " " + b.y;
    }
  }
  return s + "Z";
}

function tracePoly(ctx, pts) {
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (!isSmooth(a) && !isSmooth(b)) ctx.lineTo(b.x, b.y);
    else {
      const c1 = ctrlOut(a), c2 = ctrlIn(b);
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
    }
  }
  ctx.closePath();
}

function kindOf(d) { return d.kind || "polygon"; }

// Idle loops (loop:true) and Effects one-shots. User presets in customAnims use the same shape.
// width/glow/x/y are deltas from the resting stroke (width 1 = unchanged). glow is extra drop-shadow px.
const RECIPES = [
  // Order here is the dropdown order: groups in sequence, gentle to intense inside each.
  { id: "dash", label: "Dash", group: "Dash", loop: true, ms: 1200, ease: "linear", dash: "18 12", keys: [{ t: 0, offset: 0 }, { t: 1, offset: -80 }] },
  { id: "comet", label: "Comet", group: "Travel", loop: true, ms: 2200, ease: "linear", dash: "180 900", keys: [{ t: 0, offset: 0, width: 1.4, glow: 30 }, { t: 1, offset: -1080, width: 1.4, glow: 30 }], fx: [{ id: "head", n: 1, px: 80 }] },
  { id: "breathe", label: "Breathe", group: "Glow", loop: true, ms: 2400, ease: "ease-in-out", keys: [{ t: 0, width: 1, glow: 0 }, { t: 0.5, width: 1.35, glow: 12 }, { t: 1, width: 1, glow: 0 }] },
  { id: "heartbeat", label: "Heartbeat", group: "Glow", loop: true, ms: 1200, ease: "ease-out", keys: [
    { t: 0, width: 1, glow: 0 }, { t: 0.12, width: 1.6, glow: 14 }, { t: 0.28, width: 1, glow: 2 },
    { t: 0.42, width: 1.4, glow: 10 }, { t: 0.65, width: 1, glow: 0 }, { t: 1, width: 1, glow: 0 },
  ] },
  // Tube hum: steady glow, two irregular stutters per cycle.
  { id: "neon", label: "Neon", group: "Glow", loop: true, ms: 3000, ease: "linear", keys: [
    { t: 0, opacity: 1, glow: 10 }, { t: 0.04, opacity: 0.55, glow: 3 }, { t: 0.06, opacity: 1, glow: 10 },
    { t: 0.3, opacity: 1, glow: 12 }, { t: 0.32, opacity: 0.7, glow: 5 }, { t: 0.34, opacity: 1, glow: 10 },
    { t: 0.36, opacity: 0.4, glow: 2 }, { t: 0.38, opacity: 1, glow: 12 }, { t: 0.7, opacity: 0.95, glow: 9 }, { t: 1, opacity: 1, glow: 10 },
  ] },
  { id: "hue", label: "Hue", group: "Color", loop: true, ms: 4000, ease: "linear", keys: [{ t: 0, hue: 0, glow: 8 }, { t: 1, hue: 360, glow: 8 }] },
  { id: "aurora", label: "Aurora", group: "Color", loop: true, ms: 6000, ease: "ease-in-out", keys: [
    { t: 0, hue: 0, glow: 8 }, { t: 0.25, hue: 90, glow: 14 }, { t: 0.5, hue: 180, glow: 8 },
    { t: 0.75, hue: 270, glow: 14 }, { t: 1, hue: 360, glow: 8 },
  ], fx: [{ id: "wave" }] },
  { id: "fire", label: "Fire", group: "Color", loop: true, ms: 900, ease: "steps(1, end)", keys: [
    { t: 0, color: "#FF6A12", glow: 12 }, { t: 0.18, color: "#FF2A0D", glow: 8 },
    { t: 0.22, color: "#FFE53B", glow: 20 }, { t: 0.4, color: "#FF8C1A", glow: 10 },
    { t: 0.55, color: "#FF2A0D", glow: 16 }, { t: 0.72, color: "#FF8C1A", glow: 9 },
    { t: 0.78, color: "#FFE53B", glow: 18 }, { t: 1, color: "#FF6A12", glow: 12 },
  ], fx: [{ id: "fire" }] },
  { id: "chroma", label: "Chroma", group: "Color", loop: true, ms: 2400, ease: "ease-in-out", keys: [
    { t: 0, opacity: 1 }, { t: 1, opacity: 1 },
  ], fx: [{ id: "chroma", px: 2, n: 1 }] },
  // One-shots: fast attack (peak near t=0.2), slow ease-out release.
  { id: "pulse", label: "Pulse", group: "Pulse", ms: 700, ease: "ease-out", keys: [{ t: 0, width: 1, glow: 0 }, { t: 0.25, width: 1.8, glow: 18 }, { t: 1, width: 1, glow: 0 }] },
  { id: "pulse-double", label: "Pulse double", group: "Pulse", ms: 900, ease: "ease-out", keys: [
    { t: 0, width: 1, glow: 0 }, { t: 0.15, width: 1.8, glow: 16 }, { t: 0.45, width: 1, glow: 2 },
    { t: 0.6, width: 1.5, glow: 12 }, { t: 1, width: 1, glow: 0 },
  ] },
  { id: "heartbeat", label: "Heartbeat", group: "Pulse", ms: 1000, ease: "ease-out", keys: [
    { t: 0, width: 1, glow: 0 }, { t: 0.14, width: 2, glow: 18 }, { t: 0.34, width: 1, glow: 2 },
    { t: 0.48, width: 1.55, glow: 12 }, { t: 1, width: 1, glow: 0 },
  ] },
  { id: "flash", label: "Flash", group: "Flash", ms: 400, ease: "ease-out", keys: [{ t: 0, glow: 0 }, { t: 0.25, color: "#fff", glow: 12 }, { t: 1, glow: 0 }] },
  { id: "rainbow-burst", label: "Rainbow burst", group: "Flash", ms: 900, ease: "linear", keys: [
    { t: 0, hue: 0, glow: 16 }, { t: 0.7, hue: 360, glow: 16 }, { t: 1, hue: 360, glow: 0 },
  ] },
  { id: "boom", label: "Boom", group: "Flash", ms: 700, ease: "ease-out", fx: [{ id: "ring" }], keys: [{ t: 0, width: 1, glow: 0 }, { t: 0.18, width: 1.5, glow: 22, color: "#fff" }, { t: 1, width: 1, glow: 0 }] },
  { id: "success", label: "Success", group: "Status", ms: 700, ease: "ease-out", keys: [
    { t: 0, width: 1, glow: 0 }, { t: 0.18, color: "#3dff7a", width: 1.55, glow: 16 }, { t: 0.4, width: 1.05, glow: 4 },
    { t: 0.55, color: "#3dff7a", width: 1.25, glow: 10 }, { t: 1, width: 1, glow: 0 },
  ] },
  { id: "warn", label: "Warn", group: "Status", ms: 700, ease: "ease-out", keys: [
    { t: 0, width: 1, glow: 0 }, { t: 0.18, color: "#ffbf2e", width: 1.55, glow: 16 }, { t: 0.4, width: 1.05, glow: 4 },
    { t: 0.55, color: "#ffbf2e", width: 1.25, glow: 10 }, { t: 1, width: 1, glow: 0 },
  ] },
  { id: "alert", label: "Alert", group: "Status", ms: 800, ease: "ease-out", keys: [
    { t: 0, width: 1, glow: 0 }, { t: 0.16, color: "#ff2d2d", width: 1.7, glow: 18 }, { t: 0.38, width: 1.05, glow: 4 },
    { t: 0.52, color: "#ff2d2d", width: 1.35, glow: 12 }, { t: 1, width: 1, glow: 0 },
  ] },
  { id: "strobe", label: "Strobe", group: "Blink", ms: 800, ease: "steps(1, end)", keys: [
    { t: 0, opacity: 1 }, { t: 0.24, opacity: 1 }, { t: 0.25, opacity: 0.15 }, { t: 0.49, opacity: 0.15 },
    { t: 0.5, opacity: 1 }, { t: 0.74, opacity: 1 }, { t: 0.75, opacity: 0.15 }, { t: 1, opacity: 1 },
  ] },
  // Decaying amplitude so the hit settles instead of stopping dead.
  { id: "shake", label: "Shake", group: "Move", ms: 600, ease: "ease-in-out", keys: [
    { t: 0, x: 0, y: 0 }, { t: 0.1, x: -10, y: 3 }, { t: 0.22, x: 9, y: -4 }, { t: 0.36, x: -7, y: -2 },
    { t: 0.5, x: 5, y: 3 }, { t: 0.65, x: -3, y: -1 }, { t: 0.8, x: 2, y: 1 }, { t: 1, x: 0, y: 0 },
  ] },
  { id: "wipe", label: "Wipe", group: "Sweep", ms: 800, ease: "ease", dash: "2000 2000", keys: [{ t: 0, offset: 2000 }, { t: 1, offset: 0 }] },
  { id: "spark", label: "Spark", group: "Sweep", ms: 600, ease: "ease", dash: "8 14", keys: [{ t: 0, offset: 0, glow: 0 }, { t: 0.5, color: "#fff", glow: 16, offset: -40 }, { t: 1, offset: 0, glow: 0 }], fx: [{ id: "head", n: 1, px: 28 }] },
  { id: "chroma-burst", label: "Chroma burst", group: "Glitch", ms: 700, ease: "ease-in-out", keys: [
    { t: 0, opacity: 1 }, { t: 1, opacity: 1 },
  ], fx: [{ id: "chroma", px: 5, n: 1 }] },
  { id: "glitch", label: "Glitch", group: "Glitch", ms: 500, ease: "steps(1, end)", keys: [
    { t: 0, x: 0, y: 0, opacity: 1 },
    { t: 0.1, x: 6, y: -3 },
    { t: 0.3, x: -8, y: 2 },
    { t: 0.5, x: 3, y: 4 },
    { t: 0.7, x: -4, y: -3 },
    { t: 1, x: 0, y: 0, opacity: 1 },
  ], fx: [{ id: "slices", n: 8 }] },
];

// Dropped recipes still play as the nearest keeper. Same map as store.go animAlias.
const ANIM_ALIAS = {
  "dash-rev": "dash", "dash-fast": "dash", "dots": "dash", "long-dash": "dash", "flow": "dash",
  "scan": "comet", "orbit": "comet", "shimmer": "comet",
  "glow-pulse": "breathe", "rainbow": "hue", "neon-swap": "hue",
  "pulse-soft": "pulse", "pulse-hard": "pulse", "swell": "pulse", "snap": "pulse",
  "shockwave": "boom",
  "flash-white": "flash", "flash-hot": "flash", "flash-cold": "flash", "whiteout": "flash", "lightning": "flash",
  "blink": "strobe", "flicker": "strobe",
  "jolt": "shake",
  "reverse-wipe": "wipe",
};

function canonAnim(id) {
  return ANIM_ALIAS[id] || id;
}

const MOTION_KINDS = RECIPES.filter(r => r.loop).map(r => ({ id: r.id, label: r.label, group: r.group }));
const EVENT_ANIMS = RECIPES.filter(r => !r.loop).map(r => ({ id: r.id, label: r.label, ms: r.ms, group: r.group }));
// Same list as fxBtnColors in store.go. Unknown/empty → first chip.
const FX_BTN_COLORS = ["#5c6570", "#6b7c8d", "#a33b3b", "#b45a2a", "#b0892e", "#4f7a4a", "#2f7a7a", "#4a5ea8", "#7a4a8a", "#a85a72", "#3e464e", "#8a96a3", "#4d5c6b", "#8fa0b0", "#7a2c2c", "#c45c5c", "#8a4420", "#d07848", "#7a6220", "#c9a44a", "#35563a", "#6fa06a", "#1f5555", "#4a9a9a", "#354478", "#6b7fc4", "#5a365e", "#a070b0", "#7a4054", "#c47a90"];

function fxBtnColor(hex) {
  const h = String(hex || "").toLowerCase();
  return FX_BTN_COLORS.includes(h) ? h : FX_BTN_COLORS[0];
}

function fxFireUrl(id) {
  return location.origin + "/fx/" + encodeURIComponent(id || "");
}

function paintFxBtn(el, hex) {
  el.style.setProperty("--fx", fxBtnColor(hex));
}

function nextFxBtn(events) {
  events = events || [];
  const used = new Set(events.map((e) => fxBtnColor(e.btn)));
  return FX_BTN_COLORS.find((c) => !used.has(c)) || FX_BTN_COLORS[events.length % FX_BTN_COLORS.length];
}

let customAnims = [];
let liveDesign = null;

function recipeById(id, loop) {
  const want = !!loop;
  id = canonAnim(id);
  return RECIPES.find(r => r.id === id && !!r.loop === want)
    || (customAnims || []).find(r => r.id === id && !!r.loop === want)
    || null;
}

function eventCatalog() {
  return EVENT_ANIMS.concat((customAnims || []).filter(r => !r.loop));
}

function motionOf(d) {
  const id = canonAnim(d.motion || (d.dash ? "dash" : "none"));
  if (id === "none") return "none";
  return recipeById(id, true) ? id : "none";
}

// Total length of one dash cycle. An odd list repeats twice per cycle (SVG spec).
function dashPeriod(dash) {
  const n = String(dash || "").trim().split(/[\s,]+/).map(Number).filter(v => v > 0);
  const sum = n.reduce((a, b) => a + b, 0);
  return n.length % 2 ? sum * 2 : sum;
}

// Loop end offset snapped to a whole number of dash cycles, so the loop point is invisible.
function seamOffset(dash, from, to) {
  const p = dashPeriod(dash);
  const delta = to - from;
  if (!p || !delta) return to;
  return from + (Math.round(delta / p) || Math.sign(delta)) * p;
}

function fxOf(recipe, id) {
  return (recipe.fx || []).find(f => f.id === id) || null;
}

function dashMarks(dash) {
  const n = String(dash || "").trim().split(/[\s,]+/).map(Number).filter(v => v > 0);
  return { on: n[0] || 0, off: n[1] || 0 };
}

function recipeExtras(src) {
  const m = dashMarks(src && src.dash);
  const head = fxOf(src, "head");
  const chroma = fxOf(src, "chroma");
  const out = {};
  if (m.on && m.off) {
    out.dashOn = m.on;
    out.dashOff = m.off;
  }
  if (head) out.head = head.px != null ? head.px : 0;
  if (chroma) out.split = chroma.px != null ? chroma.px : 0;
  return out;
}

function tintOk(src) {
  if (!src) return false;
  const keys = (src.base && src.base.length ? src.base : src.keys) || [];
  if (keys.some(k => k.hue != null && k.hue !== "")) return false;
  return !fxOf(src, "fire") && !fxOf(src, "chroma");
}

function applyTuneExtras(base, tune) {
  const on = Number(tune.dashOn);
  const off = Number(tune.dashOff);
  if (on > 0 && off > 0 && base.dash) base.dash = on + " " + off;
  if (tune.head != null && tune.head !== "") {
    const px = Number(tune.head);
    const f = fxOf(base, "head");
    if (f && px === px) f.px = px;
  }
  if (tune.split != null && tune.split !== "") {
    const px = Number(tune.split);
    const f = fxOf(base, "chroma");
    if (f && px === px) f.px = px;
  }
}

function recipeBase(recipe) {
  const keys = recipe.base && recipe.base.length ? recipe.base : (recipe.keys || []);
  return {
    from: recipe.from || recipe.id,
    loop: !!recipe.loop,
    group: recipe.group || "",
    dash: recipe.dash || "",
    ms: recipe.ms,
    ease: recipe.ease || "ease",
    fx: (recipe.fx || []).map(f => Object.assign({}, f)),
    keys: keys.map(k => Object.assign({}, k)),
  };
}

function recipeTuned(src, tune, loop) {
  if (!src) return null;
  if (!tune) return src;
  const base = recipeBase(src);
  applyTuneExtras(base, tune);
  const baked = bakeRecipe(base, {
    label: src.label,
    ms: tune.ms,
    ease: tune.ease,
    color: tintOk(src) ? (tune.color || "") : "",
    strength: tune.strength != null ? tune.strength : 1,
  });
  baked.id = src.id;
  baked.loop = !!loop;
  return baked;
}

function recipeForMotion(design) {
  const id = motionOf(design);
  if (id === "none") return null;
  return recipeTuned(recipeById(id, true), design.motionTune, true);
}

// A group with an empty label puts its options straight in the select (no optgroup header).
function fillGrouped(sel, groups) {
  sel.replaceChildren();
  groups.forEach(group => {
    if (!group.items.length) return;
    const g = group.label ? document.createElement("optgroup") : sel;
    if (group.label) g.label = group.label;
    group.items.forEach(m => {
      const o = document.createElement("option");
      o.value = m.id;
      o.textContent = m.label;
      g.appendChild(o);
    });
    if (g !== sel) sel.appendChild(g);
  });
}

// [{group, ...}] -> [{label, items}] in first-seen order, so RECIPES order drives the dropdowns.
function byGroup(list) {
  const groups = [];
  list.forEach(a => {
    let g = groups.find(x => x.label === a.group);
    if (!g) { g = { label: a.group, items: [] }; groups.push(g); }
    g.items.push(a);
  });
  return groups;
}

function fillMotionSelect(sel, value) {
  fillGrouped(sel, [{ label: "", items: [{ id: "none", label: "None" }] }]
    .concat(byGroup(MOTION_KINDS), [{ label: "Mine", items: (customAnims || []).filter(r => r.loop) }]));
  value = canonAnim(value);
  const ok = value === "none" || !!recipeById(value, true);
  sel.value = ok ? value : "none";
}

function fillEventAnimSelect(sel, value) {
  fillGrouped(sel, byGroup(EVENT_ANIMS).concat([{ label: "Mine", items: (customAnims || []).filter(r => !r.loop) }]));
  value = canonAnim(value);
  sel.value = eventCatalog().some(a => a.id === value) ? value : "pulse";
}

// Copy a built-in, then scale every delta from rest. base.keys stay unscaled so strength is not compounded.
function bakeRecipe(base, opts) {
  const s = Number(opts.strength);
  const strength = s === s ? s : 1;
  const keys = (base.keys || []).map(k => {
    const o = Object.assign({}, k);
    if (o.width != null) o.width = 1 + (o.width - 1) * strength;
    if (o.glow != null) o.glow *= strength;
    if (o.x != null) o.x *= strength;
    if (o.y != null) o.y *= strength;
    if (o.rot != null) o.rot *= strength;
    if (o.opacity != null) o.opacity = Math.max(0, Math.min(1, 1 + (o.opacity - 1) * strength));
    if (o.offset != null) o.offset *= strength;
    if (o.hue != null) o.hue *= strength;
    return o;
  });
  const color = opts.color || "";
  if (color) keys.forEach(k => { k.color = color; delete k.hue; });
  return {
    label: opts.label,
    loop: !!base.loop,
    group: base.group || (base.loop ? "" : "Mine"),
    ms: Number(opts.ms) || base.ms || 600,
    ease: opts.ease || base.ease || "ease",
    dash: base.dash || "",
    from: base.from || "",
    strength: strength,
    color: color,
    base: (base.keys || []).map(k => Object.assign({}, k)),
    keys: keys,
    fx: (base.fx || []).map(f => Object.assign({}, f)),
  };
}

function makeShape(ns, d) {
  const k = kindOf(d);
  if (k === "circle") {
    const el = document.createElementNS(ns, "circle");
    const r = Math.min(d.w, d.h) / 2;
    el.setAttribute("cx", d.x + d.w / 2);
    el.setAttribute("cy", d.y + d.h / 2);
    el.setAttribute("r", String(Math.max(0, r)));
    return el;
  }
  if (k === "oval") {
    const el = document.createElementNS(ns, "ellipse");
    el.setAttribute("cx", d.x + d.w / 2);
    el.setAttribute("cy", d.y + d.h / 2);
    el.setAttribute("rx", String(Math.max(0, d.w / 2)));
    el.setAttribute("ry", String(Math.max(0, d.h / 2)));
    return el;
  }
  if (k === "roundrect") {
    const el = document.createElementNS(ns, "rect");
    const rr = Math.max(0, Math.min(d.r || 0, Math.min(d.w, d.h) / 2));
    el.setAttribute("x", d.x); el.setAttribute("y", d.y);
    el.setAttribute("width", d.w); el.setAttribute("height", d.h);
    el.setAttribute("rx", String(rr)); el.setAttribute("ry", String(rr));
    return el;
  }
  const el = document.createElementNS(ns, "path");
  el.setAttribute("d", pathD(d));
  return el;
}

function renderBorder(svg, d, opts) {
  const handles = opts && opts.handles;
  const pad = (opts && opts.pad) || 0;
  const padX = opts && opts.padX != null ? opts.padX : pad;
  const padY = opts && opts.padY != null ? opts.padY : pad;
  const scale = opts && opts.scale ? opts.scale : 1;
  const vw = (opts && opts.overlayW) || (d.width + 2 * padX);
  const vh = (opts && opts.overlayH) || (d.height + 2 * padY);
  svg.setAttribute("viewBox", "0 0 " + vw + " " + vh);
  svg.replaceChildren();
  const ns = "http://www.w3.org/2000/svg";
  let root = svg;
  if (padX || padY || scale !== 1) {
    const g = document.createElementNS(ns, "g");
    g.setAttribute("transform", "translate(" + padX + " " + padY + ") scale(" + scale + ")");
    svg.appendChild(g);
    root = g;
  }
  const ui = (opts && opts.ui) || (handles ? svg : null);
  if (handles) {
    const hole = makeShape(ns, d);
    hole.setAttribute("class", "hole");
    root.appendChild(hole);
  }

  if (handles && ui) {
    let hroot = ui;
    if (ui !== svg) {
      ui.setAttribute("viewBox", svg.getAttribute("viewBox"));
      ui.replaceChildren();
      hroot = ui;
    }
    if (kindOf(d) === "polygon") {
      const pts = d.points || [];
      const sp = pts[opts.sel];
      if (sp && sp.smooth) {
        [[sp.ix, sp.iy], [sp.ox, sp.oy]].forEach(([hx, hy]) => {
          const ln = document.createElementNS(ns, "line");
          ln.setAttribute("x1", sp.x); ln.setAttribute("y1", sp.y);
          ln.setAttribute("x2", hx); ln.setAttribute("y2", hy);
          ln.setAttribute("class", "arm");
          hroot.appendChild(ln);
        });
        [["in", sp.ix, sp.iy], ["out", sp.ox, sp.oy]].forEach(([name, hx, hy]) => {
          const h = document.createElementNS(ns, "circle");
          h.setAttribute("cx", hx); h.setAttribute("cy", hy); h.setAttribute("r", 7);
          h.setAttribute("class", "handle bez");
          h.dataset.h = name;
          h.dataset.i = String(opts.sel);
          hroot.appendChild(h);
        });
      }
      pts.forEach((p, i) => {
        const h = document.createElementNS(ns, "circle");
        h.setAttribute("cx", p.x); h.setAttribute("cy", p.y); h.setAttribute("r", 10);
        h.setAttribute("class", "handle" + (p.smooth ? " smooth" : "") + (opts.sel === i ? " sel" : ""));
        h.dataset.i = String(i);
        hroot.appendChild(h);
      });
    } else {
      const x = d.x, y = d.y, w = d.w, hgt = d.h;
      const spots = [
        ["nw", x, y], ["n", x + w / 2, y], ["ne", x + w, y],
        ["e", x + w, y + hgt / 2], ["se", x + w, y + hgt],
        ["s", x + w / 2, y + hgt], ["sw", x, y + hgt], ["w", x, y + hgt / 2],
      ];
      spots.forEach(([t, hx, hy]) => {
        const h = document.createElementNS(ns, "rect");
        h.setAttribute("x", hx - 6); h.setAttribute("y", hy - 6);
        h.setAttribute("width", 12); h.setAttribute("height", 12);
        h.setAttribute("class", "handle box " + t);
        h.dataset.t = t;
        hroot.appendChild(h);
      });
      if (kindOf(d) === "roundrect") {
        const rr = Math.max(0, Math.min(d.r || 0, Math.min(w, hgt) / 2));
        const h = document.createElementNS(ns, "circle");
        h.setAttribute("cx", x + rr); h.setAttribute("cy", y);
        h.setAttribute("r", 8);
        h.setAttribute("class", "handle rad");
        h.dataset.t = "rad";
        hroot.appendChild(h);
      }
    }
  }
}

function holePath(ctx, d) {
  ctx.beginPath();
  const k = kindOf(d);
  if (k === "circle") {
    ctx.arc(d.x + d.w / 2, d.y + d.h / 2, Math.min(d.w, d.h) / 2, 0, Math.PI * 2);
  } else if (k === "oval") {
    ctx.ellipse(d.x + d.w / 2, d.y + d.h / 2, d.w / 2, d.h / 2, 0, 0, Math.PI * 2);
  } else if (k === "roundrect") {
    const rr = Math.max(0, Math.min(d.r || 0, Math.min(d.w, d.h) / 2));
    ctx.roundRect(d.x, d.y, d.w, d.h, rr);
  } else {
    tracePoly(ctx, d.points);
  }
}

// Mask: full-frame black, white filled hole. OBS Image Mask.
// Feather blurs the hole edge inward; clip keeps white inside the path.
function maskCanvas(d) {
  const c = document.createElement("canvas");
  c.width = d.width;
  c.height = d.height;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, c.width, c.height);
  const feather = Math.max(0, d.feather || 0);
  if (feather) ctx.filter = "blur(" + feather + "px)";
  ctx.fillStyle = "#fff";
  holePath(ctx, d);
  ctx.fill("nonzero");
  ctx.filter = "none";
  if (feather) {
    ctx.globalCompositeOperation = "destination-in";
    holePath(ctx, d);
    ctx.fill("nonzero");
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = "source-over";
  }
  return c;
}

(function recipeTuneCheck() {
  const dash = recipeTuned(recipeById("dash", true), { ms: 1200, ease: "linear", strength: 1, dashOn: 24, dashOff: 8 }, true);
  if (!dash || dash.dash !== "24 8") throw new Error("tune dash");
  const chroma = recipeTuned(recipeById("chroma", true), { ms: 2400, ease: "ease-in-out", strength: 1, split: 7, color: "#ff00ff" }, true);
  const fx = fxOf(chroma, "chroma");
  if (!fx || fx.px !== 7) throw new Error("tune split");
  if ((chroma.keys || []).some(k => k.color === "#ff00ff")) throw new Error("tune chroma tint");
})();

(function maskCheck() {
  const c = maskCanvas({ kind: "roundrect", width: 80, height: 80, x: 20, y: 20, w: 40, h: 40, r: 0, feather: 8 });
  const ctx = c.getContext("2d");
  if (ctx.getImageData(10, 40, 1, 1).data[0] > 2) throw new Error("mask feather spill");
  if (ctx.getImageData(40, 40, 1, 1).data[0] < 250) throw new Error("mask hole");
})();

function fireOverlayAnim(kind, tune) {
  const ink = window.overlayInk || window.designInk;
  if (!ink) return;
  const hit = recipeById(kind, false) || recipeById("pulse", false);
  ink.play(recipeTuned(hit, tune, false), true);
}

function fireNamedEvent(d, id) {
  const evn = ((d && d.events) || []).find((e) => e.id === id);
  fireOverlayAnim(evn ? evn.anim : id, evn && evn.tune);
}
