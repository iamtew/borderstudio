let d;
let sel = 0;
let saveT;
let stack = [];
let idx = -1;
const SNAP = 12;
const GRIDS = [
  { id: "center", name: "Center", op: 0.55, xs: [0.5], ys: [0.5] },
  { id: "thirds", name: "Thirds", op: 0.4, xs: [1 / 3, 2 / 3], ys: [1 / 3, 2 / 3] },
  { id: "fifths", name: "Fifths", op: 0.35, xs: [1 / 5, 2 / 5, 3 / 5, 4 / 5], ys: [1 / 5, 2 / 5, 3 / 5, 4 / 5] },
  { id: "action", name: "Action safe", op: 0.35, xs: [0.05, 0.95], ys: [0.05, 0.95] },
  { id: "title", name: "Title safe", op: 0.25, xs: [0.1, 0.9], ys: [0.1, 0.9] },
];
const shownGrids = new Set();
const stage = document.getElementById("stage");
const banner = document.getElementById("down-banner");
const menu = document.getElementById("file-menu");
const gridsEl = document.getElementById("grids");

function pushHist() {
  const s = JSON.stringify(d);
  if (idx >= 0 && stack[idx] === s) return;
  stack = stack.slice(0, idx + 1);
  stack.push(s);
  if (stack.length > 80) stack.shift();
  idx = stack.length - 1;
}

function applyHist(s) {
  d = JSON.parse(s);
  sel = Math.min(sel, (d.points && d.points.length) ? d.points.length - 1 : 0);
  paint();
  scheduleSave();
}

function undo() {
  if (idx <= 0) return;
  idx--;
  applyHist(stack[idx]);
}

function redo() {
  if (idx >= stack.length - 1) return;
  idx++;
  applyHist(stack[idx]);
}

function scheduleSave() {
  clearTimeout(saveT);
  saveT = setTimeout(save, 250);
}

async function save() {
  const res = await fetch("/api/design", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
  if (!res.ok) banner.hidden = false;
}

function paint() {
  stage.setAttribute("viewBox", "0 0 " + d.width + " " + d.height);
  renderBorder(stage, d, { handles: true, sel });
  paintStrokeWell();
  document.getElementById("in-width").value = d.strokeWidth;
  document.getElementById("in-glow").value = d.glow;
  fillMotionSelect(document.getElementById("in-motion"), motionOf(d));
  document.getElementById("in-mw").value = d.width;
  document.getElementById("in-mh").value = d.height;
  document.getElementById("mask-prev").src = maskCanvas(d).toDataURL("image/png");
  const k = kindOf(d);
  document.getElementById("in-kind").value = k;
  document.getElementById("in-radius").value = d.r || 0;
  document.body.classList.toggle("shape-poly", k === "polygon");
  document.body.classList.toggle("shape-roundrect", k === "roundrect");
  paintCtrl();
  paintGrids();
}

let ctrlEdit = false;

function paintCtrl() {
  const grid = document.getElementById("ctrl-grid");
  const add = document.getElementById("btn-ev-add");
  const edit = document.getElementById("btn-ctrl-edit");
  document.body.classList.toggle("ctrl-edit", ctrlEdit);
  add.hidden = !ctrlEdit;
  edit.innerHTML = ctrlEdit
    ? '<i class="fa-solid fa-check" aria-hidden="true"></i> Done'
    : '<i class="fa-solid fa-pen" aria-hidden="true"></i> Edit';
  grid.replaceChildren();
  if (ctrlEdit) {
    const head = document.createElement("div");
    head.className = "event-head";
    head.innerHTML = "<span>Button</span><span>Animation</span><span></span>";
    grid.appendChild(head);
  }
  (d.events || []).forEach((ev, i) => {
    if (!ctrlEdit) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = ev.label || ev.id;
      b.onclick = () => fetch("/api/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: ev.id }) });
      grid.appendChild(b);
      return;
    }
    const row = document.createElement("div");
    row.className = "event-row";
    const lab = document.createElement("input");
    lab.value = ev.label;
    lab.placeholder = "Button name";
    lab.setAttribute("aria-label", "Button name");
    lab.onfocus = pushHist;
    lab.onchange = () => { ev.label = lab.value; ev.id = slug(lab.value) || ev.id; scheduleSave(); };
    const anim = document.createElement("select");
    anim.setAttribute("aria-label", "Animation");
    fillEventAnimSelect(anim, ev.anim);
    anim.onfocus = pushHist;
    anim.onchange = () => {
      const prev = EVENT_ANIMS.find(x => x.id === ev.anim);
      const next = EVENT_ANIMS.find(x => x.id === anim.value) || EVENT_ANIMS[0];
      if (!String(ev.label || "").trim() || (prev && ev.label === eventButtonName(prev))) {
        ev.label = eventButtonName(next);
        ev.id = uniqueEventId(slug(ev.label) || next.id, ev);
        lab.value = ev.label;
      }
      ev.anim = anim.value;
      scheduleSave();
    };
    const del = document.createElement("button");
    del.type = "button";
    del.setAttribute("aria-label", "Delete");
    del.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
    del.onclick = () => { pushHist(); d.events.splice(i, 1); paintCtrl(); scheduleSave(); };
    row.append(lab, anim, del);
    grid.appendChild(row);
  });
}

let iroPick = null, iroOn = null;

function closeIro() {
  const pop = document.getElementById("iro-pop");
  if (pop) pop.hidden = true;
  iroOn = null;
}

function colorHex(c) {
  return c.alpha < 1 ? c.hex8String : c.hexString;
}

function parseHex(v) {
  v = String(v || "").trim();
  if (v && v[0] !== "#") v = "#" + v;
  return /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v) ? v : "";
}

