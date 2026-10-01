function applyOverlayBackground() {
  if (/OBS/i.test(navigator.userAgent)) document.body.classList.add("obs");
}

function bustFavicon(v) {
  const l = document.querySelector('link[rel="icon"]');
  if (l) l.href = "/favicon.ico?v=" + encodeURIComponent(v || Date.now());
}
fetch("/api/version").then(r => r.json()).then(d => bustFavicon(d.run || d.version)).catch(() => bustFavicon());

function pathD(d) {
  return d.points.map((p, i) => (i ? "L" : "M") + p.x + " " + p.y).join(" ") + " Z";
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
    const hole = document.createElementNS(ns, "path");
    hole.setAttribute("d", pathD(d));
    hole.setAttribute("class", "hole");
    svg.appendChild(hole);
  }

  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", pathD(d));
  path.setAttribute("class", "border-path" + (d.dash ? " dash" : ""));
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", d.stroke || "#e6f350");
  path.setAttribute("stroke-width", String(d.strokeWidth || 12));
  path.setAttribute("stroke-linejoin", "round");
  path.style.setProperty("--sw", (d.strokeWidth || 12) + "px");
  if (d.glow) path.style.filter = "drop-shadow(0 0 " + d.glow + "px " + (d.stroke || "#e6f350") + ")";
  svg.appendChild(path);

  if (handles) {
    d.points.forEach((p, i) => {
      const h = document.createElementNS(ns, "circle");
      h.setAttribute("cx", p.x); h.setAttribute("cy", p.y); h.setAttribute("r", 10);
      h.setAttribute("class", "handle" + (opts.sel === i ? " sel" : ""));
      h.dataset.i = String(i);
      svg.appendChild(h);
    });
  }
}

// Mask: full-frame black, white filled polygon (nonzero winding). OBS Image Mask.
function maskCanvas(d) {
  const c = document.createElement("canvas");
  c.width = d.width;
  c.height = d.height;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  d.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath();
  ctx.fill("nonzero");
  return c;
}

function fireOverlayAnim(kind) {
  const k = kind === "flash" ? "flash" : "pulse";
  document.body.classList.remove("pulse", "flash");
  void document.body.offsetWidth;
  document.body.classList.add(k);
  setTimeout(() => document.body.classList.remove(k), 800);
}
