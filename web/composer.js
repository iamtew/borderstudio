let d;
let sel = 0;
let saveT;
let stack = [];
let idx = -1;
const SNAP_PX = 10;
const GRIDS = [
  { id: "center", name: "Center", op: 0.55, xs: [0.5], ys: [0.5] },
  { id: "thirds", name: "Thirds", op: 0.4, xs: [1 / 3, 2 / 3], ys: [1 / 3, 2 / 3] },
  { id: "fifths", name: "Fifths", op: 0.35, xs: [1 / 5, 2 / 5, 3 / 5, 4 / 5], ys: [1 / 5, 2 / 5, 3 / 5, 4 / 5] },
  { id: "action", name: "Action safe", op: 0.35, xs: [0.05, 0.95], ys: [0.05, 0.95] },
  { id: "title", name: "Title safe", op: 0.25, xs: [0.1, 0.9], ys: [0.1, 0.9] },
];
const shownGrids = new Set();
let sizeCustom = false;
const stage = document.getElementById("stage");
const hits = document.getElementById("hits");
const frame = document.getElementById("frame");
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
  sizeCustom = namedSize() === "custom";
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

// Save/sync state. Designer windows each hold the whole design, so every
// window pulls the server copy on "update" unless it has edits of its own
// in flight (those win, last writer wins).
let saving = 0;       // PUTs in flight
let dirty = false;    // last save failed; resent when the event stream reconnects
let pullAgain = false; // an "update" arrived while we were busy
let lastSeen = "";    // server copy we already hold (stringified)
let maskSnap = "";    // last applied/saved hole; compare to maskOf(d) for unsaved edits

function scheduleSave() {
  clearTimeout(saveT);
  saveT = setTimeout(save, 250);
}

function busy() { return saveT || saving || dirty; }