function paintColor(btn, hexInp, hex) {
  btn.style.background = hex;
  btn.dataset.color = hex;
  if (hexInp && document.activeElement !== hexInp) hexInp.value = hex;
  const popHex = document.getElementById("iro-hex");
  if (popHex && document.activeElement !== popHex) popHex.value = hex;
}

function paintStrokeWell() {
  paintColor(document.getElementById("in-stroke"), document.getElementById("in-stroke-hex"), d.stroke || "#e6f350");
}

function setStroke(hex) {
  d.stroke = hex;
  paint();
  scheduleSave();
}

function openIro(btn, hexInp, on) {
  const pop = document.getElementById("iro-pop");
  const box = document.getElementById("iro-box");
  const popHex = document.getElementById("iro-hex");
  if (!pop || !box || typeof iro === "undefined") return;
  if (!iroPick) {
    iroPick = new iro.ColorPicker(box, {
      width: 200,
      color: btn.dataset.color || "#ffffff",
      layout: [
        { component: iro.ui.Box },
        { component: iro.ui.Slider, options: { sliderType: "hue" } },
        { component: iro.ui.Slider, options: { sliderType: "alpha" } },
      ],
    });
    iroPick.on("color:change", (c) => { if (iroOn) iroOn(colorHex(c)); });
    if (popHex) popHex.oninput = () => {
      const h = parseHex(popHex.value);
      if (!h || !iroPick) return;
      try { iroPick.color.set(h); } catch (e) {}
    };
  }
  iroOn = (hex) => {
    paintColor(btn, hexInp, hex);
    on(hex);
  };
  try { iroPick.color.set(btn.dataset.color || "#ffffff"); } catch (e) {}
  if (popHex) popHex.value = btn.dataset.color || "#ffffff";
  pop.hidden = false;
  const r = btn.getBoundingClientRect();
  pop.style.left = Math.min(r.left, innerWidth - 240) + "px";
  pop.style.top = Math.min(r.bottom + 6, innerHeight - 520) + "px";
}

