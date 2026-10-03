function applyOverlayBackground() {
  if (/OBS/i.test(navigator.userAgent)) document.body.classList.add("obs");
}

function bustFavicon(v) {
  const l = document.querySelector('link[rel="icon"]');
  if (l) l.href = "/favicon.ico?v=" + encodeURIComponent(v || Date.now());
}
fetch("/api/version").then(r => r.json()).then(d => bustFavicon(d.run || d.version)).catch(() => bustFavicon());

function pathD(d) {
  return (d.points || []).map((p, i) => (i ? "L" : "M") + p.x + " " + p.y).join(" ") + " Z";
}

function kindOf(d) { return d.kind || "polygon"; }

// Idle loops (loop:true) and controller one-shots. User presets in customAnims use the same shape.
// width/glow/x/y are deltas from the resting stroke (width 1 = unchanged). glow is extra drop-shadow px.
const RECIPES = [
  { id: "dash", label: "Dash", loop: true, ms: 1200, ease: "linear", dash: "18 12", keys: [{ t: 0, offset: 0 }, { t: 1, offset: -80 }] },
  { id: "dash-rev", label: "Dash reverse", loop: true, ms: 1200, ease: "linear", dash: "18 12", keys: [{ t: 0, offset: 0 }, { t: 1, offset: 80 }] },
  { id: "dash-fast", label: "Dash fast", loop: true, ms: 450, ease: "linear", dash: "18 12", keys: [{ t: 0, offset: 0 }, { t: 1, offset: -80 }] },
  { id: "dots", label: "Dots", loop: true, ms: 900, ease: "linear", dash: "2 10", keys: [{ t: 0, offset: 0 }, { t: 1, offset: -80 }] },
  { id: "long-dash", label: "Long dash", loop: true, ms: 1600, ease: "linear", dash: "40 16", keys: [{ t: 0, offset: 0 }, { t: 1, offset: -80 }] },
  { id: "flow", label: "Flow", loop: true, ms: 2400, ease: "linear", dash: "60 40", keys: [{ t: 0, offset: 0 }, { t: 1, offset: -80 }] },
  { id: "scan", label: "Scan", loop: true, ms: 1800, ease: "linear", dash: "48 220", keys: [{ t: 0, offset: 0 }, { t: 1, offset: -80 }] },
  { id: "breathe", label: "Breathe", loop: true, ms: 1800, ease: "ease-in-out", keys: [{ t: 0, width: 1 }, { t: 0.5, width: 1.45 }, { t: 1, width: 1 }] },
  { id: "heartbeat", label: "Heartbeat", loop: true, ms: 1200, ease: "ease-in-out", keys: [{ t: 0, width: 1 }, { t: 0.2, width: 1.7 }, { t: 0.4, width: 1 }, { t: 0.55, width: 1.4 }, { t: 1, width: 1 }] },
  { id: "glow-pulse", label: "Glow pulse", loop: true, ms: 1600, ease: "ease-in-out", keys: [{ t: 0, glow: 0 }, { t: 0.5, glow: 16 }, { t: 1, glow: 0 }] },
  { id: "neon", label: "Neon", loop: true, ms: 2000, ease: "steps(2, end)", keys: [{ t: 0, opacity: 1, glow: 0 }, { t: 0.5, opacity: 0.75, glow: 2 }, { t: 1, opacity: 1, glow: 0 }] },
  { id: "hue", label: "Hue", loop: true, ms: 4000, ease: "linear", keys: [{ t: 0, hue: 0 }, { t: 1, hue: 360 }] },
  { id: "rainbow", label: "Rainbow", loop: true, ms: 3000, ease: "linear", keys: [
    { t: 0, hue: 0 }, { t: 0.16, hue: 60 }, { t: 0.33, hue: 120 },
    { t: 0.5, hue: 180 }, { t: 0.66, hue: 240 }, { t: 0.83, hue: 300 }, { t: 1, hue: 360 },
  ] },
  { id: "shimmer", label: "Shimmer", loop: true, ms: 1400, ease: "ease-in-out", keys: [{ t: 0, opacity: 1 }, { t: 0.5, opacity: 0.4 }, { t: 1, opacity: 1 }] },
  { id: "pulse", label: "Pulse", group: "Pulse", ms: 700, ease: "ease", keys: [{ t: 0, width: 1, glow: 0 }, { t: 0.5, width: 1.8, glow: 16 }, { t: 1, width: 1, glow: 0 }] },
  { id: "pulse-soft", label: "Pulse soft", group: "Pulse", ms: 900, ease: "ease", keys: [{ t: 0, width: 1, glow: 0 }, { t: 0.5, width: 1.35, glow: 10 }, { t: 1, width: 1, glow: 0 }] },
  { id: "pulse-hard", label: "Pulse hard", group: "Pulse", ms: 500, ease: "ease", keys: [{ t: 0, width: 1, glow: 0 }, { t: 0.5, width: 2.4, glow: 24 }, { t: 1, width: 1, glow: 0 }] },
  { id: "pulse-double", label: "Pulse double", group: "Pulse", ms: 900, ease: "ease", keys: [
    { t: 0, width: 1 }, { t: 0.25, width: 1.8 }, { t: 0.5, width: 1 }, { t: 0.75, width: 1.5 }, { t: 1, width: 1 },
  ] },
  { id: "heartbeat", label: "Heartbeat", group: "Pulse", ms: 1000, ease: "ease", keys: [
    { t: 0, width: 1 }, { t: 0.18, width: 2 }, { t: 0.36, width: 1 }, { t: 0.52, width: 1.55 }, { t: 1, width: 1 },
  ] },
  { id: "flash", label: "Flash", group: "Flash", ms: 400, ease: "ease", keys: [{ t: 0 }, { t: 0.5, color: "#fff" }, { t: 1 }] },
  { id: "flash-white", label: "Flash white", group: "Flash", ms: 400, ease: "ease", keys: [{ t: 0, glow: 0 }, { t: 0.4, color: "#fff", glow: 20 }, { t: 0.6, color: "#fff", glow: 20 }, { t: 1, glow: 0 }] },
  { id: "flash-hot", label: "Flash hot", group: "Flash", ms: 450, ease: "ease", keys: [{ t: 0, glow: 0 }, { t: 0.5, color: "#ff4d2e", glow: 18 }, { t: 1, glow: 0 }] },
  { id: "flash-cold", label: "Flash cold", group: "Flash", ms: 450, ease: "ease", keys: [{ t: 0, glow: 0 }, { t: 0.5, color: "#7ad7ff", glow: 18 }, { t: 1, glow: 0 }] },
  { id: "whiteout", label: "Whiteout", group: "Flash", ms: 500, ease: "ease", keys: [{ t: 0, width: 1, glow: 0 }, { t: 0.4, color: "#fff", width: 2.2, glow: 28 }, { t: 1, width: 1, glow: 0 }] },
  { id: "alert", label: "Alert", group: "Alert", ms: 700, ease: "ease", keys: [{ t: 0, width: 1 }, { t: 0.5, color: "#ff2d2d", width: 1.7 }, { t: 1, width: 1 }] },
  { id: "success", label: "Success", group: "Alert", ms: 600, ease: "ease", keys: [{ t: 0, width: 1 }, { t: 0.5, color: "#3dff7a", width: 1.5 }, { t: 1, width: 1 }] },
  { id: "warn", label: "Warn", group: "Alert", ms: 600, ease: "ease", keys: [{ t: 0, width: 1 }, { t: 0.5, color: "#ffbf2e", width: 1.5 }, { t: 1, width: 1 }] },
  { id: "strobe", label: "Strobe", group: "Alert", ms: 800, ease: "steps(1, end)", keys: [
    { t: 0, opacity: 1 }, { t: 0.24, opacity: 1 }, { t: 0.25, opacity: 0.15 }, { t: 0.49, opacity: 0.15 },
    { t: 0.5, opacity: 1 }, { t: 0.74, opacity: 1 }, { t: 0.75, opacity: 0.15 }, { t: 1, opacity: 1 },
  ] },
  { id: "blink", label: "Blink", group: "Alert", ms: 600, ease: "steps(1, end)", keys: [
    { t: 0, opacity: 1 }, { t: 0.45, opacity: 1 }, { t: 0.5, opacity: 0 }, { t: 0.95, opacity: 0 }, { t: 1, opacity: 1 },
  ] },
  { id: "flicker", label: "Flicker", group: "Alert", ms: 500, ease: "steps(1, end)", keys: [
    { t: 0, opacity: 1 }, { t: 0.1, opacity: 0.2 }, { t: 0.2, opacity: 1 }, { t: 0.3, opacity: 0.2 },
    { t: 0.4, opacity: 1 }, { t: 0.55, opacity: 0.2 }, { t: 0.7, opacity: 1 }, { t: 1, opacity: 1 },
  ] },
  { id: "shake", label: "Shake", group: "Hit", ms: 500, ease: "ease", keys: [
    { t: 0, x: 0, y: 0 }, { t: 0.2, x: -6, y: 2 }, { t: 0.4, x: 7, y: -3 }, { t: 0.6, x: -5, y: -2 }, { t: 0.8, x: 4, y: 3 }, { t: 1, x: 0, y: 0 },
  ] },
  { id: "jolt", label: "Jolt", group: "Hit", ms: 350, ease: "ease", keys: [
    { t: 0, x: 0, y: 0, rot: 0 }, { t: 0.3, x: 10, y: -6, rot: 1 }, { t: 0.6, x: -8, y: 4, rot: 0 }, { t: 1, x: 0, y: 0, rot: 0 },
  ] },
  { id: "swell", label: "Swell", group: "Hit", ms: 700, ease: "ease", keys: [{ t: 0, width: 1 }, { t: 0.5, width: 2.1 }, { t: 1, width: 1 }] },
  { id: "snap", label: "Snap", group: "Hit", ms: 400, ease: "ease", keys: [{ t: 0, width: 1 }, { t: 0.4, width: 0.4 }, { t: 0.7, width: 1.9 }, { t: 1, width: 1 }] },
  { id: "wipe", label: "Wipe", group: "Hit", ms: 800, ease: "ease", dash: "2000 2000", keys: [{ t: 0, offset: 2000 }, { t: 1, offset: 0 }] },
  { id: "reverse-wipe", label: "Reverse wipe", group: "Hit", ms: 800, ease: "ease", dash: "2000 2000", keys: [{ t: 0, offset: 0 }, { t: 1, offset: 2000 }] },
  { id: "rainbow-burst", label: "Rainbow burst", group: "Glitch", ms: 900, ease: "linear", keys: [
    { t: 0, color: "#ff3b3b" }, { t: 0.2, color: "#ff9f1c" }, { t: 0.4, color: "#e6f350" },
    { t: 0.6, color: "#2ec4b6" }, { t: 0.8, color: "#c77dff" }, { t: 1 },
  ] },
  { id: "glitch", label: "Glitch", group: "Glitch", ms: 500, ease: "steps(1, end)", keys: [
    { t: 0, x: 0, y: 0, opacity: 1 },
    { t: 0.1, x: 8, y: -4, color: "#fff" },
    { t: 0.3, x: -10, y: 3, opacity: 0.4 },
    { t: 0.5, x: 4, y: 6, color: "#7ad7ff" },
    { t: 0.7, x: -6, y: -5 },
    { t: 1, x: 0, y: 0, opacity: 1 },
  ], fx: [{ id: "chroma", px: 6 }, { id: "slices", n: 5 }] },
  { id: "spark", label: "Spark", group: "Glitch", ms: 600, ease: "ease", dash: "8 14", keys: [{ t: 0, offset: 0, glow: 0 }, { t: 0.5, color: "#fff", glow: 16, offset: -40 }, { t: 1, offset: 0, glow: 0 }] },
  { id: "boom", label: "Boom", group: "Glitch", ms: 700, ease: "ease", keys: [{ t: 0, width: 1, glow: 0 }, { t: 0.4, width: 2.6, glow: 28, color: "#fff" }, { t: 1, width: 1, glow: 0 }] },
];