async function save() {
  clearTimeout(saveT);
  saveT = 0;
  saving++;
  try {
    const res = await fetch("/api/design", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
    dirty = !res.ok;
    if (res.ok) lastSeen = JSON.stringify(await res.json());
  } catch (e) {
    dirty = true;
  }
  saving--;
  if (dirty) banner.hidden = false;
  if (pullAgain && !busy()) pullDesign();
}

async function pullDesign() {
  if (busy()) { pullAgain = true; return; }
  pullAgain = false;
  let s;
  try {
    const res = await fetch("/api/design");
    if (!res.ok) return;
    s = JSON.stringify(await res.json());
  } catch (e) { return; }
  if (s === lastSeen) return;
  if (busy()) { pullAgain = true; return; } // user edited while we fetched
  lastSeen = s;
  d = JSON.parse(s);
  sel = Math.min(sel, (d.points && d.points.length) ? d.points.length - 1 : 0);
  sizeCustom = false;
  maskSnap = JSON.stringify(maskOf(d));
  pushHist();
  paint();
}

async function pullAnims() {
  const before = JSON.stringify(animsDoc);
  await loadAnims();
  if (d && JSON.stringify(animsDoc) !== before) paint();
}

function paint() {
  stage.setAttribute("viewBox", "0 0 " + d.width + " " + d.height);
  renderBorder(stage, d, { handles: true, sel, ui: hits });
  if (window.designInk) {
    window.designInk.setView({ overlayW: d.width, overlayH: d.height });
    if (!fxEdit) window.designInk.playIdle(d);
  }
  paintStrokeWell();
  paintInnerWell();
  fillPair("in-width", "in-width-r", d.strokeWidth);
  fillPair("in-glow", "in-glow-r", d.glow);
  fillPair("in-blur", "in-blur-r", d.blur || 0);
  fillPair("in-inner-width", "in-inner-width-r", d.innerStrokeWidth || 0);
  fillPair("in-inner-blur", "in-inner-blur-r", d.innerBlur || 0);
  fillPair("in-feather", "in-feather-r", d.feather || 0);
  fillMotionSelect(document.getElementById("in-motion"), motionOf(d));
  paintTune();
  fillPair("in-mw", "", d.width);
  fillPair("in-mh", "", d.height);
  paintSize();
  document.getElementById("mask-prev").src = maskCanvas(d).toDataURL("image/png");
  paintCam();
  const k = kindOf(d);
  document.getElementById("in-kind").value = k;
  fillPair("in-radius", "in-radius-r", d.r || 0);
  document.body.classList.toggle("shape-poly", k === "polygon");
  document.body.classList.toggle("shape-roundrect", k === "roundrect");
  paintCtrl();
  paintGrids();
}

let fxEdit = false;
let ctrlSel = 0;

function tuneOfRecipe(src) {
  if (!src) return null;
  return { ms: src.ms, ease: src.ease || "ease", color: src.color || "", strength: src.strength != null ? src.strength : 1 };
}

function paintCtrl() {
  const grid = document.getElementById("ctrl-grid");
  const list = document.getElementById("fx-list");
  const events = d.events || [];
  if (ctrlSel >= events.length) ctrlSel = Math.max(0, events.length - 1);
  if (fxEdit && !events[ctrlSel]) fxEdit = false;
  list.hidden = fxEdit;
  grid.replaceChildren();
  events.forEach((ev, i) => {
    const row = document.createElement("div");
    row.className = "fx-row";
    row.dataset.i = String(i);
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = ev.label || ev.id;
    b.onclick = () => fireFx(ev);
    const wrench = document.createElement("button");
    wrench.type = "button";
    wrench.className = "fx-wrench";
    wrench.title = "Edit effect";
    wrench.setAttribute("aria-label", "Edit " + (ev.label || ev.id));
    wrench.innerHTML = '<span class="ti ti-tool" aria-hidden="true"></span>';
    wrench.onclick = () => openFx(i);
    row.append(b, wrench);
    grid.appendChild(row);
  });
  paintCtrlTune();
  if (fxEdit) requestAnimationFrame(previewCtrl);
}

function fireFx(ev) {
  fetch("/api/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: ev.id }) });
  const ink = window.designInk;
  if (!ink || !d) return;
  const src = recipeById(ev.anim, false) || recipeById("pulse", false);
  ink.play(recipeTuned(src, ev.tune || tuneOfRecipe(src), false), true);
}

function openFx(i) {
  fxEdit = true;
  ctrlSel = i;
  paintCtrl();
}

function delEvent(i) {
  pushHist();
  d.events.splice(i, 1);
  if (ctrlSel >= d.events.length) ctrlSel = Math.max(0, d.events.length - 1);
  if (!d.events.length) fxEdit = false;
  if (!fxEdit && window.designInk) window.designInk.playIdle(d);
  paintCtrl();
  scheduleSave();
}

function closeFx() {
  fxEdit = false;
  if (window.designInk) window.designInk.playIdle(d);
  paintCtrl();
}

function ctrlEvent() {
  return fxEdit && d && d.events && d.events[ctrlSel];
}

function readCtrlTune() {
  return {
    ms: Number(document.getElementById("ctrl-ms").value),
    ease: document.getElementById("ctrl-ease").value,
    color: parseHex(document.getElementById("ctrl-color-hex").value),
    strength: Number(document.getElementById("ctrl-strength").value),
  };
}

function paintCtrlTune() {
  const box = document.getElementById("ctrl-tune");
  const ev = ctrlEvent();
  box.hidden = !ev;
  if (!ev) return;
  const src = recipeById(ev.anim, false) || recipeById("pulse", false);
  const tune = ev.tune || tuneOfRecipe(src);
  const lab = document.getElementById("fx-label");
  const anim = document.getElementById("fx-anim");
  const ease = document.getElementById("ctrl-ease");
  const hex = document.getElementById("ctrl-color-hex");
  if (document.activeElement !== lab) lab.value = ev.label || "";
  fillEventAnimSelect(anim, ev.anim);
  fillPair("ctrl-ms", "ctrl-ms-r", tune.ms);
  if (document.activeElement !== ease) ease.value = [...ease.options].some(o => o.value === tune.ease) ? tune.ease : "ease";
  if (document.activeElement !== hex) hex.value = tune.color || "";
  fillPair("ctrl-strength", "ctrl-strength-r", tune.strength != null ? tune.strength : 1);
  const btn = document.getElementById("ctrl-color");
  const shown = tune.color || d.stroke || "#e6f350";
  btn.style.background = shown;
  btn.dataset.color = shown;
  document.getElementById("ctrl-del").hidden = !(customAnims || []).some(r => !r.loop && r.id === ev.anim);
  document.getElementById("ctrl-color-clear").hidden = !tune.color;
}

function previewCtrl() {
  const ev = ctrlEvent();
  const ink = window.designInk;
  if (!ev || !d || !ink) return;
  ink.playIdle(d);
  const src = recipeById(ev.anim, false) || recipeById("pulse", false);
  ink.play(recipeTuned(src, ev.tune || tuneOfRecipe(src), false), true);
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

function paintInnerWell() {
  paintColor(document.getElementById("in-inner"), document.getElementById("in-inner-hex"), d.innerStroke || "#333333");
}

function setStroke(hex) {
  d.stroke = hex;
  paint();
  scheduleSave();
}

function setInnerStroke(hex) {
  d.innerStroke = hex;
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
  saveObs().catch(() => {});
  document.getElementById("settings-overlay").hidden = true;
}

function openSettings() {
  setPalId = "";
  fillSettingsPalettes();
  loadObs();
  showSettingsPage("obs");
  document.getElementById("settings-overlay").hidden = false;
}

function showSettingsPage(name) {
  document.querySelectorAll(".settings-nav button").forEach((b) => b.classList.toggle("sel", b.dataset.set === name));
  document.getElementById("set-obs").hidden = name !== "obs";
  document.getElementById("set-mode").hidden = name !== "mode";
  document.getElementById("set-palettes").hidden = name !== "palettes";
}

function obsMsg(s) {
  document.getElementById("obs-msg").textContent = s || "";
}

let modePrefs = { defaultMode: "obs", autoOffline: true, autoOnline: true, modeGraceSec: 0 };

function applyModePrefs(s) {
  modePrefs.defaultMode = s.defaultMode === "designer" ? "designer" : "obs";
  modePrefs.autoOffline = !!s.autoOffline;
  modePrefs.autoOnline = !!s.autoOnline;
  modePrefs.modeGraceSec = Math.max(0, Number(s.modeGraceSec) || 0);
  document.querySelectorAll('input[name="mode-default"]').forEach((r) => { r.checked = r.value === modePrefs.defaultMode; });
  document.getElementById("mode-auto-off").checked = modePrefs.autoOffline;
  document.getElementById("mode-auto-on").checked = modePrefs.autoOnline;
  document.getElementById("mode-grace").value = String(modePrefs.modeGraceSec);
}

function readModePrefsFromForm() {
  return {
    defaultMode: document.querySelector('input[name="mode-default"]:checked')?.value === "designer" ? "designer" : "obs",
    autoOffline: document.getElementById("mode-auto-off").checked,
    autoOnline: document.getElementById("mode-auto-on").checked,
    modeGraceSec: Math.max(0, Number(document.getElementById("mode-grace").value) || 0),
  };
}

async function loadObs() {
  try {
    const s = await (await fetch("/api/obs")).json();
    document.getElementById("obs-host").value = s.host || "127.0.0.1";
    document.getElementById("obs-port").value = s.port || 4455;
    document.getElementById("obs-pass").value = s.password || "";
    applyModePrefs(s);
    await refreshObs(s.camera);
  } catch (e) {
    obsMsg(e.message || "OBS settings failed");
  }
}

async function saveObs() {
  Object.assign(modePrefs, readModePrefsFromForm());
  const body = {
    host: document.getElementById("obs-host").value.trim(),
    port: Number(document.getElementById("obs-port").value) || 4455,
    password: document.getElementById("obs-pass").value,
    camera: document.getElementById("obs-camera").value,
    defaultMode: modePrefs.defaultMode,
    autoOffline: modePrefs.autoOffline,
    autoOnline: modePrefs.autoOnline,
    modeGraceSec: modePrefs.modeGraceSec,
  };
  const res = await fetch("/api/obs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function fillSelect(sel, items, value, label, key) {
  sel.replaceChildren();
  items.forEach((it) => {
    const o = document.createElement("option");
    o.value = key ? it[key] : it;
    o.textContent = label ? it[label] : it;
    sel.appendChild(o);
  });
  if (value) sel.value = value;
}

async function refreshObs(camera) {
  const st = await (await fetch("/api/obs/status")).json();
  document.getElementById("obs-status").textContent = st.connected ? "Connected" : (st.error ? "Disconnected: " + st.error : "Disconnected");
  const camSel = document.getElementById("obs-camera");
  const row = document.getElementById("obs-device-row");
  if (!st.connected) {
    fillSelect(camSel, camera ? [{ name: camera }] : [], camera, "name", "name");
    row.hidden = true;
    return;
  }
  const cams = await (await fetch("/api/obs/cameras")).json();
  const list = cams.cameras || [];
  if (camera && !list.some((c) => c.name === camera)) list.unshift({ name: camera, kind: "" });
  fillSelect(camSel, list, camera, "name", "name");
  if (camera && camSel.value !== camera && list.length) camSel.value = list[0].name;
  const needDev = !list.length || camSel.value === "BS Camera Device";
  row.hidden = !needDev;
  if (needDev) {
    const input = camSel.value || "BS Camera Device";
    try {
      const devs = await (await fetch("/api/obs/devices?input=" + encodeURIComponent(input))).json();
      fillSelect(document.getElementById("obs-device"), devs.devices || [], "", "name", "value");
    } catch (e) {
      row.hidden = true;
    }
  }
}

document.getElementById("obs-connect").onclick = async () => {
  obsMsg("");
  try {
    const saved = await saveObs();
    const res = await fetch("/api/obs/connect", { method: "POST" });
    if (!res.ok) throw new Error(await res.text());
    await refreshObs(document.getElementById("obs-camera").value || saved.camera);
  } catch (e) {
    obsMsg(e.message || "Connect failed");
    await refreshObs(document.getElementById("obs-camera").value);
  }
};
document.getElementById("obs-disconnect").onclick = async () => {
  obsMsg("");
  await fetch("/api/obs/disconnect", { method: "POST" });
  await refreshObs(document.getElementById("obs-camera").value);
};
document.getElementById("obs-camera").onchange = async () => {
  try {
    await saveObs();
    await refreshObs(document.getElementById("obs-camera").value);
  } catch (e) {
    obsMsg(e.message || "Save failed");
  }
};
document.getElementById("obs-device").onchange = async () => {
  obsMsg("");
  const id = document.getElementById("obs-device").value;
  const input = document.getElementById("obs-camera").value || "BS Camera Device";
  const res = await fetch("/api/obs/device", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input, id }) });
  if (!res.ok) obsMsg(await res.text());
};
document.getElementById("obs-scene").onclick = async () => {
  obsMsg("");
  try {
    await saveObs();
    if (!((await (await fetch("/api/obs/status")).json()).connected)) {
      const res = await fetch("/api/obs/connect", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
    }
    const res = await fetch("/api/obs/scene", { method: "POST" });
    if (!res.ok) throw new Error(await res.text());
    obsMsg("Scene Border Studio is ready. Nest it in your other scenes.");
    await refreshObs(document.getElementById("obs-camera").value);
  } catch (e) {
    const msg = (e.message || "Scene failed").trim();
    obsMsg(msg);
    if (/Advanced Masks/i.test(msg)) alert(msg);
  }
};

let animsDoc = { custom: [] };

async function loadAnims() {
  try {
    const res = await fetch("/api/anims");
    if (res.ok) {
      animsDoc = await res.json();
      animsDoc.custom = animsDoc.custom || [];
    }
  } catch (e) {}
  customAnims = animsDoc.custom || [];
}

async function persistAnims() {
  try {
    const res = await fetch("/api/anims", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(animsDoc) });
    if (res.ok) animsDoc = await res.json();
  } catch (e) {}
  animsDoc.custom = animsDoc.custom || [];
  customAnims = animsDoc.custom;
  if (d) paint();
}

function svgPoint(ev) {
  const pt = stage.createSVGPoint();
  pt.x = ev.clientX; pt.y = ev.clientY;
  return pt.matrixTransform(stage.getScreenCTM().inverse());
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function edgeAt(a, b, t) {
  if (!isSmooth(a) && !isSmooth(b)) {
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  }
  const c1 = ctrlOut(a), c2 = ctrlIn(b), u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
  };
}

function nearestEdge(p) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < d.points.length; i++) {
    const a = d.points[i], b = d.points[(i + 1) % d.points.length];
    if (!isSmooth(a) && !isSmooth(b)) {
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1)));
      const q = edgeAt(a, b, t);
      const dd = dist(p, q);
      if (dd < bestD) { bestD = dd; best = i; }
    } else {
      // ponytail: 16 samples along the cubic; denser split if a long curve misses clicks
      for (let s = 0; s <= 16; s++) {
        const dd = dist(p, edgeAt(a, b, s / 16));
        if (dd < bestD) { bestD = dd; best = i; }
      }
    }
  }
  return best;
}