const BUILTIN_PALETTES = [
  { id: "basic", name: "Basic", colors: ["#000000", "#ffffff", "#4a4a4a", "#808080", "#c0c0c0", "#ff0000", "#ff8000", "#ffff00", "#00a000", "#0066ff", "#8000ff", "#ff00aa"] },
  { id: "credits", name: "Credits", colors: ["#ffffff", "#f5f0e6", "#e8d5a3", "#ffd700", "#c9a227", "#8b7355", "#2c2c2c", "#111111"] },
  { id: "pastel", name: "Pastel", colors: ["#ffd1dc", "#ffdab9", "#fff1c1", "#c1e1c1", "#c5e3e8", "#b5d3e7", "#e0bbe4", "#f4c2c2"] },
  { id: "neon", name: "Neon", colors: ["#39ff14", "#ff073a", "#00ffff", "#ff00ff", "#ffff00", "#ff6ec7", "#7df9ff", "#ccff00"] },
  { id: "sesh", name: "Sesh Sofa", colors: ["#9AAC62", "#6C754A", "#8600DF", "#E5F20D", "#F20D0D", "#00F53A", "#FF00FF", "#00FFFF", "#E0E0E0", "#666666"] },
  { id: "studio", name: "Studio", colors: ["#e6f350", "#88f25d", "#4dff00", "#111111", "#282828", "#e6e6e6", "#00ffff", "#ff00ff"] },
  { id: "night", name: "Night", colors: ["#0b1020", "#1a2744", "#3d5a80", "#7eb6ff", "#c9d6ff", "#a78bfa", "#f472b6", "#f8fafc"] },
  { id: "warm", name: "Warm", colors: ["#1a0e08", "#4a1c0a", "#b45309", "#f59e0b", "#fbbf24", "#fb7185", "#ea580c", "#fff7ed"] },
  { id: "ice", name: "Ice", colors: ["#082f49", "#0e7490", "#22d3ee", "#67e8f9", "#a5f3fc", "#e0f2fe", "#94a3b8", "#f8fafc"] },
  { id: "hazard", name: "Hazard", colors: ["#111111", "#1c1c1c", "#facc15", "#eab308", "#f97316", "#ffffff", "#78716c", "#450a0a"] },
  { id: "vhs", name: "VHS", colors: ["#1b1028", "#ff71ce", "#01cdfe", "#05ffa1", "#b967ff", "#fffb96", "#c0c0c0", "#3d2b4f"] },
];
let palettes = { selected: "basic", custom: [] };
let setPalId = "";

function allPalettes() {
  return BUILTIN_PALETTES.concat(palettes.custom || []);
}

function paletteById(id) {
  return allPalettes().find((p) => p.id === id) || null;
}

function isCustomPal(id) {
  return (palettes.custom || []).some((p) => p.id === id);
}

async function loadPalettes() {
  try {
    const res = await fetch("/api/palettes");
    if (res.ok) {
      palettes = await res.json();
      palettes.custom = palettes.custom || [];
      palettes.selected = palettes.selected || "basic";
    }
  } catch (e) {}
  fillPaletteUI();
}

async function persistPalettes() {
  try {
    const res = await fetch("/api/palettes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(palettes) });
    if (res.ok) palettes = await res.json();
  } catch (e) {}
  fillPaletteUI();
}

function palSwatches(colors) {
  const wrap = document.createElement("span");
  wrap.className = "set-pal-swatches";
  for (const hex of colors || []) {
    const i = document.createElement("i");
    i.style.background = hex;
    wrap.append(i);
  }
  return wrap;
}

function fillSetPalForm() {
  const nameEl = document.getElementById("set-pal-name");
  const importEl = document.getElementById("set-pal-import");
  const del = document.getElementById("set-pal-del");
  const cur = paletteById(setPalId);
  const custom = isCustomPal(setPalId);
  nameEl.value = cur && custom ? cur.name : "";
  importEl.value = cur && custom ? cur.colors.join("\n") : "";
  del.hidden = !custom;
}

function fillSettingsPalettes() {
  const list = document.getElementById("set-pal-list");
  if (!list) return;
  list.replaceChildren();
  for (const p of allPalettes()) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.id = p.id;
    if (p.id === setPalId) b.classList.add("sel");
    if (!isCustomPal(p.id)) b.classList.add("builtin");
    const name = document.createElement("span");
    name.textContent = p.name + (isCustomPal(p.id) ? "" : " (built-in)");
    b.append(name, palSwatches(p.colors));
    b.onclick = () => {
      setPalId = isCustomPal(p.id) ? p.id : "";
      fillSettingsPalettes();
      fillSetPalForm();
    };
    list.append(b);
  }
  fillSetPalForm();
}