const MOTION_KINDS = [{ id: "none", label: "None" }].concat(RECIPES.filter(r => r.loop).map(r => ({ id: r.id, label: r.label })));
const EVENT_ANIMS = RECIPES.filter(r => !r.loop).map(r => ({ id: r.id, label: r.label, ms: r.ms, group: r.group }));

let customAnims = [];
let liveDesign = null;
let playToken = 0;
let sliceTimer = 0;

function recipeById(id, loop) {
  const want = !!loop;
  return RECIPES.find(r => r.id === id && !!r.loop === want)
    || (customAnims || []).find(r => r.id === id && !!r.loop === want)
    || null;
}

function eventCatalog() {
  return EVENT_ANIMS.concat((customAnims || []).filter(r => !r.loop));
}

function motionOf(d) {
  const id = d.motion || (d.dash ? "dash" : "none");
  if (id === "none") return "none";
  return recipeById(id, true) ? id : "none";
}

function userScale(el) {
  const svg = el && el.ownerSVGElement;
  const vb = svg && svg.viewBox && svg.viewBox.baseVal;
  const w = svg && svg.getBoundingClientRect().width;
  if (!vb || !vb.width || !w) return 1;
  return w / vb.width;
}

function recipeFrames(recipe, design, scale) {
  const sc = scale || 1;
  const sw = (design && design.strokeWidth) || 12;
  const baseGlow = (design && design.glow) || 0;
  const stroke = (design && design.stroke) || "#e6f350";
  const keys = (recipe.keys && recipe.keys.length ? recipe.keys : [{ t: 0 }, { t: 1 }]).slice().sort((a, b) => a.t - b.t);
  const has = (p) => keys.some(k => k[p] != null && k[p] !== "");
  const useW = has("width"), useOp = has("opacity"), useC = has("color"), useOff = has("offset");
  const useG = has("glow"), useH = has("hue"), useT = has("x") || has("y") || has("rot");
  return keys.map(k => {
    const f = { offset: k.t };
    if (useW) f.strokeWidth = (sw * (k.width != null ? k.width : 1) * sc) + "px";
    if (useOp) f.opacity = Math.max(0, Math.min(1, k.opacity != null ? k.opacity : 1));
    if (useC) f.stroke = k.color || stroke;
    if (useOff) f.strokeDashoffset = ((k.offset != null ? k.offset : 0) * sc) + "px";
    if (useG || useH) {
      const g = baseGlow + (k.glow || 0);
      let filter = "drop-shadow(0 0 " + g + "px " + (k.color || stroke) + ")";
      if (useH) filter = "hue-rotate(" + (k.hue || 0) + "deg) " + filter;
      f.filter = filter;
    }
    if (useT) f.transform = "translate(" + (k.x || 0) + "px, " + (k.y || 0) + "px) rotate(" + (k.rot || 0) + "deg)";
    return f;
  });
}

