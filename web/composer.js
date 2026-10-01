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
  sel = Math.min(sel, d.points.length - 1);
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
  document.getElementById("in-stroke").value = toColor(d.stroke);
  document.getElementById("in-stroke-hex").value = d.stroke;
  document.getElementById("in-width").value = d.strokeWidth;
  document.getElementById("in-glow").value = d.glow;
  document.getElementById("in-dash").checked = !!d.dash;
  document.getElementById("in-mw").value = d.width;
  document.getElementById("in-mh").value = d.height;
  document.getElementById("mask-prev").src = maskCanvas(d).toDataURL("image/png");
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
    lab.onfocus = pushHist;
    lab.onchange = () => { ev.label = lab.value; ev.id = slug(lab.value) || ev.id; scheduleSave(); };
    const anim = document.createElement("select");
    ["pulse", "flash"].forEach(k => {
      const o = document.createElement("option");
      o.value = k; o.textContent = k; if (ev.anim === k) o.selected = true;
      anim.appendChild(o);
    });
    anim.onfocus = pushHist;
    anim.onchange = () => { ev.anim = anim.value; scheduleSave(); };
    const del = document.createElement("button");
    del.type = "button";
    del.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
    del.onclick = () => { pushHist(); d.events.splice(i, 1); paintCtrl(); scheduleSave(); };
    row.append(lab, anim, del);
    grid.appendChild(row);
  });
}

function toColor(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
  return m ? "#" + m[1] : "#e6f350";
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

let drag = null;
stage.addEventListener("pointerdown", ev => {
  const p = svgPoint(ev);
  const hit = ev.target.closest && ev.target.closest(".handle");
  if (hit) {
    pushHist();
    sel = Number(hit.dataset.i);
    drag = sel;
    stage.setPointerCapture(ev.pointerId);
    paint();
    return;
  }
  addPointAt(p);
});
stage.addEventListener("pointermove", ev => {
  if (drag == null) return;
  const p = snapPt(svgPoint(ev));
  d.points[drag] = { x: p.x, y: p.y };
  paint();
});
stage.addEventListener("pointerup", () => {
  if (drag != null) scheduleSave();
  drag = null;
});

function delPoint() {
  if (d.points.length <= 3) return;
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
lookInput(document.getElementById("in-stroke"), () => { d.stroke = document.getElementById("in-stroke").value; });
lookInput(document.getElementById("in-stroke-hex"), () => { d.stroke = document.getElementById("in-stroke-hex").value; });
lookInput(document.getElementById("in-width"), () => { d.strokeWidth = Number(document.getElementById("in-width").value) || 1; });
lookInput(document.getElementById("in-glow"), () => { d.glow = Number(document.getElementById("in-glow").value) || 0; });
lookInput(document.getElementById("in-dash"), () => { d.dash = document.getElementById("in-dash").checked; });
lookInput(document.getElementById("in-mw"), () => { d.width = Math.max(16, Number(document.getElementById("in-mw").value) || 1920); });
lookInput(document.getElementById("in-mh"), () => { d.height = Math.max(16, Number(document.getElementById("in-mh").value) || 1080); });

function slug(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

document.getElementById("btn-ctrl-edit").onclick = () => { ctrlEdit = !ctrlEdit; paintCtrl(); };
document.getElementById("btn-ev-add").onclick = () => {
  pushHist();
  const n = (d.events || []).length + 1;
  d.events = d.events || [];
  d.events.push({ id: "event-" + n, label: "Event " + n, anim: "pulse" });
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
  pushHist();
  paint();
  if (location.pathname === "/control") setView("control");
  const es = new EventSource("/api/events?admin=1");
  es.onerror = () => { banner.hidden = false; };
  es.onopen = () => { banner.hidden = true; };
}
boot();