function fillPaletteUI() {
  const sel = document.getElementById("iro-pal-sel");
  const chips = document.getElementById("iro-pal-chips");
  if (!sel || !chips) return;
  sel.replaceChildren();
  for (const p of allPalettes()) {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.name;
    sel.append(o);
  }
  const pick = paletteById(palettes.selected) ? palettes.selected : "basic";
  sel.value = pick;
  chips.replaceChildren();
  const cur = paletteById(pick);
  if (cur) {
    for (const hex of cur.colors) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pal-chip";
      b.style.background = hex;
      b.title = hex;
      b.onclick = (ev) => {
        ev.stopPropagation();
        if (iroOn) iroOn(hex);
        if (iroPick) try { iroPick.color.set(hex); } catch (e) {}
        const popHex = document.getElementById("iro-hex");
        if (popHex) popHex.value = hex;
      };
      chips.append(b);
    }
  }
  fillSettingsPalettes();
}

function settingsOpen() {
  return !document.getElementById("settings-overlay").hidden;
}

function closeSettings() {
  document.getElementById("settings-overlay").hidden = true;
}

function openSettings() {
  setPalId = "";
  fillSettingsPalettes();
  document.getElementById("settings-overlay").hidden = false;
}

function svgPoint(ev) {
  const pt = stage.createSVGPoint();
  pt.x = ev.clientX; pt.y = ev.clientY;
  return pt.matrixTransform(stage.getScreenCTM().inverse());
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function nearestEdge(p) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < d.points.length; i++) {
    const a = d.points[i], b = d.points[(i + 1) % d.points.length];
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1)));
    const q = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    const dd = dist(p, q);
    if (dd < bestD) { bestD = dd; best = i; }
  }
  return best;
}

function snapVal(v, lines) {
  let best = v, gap = SNAP;
  for (const L of lines) {
    const a = Math.abs(v - L);
    if (a < gap) { gap = a; best = L; }
  }
  return best;
}

function gridLines() {
  // Canvas edges always snap; framing lines only when that grid is on.
  const xs = [0, d.width], ys = [0, d.height];
  for (const g of GRIDS) {
    if (!shownGrids.has(g.id)) continue;
    for (const x of g.xs) xs.push(x * d.width);
    for (const y of g.ys) ys.push(y * d.height);
  }
  return { xs, ys };
}

function snapPt(p) {
  const { xs, ys } = gridLines();
  return { x: snapVal(p.x, xs), y: snapVal(p.y, ys) };
}

function paintGrids() {
  let s = "";
  for (const g of GRIDS) {
    if (!shownGrids.has(g.id)) continue;
    const attr = 'stroke="#e6f350" stroke-width="1" stroke-opacity="' + g.op + '" vector-effect="non-scaling-stroke"';
    for (const x of g.xs) s += '<line x1="' + x * 100 + '" y1="0" x2="' + x * 100 + '" y2="100" ' + attr + "/>";
    for (const y of g.ys) s += '<line x1="0" y1="' + y * 100 + '" x2="100" y2="' + y * 100 + '" ' + attr + "/>";
  }
  gridsEl.innerHTML = s ? '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' + s + "</svg>" : "";
}

function addPointAt(p) {
  p = snapPt(p);
  pushHist();
  const i = nearestEdge(p);
  d.points.splice(i + 1, 0, { x: p.x, y: p.y });
  sel = i + 1;
  paint();
  scheduleSave();
}

function polyBox(d) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  (d.points || []).forEach(p => {
    x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y);
  });
  if (!isFinite(x1)) return { x: 80, y: 80, w: d.width - 160, h: d.height - 160 };
  return { x: x1, y: y1, w: Math.max(16, x2 - x1), h: Math.max(16, y2 - y1) };
}