function clearFx(svg) {
  if (sliceTimer) { clearInterval(sliceTimer); sliceTimer = 0; }
  if (!svg) return;
  svg.querySelectorAll(".bs-chroma-copy, .bs-slices").forEach(n => n.remove());
}

function fxOf(recipe, id) {
  return (recipe.fx || []).find(f => f.id === id) || null;
}

function mountChroma(el, px) {
  const ns = "http://www.w3.org/2000/svg";
  const made = [];
  [[px, "#ff3355"], [-px, "#33aaff"]].forEach(([dx, color]) => {
    const g = document.createElementNS(ns, "g");
    g.setAttribute("class", "bs-chroma-copy");
    g.setAttribute("transform", "translate(" + dx + " 0)");
    g.style.pointerEvents = "none";
    const node = el.cloneNode(true);
    node.setAttribute("class", "bs-chroma-ink");
    node.setAttribute("stroke", color);
    node.style.filter = "none";
    node.style.mixBlendMode = "screen";
    g.appendChild(node);
    el.parentNode.insertBefore(g, el);
    made.push(node);
  });
  return made;
}

function mountSlices(svg, design, n, ms) {
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("class", "bs-slices");
  g.style.pointerEvents = "none";
  svg.appendChild(g);
  const colors = ["#ffffff", "#7ad7ff", "#ff4d2e", "#ff00ff"];
  const w = (design && design.width) || 1920;
  const h = (design && design.height) || 1080;
  const step = () => {
    g.replaceChildren();
    for (let i = 0; i < n; i++) {
      const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      r.setAttribute("x", String((Math.random() - 0.5) * 80));
      r.setAttribute("y", String(Math.random() * h));
      r.setAttribute("width", String(w));
      r.setAttribute("height", String(6 + Math.random() * 22));
      r.setAttribute("fill", colors[i % colors.length]);
      r.setAttribute("opacity", "0.8");
      g.appendChild(r);
    }
  };
  step();
  // ponytail: one global timer, fine while a single overlay plays one recipe
  sliceTimer = setInterval(step, Math.max(40, (ms || 500) / 6));
}