// Handles sit on the chord through the neighbors, one third of each adjacent edge.
function smoothen(pts, i) {
  const n = pts.length;
  const p = pts[i];
  const prev = pts[(i + n - 1) % n];
  const next = pts[(i + 1) % n];
  let dx = next.x - prev.x, dy = next.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  const inLen = Math.hypot(p.x - prev.x, p.y - prev.y) / 3;
  const outLen = Math.hypot(next.x - p.x, next.y - p.y) / 3;
  p.smooth = true;
  p.ix = p.x - dx * inLen; p.iy = p.y - dy * inLen;
  p.ox = p.x + dx * outLen; p.oy = p.y + dy * outLen;
}

// Snap distance is in screen pixels, so it feels the same at any window size.
function snapGap() {
  const m = stage.getScreenCTM();
  return SNAP_PX / ((m && m.a) || 1);
}

function snapVal(v, lines) {
  let best = v, gap = snapGap();
  for (const L of lines) {
    const a = Math.abs(v - L);
    if (a < gap) { gap = a; best = L; }
  }
  return best;
}

// Snap a span [start, start+size] so its start, middle, or end lands on the nearest line.
function snapSpan(start, size, lines) {
  let best = start, gap = snapGap();
  for (const off of [0, size / 2, size]) {
    for (const L of lines) {
      const a = Math.abs(start + off - L);
      if (a < gap) { gap = a; best = L - off; }
    }
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
    const { xs, ys } = gridLines();
    x = snapSpan(orig.x + p.x - orig.ox, w, xs);
    y = snapSpan(orig.y + p.y - orig.oy, h, ys);
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
let dragFrom = null;
frame.addEventListener("pointerdown", ev => {
  // Right-click opens the app menu; it must not insert a point or start a drag.
  if (ev.button !== 0) return;
  const p = svgPoint(ev);
  const hit = ev.target.closest && ev.target.closest(".handle");
  if (hit) {
    pushHist();
    if (hit.dataset.t) {
      drag = { t: hit.dataset.t, ox: p.x, oy: p.y, x: d.x, y: d.y, w: d.w, h: d.h };
    } else if (hit.dataset.h) {
      sel = Number(hit.dataset.i);
      drag = { h: hit.dataset.h, i: sel };
    } else {
      sel = Number(hit.dataset.i);
      drag = sel;
      dragFrom = { cx: ev.clientX, cy: ev.clientY, moved: false, pt: Object.assign({}, d.points[sel]) };
    }
    frame.setPointerCapture(ev.pointerId);
    paint();
    return;
  }
  if (kindOf(d) !== "polygon") {
    if (ev.target.closest && ev.target.closest(".hole")) {
      pushHist();
      drag = { t: "move", ox: p.x, oy: p.y, x: d.x, y: d.y, w: d.w, h: d.h };
      frame.setPointerCapture(ev.pointerId);
    }
    return;
  }
  addPointAt(p);
});
frame.addEventListener("pointermove", ev => {
  if (drag == null) return;
  if (dragFrom && Math.hypot(ev.clientX - dragFrom.cx, ev.clientY - dragFrom.cy) > 4) dragFrom.moved = true;
  const p = snapPt(svgPoint(ev));
  if (typeof drag === "number") {
    const o = dragFrom.pt;
    const dx = p.x - o.x, dy = p.y - o.y;
    const n = { x: p.x, y: p.y };
    if (o.smooth) {
      n.smooth = true;
      n.ix = o.ix + dx; n.iy = o.iy + dy;
      n.ox = o.ox + dx; n.oy = o.oy + dy;
    }
    d.points[drag] = n;
  // A box drag stores its height on h. Only "in" / "out" is a bezier handle.
  } else if (drag.h === "in" || drag.h === "out") {
    const pt = d.points[drag.i];
    if (drag.h === "out") { pt.ox = p.x; pt.oy = p.y; pt.ix = 2 * pt.x - p.x; pt.iy = 2 * pt.y - p.y; }
    else { pt.ix = p.x; pt.iy = p.y; pt.ox = 2 * pt.x - p.x; pt.oy = 2 * pt.y - p.y; }
  } else applyBox(drag.t, p, drag);
  paint();
});
frame.addEventListener("pointerup", () => {
  const ae = document.activeElement;
  if (ae && ae.matches && ae.matches("input, textarea, select")) ae.blur();
  if (typeof drag === "number" && dragFrom && !dragFrom.moved) {
    d.points[drag] = dragFrom.pt;
    if (!dragFrom.pt.smooth) smoothen(d.points, drag);
    paint();
  }
  if (drag != null) scheduleSave();
  drag = null;
  dragFrom = null;
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

let clearDesignPick = async () => {};
let clearMaskPick = async () => {};
let clearBoardPick = async () => {};

async function postLive(path) {
  pushHist();
  const res = await fetch(path, { method: "POST" });
  if (!res.ok) { banner.hidden = false; return false; }
  d = await res.json();
  lastSeen = JSON.stringify(d);
  return true;
}

async function resetHole() {
  if (!await postLive("/api/design/reset-mask")) return;
  sel = 0;
  sizeCustom = false;
  pushHist();
  paint();
  await clearMaskPick();
  maskSnap = JSON.stringify(maskOf(d));
}

async function resetDesign() {
  if (!await postLive("/api/design/reset")) return;
  sel = 0;
  sizeCustom = false;
  pushHist();
  paint();
  await clearDesignPick();
}

async function resetBoard() {
  if (!await postLive("/api/design/reset-events")) return;
  if (ctrlSel >= (d.events || []).length) ctrlSel = Math.max(0, (d.events || []).length - 1);
  if (fxEdit && !(d.events || [])[ctrlSel]) fxEdit = false;
  pushHist();
  paint();
  await clearBoardPick();
}

document.getElementById("btn-reset").onclick = resetHole;
document.getElementById("file-reset").onclick = () => { menu.hidden = true; resetDesign(); };

function lookInput(el, fn) {
  el.addEventListener("focus", pushHist);
  el.addEventListener("input", () => { fn(); paint(); scheduleSave(); });
  el.addEventListener("change", () => { fn(); paint(); scheduleSave(); });
}
function fillPair(numId, rangeId, v) {
  const num = document.getElementById(numId);
  const range = document.getElementById(rangeId);
  const ae = document.activeElement;
  if (ae !== num && ae !== range) {
    num.value = v;
    if (range) range.value = v;
  } else if (ae === num && range) range.value = num.value;
  else if (ae === range) num.value = range.value;
}
function clampPair(num, range) {
  if (!range) return;
  const lo = Number(range.min), hi = Number(range.max);
  let v = Number(num.value);
  if (!Number.isFinite(v)) v = lo;
  if (Number.isFinite(lo) && v < lo) v = lo;
  if (Number.isFinite(hi) && v > hi) v = hi;
  num.value = v;
  range.value = v;
}
function bindPair(numId, rangeId, fn) {
  const num = document.getElementById(numId);
  const range = document.getElementById(rangeId);
  const run = (src) => {
    if (src === range) num.value = range.value;
    else clampPair(num, range);
    fn();
  };
  lookInput(num, () => run(num));
  if (range) lookInput(range, () => run(range));
}
function onReset(id, fn) {
  document.getElementById(id).onclick = () => { pushHist(); fn(); paint(); scheduleSave(); };
}
function bindSwatch(btnId, hexId, apply) {
  const btn = document.getElementById(btnId);
  const hexInp = document.getElementById(hexId);
  btn.onclick = (ev) => {
    ev.stopPropagation();
    pushHist();
    openIro(btn, hexInp, apply);
  };
  hexInp.addEventListener("focus", pushHist);
  hexInp.oninput = () => {
    const h = parseHex(hexInp.value);
    if (!h) return;
    paintColor(btn, hexInp, h);
    if (iroPick && !document.getElementById("iro-pop").hidden) {
      try { iroPick.color.set(h); } catch (e) {}
    }
    apply(h);
  };
}
bindSwatch("in-stroke", "in-stroke-hex", (hex) => setStroke(hex));
bindSwatch("in-inner", "in-inner-hex", (hex) => setInnerStroke(hex));
bindPair("in-width", "in-width-r", () => { d.strokeWidth = Math.max(1, Number(document.getElementById("in-width").value) || 1); });
bindPair("in-glow", "in-glow-r", () => { d.glow = Math.max(0, Number(document.getElementById("in-glow").value) || 0); });
bindPair("in-blur", "in-blur-r", () => { d.blur = Math.max(0, Number(document.getElementById("in-blur").value) || 0); });
bindPair("in-inner-width", "in-inner-width-r", () => { d.innerStrokeWidth = Math.max(0, Number(document.getElementById("in-inner-width").value) || 0); });
bindPair("in-inner-blur", "in-inner-blur-r", () => { d.innerBlur = Math.max(0, Number(document.getElementById("in-inner-blur").value) || 0); });
bindPair("in-feather", "in-feather-r", () => { d.feather = Math.max(0, Math.min(64, Number(document.getElementById("in-feather").value) || 0)); });
lookInput(document.getElementById("in-motion"), () => {
  d.motion = document.getElementById("in-motion").value;
  d.dash = d.motion === "dash";
  const src = recipeById(d.motion, true);
  d.motionTune = src ? { ms: src.ms, ease: src.ease || "ease", color: src.color || "", strength: src.strength != null ? src.strength : 1 } : null;
  document.getElementById("tune-name").value = src ? src.label + " copy" : "";
});
onReset("in-width-reset", () => { d.strokeWidth = 12; });
onReset("in-glow-reset", () => { d.glow = 8; });
onReset("in-blur-reset", () => { d.blur = 0; });
onReset("in-feather-reset", () => { d.feather = 0; });
onReset("in-stroke-reset", () => { d.stroke = "#e6f350"; });
onReset("in-inner-reset", () => { d.innerStroke = "#333333"; });
onReset("in-inner-width-reset", () => { d.innerStrokeWidth = 0; });
onReset("in-inner-blur-reset", () => { d.innerBlur = 0; });
onReset("in-motion-reset", () => { d.motion = "none"; d.dash = false; d.motionTune = null; });
onReset("in-radius-reset", () => { d.r = 0; });
function readTune() {
  return {
    ms: Number(document.getElementById("tune-ms").value),
    ease: document.getElementById("tune-ease").value,
    color: parseHex(document.getElementById("tune-color-hex").value),
    strength: Number(document.getElementById("tune-strength").value),
  };
}
function paintTune() {
  const box = document.getElementById("motion-tune");
  const id = motionOf(d);
  const src = id === "none" ? null : recipeById(id, true);
  box.hidden = !src;
  const del = document.getElementById("tune-del");
  const mine = !!(src && (customAnims || []).some(r => r.loop && r.id === src.id));
  del.hidden = !mine;
  if (!src) return;
  const tune = d.motionTune || { ms: src.ms, ease: src.ease || "ease", color: src.color || "", strength: src.strength != null ? src.strength : 1 };
  const ease = document.getElementById("tune-ease");
  const hex = document.getElementById("tune-color-hex");
  fillPair("tune-ms", "tune-ms-r", tune.ms);
  if (document.activeElement !== ease) ease.value = [...ease.options].some(o => o.value === tune.ease) ? tune.ease : "ease";
  if (document.activeElement !== hex) hex.value = tune.color || "";
  fillPair("tune-strength", "tune-strength-r", tune.strength != null ? tune.strength : 1);
  const btn = document.getElementById("tune-color");
  const shown = tune.color || d.stroke || "#e6f350";
  btn.style.background = shown;
  btn.dataset.color = shown;
  document.getElementById("tune-color-clear").hidden = !tune.color;
}
function replayMotion() {
  if (window.designInk) window.designInk.playIdle(d);
}
function applyTune() { d.motionTune = readTune(); replayMotion(); scheduleSave(); }
function bindTunePair(numId, rangeId) {
  const num = document.getElementById(numId);
  const range = document.getElementById(rangeId);
  const go = (src) => {
    if (src === range) num.value = range.value;
    else clampPair(num, range);
    applyTune();
  };
  [num, range].forEach(el => {
    el.addEventListener("focus", pushHist);
    el.addEventListener("input", () => go(el));
    el.addEventListener("change", () => go(el));
  });
}
bindTunePair("tune-ms", "tune-ms-r");
bindTunePair("tune-strength", "tune-strength-r");
document.getElementById("tune-ease").addEventListener("focus", pushHist);
document.getElementById("tune-ease").addEventListener("change", applyTune);
function motionRecipe() { return recipeById(motionOf(d), true); }
onReset("tune-ms-reset", () => { const src = motionRecipe(); d.motionTune = Object.assign(readTune(), { ms: src ? src.ms : 1000 }); });
onReset("tune-ease-reset", () => { const src = motionRecipe(); d.motionTune = Object.assign(readTune(), { ease: (src && src.ease) || "ease" }); });
onReset("tune-strength-reset", () => { const src = motionRecipe(); d.motionTune = Object.assign(readTune(), { strength: src && src.strength != null ? src.strength : 1 }); });
document.getElementById("tune-color").onclick = (ev) => {
  ev.stopPropagation();
  pushHist();
  const btn = document.getElementById("tune-color");
  const hex = document.getElementById("tune-color-hex");
  openIro(btn, hex, (color) => {
    hex.value = color;
    d.motionTune = readTune();
    paintTune();
    replayMotion();
    scheduleSave();
  });
};
document.getElementById("tune-color-hex").addEventListener("focus", pushHist);
document.getElementById("tune-color-hex").oninput = () => {
  const h = parseHex(document.getElementById("tune-color-hex").value);
  if (!h && document.getElementById("tune-color-hex").value.trim()) return;
  d.motionTune = readTune();
  paintTune();
  if (iroPick && !document.getElementById("iro-pop").hidden && h) {
    try { iroPick.color.set(h); } catch (e) {}
  }
  replayMotion();
  scheduleSave();
};
document.getElementById("tune-color-clear").onclick = () => {
  pushHist();
  document.getElementById("tune-color-hex").value = "";
  d.motionTune = readTune();
  paintTune();
  replayMotion();
  scheduleSave();
};
document.getElementById("tune-save").onclick = () => {
  const src = recipeById(motionOf(d), true);
  if (!src) return;
  const tune = readTune();
  d.motionTune = tune;
  const name = document.getElementById("tune-name").value.trim() || (src.label + " copy");
  const baked = bakeRecipe(recipeBase(src), Object.assign({ label: name }, tune));
  const id = "a" + Date.now();
  animsDoc.custom = animsDoc.custom || [];
  animsDoc.custom.push(Object.assign({ id: id }, baked));
  d.motion = id;
  d.dash = false;
  d.motionTune = { ms: baked.ms, ease: baked.ease, color: baked.color || "", strength: baked.strength };
  document.getElementById("tune-name").value = name + " copy";
  persistAnims();
  scheduleSave();
};
document.getElementById("tune-del").onclick = () => {
  const id = motionOf(d);
  if (!(customAnims || []).some(r => r.loop && r.id === id)) return;
  pushHist();
  animsDoc.custom = (animsDoc.custom || []).filter(r => r.id !== id);
  d.motion = "none";
  d.dash = false;
  d.motionTune = null;
  document.getElementById("tune-name").value = "";
  persistAnims();
  scheduleSave();
};
function namedSize() {
  if (d.width === 1280 && d.height === 720) return "720";
  if (d.width === 1920 && d.height === 1080) return "1080";
  return "custom";
}
function sizeKind() {
  return sizeCustom ? "custom" : namedSize();
}
function paintSize() {
  const kind = sizeKind();
  [["size-720", "720"], ["size-1080", "1080"], ["size-custom", "custom"]].forEach(([id, k]) => {
    const b = document.getElementById(id);
    b.classList.toggle("sel", kind === k);
    b.setAttribute("aria-checked", String(kind === k));
  });
  document.getElementById("size-custom-fields").hidden = kind !== "custom";
  const label = kind === "720" ? "720p" : kind === "1080" ? "1080p" : d.width + "×" + d.height;
  document.getElementById("size-label").textContent = label;
  frame.style.aspectRatio = d.width + " / " + d.height;
  frame.style.width = "min(100%, calc((100vh - 80px) * " + d.width + " / " + d.height + "))";
}
function setSize(w, h, custom) {
  pushHist();
  sizeCustom = !!custom;
  d.width = w;
  d.height = h;
  paint();
  scheduleSave();
}
document.getElementById("size-720").onclick = () => { setSize(1280, 720, false); closeSize(); };
document.getElementById("size-1080").onclick = () => { setSize(1920, 1080, false); closeSize(); };
document.getElementById("size-custom").onclick = () => setSize(d.width, d.height, true);
lookInput(document.getElementById("in-mw"), () => { sizeCustom = true; d.width = Math.max(16, Number(document.getElementById("in-mw").value) || 1920); });
lookInput(document.getElementById("in-mh"), () => { sizeCustom = true; d.height = Math.max(16, Number(document.getElementById("in-mh").value) || 1080); });
document.getElementById("in-kind").onchange = e => setKind(e.target.value);
bindPair("in-radius", "in-radius-r", () => { d.r = Math.max(0, Number(document.getElementById("in-radius").value) || 0); });

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

function applyCtrlTune() {
  const ev = ctrlEvent();
  if (!ev) return;
  const ae = document.activeElement;
  [["ctrl-ms", "ctrl-ms-r"], ["ctrl-strength", "ctrl-strength-r"]].forEach(([n, r]) => {
    const num = document.getElementById(n), range = document.getElementById(r);
    if (ae === range) num.value = range.value;
    else if (ae === num) clampPair(num, range);
  });
  ev.tune = readCtrlTune();
  previewCtrl();
  scheduleSave();
}
["ctrl-ms", "ctrl-ms-r", "ctrl-ease", "ctrl-strength", "ctrl-strength-r"].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener("focus", pushHist);
  el.addEventListener("input", applyCtrlTune);
  el.addEventListener("change", applyCtrlTune);
});
function fxRecipe() {
  const ev = ctrlEvent();
  return ev && (recipeById(ev.anim, false) || recipeById("pulse", false));
}
onReset("ctrl-ms-reset", () => { const ev = ctrlEvent(); const src = fxRecipe(); if (ev && src) ev.tune = Object.assign(readCtrlTune(), { ms: src.ms }); previewCtrl(); });
onReset("ctrl-ease-reset", () => { const ev = ctrlEvent(); const src = fxRecipe(); if (ev && src) ev.tune = Object.assign(readCtrlTune(), { ease: src.ease || "ease" }); previewCtrl(); });
onReset("ctrl-strength-reset", () => { const ev = ctrlEvent(); const src = fxRecipe(); if (ev && src) ev.tune = Object.assign(readCtrlTune(), { strength: src.strength != null ? src.strength : 1 }); previewCtrl(); });
document.getElementById("fx-play").onclick = () => { const ev = ctrlEvent(); if (ev) fireFx(ev); };
document.getElementById("fx-back").onclick = closeFx;
document.getElementById("fx-label").addEventListener("focus", pushHist);
document.getElementById("fx-label").onchange = () => {
  const ev = ctrlEvent();
  if (!ev) return;
  ev.label = document.getElementById("fx-label").value;
  ev.id = slug(ev.label) || ev.id;
  scheduleSave();
};
document.getElementById("fx-anim").onchange = () => {
  const ev = ctrlEvent();
  if (!ev) return;
  pushHist();
  const catalog = eventCatalog();
  const prev = catalog.find(x => x.id === ev.anim);
  const next = catalog.find(x => x.id === document.getElementById("fx-anim").value) || EVENT_ANIMS[0];
  if (!String(ev.label || "").trim() || (prev && ev.label === eventButtonName(prev))) {
    ev.label = eventButtonName(next);
    ev.id = uniqueEventId(slug(ev.label) || next.id, ev);
  }
  ev.anim = next.id;
  ev.tune = tuneOfRecipe(recipeById(ev.anim, false));
  paintCtrlTune();
  previewCtrl();
  scheduleSave();
};
document.getElementById("fx-del-ev").onclick = () => delEvent(ctrlSel);
document.getElementById("ctrl-color").onclick = (ev) => {
  ev.stopPropagation();
  pushHist();
  const btn = document.getElementById("ctrl-color");
  const hex = document.getElementById("ctrl-color-hex");
  openIro(btn, hex, (color) => {
    hex.value = color;
    applyCtrlTune();
    paintCtrlTune();
  });
};
document.getElementById("ctrl-color-hex").addEventListener("focus", pushHist);
document.getElementById("ctrl-color-hex").oninput = () => {
  const h = parseHex(document.getElementById("ctrl-color-hex").value);
  if (!h && document.getElementById("ctrl-color-hex").value.trim()) return;
  applyCtrlTune();
  paintCtrlTune();
  if (iroPick && !document.getElementById("iro-pop").hidden && h) {
    try { iroPick.color.set(h); } catch (e) {}
  }
};
document.getElementById("ctrl-color-clear").onclick = () => {
  pushHist();
  document.getElementById("ctrl-color-hex").value = "";
  applyCtrlTune();
  paintCtrlTune();
};
document.getElementById("ctrl-save").onclick = () => {
  const ev = ctrlEvent();
  const src = ev && (recipeById(ev.anim, false) || recipeById("pulse", false));
  if (!src) return;
  const tune = readCtrlTune();
  ev.tune = tune;
  const name = document.getElementById("ctrl-name").value.trim() || (src.label + " copy");
  const baked = bakeRecipe(recipeBase(src), Object.assign({ label: name }, tune));
  const id = "a" + Date.now();
  animsDoc.custom = animsDoc.custom || [];
  animsDoc.custom.push(Object.assign({ id: id }, baked));
  ev.anim = id;
  ev.tune = { ms: baked.ms, ease: baked.ease, color: baked.color || "", strength: baked.strength };
  document.getElementById("ctrl-name").value = name + " copy";
  persistAnims();
  scheduleSave();
};
document.getElementById("ctrl-del").onclick = () => {
  const ev = ctrlEvent();
  if (!ev || !(customAnims || []).some(r => !r.loop && r.id === ev.anim)) return;
  pushHist();
  animsDoc.custom = (animsDoc.custom || []).filter(r => r.id !== ev.anim);
  ev.anim = "pulse";
  ev.tune = tuneOfRecipe(recipeById("pulse", false));
  persistAnims();
  scheduleSave();
};
document.getElementById("btn-ev-add").onclick = () => {
  pushHist();
  d.events = d.events || [];
  const used = new Set(d.events.map(e => e.anim));
  const a = eventCatalog().find(x => !used.has(x.id)) || EVENT_ANIMS[0];
  d.events.push({ id: uniqueEventId(slug(eventButtonName(a)) || a.id), label: eventButtonName(a), anim: a.id, tune: tuneOfRecipe(a) });
  ctrlSel = d.events.length - 1;
  paintCtrl();
  scheduleSave();
};

document.getElementById("btn-mask").onclick = () => {
  const a = document.createElement("a");
  a.href = maskCanvas(d).toDataURL("image/png");
  a.download = "border-mask.png";
  a.click();
};

function setSideTab(name) {
  if (name !== "effects" && fxEdit) closeFx();
  document.body.classList.toggle("tab-mask", name === "mask");
  document.body.classList.toggle("tab-border", name === "border");
  document.body.classList.toggle("tab-effects", name === "effects");
  [["tab-mask", "mask"], ["tab-border", "border"], ["tab-effects", "effects"]].forEach(([id, n]) => {
    const b = document.getElementById(id);
    b.classList.toggle("sel", name === n);
    b.setAttribute("aria-selected", String(name === n));
  });
}
document.getElementById("tab-mask").onclick = () => setSideTab("mask");
document.getElementById("tab-border").onclick = () => setSideTab("border");
document.getElementById("tab-effects").onclick = () => setSideTab("effects");

const sizeMenu = document.getElementById("size-menu");
function closeSize() {
  sizeMenu.hidden = true;
  document.getElementById("btn-size").setAttribute("aria-expanded", "false");
}
document.getElementById("btn-size").onclick = () => {
  closeCtx();
  menu.hidden = true;
  sizeMenu.hidden = !sizeMenu.hidden;
  document.getElementById("btn-size").setAttribute("aria-expanded", String(!sizeMenu.hidden));
};
document.getElementById("btn-file").onclick = () => { closeCtx(); closeSize(); menu.hidden = !menu.hidden; };

const pullLibs = [];

function visualOf(src) {
  const v = JSON.parse(JSON.stringify(src));
  delete v.events;
  return v;
}

function applyVisual(body) {
  const events = d.events;
  d = body;
  d.events = events || [];
}

function maskOf(src) {
  return JSON.parse(JSON.stringify({
    width: src.width, height: src.height, kind: src.kind || "",
    points: src.points || [], x: src.x || 0, y: src.y || 0,
    w: src.w || 0, h: src.h || 0, r: src.r || 0, feather: src.feather || 0,
  }));
}

function applyMask(body) {
  d.width = body.width;
  d.height = body.height;
  d.kind = body.kind || "";
  d.points = body.points || [];
  d.x = body.x || 0;
  d.y = body.y || 0;
  d.w = body.w || 0;
  d.h = body.h || 0;
  d.r = body.r || 0;
  d.feather = body.feather || 0;
}

function applyBoard(body) {
  d.events = Array.isArray(body) ? body : [];
  if (ctrlSel >= d.events.length) ctrlSel = Math.max(0, d.events.length - 1);
  if (fxEdit && !d.events[ctrlSel]) fxEdit = false;
}

// Named snapshots. capture/apply decide which slice of the live design moves.
function bindLib(opts) {
  let doc = { selected: "", items: [] };
  let gen = 0;
  let hold = 0;
  let missed = false;
  const listEl = document.getElementById(opts.listId);
  const nameEl = document.getElementById(opts.nameId);
  const isSelect = listEl.tagName === "SELECT";
  function paintLib() {
    listEl.replaceChildren();
    if (isSelect) {
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "Custom";
      listEl.appendChild(blank);
      doc.items.forEach((it) => {
        const o = document.createElement("option");
        o.value = it.id;
        o.textContent = it.name;
        listEl.appendChild(o);
      });
      listEl.value = doc.selected || "";
    } else {
      doc.items.forEach((it) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = it.name;
        b.classList.toggle("sel", it.id === doc.selected);
        b.onclick = () => pick(it.id);
        listEl.appendChild(b);
      });
    }
    if (document.activeElement !== nameEl) nameEl.value = (doc.items.find((it) => it.id === doc.selected) || {}).name || "";
    const del = document.getElementById(opts.delId);
    if (del) del.hidden = !doc.selected;
  }
  async function load() {
    const n = ++gen;
    try {
      const res = await fetch("/api/" + opts.key);
      if (!res.ok || n !== gen || hold) { if (hold) missed = true; return; }
      doc = await res.json();
    } catch (e) { return; }
    if (n !== gen || hold) { if (hold) missed = true; return; }
    doc.items = doc.items || [];
    doc.selected = doc.selected || "";
    paintLib();
  }
  async function persist() {
    const n = ++gen;
    try {
      const res = await fetch("/api/" + opts.key, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(doc),
      });
      if (n !== gen) return res.ok;
      if (!res.ok) { await load(); return false; }
      doc = await res.json();
    } catch (e) {
      if (n === gen) await load();
      return false;
    }
    if (n !== gen) return true;
    doc.items = doc.items || [];
    paintLib();
    return true;
  }
  async function pick(id, force) {
    id = id || "";
    if (!force && id === (doc.selected || "")) return;
    if (!force && id && opts.guard && opts.guard()) {
      if (isSelect) listEl.value = doc.selected || "";
      if (opts.onAsk) opts.onAsk(id);
      return;
    }
    if (!id) {
      if (!doc.selected) return;
      hold++;
      try {
        doc = { selected: "", items: doc.items };
        paintLib();
        await persist();
      } finally {
        hold--;
        if (!hold && missed) { missed = false; await load(); }
      }
      return;
    }
    const it = doc.items.find((x) => x.id === id);
    if (!it) return;
    hold++;
    try {
      pushHist();
      opts.apply(JSON.parse(JSON.stringify(it.body)));
      if (opts.touchSize) {
        sel = Math.min(sel, (d.points && d.points.length) ? d.points.length - 1 : 0);
        sizeCustom = namedSize() === "custom";
      }
      paint();
      doc.selected = id;
      paintLib();
      if (opts.onApplied) opts.onApplied();
      await save();
      await persist();
    } finally {
      hold--;
      if (!hold && missed) { missed = false; await load(); }
    }
  }
  async function saveItem() {
    let name = nameEl.value.trim();
    if (!name && doc.selected) {
      const cur = doc.items.find((it) => it.id === doc.selected);
      name = cur ? cur.name : "";
    }
    if (!name) return false;
    const items = doc.items.map((it) => ({ id: it.id, name: it.name, body: it.body }));
    const clash = items.find((it) => it.name.toLowerCase() === name.toLowerCase());
    let selected = doc.selected;
    if (clash) {
      clash.name = name;
      clash.body = opts.capture();
      selected = clash.id;
    } else {
      items.push({ id: "i" + Date.now(), name, body: opts.capture() });
      selected = items[items.length - 1].id;
    }
    doc = { selected, items };
    const ok = await persist();
    if (ok && opts.onSaved) opts.onSaved();
    return ok;
  }
  document.getElementById(opts.saveId).onclick = () => saveItem();
  document.getElementById(opts.delId).onclick = async () => {
    if (!doc.selected) return;
    doc = { selected: "", items: doc.items.filter((it) => it.id !== doc.selected) };
    await persist();
  };
  if (isSelect) listEl.onchange = () => pick(listEl.value);
  pullLibs.push(load);
  load();
  return {
    doc: () => doc,
    pick,
    saveItem,
    clearSelected: async () => {
      if (!doc.selected) return;
      doc = { selected: "", items: doc.items };
      await persist();
    },
    setDoc: async (next) => { doc = next; return persist(); },
  };
}