function setKind(k) {
  pushHist();
  const prev = kindOf(d);
  const b = prev === "polygon" ? polyBox(d) : { x: d.x, y: d.y, w: d.w, h: d.h };
  d.kind = k;
  if (k === "polygon") {
    if (prev !== "polygon" || !d.points || d.points.length < 3) {
      d.points = [
        { x: b.x, y: b.y }, { x: b.x + b.w, y: b.y },
        { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h },
      ];
    }
  } else {
    d.x = b.x; d.y = b.y; d.w = b.w; d.h = b.h;
    if (k === "circle") {
      const s = Math.min(b.w, b.h);
      d.x = b.x + (b.w - s) / 2;
      d.y = b.y + (b.h - s) / 2;
      d.w = d.h = s;
    }
    if (k === "roundrect" && !(d.r > 0)) d.r = Math.min(48, Math.min(d.w, d.h) / 4);
  }
  paint();
  scheduleSave();
}

function applyBox(t, p, orig) {
  let { x, y, w, h } = orig;
  if (t === "move") {
    x = snapVal(orig.x + p.x - orig.ox, gridLines().xs);
    y = snapVal(orig.y + p.y - orig.oy, gridLines().ys);
  } else if (t === "rad") {
    d.r = Math.max(0, Math.min(p.x - orig.x, Math.min(orig.w, orig.h) / 2));
    return;
  } else {
    if (t.includes("e")) w = p.x - x;
    if (t.includes("s")) h = p.y - y;
    if (t.includes("w")) { w += x - p.x; x = p.x; }
    if (t.includes("n")) { h += y - p.y; y = p.y; }
    if (w < 16) { if (t.includes("w")) x = orig.x + orig.w - 16; w = 16; }
    if (h < 16) { if (t.includes("n")) y = orig.y + orig.h - 16; h = 16; }
    if (kindOf(d) === "circle") {
      const s = Math.max(w, h);
      if (t.includes("w")) x = orig.x + orig.w - s;
      if (t.includes("n")) y = orig.y + orig.h - s;
      w = h = s;
    }
  }
  d.x = x; d.y = y; d.w = w; d.h = h;
}

let drag = null;
stage.addEventListener("pointerdown", ev => {
  const p = svgPoint(ev);
  const hit = ev.target.closest && ev.target.closest(".handle");
  if (hit) {
    pushHist();
    if (hit.dataset.t) {
      drag = { t: hit.dataset.t, ox: p.x, oy: p.y, x: d.x, y: d.y, w: d.w, h: d.h };
    } else {
      sel = Number(hit.dataset.i);
      drag = sel;
    }
    stage.setPointerCapture(ev.pointerId);
    paint();
    return;
  }
  if (kindOf(d) !== "polygon") {
    if (ev.target.closest && ev.target.closest(".hole, .border-path")) {
      pushHist();
      drag = { t: "move", ox: p.x, oy: p.y, x: d.x, y: d.y, w: d.w, h: d.h };
      stage.setPointerCapture(ev.pointerId);
    }
    return;
  }
  addPointAt(p);
});
stage.addEventListener("pointermove", ev => {
  if (drag == null) return;
  const p = snapPt(svgPoint(ev));
  if (typeof drag === "number") d.points[drag] = { x: p.x, y: p.y };
  else applyBox(drag.t, p, drag);
  paint();
});
stage.addEventListener("pointerup", () => {
  if (drag != null) scheduleSave();
  drag = null;
});

function delPoint() {
  if (kindOf(d) !== "polygon" || d.points.length <= 3) return;
  pushHist();
  d.points.splice(sel, 1);
  sel = Math.min(sel, d.points.length - 1);
  paint();
  scheduleSave();
}