function safeAnimate(el, frames, timing) {
  try { return el.animate(frames, timing); }
  catch (e) {
    try { return el.animate(frames, Object.assign({}, timing, { easing: "linear" })); }
    catch (e2) { return null; }
  }
}

function playRecipe(el, design, recipe, once) {
  const token = ++playToken;
  if (design) liveDesign = design;
  const svg = el.ownerSVGElement;
  el.getAnimations().forEach(a => a.cancel());
  clearFx(svg);
  if (!recipe) {
    el.removeAttribute("stroke-dasharray");
    return;
  }
  if (recipe.dash) el.setAttribute("stroke-dasharray", recipe.dash);
  else el.removeAttribute("stroke-dasharray");
  const frames = recipeFrames(recipe, design || liveDesign || {}, userScale(el));
  const timing = {
    duration: Math.max(100, recipe.ms || 600),
    easing: recipe.ease || "ease",
    iterations: once ? 1 : Infinity,
    fill: "forwards",
  };
  const chroma = fxOf(recipe, "chroma");
  const copies = chroma && chroma.px ? mountChroma(el, chroma.px) : [];
  const slices = fxOf(recipe, "slices");
  if (slices && slices.n && svg) mountSlices(svg, design || liveDesign, slices.n, recipe.ms);
  const anim = safeAnimate(el, frames, timing);
  const copyFrames = frames.map(f => {
    const o = Object.assign({}, f);
    delete o.stroke;
    delete o.filter;
    return o;
  });
  copies.forEach(c => safeAnimate(c, copyFrames, timing));
  if (once && anim) {
    anim.onfinish = () => {
      if (token !== playToken) return;
      playIdle(el, liveDesign);
    };
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
    fx: recipe.fx || [],
    keys: keys.map(k => Object.assign({}, k)),
  };
}