const designs = bindLib({
  key: "designs",
  listId: "design-list",
  nameId: "design-name",
  saveId: "file-save",
  delId: "file-del",
  touchSize: true,
  capture: () => visualOf(d),
  apply: applyVisual,
});
clearDesignPick = designs.clearSelected;

let maskAsk = "";
function snapMask() { maskSnap = JSON.stringify(maskOf(d)); }
function maskDirty() { return JSON.stringify(maskOf(d)) !== maskSnap; }
function confirmOpen() { return !document.getElementById("confirm-overlay").hidden; }
function closeConfirm() {
  maskAsk = "";
  document.getElementById("confirm-overlay").hidden = true;
}
const masks = bindLib({
  key: "masks",
  listId: "mask-list",
  nameId: "mask-name",
  saveId: "mask-save",
  delId: "mask-del",
  touchSize: true,
  capture: () => maskOf(d),
  apply: applyMask,
  guard: maskDirty,
  onAsk: (id) => {
    maskAsk = id;
    document.getElementById("confirm-overlay").hidden = false;
  },
  onApplied: snapMask,
  onSaved: snapMask,
});
clearMaskPick = masks.clearSelected;
document.getElementById("confirm-discard").onclick = async () => {
  const id = maskAsk;
  closeConfirm();
  await masks.pick(id, true);
};
document.getElementById("confirm-save").onclick = async () => {
  if (!await masks.saveItem()) return;
  const id = maskAsk;
  closeConfirm();
  await masks.pick(id, true);
};
document.getElementById("confirm-overlay").onclick = (ev) => {
  if (ev.target.id === "confirm-overlay") closeConfirm();
};