document.getElementById("btn-add").onclick = () => {
  const i = sel;
  const a = d.points[i], b = d.points[(i + 1) % d.points.length];
  addPointAt({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
};
document.getElementById("btn-del").onclick = delPoint;

async function resetDesign() {
  pushHist();
  const res = await fetch("/api/design/reset", { method: "POST" });
  if (!res.ok) { banner.hidden = false; return; }
  d = await res.json();
  sel = 0;
  pushHist();
  paint();
}

document.getElementById("btn-reset").onclick = resetDesign;
document.getElementById("file-reset").onclick = () => { menu.hidden = true; resetDesign(); };

function lookInput(el, fn) {
  el.addEventListener("focus", pushHist);
  el.addEventListener("input", () => { fn(); paint(); scheduleSave(); });
  el.addEventListener("change", () => { fn(); paint(); scheduleSave(); });
}
const strokeBtn = document.getElementById("in-stroke");
const strokeHex = document.getElementById("in-stroke-hex");
strokeBtn.onclick = (ev) => {
  ev.stopPropagation();
  pushHist();
  openIro(strokeBtn, strokeHex, (hex) => setStroke(hex));
};
strokeHex.addEventListener("focus", pushHist);
strokeHex.oninput = () => {
  const h = parseHex(strokeHex.value);
  if (!h) return;
  paintColor(strokeBtn, strokeHex, h);
  if (iroPick && !document.getElementById("iro-pop").hidden) {
    try { iroPick.color.set(h); } catch (e) {}
  }
  setStroke(h);
};
lookInput(document.getElementById("in-width"), () => { d.strokeWidth = Number(document.getElementById("in-width").value) || 1; });
lookInput(document.getElementById("in-glow"), () => { d.glow = Number(document.getElementById("in-glow").value) || 0; });
lookInput(document.getElementById("in-motion"), () => {
  d.motion = document.getElementById("in-motion").value;
  d.dash = d.motion === "dash";
});
lookInput(document.getElementById("in-mw"), () => { d.width = Math.max(16, Number(document.getElementById("in-mw").value) || 1920); });
lookInput(document.getElementById("in-mh"), () => { d.height = Math.max(16, Number(document.getElementById("in-mh").value) || 1080); });
document.getElementById("in-kind").onchange = e => setKind(e.target.value);
lookInput(document.getElementById("in-radius"), () => {
  d.r = Math.max(0, Number(document.getElementById("in-radius").value) || 0);
});

function slug(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function eventButtonName(a) {
  return a.group + "-" + a.label;
}

function uniqueEventId(base, skip) {
  const ids = new Set((d.events || []).filter(e => e !== skip).map(e => e.id));
  const id = base || "event";
  if (!ids.has(id)) return id;
  for (let n = 2; ; n++) if (!ids.has(id + "-" + n)) return id + "-" + n;
}

document.getElementById("btn-ctrl-edit").onclick = () => { ctrlEdit = !ctrlEdit; paintCtrl(); };
document.getElementById("btn-ev-add").onclick = () => {
  pushHist();
  d.events = d.events || [];
  const used = new Set(d.events.map(e => e.anim));
  const a = EVENT_ANIMS.find(x => !used.has(x.id)) || EVENT_ANIMS[0];
  d.events.push({ id: uniqueEventId(slug(eventButtonName(a)) || a.id), label: eventButtonName(a), anim: a.id });
  paintCtrl();
  scheduleSave();
};

document.getElementById("btn-mask").onclick = () => {
  const a = document.createElement("a");
  a.href = maskCanvas(d).toDataURL("image/png");
  a.download = "border-mask.png";
  a.click();
};

function setView(name) {
  document.body.classList.toggle("view-design", name === "design");
  document.body.classList.toggle("view-control", name === "control");
  document.getElementById("view-design").classList.toggle("sel", name === "design");
  document.getElementById("view-control").classList.toggle("sel", name === "control");
  document.title = name === "control" ? "Border Studio Controller" : "Border Studio Designer";
  history.replaceState(null, "", name === "control" ? "/control" : "/admin");
}

document.getElementById("view-design").onclick = () => setView("design");
document.getElementById("view-control").onclick = () => setView("control");

document.getElementById("btn-file").onclick = () => { menu.hidden = !menu.hidden; };
document.getElementById("file-save").onclick = () => { menu.hidden = true; save(); };
document.getElementById("file-settings").onclick = () => {
  menu.hidden = true;
  openSettings();
};
document.getElementById("settings-close").onclick = () => closeSettings();
document.getElementById("settings-overlay").onclick = (ev) => {
  if (ev.target.id === "settings-overlay") closeSettings();
};
document.getElementById("iro-pal-sel").onchange = () => {
  palettes.selected = document.getElementById("iro-pal-sel").value;
  persistPalettes();
};
document.getElementById("set-pal-new").onclick = () => {
  setPalId = "";
  fillSettingsPalettes();
  fillSetPalForm();
  document.getElementById("set-pal-name").focus();
};
document.getElementById("set-pal-del").onclick = () => {
  if (!isCustomPal(setPalId)) return;
  palettes.custom = (palettes.custom || []).filter((p) => p.id !== setPalId);
  if (palettes.selected === setPalId) palettes.selected = "basic";
  setPalId = "";
  persistPalettes();
};
document.getElementById("set-pal-save").onclick = () => {
  const name = document.getElementById("set-pal-name").value.trim();
  const colors = document.getElementById("set-pal-import").value.split(/[\s,]+/).map((tok) => parseHex(tok)).filter(Boolean);
  if (!name) return;
  const editing = isCustomPal(setPalId) ? paletteById(setPalId) : null;
  const clash = (palettes.custom || []).find((p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== (editing && editing.id));
  if (clash) {
    clash.colors = colors;
    setPalId = clash.id;
    palettes.selected = clash.id;
  } else if (editing) {
    editing.name = name;
    editing.colors = colors;
    palettes.selected = editing.id;
  } else {
    const id = "p" + Date.now();
    palettes.custom.push({ id, name, colors });
    setPalId = id;
    palettes.selected = id;
  }
  persistPalettes();
};
document.getElementById("file-close").onclick = () => {
  const api = location.pathname === "/control" ? "/api/controller/close" : "/api/designer/close";
  fetch(api, { method: "POST" });
};
document.getElementById("file-quit").onclick = () => fetch("/api/quit", { method: "POST" });
document.getElementById("btn-copy-overlay").onclick = () => navigator.clipboard.writeText(location.origin + "/overlay");

(function fillGridToggles() {
  const box = document.getElementById("grid-toggles");
  for (const g of GRIDS) {
    const lab = document.createElement("label");
    const c = document.createElement("input");
    c.type = "checkbox";
    c.onchange = () => {
      if (c.checked) shownGrids.add(g.id);
      else shownGrids.delete(g.id);
      paintGrids();
    };
    lab.append(c, document.createTextNode(g.name));
    box.append(lab);
  }
})();

addEventListener("pointerdown", ev => {
  if (ev.target.closest("#iro-pop, .swatch, .color-field")) return;
  closeIro();
});
addEventListener("keydown", ev => {
  const inField = ev.target.matches("input[type=text], textarea");
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") {
    if (inField) return;
    ev.preventDefault();
    if (ev.shiftKey) redo(); else undo();
    return;
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "y") {
    if (inField) return;
    ev.preventDefault();
    redo();
    return;
  }
  if (ev.key === "Escape" && settingsOpen()) {
    ev.preventDefault();
    closeSettings();
    return;
  }
  if (ev.key === "Delete" || ev.key === "Backspace") {
    if (!document.body.classList.contains("view-design")) return;
    if (ev.target.matches("input,textarea,select")) return;
    ev.preventDefault();
    delPoint();
  }
});

async function boot() {
  const v = await fetch("/api/version").then(r => r.json()).catch(() => ({ version: "dev" }));
  document.getElementById("file-version").textContent = v.version;
  const res = await fetch("/api/design");
  d = await res.json();
  await loadPalettes();
  pushHist();
  paint();
  if (location.pathname === "/control") setView("control");
  const es = new EventSource("/api/events?admin=1");
  es.onerror = () => { banner.hidden = false; };
  es.onopen = () => { banner.hidden = true; };
}
boot();