function recipeForMotion(design) {
  const id = motionOf(design);
  if (id === "none") return null;
  const src = recipeById(id, true);
  if (!src) return null;
  const tune = design.motionTune;
  if (!tune) return src;
  const baked = bakeRecipe(recipeBase(src), {
    label: src.label,
    ms: tune.ms,
    ease: tune.ease,
    color: tune.color || "",
    strength: tune.strength != null ? tune.strength : 1,
  });
  baked.id = src.id;
  baked.loop = true;
  return baked;
}

function playIdle(el, design) {
  if (!el) return;
  playRecipe(el, design, design ? recipeForMotion(design) : null, false);
}

function styleStroke(el, d) {
  el.setAttribute("class", "border-path");
  el.setAttribute("fill", "none");
  el.setAttribute("stroke", d.stroke || "#e6f350");
  el.setAttribute("stroke-width", String(d.strokeWidth || 12));
  el.setAttribute("stroke-linejoin", "round");
  el.style.setProperty("--sw", (d.strokeWidth || 12) + "px");
  el.style.setProperty("--glow", (d.glow || 0) + "px");
  el.style.setProperty("--stroke", d.stroke || "#e6f350");
}

function fillGrouped(sel, groups) {
  sel.replaceChildren();
  groups.forEach(group => {
    if (!group.items.length) return;
    const g = document.createElement("optgroup");
    g.label = group.label;
    group.items.forEach(m => {
      const o = document.createElement("option");
      o.value = m.id;
      o.textContent = m.label;
      g.appendChild(o);
    });
    sel.appendChild(g);
  });
}