const boards = bindLib({
  key: "boards",
  listId: "board-list",
  nameId: "board-name",
  saveId: "board-save",
  delId: "board-del",
  capture: () => JSON.parse(JSON.stringify(d.events || [])),
  apply: applyBoard,
});
clearBoardPick = boards.clearSelected;
document.getElementById("board-reset").onclick = resetBoard;

function designFileOk(parsed) {
  if (!parsed || parsed.borderstudio !== "designs" || parsed.version !== 1 || !Array.isArray(parsed.items)) return false;
  return parsed.items.every((it) => it && typeof it.name === "string" && it.body && typeof it.body === "object" && !Array.isArray(it.body));
}

document.getElementById("file-export").onclick = () => {
  const doc = designs.doc();
  const payload = { borderstudio: "designs", version: 1, selected: doc.selected, items: doc.items };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  a.download = "borderstudio-designs.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

document.getElementById("file-import").onclick = () => {
  const inp = document.getElementById("file-import-in");
  inp.value = "";
  inp.click();
};
document.getElementById("file-import-in").onchange = async () => {
  const f = document.getElementById("file-import-in").files[0];
  if (!f) return;
  let parsed;
  try { parsed = JSON.parse(await f.text()); } catch (e) { return; }
  if (!designFileOk(parsed)) return;
  const items = designs.doc().items.map((it) => ({ id: it.id, name: it.name, body: it.body }));
  parsed.items.forEach((it) => {
    const name = it.name.trim();
    if (!name) return;
    const clash = items.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (clash) { clash.name = name; clash.body = it.body; return; }
    const id = it.id && !items.some((x) => x.id === it.id) ? String(it.id) : "";
    items.push({ id, name, body: it.body });
  });
  await designs.setDoc({ selected: designs.doc().selected, items });
};
document.getElementById("file-settings").onclick = () => {
  menu.hidden = true;
  openSettings();
};
document.getElementById("file-help").onclick = () => {
  menu.hidden = true;
  fetch("/api/help", { method: "POST" });
};
document.getElementById("settings-close").onclick = () => closeSettings();
document.getElementById("settings-overlay").onclick = (ev) => {
  if (ev.target.id === "settings-overlay") closeSettings();
};
document.querySelector(".settings-nav").onclick = (ev) => {
  const b = ev.target.closest("button[data-set]");
  if (b) showSettingsPage(b.dataset.set);
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

// Designer mode: OBS lets go of the webcam and the stage shows it inside the hole.
// OBS mode: browser lets go, OBS owns the camera. Stream in OBS mode.
let camStream = null;
const camVideo = document.getElementById("cam-video");

// The <video> is never re-created; luminance mask follows the hole (including feather).
function paintCam() {
  const layer = document.getElementById("cam-layer");
  const fo = document.getElementById("cam-fo");
  layer.setAttribute("viewBox", "0 0 " + d.width + " " + d.height);
  fo.setAttribute("width", d.width);
  fo.setAttribute("height", d.height);
  const src = document.getElementById("mask-prev").src;
  if (!src) return;
  const url = "url(\"" + src + "\")";
  layer.style.webkitMaskImage = url;
  layer.style.maskImage = url;
}

function showMode(mode) {
  document.body.classList.toggle("cam-on", mode === "designer");
  for (const [id, m] of [["mode-design", "designer"], ["mode-obs", "obs"]]) {
    const b = document.getElementById(id);
    b.classList.toggle("sel", m === mode);
    b.setAttribute("aria-checked", String(m === mode));
  }
}

async function putMode(mode) {
  const res = await fetch("/api/mode", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });
  if (!res.ok) throw new Error((await res.text()).trim());
  return res.json();
}

function stopCam() {
  if (camStream) camStream.getTracks().forEach((t) => t.stop());
  camStream = null;
  camVideo.srcObject = null;
}

let modeBusy = false;

function uiMode() {
  return document.body.classList.contains("cam-on") ? "designer" : "obs";
}

async function setMode(mode) {
  if (modeBusy) return;
  modeBusy = true;
  try {
    if (mode === "obs") {
      stopCam();
      showMode("obs");
      try { await putMode("obs"); } catch (e) { alert("Could not hand the camera back to OBS: " + e.message); }
      return;
    }
    try {
      const { device } = await putMode("designer");
      // Labels stay empty until the page has camera permission once; then the system default is used.
      const cams = (await navigator.mediaDevices.enumerateDevices()).filter((x) => x.kind === "videoinput");
      const hit = device && cams.find((c) => c.label.toLowerCase().startsWith(device.toLowerCase()));
      const video = { width: { ideal: 1920 }, height: { ideal: 1080 } };
      if (hit) video.deviceId = { exact: hit.deviceId };
      // OBS releases the device asynchronously; a busy camera gets a few short retries.
      for (let i = 0; !camStream; i++) {
        try {
          camStream = await navigator.mediaDevices.getUserMedia({ video });
        } catch (e) {
          if (e.name !== "NotReadableError" || i >= 4) throw e;
          await new Promise((r) => setTimeout(r, 400));
        }
      }
      camVideo.srcObject = camStream;
      showMode("designer");
      paint();
    } catch (e) {
      stopCam();
      showMode("obs");
      putMode("obs").catch(() => {});
      alert("Designer mode needs the camera: " + (e.message || e.name));
    }
  } finally {
    modeBusy = false;
  }
}

document.getElementById("mode-design").onclick = () => { if (!camStream) setMode("designer"); };
document.getElementById("mode-obs").onclick = () => setMode("obs");
document.getElementById("obs-pill").onclick = () => openSettings();

let lastObsUp = null;
let modeGraceTimer = null;

function autoWant(up) {
  if (!up && modePrefs.autoOffline) return "designer";
  if (up && modePrefs.autoOnline) return "obs";
  return "";
}

function cancelModeGrace() {
  if (modeGraceTimer) {
    clearTimeout(modeGraceTimer);
    modeGraceTimer = null;
  }
}

function scheduleMode(mode) {
  if (modeBusy || uiMode() === mode) {
    cancelModeGrace();
    return;
  }
  cancelModeGrace();
  const go = () => {
    modeGraceTimer = null;
    if (modeBusy || uiMode() === mode) return;
    setMode(mode);
  };
  const ms = modePrefs.modeGraceSec * 1000;
  if (ms <= 0) go();
  else modeGraceTimer = setTimeout(go, ms);
}

async function pollObs() {
  let up = false;
  try { up = (await (await fetch("/api/obs/status")).json()).connected; } catch (e) {}
  document.getElementById("obs-pill").classList.toggle("up", up);
  document.getElementById("obs-pill-text").textContent = up ? "OBS connected" : "OBS offline";
  const first = lastObsUp === null;
  if (!first && up === lastObsUp) return;
  lastObsUp = up;
  if (first) {
    scheduleMode(autoWant(up) || modePrefs.defaultMode);
    return;
  }
  const want = autoWant(up);
  if (want) scheduleMode(want);
  else cancelModeGrace();
}

(async () => {
  try { applyModePrefs(await (await fetch("/api/obs")).json()); } catch (e) {}
  pollObs();
  setInterval(pollObs, 3000);
})();

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

const ctx = document.createElement("div");
ctx.id = "ctx-menu";
ctx.hidden = true;
document.body.appendChild(ctx);

function closeCtx() { ctx.hidden = true; }

function addCtxBtn(label, icon, run, disabled, title) {
  const b = document.createElement("button");
  b.type = "button";
  b.disabled = !!disabled;
  if (title) b.title = title;
  const i = document.createElement("span");
  i.className = "ti ti-" + icon;
  i.setAttribute("aria-hidden", "true");
  b.append(i, document.createTextNode(label));
  if (!b.disabled) b.onclick = () => { closeCtx(); run(); };
  ctx.appendChild(b);
}

// Right-click menu for the admin window. Text fields keep the browser menu.
addEventListener("contextmenu", ev => {
  if (!ev.target.closest) return;
  if (ev.target.closest("input, textarea")) return;
  ev.preventDefault();
  if (ev.target.closest("#ctx-menu")) return;
  menu.hidden = true;
  closeSize();
  ctx.replaceChildren();
  const extra = [];
  const onStage = ev.target.closest("#stage, #hits, #ink");
  if (d && kindOf(d) === "polygon" && onStage) {
    const vert = ev.target.closest(".handle[data-i]:not([data-h])");
    if (vert) {
      const i = Number(vert.dataset.i);
      const floor = d.points.length <= 3;
      extra.push(["Delete point", "trash", () => { sel = i; delPoint(); }, floor, floor ? "A polygon needs 3 points" : ""]);
    } else {
      const p = svgPoint(ev);
      extra.push(["Add point here", "plus", () => addPointAt(p)]);
    }
  }
  const row = ev.target.closest("#ctrl-grid .fx-row");
  if (row) extra.push(["Delete effect", "trash", () => delEvent(Number(row.dataset.i))]);
  extra.forEach(it => addCtxBtn(it[0], it[1], it[2], it[3], it[4]));
  if (extra.length) {
    const sep = document.createElement("div");
    sep.className = "file-sep";
    ctx.appendChild(sep);
  }
  addCtxBtn("Undo", "arrow-back-up", undo, idx <= 0);
  addCtxBtn("Redo", "arrow-forward-up", redo, idx >= stack.length - 1);
  addCtxBtn("Save", "device-floppy", () => save());
  addCtxBtn("Settings", "settings", openSettings);
  ctx.hidden = false;
  ctx.style.left = "0px";
  ctx.style.top = "0px";
  const r = ctx.getBoundingClientRect();
  ctx.style.left = Math.max(4, Math.min(ev.clientX, innerWidth - r.width - 4)) + "px";
  ctx.style.top = Math.max(4, Math.min(ev.clientY, innerHeight - r.height - 4)) + "px";
});
addEventListener("pointerdown", ev => {
  if (!sizeMenu.hidden && !ev.target.closest("#size-wrap")) closeSize();
  if (ctx.hidden || ev.target.closest("#ctx-menu")) return;
  closeCtx();
});
addEventListener("scroll", closeCtx, true);

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
  if (ev.key === "Escape" && !ctx.hidden) {
    ev.preventDefault();
    closeCtx();
    return;
  }
  if (ev.key === "Escape" && confirmOpen()) {
    ev.preventDefault();
    closeConfirm();
    return;
  }
  if (ev.key === "Escape" && settingsOpen()) {
    ev.preventDefault();
    closeSettings();
    return;
  }
  if (ev.key === "Delete" || ev.key === "Backspace") {
    if (document.body.classList.contains("tab-effects")) return;
    if (ev.target.matches("input,textarea,select")) return;
    ev.preventDefault();
    delPoint();
  }
});

async function boot() {
  const v = await fetch("/api/version").then(r => r.json()).catch(() => ({ version: "dev" }));
  document.getElementById("file-version").textContent = v.version;
  // Server may still be starting (or restarting): show the banner and retry.
  for (;;) {
    try {
      const res = await fetch("/api/design");
      if (res.ok) { d = await res.json(); break; }
    } catch (e) {}
    banner.hidden = false;
    await new Promise(r => setTimeout(r, 1000));
  }
  lastSeen = JSON.stringify(d);
  snapMask();
  await loadPalettes();
  await loadAnims();
  pushHist();
  paint();
  window.designInk = await mountInk(document.getElementById("ink"));
  paint();
  if (location.pathname === "/control") setSideTab("effects");
  const es = new EventSource("/api/events?admin=1");
  es.onerror = () => { banner.hidden = false; };
  es.onopen = () => {
    banner.hidden = true;
    if (dirty) save();
  };
  es.onmessage = (ev) => {
    const msg = (ev.data || "").trim();
    if (msg === "update" || msg === "hello") { pullDesign(); pullAnims(); pullLibs.forEach((fn) => fn()); }
  };
}
boot();
