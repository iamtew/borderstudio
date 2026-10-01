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

const MOTION_KINDS = [
  { id: "none", label: "None" },
  { id: "dash", label: "Dash" },
  { id: "dash-rev", label: "Dash reverse" },
  { id: "dash-fast", label: "Dash fast" },
  { id: "dots", label: "Dots" },
  { id: "long-dash", label: "Long dash" },
  { id: "flow", label: "Flow" },
  { id: "scan", label: "Scan" },
  { id: "breathe", label: "Breathe" },
  { id: "heartbeat", label: "Heartbeat" },
  { id: "glow-pulse", label: "Glow pulse" },
  { id: "neon", label: "Neon" },
  { id: "hue", label: "Hue" },
  { id: "rainbow", label: "Rainbow" },
  { id: "shimmer", label: "Shimmer" },
];

const EVENT_ANIMS = [
  { id: "pulse", label: "Pulse", ms: 700, group: "Pulse" },
  { id: "pulse-soft", label: "Pulse soft", ms: 900, group: "Pulse" },
  { id: "pulse-hard", label: "Pulse hard", ms: 500, group: "Pulse" },
  { id: "pulse-double", label: "Pulse double", ms: 900, group: "Pulse" },
  { id: "heartbeat", label: "Heartbeat", ms: 1000, group: "Pulse" },
  { id: "flash", label: "Flash", ms: 400, group: "Flash" },
  { id: "flash-white", label: "Flash white", ms: 400, group: "Flash" },
  { id: "flash-hot", label: "Flash hot", ms: 450, group: "Flash" },
  { id: "flash-cold", label: "Flash cold", ms: 450, group: "Flash" },
  { id: "whiteout", label: "Whiteout", ms: 500, group: "Flash" },
  { id: "alert", label: "Alert", ms: 700, group: "Alert" },
  { id: "success", label: "Success", ms: 600, group: "Alert" },
  { id: "warn", label: "Warn", ms: 600, group: "Alert" },
  { id: "strobe", label: "Strobe", ms: 800, group: "Alert" },
  { id: "blink", label: "Blink", ms: 600, group: "Alert" },
  { id: "flicker", label: "Flicker", ms: 500, group: "Alert" },
  { id: "shake", label: "Shake", ms: 500, group: "Hit" },
  { id: "jolt", label: "Jolt", ms: 350, group: "Hit" },
  { id: "swell", label: "Swell", ms: 700, group: "Hit" },
  { id: "snap", label: "Snap", ms: 400, group: "Hit" },
  { id: "wipe", label: "Wipe", ms: 800, group: "Hit" },
  { id: "reverse-wipe", label: "Reverse wipe", ms: 800, group: "Hit" },
  { id: "rainbow-burst", label: "Rainbow burst", ms: 900, group: "Glitch" },
  { id: "glitch", label: "Glitch", ms: 500, group: "Glitch" },
  { id: "spark", label: "Spark", ms: 600, group: "Glitch" },
  { id: "boom", label: "Boom", ms: 700, group: "Glitch" },
];

function motionOf(d) {
  const id = d.motion || (d.dash ? "dash" : "none");
  return MOTION_KINDS.some(m => m.id === id) ? id : "none";
}

function styleStroke(el, d) {
  const motion = motionOf(d);
  el.setAttribute("class", "border-path" + (motion !== "none" ? " motion-" + motion : ""));
  el.setAttribute("fill", "none");
  el.setAttribute("stroke", d.stroke || "#e6f350");
  el.setAttribute("stroke-width", String(d.strokeWidth || 12));
  el.setAttribute("stroke-linejoin", "round");
  el.style.setProperty("--sw", (d.strokeWidth || 12) + "px");
  el.style.setProperty("--glow", (d.glow || 0) + "px");
  el.style.setProperty("--stroke", d.stroke || "#e6f350");
}

function fillMotionSelect(sel, value) {
  if (!sel.dataset.filled) {
    MOTION_KINDS.forEach(m => {
      const o = document.createElement("option");
      o.value = m.id;
      o.textContent = m.label;
      sel.appendChild(o);
    });
    sel.dataset.filled = "1";
  }
  sel.value = value;
}

function fillEventAnimSelect(sel, value) {
  if (!sel.dataset.filled) {
    const groups = new Map();
    EVENT_ANIMS.forEach(a => {
      let g = groups.get(a.group);
      if (!g) {
        g = document.createElement("optgroup");
        g.label = a.group;
        groups.set(a.group, g);
        sel.appendChild(g);
      }
      const o = document.createElement("option");
      o.value = a.id;
      o.textContent = a.label;
      g.appendChild(o);
    });
    sel.dataset.filled = "1";
  }
  sel.value = EVENT_ANIMS.some(a => a.id === value) ? value : "pulse";
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

let overlayAnimT;
function fireOverlayAnim(kind) {
  const hit = EVENT_ANIMS.find(a => a.id === kind) || EVENT_ANIMS[0];
  document.body.classList.remove(...EVENT_ANIMS.map(a => a.id));
  void document.body.offsetWidth;
  document.body.classList.add(hit.id);
  clearTimeout(overlayAnimT);
  overlayAnimT = setTimeout(() => document.body.classList.remove(hit.id), hit.ms);
}