function fillMotionSelect(sel, value) {
  const mine = (customAnims || []).filter(r => r.loop);
  fillGrouped(sel, [
    { label: "Motion", items: MOTION_KINDS },
    { label: "Mine", items: mine },
  ]);
  const ok = value === "none" || !!recipeById(value, true);
  sel.value = ok ? value : "none";
}

function fillEventAnimSelect(sel, value) {
  const groups = [];
  EVENT_ANIMS.forEach(a => {
    let g = groups.find(x => x.label === a.group);
    if (!g) { g = { label: a.group, items: [] }; groups.push(g); }
    g.items.push(a);
  });
  groups.push({ label: "Mine", items: (customAnims || []).filter(r => !r.loop) });
  fillGrouped(sel, groups);
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
  svg.setAttribute("viewBox", "0 0 " + d.width + " " + d.height);
  svg.replaceChildren();
  const ns = "http://www.w3.org/2000/svg";
  if (handles) {
    const defs = document.createElementNS(ns, "defs");
    const pat = document.createElementNS(ns, "pattern");
    pat.setAttribute("id", "checker");
    pat.setAttribute("width", "40");
    pat.setAttribute("height", "40");
    pat.setAttribute("patternUnits", "userSpaceOnUse");
    const a = document.createElementNS(ns, "rect");
    a.setAttribute("width", "40"); a.setAttribute("height", "40"); a.setAttribute("fill", "#2a2a2a");
    const b = document.createElementNS(ns, "rect");
    b.setAttribute("width", "20"); b.setAttribute("height", "20"); b.setAttribute("fill", "#222");
    const c = document.createElementNS(ns, "rect");
    c.setAttribute("x", "20"); c.setAttribute("y", "20"); c.setAttribute("width", "20"); c.setAttribute("height", "20"); c.setAttribute("fill", "#222");
    pat.append(a, b, c);
    defs.appendChild(pat);
    svg.appendChild(defs);
    const bg = document.createElementNS(ns, "rect");
    bg.setAttribute("width", d.width); bg.setAttribute("height", d.height);
    bg.setAttribute("class", "checker");
    svg.appendChild(bg);
    const hole = makeShape(ns, d);
    hole.setAttribute("class", "hole");
    svg.appendChild(hole);
  }

  const path = makeShape(ns, d);
  styleStroke(path, d);
  svg.appendChild(path);
  playIdle(path, d);

  if (handles) {
    if (kindOf(d) === "polygon") {
      (d.points || []).forEach((p, i) => {
        const h = document.createElementNS(ns, "circle");
        h.setAttribute("cx", p.x); h.setAttribute("cy", p.y); h.setAttribute("r", 10);
        h.setAttribute("class", "handle" + (opts.sel === i ? " sel" : ""));
        h.dataset.i = String(i);
        svg.appendChild(h);
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
        svg.appendChild(h);
      });
      if (kindOf(d) === "roundrect") {
        const rr = Math.max(0, Math.min(d.r || 0, Math.min(w, hgt) / 2));
        const h = document.createElementNS(ns, "circle");
        h.setAttribute("cx", x + rr); h.setAttribute("cy", y);
        h.setAttribute("r", 8);
        h.setAttribute("class", "handle rad");
        h.dataset.t = "rad";
        svg.appendChild(h);
      }
    }
  }
}

// Mask: full-frame black, white filled hole. OBS Image Mask.
function maskCanvas(d) {
  const c = document.createElement("canvas");
  c.width = d.width;
  c.height = d.height;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#fff";
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
    d.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
  }
  ctx.fill("nonzero");
  return c;
}

function fireOverlayAnim(kind) {
  const el = document.querySelector(".border-path");
  if (!el) return;
  const hit = recipeById(kind, false) || recipeById("pulse", false);
  playRecipe(el, liveDesign, hit, true);
}
