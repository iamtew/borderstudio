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

// Closed ribbon: centerline + mitered normal. Width is a uniform, so this stays put while the stroke breathes.
// The first point is repeated at uv.x = 1 so the closing edge does not wrap the dash backwards.
function buildRibbon(poly) {
  const pts = poly && poly.pts;
  const n = pts ? pts.length : 0;
  const L = poly && poly.length;
  if (n < 2 || !L) return null;
  const seg = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    let dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    seg.push({ x: -dy, y: dx });
  }
  const miter = [];
  for (let i = 0; i < n; i++) {
    const prev = seg[(i + n - 1) % n], next = seg[i];
    let mx = prev.x + next.x, my = prev.y + next.y;
    const ml = Math.hypot(mx, my);
    let nx = next.x, ny = next.y, scale = 1;
    if (ml > 1e-4) {
      nx = mx / ml; ny = my / ml;
      const denom = nx * next.x + ny * next.y;
      // ponytail: bevel past a miter of 3. A round join would need extra verts.
      if (denom > 1 / 3) scale = Math.min(3, 1 / denom);
      else { nx = next.x; ny = next.y; scale = 1; }
    }
    miter.push({ x: nx * scale, y: ny * scale, u: pts[i].s / L });
  }
  const v = n + 1;
  const positions = new Float32Array(v * 4);
  const normals = new Float32Array(v * 4);
  const uvs = new Float32Array(v * 4);
  const indices = new Uint32Array(n * 6);
  for (let i = 0; i < v; i++) {
    const src = i === n ? miter[0] : miter[i];
    const u = i === n ? 1 : src.u;
    const p = i === n ? pts[0] : pts[i];
    for (let side = 0; side < 2; side++) {
      const sgn = side ? 1 : -1;
      const o = (i * 2 + side) * 2;
      positions[o] = p.x;
      positions[o + 1] = p.y;
      normals[o] = src.x * sgn;
      normals[o + 1] = src.y * sgn;
      uvs[o] = u;
      uvs[o + 1] = sgn;
    }
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    const k = i * 6;
    indices[k] = a; indices[k + 1] = b; indices[k + 2] = c;
    indices[k + 3] = b; indices[k + 4] = d; indices[k + 5] = c;
  }
  return { positions, normals, uvs, indices };
}

// dash "2000 2000" is a reveal, not a dash. Direction comes from the keys so a saved preset still wipes.
function revealSpan(recipe, offset) {
  const d0 = parseFloat(recipe && recipe.dash);
  if (!(d0 >= 1000)) return null;
  const keys = (recipe && recipe.keys) || [];
  const a = (keys[0] && keys[0].offset) || 0;
  const b = (keys[keys.length - 1] && keys[keys.length - 1].offset) || 0;
  const reverse = b > a;
  const frac = Math.max(0, Math.min(1, reverse ? (offset || 0) / 2000 : 1 - (offset || 0) / 2000));
  return reverse ? [1 - frac, 1] : [0, frac];
}

function chromaGhost(recipe) {
  const f = recipe && fxOf(recipe, "chroma");
  return !!(f && f.n >= 1);
}

function fxScale(recipe) {
  const s = recipe && recipe.strength;
  return s == null || s !== s ? 1 : s;
}

// ponytail: first on-span plus the full period. A preset with two on-spans needs the spans packed into the shader.
function dashParts(dash) {
  const pat = String(dash || "").trim().split(/[\s,]+/).map(Number).filter(v => v > 0);
  if (pat.length < 2) return null;
  let period = pat.reduce((a, b) => a + b, 0);
  if (pat.length % 2) period *= 2;
  if (!(period > 0) || pat[0] >= 1000) return null;
  return { period, on: pat[0] };
}

function travelSign(recipe) {
  const keys = (recipe && recipe.keys) || [];
  const a = keys[0] && keys[0].offset;
  const b = keys[keys.length - 1] && keys[keys.length - 1].offset;
  if (a == null || b == null || a === b) return -1;
  return b < a ? -1 : 1;
}

function alongStroke(recipe) {
  const keys = (recipe && recipe.keys) || [];
  return keys.some(k => k.hue != null && k.hue !== "");
}

function designKey(d) {
  if (!d) return "";
  const pts = d.points || [];
  let s = (d.kind || "polygon") + "|" + d.x + "|" + d.y + "|" + d.w + "|" + d.h + "|" + d.r + "|" + d.width + "|" + d.height;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    s += ";" + p.x + "," + p.y + "," + (p.smooth ? 1 : 0) + "," + p.ix + "," + p.iy + "," + p.ox + "," + p.oy;
  }
  return s;
}

function rgb01(hex) {
  const c = hexRgb(hex);
  return [c.r / 255, c.g / 255, c.b / 255];
}

const INK_GL = `
uniform mediump vec4 uInk0;
uniform mediump vec4 uInk1;
uniform mediump vec4 uInk2;
uniform mediump vec4 uInk3;
uniform mediump vec4 uRgb;
vec3 inkHue(vec3 color, float hue) {
    const vec3 k = vec3(0.57735);
    float c = cos(hue);
    return color * c + cross(k, color) * sin(hue) + k * dot(k, color) * (1.0 - c);
}
float inkWrap(float a, float m) {
    return mod(mod(a, m) + m, m);
}
`;

const inkBitGl = {
  name: "ink-ribbon-bit",
  vertex: {
    header: INK_GL + "in vec2 aNormal;",
    main: `
            float amp = uInk2.x;
            float bands = uInk2.y;
            if (amp > 0.5 && bands > 0.5) {
                float h = max(8.0, uInk1.w / bands);
                float n = fract(sin(floor(aPosition.y / h) * 12.9898 + uInk2.z) * 43758.5453);
                position.x += (n - 0.5) * 2.0 * amp;
            }
            position += aNormal * (uInk0.x * 0.5);
        `,
  },
  fragment: {
    header: INK_GL,
    main: `
            float cover = 1.0;
            float aa = 1.5 / max(uInk1.w, 1.0);
            if (uInk0.z > 0.001) cover *= smoothstep(uInk0.z - aa, uInk0.z + aa, vUV.x);
            if (uInk0.w < 0.999) cover *= 1.0 - smoothstep(uInk0.w - aa, uInk0.w + aa, vUV.x);
            float period = uInk1.x;
            float on = uInk1.y;
            float alongS = vUV.x * uInk1.w;
            vec3 col = uRgb.rgb;
            if (period > 1.0 && on < period - 0.01) {
                float u = inkWrap(alongS + uInk1.z, period);
                float featherPx = max(uInk0.x * 0.35, 1.0);
                cover *= 1.0 - smoothstep(on - featherPx, on + featherPx, u);
                float edge = uInk3.z < 0.0 ? (on - u) : u;
                float cap = uInk2.w;
                if (cap > 0.5 && edge < cap) col += (1.0 - edge / cap) * 0.55;
            }
            float tail = uInk3.y;
            if (tail > 1.0) {
                float ds = inkWrap(uInk3.z < 0.0 ? alongS - uInk3.x : uInk3.x - alongS, max(uInk1.w, 1.0));
                if (ds < tail) col += (1.0 - ds / tail) * 0.45;
            }
            if (cover < 0.02) discard;
            if (uInk0.y > 0.5) col = inkHue(col, vUV.x * 6.2831853);
            float a = clamp(cover, 0.0, 1.0) * (1.0 - smoothstep(0.8, 1.0, abs(vUV.y)));
            outColor = vec4(col * a, a);
        `,
  },
};

const INK_WGSL = `
struct InkUniforms {
    uInk0: vec4<f32>,
    uInk1: vec4<f32>,
    uInk2: vec4<f32>,
    uInk3: vec4<f32>,
    uRgb: vec4<f32>,
};
@group(2) @binding(0) var<uniform> inkUniforms: InkUniforms;

fn inkHue(color: vec3<f32>, hue: f32) -> vec3<f32> {
    let k = vec3<f32>(0.57735, 0.57735, 0.57735);
    let c = cos(hue);
    return color * c + cross(k, color) * sin(hue) + k * dot(k, color) * (1.0 - c);
}
fn inkWrap(a: f32, m: f32) -> f32 {
    return ((a % m) + m) % m;
}
`;

const inkBitGpu = {
  name: "ink-ribbon-bit",
  vertex: {
    header: INK_WGSL + "@in aNormal: vec2<f32>;",
    main: `
            let amp = inkUniforms.uInk2.x;
            let bands = inkUniforms.uInk2.y;
            if (amp > 0.5 && bands > 0.5) {
                let h = max(8.0, inkUniforms.uInk1.w / bands);
                let n = fract(sin(floor(aPosition.y / h) * 12.9898 + inkUniforms.uInk2.z) * 43758.5453);
                position.x = position.x + (n - 0.5) * 2.0 * amp;
            }
            position = position + aNormal * (inkUniforms.uInk0.x * 0.5);
        `,
  },
  fragment: {
    header: INK_WGSL,
    main: `
            var cover = 1.0;
            let aa = 1.5 / max(inkUniforms.uInk1.w, 1.0);
            if (inkUniforms.uInk0.z > 0.001) {
                cover = cover * smoothstep(inkUniforms.uInk0.z - aa, inkUniforms.uInk0.z + aa, vUV.x);
            }
            if (inkUniforms.uInk0.w < 0.999) {
                cover = cover * (1.0 - smoothstep(inkUniforms.uInk0.w - aa, inkUniforms.uInk0.w + aa, vUV.x));
            }
            let period = inkUniforms.uInk1.x;
            let on = inkUniforms.uInk1.y;
            let alongS = vUV.x * inkUniforms.uInk1.w;
            var col = inkUniforms.uRgb.rgb;
            if (period > 1.0 && on < period - 0.01) {
                let u = inkWrap(alongS + inkUniforms.uInk1.z, period);
                let featherPx = max(inkUniforms.uInk0.x * 0.35, 1.0);
                cover = cover * (1.0 - smoothstep(on - featherPx, on + featherPx, u));
                let edge = select(u, on - u, inkUniforms.uInk3.z < 0.0);
                let cap = inkUniforms.uInk2.w;
                if (cap > 0.5 && edge < cap) { col = col + vec3<f32>(1.0 - edge / cap) * 0.55; }
            }
            let tail = inkUniforms.uInk3.y;
            if (tail > 1.0) {
                let ds = inkWrap(select(inkUniforms.uInk3.x - alongS, alongS - inkUniforms.uInk3.x, inkUniforms.uInk3.z < 0.0), max(inkUniforms.uInk1.w, 1.0));
                if (ds < tail) { col = col + vec3<f32>(1.0 - ds / tail) * 0.45; }
            }
            if (cover < 0.02) { discard; }
            if (inkUniforms.uInk0.y > 0.5) { col = inkHue(col, vUV.x * 6.2831853); }
            let a = clamp(cover, 0.0, 1.0) * (1.0 - smoothstep(0.8, 1.0, abs(vUV.y)));
            outColor = vec4<f32>(col * a, a);
        `,
  },
};

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
  const canvasRoot = new PIXI.Container();
  const haloG = new PIXI.Graphics();
  const coreG = new PIXI.Graphics();
  const fxG = new PIXI.Graphics();
  const boltG = new PIXI.Graphics();
  haloG.blendMode = "add";
  fxG.blendMode = "add";
  boltG.blendMode = "add";
  canvasRoot.addChild(haloG, coreG, fxG, boltG);
  pad.addChild(inkRoot);
  inkRoot.addChild(canvasRoot);
  world.addChild(pad);
  app.stage.addChild(world);

  const useGL = app.renderer.type !== 4;
  const Blur = PIXI.BlurFilter;
  const blur = useGL && Blur ? new Blur({ strength: 0, quality: 2 }) : null;
  const chromaBlur = useGL && Blur ? new Blur({ strength: 6, quality: 3 }) : null;

  function blankGeom() {
    const g = new PIXI.Geometry();
    const z = new Float32Array(6);
    g.addAttribute("aPosition", { buffer: z.slice(), format: "float32x2", stride: 8, offset: 0 });
    g.addAttribute("aUV", { buffer: z.slice(), format: "float32x2", stride: 8, offset: 0 });
    g.addAttribute("aNormal", { buffer: z.slice(), format: "float32x2", stride: 8, offset: 0 });
    g.addIndex(new Uint32Array([0, 1, 2]));
    return g;
  }

  function inkGroup() {
    return new PIXI.UniformGroup({
      uInk0: { value: new Float32Array(4), type: "vec4<f32>" },
      uInk1: { value: new Float32Array(4), type: "vec4<f32>" },
      uInk2: { value: new Float32Array(4), type: "vec4<f32>" },
      uInk3: { value: new Float32Array(4), type: "vec4<f32>" },
      uRgb: { value: new Float32Array([1, 1, 1, 1]), type: "vec4<f32>" },
    }, { ubo: false });
  }

  let geom = null;
  let passes = null;
  let ribbon = false;
  const dot = PIXI.Texture.from((function () {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d");
    const rad = g.createRadialGradient(16, 16, 1, 16, 16, 16);
    rad.addColorStop(0, "#fff");
    rad.addColorStop(0.45, "rgba(255,255,255,0.75)");
    rad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = rad;
    g.fillRect(0, 0, 32, 32);
    return c;
  })());
  const heads = [];
  const sparkPool = [];
  for (let i = 0; i < 8; i++) {
    const s = new PIXI.Sprite(dot);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.visible = false;
    heads.push(s);
    inkRoot.addChild(s);
  }
  for (let i = 0; i < 16; i++) {
    const s = new PIXI.Sprite(dot);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.visible = false;
    sparkPool.push({ sprite: s, life: 0, s: 0, r: 2 });
    inkRoot.addChild(s);
  }
  inkRoot.addChild(boltG);
  const ribbonRoot = new PIXI.Container();
  const chromaRoot = new PIXI.Container();
  inkRoot.addChildAt(ribbonRoot, 0);

  if (useGL && PIXI.compileHighShaderGlProgram && PIXI.Shader) {
    try {
      geom = blankGeom();
      const glProgram = PIXI.compileHighShaderGlProgram({
        name: "ink-ribbon",
        bits: [PIXI.localUniformBitGl, PIXI.roundPixelsBitGl, inkBitGl],
      });
      let gpuProgram = null;
      try {
        gpuProgram = PIXI.compileHighShaderGpuProgram({
          name: "ink-ribbon",
          bits: [PIXI.localUniformBit, PIXI.roundPixelsBit, inkBitGpu],
        });
      } catch (e) { gpuProgram = null; }
      function makePass(blend, parent) {
        const shader = new PIXI.Shader({ glProgram, gpuProgram, resources: { inkUniforms: inkGroup() } });
        const mesh = new PIXI.Mesh({ geometry: geom, shader });
        mesh.blendMode = blend;
        mesh.visible = false;
        (parent || ribbonRoot).addChild(mesh);
        return { mesh, shader };
      }
      passes = {
        halo: makePass("add"),
        core: makePass("normal"),
        hot: makePass("add"),
        ring: makePass("add"),
        cr: makePass("add", chromaRoot),
        cg: makePass("add", chromaRoot),
        cb: makePass("add", chromaRoot),
      };
      ribbonRoot.addChild(chromaRoot);
      ribbon = true;
      canvasRoot.visible = false;
    } catch (e) {
      console.error("ink shader", e);
      ribbon = false;
    }
  }

  const ink = {
    design: null,
    view: {},
    recipe: null,
    once: false,
    tMs: 0,
    token: 0,
    poly: { pts: [], length: 0, cx: 0, cy: 0, maxDim: 1 },
    key: "",
    sparkI: 0,
    sparkTick: 0,
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

  function strokeStyle(width, color, alpha) {
    return { width: Math.max(0.5, width), color: colorNum(color), alpha, cap: "round", join: "round" };
  }

  function uploadRibbon(rib) {
    if (!geom || !rib) return;
    const put = (name, data) => {
      const buf = geom.getBuffer(name);
      buf.data = data;
      buf.update();
    };
    put("aPosition", rib.positions);
    put("aUV", rib.uvs);
    put("aNormal", rib.normals);
    geom.indexBuffer.data = rib.indices;
    geom.indexBuffer.update();
  }

  function pushPass(pass, o) {
    const g = pass.shader.resources.inkUniforms;
    const u = g.uniforms;
    const a = u.uInk0, b = u.uInk1, c = u.uInk2, d = u.uInk3, r = u.uRgb;
    a[0] = o.width; a[1] = o.along; a[2] = o.r0; a[3] = o.r1;
    b[0] = o.period; b[1] = o.dashOn; b[2] = o.off; b[3] = o.len;
    c[0] = o.sliceA; c[1] = o.sliceN; c[2] = o.sliceT; c[3] = o.cap;
    d[0] = o.headS; d[1] = o.tail; d[2] = o.sign; d[3] = 0;
    r[0] = o.rgb[0]; r[1] = o.rgb[1]; r[2] = o.rgb[2]; r[3] = 1;
    g.update();
    pass.mesh.visible = o.on;
    pass.mesh.alpha = o.alpha;
    pass.mesh.position.set(o.x || 0, o.y || 0);
  }

  function draw(u) {
    try { drawInk(u); } catch (e) { console.error("ink", e); }
  }

  function drawInk(u) {
    const d = ink.design;
    const poly = ink.poly;
    if (!d || !poly.pts.length) {
      if (passes) Object.keys(passes).forEach(k => { passes[k].mesh.visible = false; });
      return;
    }
    const recipe = ink.recipe;
    const pose = recipe ? poseAt(recipe, d, u) : { t: u, width: 1, glow: 0, opacity: 1, offset: 0, x: 0, y: 0, rot: 0, hue: 0, color: d.stroke || "#e6f350" };
    const sw = (d.strokeWidth || 12) * pose.width;
    const glowPx = Math.max(0, (d.glow || 0) + pose.glow);
    const blurPx = d.blur || 0;
    const alpha = Math.max(0, Math.min(1, pose.opacity));
    const color = pose.color;
    const rgb = rgb01(color);
    inkRoot.position.set(poly.cx + pose.x, poly.cy + pose.y);
    inkRoot.pivot.set(poly.cx, poly.cy);
    inkRoot.rotation = (pose.rot || 0) * Math.PI / 180;

    if (blur) {
      const b = Math.max(0, blurPx);
      blur.blur = b;
      if ("strength" in blur) blur.strength = b;
      blur.padding = Math.ceil(b + sw + glowPx + 8);
      inkRoot.filters = b > 0 ? [blur] : null;
    }

    const scale = fxScale(recipe);
    const ghost = chromaGhost(recipe);
    const chroma = recipe && fxOf(recipe, "chroma");
    let sx = 0, sy = 0;
    if (chroma && chroma.px) {
      let px = chroma.px * scale;
      if (ghost) px *= poly.maxDim / 192;
      const env = recipe.loop ? (0.65 + 0.35 * Math.sin(u * Math.PI * 2)) : Math.sin(Math.min(1, Math.max(0, u)) * Math.PI);
      sx = px * env;
    }
    const mv = Math.hypot(pose.x || 0, pose.y || 0);
    if (mv > 0.5) { sx += pose.x * 0.35; sy += pose.y * 0.35; }

    const reveal = recipe ? revealSpan(recipe, pose.offset) : null;
    const dash = recipe && !reveal ? dashParts(recipe.dash) : null;
    const slices = recipe && fxOf(recipe, "slices");
    const head = recipe && fxOf(recipe, "head");
    const sign = travelSign(recipe);
    const hasOff = !!((recipe && recipe.keys) || []).some(k => k.offset != null && k.offset !== "");
    const headS = head ? (hasOff ? -pose.offset : u * poly.length) : 0;
    const tail = head ? (head.px || 0) * scale : 0;
    const shared = {
      along: alongStroke(recipe) ? 1 : 0,
      r0: reveal ? reveal[0] : 0,
      r1: reveal ? reveal[1] : 1,
      period: dash ? dash.period : 0,
      dashOn: dash ? dash.on : 0,
      off: pose.offset || 0,
      len: poly.length,
      sliceA: slices ? 8 * scale : 0,
      sliceN: slices ? slices.n : 0,
      sliceT: Math.floor(ink.tMs / 80),
      cap: dash ? Math.max(3, sw * 0.45) : 0,
      headS: headS,
      tail: tail,
      sign: sign,
    };

    if (ribbon) {
      const show = alpha > 0.004;
      pushPass(passes.halo, Object.assign({ on: show && !ghost && glowPx > 0, alpha: Math.min(0.55, alpha * 0.5), width: sw + glowPx * 1.6, rgb }, shared));
      pushPass(passes.core, Object.assign({ on: show && !ghost, alpha, width: sw, rgb }, shared));
      const hot = show && !ghost && pose.width > 1.05;
      pushPass(passes.hot, Object.assign({ on: hot, alpha: Math.min(0.5, (pose.width - 1) * 0.35) * alpha, width: sw * 0.45, rgb: [1, 1, 1] }, shared));
      const ring = recipe && fxOf(recipe, "ring");
      const boom = Math.min(1, u / 0.45);
      pushPass(passes.ring, Object.assign({
        on: !!(ring && show),
        alpha: ring ? 0.55 * (1 - boom) * alpha : 0,
        width: sw * (1 + boom * 5),
        rgb: [1, 1, 1],
      }, shared));
      const split = Math.hypot(sx, sy) > 0.2 && show;
      const ca = ghost ? Math.min(1, alpha) : alpha * 0.55;
      const fringe = !!(chroma && chroma.px);
      if (fringe) {
        pushPass(passes.cr, Object.assign({ on: split, alpha: ca, width: sw, rgb: [0, 1, 1], x: sx, y: sy }, shared));
        pushPass(passes.cg, Object.assign({ on: false, alpha: 0, width: sw, rgb: [0, 0, 0] }, shared));
        pushPass(passes.cb, Object.assign({ on: split, alpha: ca, width: sw, rgb: [1, 0, 1], x: -sx, y: -sy }, shared));
      } else {
        pushPass(passes.cr, Object.assign({ on: split, alpha: ca, width: sw, rgb: [rgb[0], 0, 0], x: sx, y: sy }, shared));
        pushPass(passes.cg, Object.assign({ on: split, alpha: ca, width: sw, rgb: [0, rgb[1], 0] }, shared));
        pushPass(passes.cb, Object.assign({ on: split, alpha: ca, width: sw, rgb: [0, 0, rgb[2]], x: -sx, y: -sy }, shared));
      }
      if (chromaBlur) {
        const soft = fringe && split;
        chromaRoot.filters = soft ? [chromaBlur] : null;
        if (soft) {
          const bs = Math.max(2.5, sw * 0.22);
          chromaBlur.strength = bs;
          chromaBlur.blur = bs;
          chromaBlur.padding = Math.ceil(bs + 8);
        }
      }
    } else {
      drawCanvas(poly, recipe, pose, sw, glowPx, alpha, color, ghost, sx, sy, reveal);
    }

    const headN = head ? Math.max(1, Math.min(8, head.n || 1)) : 0;
    const headWhite = head && !(recipe && recipe.dash);
    for (let i = 0; i < heads.length; i++) {
      const s = heads[i];
      if (i >= headN || alpha < 0.004) { s.visible = false; continue; }
      const p = atLen(poly, headS + (i * poly.length) / headN);
      s.visible = true;
      s.position.set(p.x, p.y);
      const rad = Math.max(2, sw * (i ? 0.55 : 0.75));
      s.scale.set(rad / 16);
      s.alpha = alpha;
      s.tint = headWhite ? 0xffffff : colorNum(color);
    }

    const wantSparks = !!(head && (head.px || 0) * scale >= 64);
    if (wantSparks) {
      ink.sparkTick = (ink.sparkTick + 1) % 3;
      if (ink.sparkTick === 0) {
        const sp = sparkPool[ink.sparkI];
        ink.sparkI = (ink.sparkI + 1) % sparkPool.length;
        sp.life = 1;
        sp.s = headS;
        sp.r = Math.max(2, sw * 0.28);
      }
    }
    sparkPool.forEach(sp => {
      if (!wantSparks || sp.life <= 0) { sp.sprite.visible = false; sp.life = wantSparks ? sp.life : 0; return; }
      sp.life -= 0.035;
      sp.s -= 8;
      if (sp.life <= 0) { sp.sprite.visible = false; return; }
      const p = atLen(poly, sp.s);
      sp.sprite.visible = true;
      sp.sprite.position.set(p.x, p.y);
      sp.sprite.scale.set((sp.r * sp.life) / 16);
      sp.sprite.alpha = sp.life * 0.75;
      sp.sprite.tint = 0xffffff;
    });

    const bolts = recipe && fxOf(recipe, "bolts");
    boltG.clear();
    if (bolts && bolts.n && pose.glow > 10 && alpha > 0.05) {
      const seed = Math.floor(u * 40);
      const n = Math.min(12, bolts.n);
      for (let i = 0; i < n; i++) {
        const p = atLen(poly, (seed * 97 + i * 211) % poly.length);
        const len = 18 + ((seed + i * 3) % 24);
        boltG.moveTo(p.x, p.y);
        boltG.lineTo(p.x - p.ty * len, p.y + p.tx * len);
        boltG.stroke(strokeStyle(2, "#fff", 0.8 * alpha));
      }
    }
  }

  function drawCanvas(poly, recipe, pose, sw, glowPx, alpha, color, ghost, sx, sy, reveal) {
    haloG.clear(); coreG.clear(); fxG.clear();
    const span = reveal ? { s0: poly.length * reveal[0], s1: poly.length * reveal[1] } : { s0: 0, s1: poly.length };
    const dash = recipe && !reveal ? recipe.dash : "";
    function stroke(g, dx, dy, width, col, a) {
      if (a < 0.004) return;
      const op = dx || dy ? { pts: poly.pts.map(p => ({ x: p.x + dx, y: p.y + dy, s: p.s })), length: poly.length } : poly;
      if (dash && parseFloat(dash) < 1000) {
        dashWalk(op, dash, pose.offset, (a0, b0) => {
          const from = Math.max(a0, span.s0), to = Math.min(b0, span.s1);
          if (to > from) traceSpan(g, op, from, to);
        });
      } else traceSpan(g, op, span.s0, span.s1);
      g.stroke(strokeStyle(width, col, a));
    }
    if (!ghost && glowPx > 0) stroke(haloG, 0, 0, sw + glowPx * 1.6, color, Math.min(0.55, alpha * 0.5));
    if (!ghost) stroke(coreG, 0, 0, sw, color, alpha);
    if (Math.hypot(sx, sy) > 0.2) {
      const ca = ghost ? alpha : alpha * 0.55;
      const fringe = recipe && fxOf(recipe, "chroma");
      if (fringe && fringe.px) {
        [[sx, sy, "#00ffff"], [-sx, -sy, "#ff00ff"]].forEach(([dx, dy, col]) => {
          stroke(fxG, dx, dy, sw + 14, col, ca * 0.35);
          stroke(fxG, dx, dy, sw, col, ca);
        });
      } else {
        const rgb = rgb01(color);
        [
          [sx, sy, rgbHex(rgb[0] * 255, 0, 0)],
          [0, 0, rgbHex(0, rgb[1] * 255, 0)],
          [-sx, -sy, rgbHex(0, 0, rgb[2] * 255)],
        ].forEach(([dx, dy, col]) => stroke(fxG, dx, dy, sw, col, ca));
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
    sparkPool.forEach(sp => { sp.life = 0; sp.sprite.visible = false; });
    if (!ink.recipe) { present(); app.ticker.stop(); return; }
    if (needTick()) { app.ticker.start(); draw(0); }
    else { present(); app.ticker.stop(); }
  };
  ink.playIdle = function (d) {
    ink.design = d;
    liveDesign = d;
    const key = designKey(d);
    if (key !== ink.key) {
      ink.key = key;
      ink.poly = d ? sampleDesign(d) : { pts: [], length: 0, cx: 0, cy: 0, maxDim: 1 };
      if (ribbon) uploadRibbon(buildRibbon(ink.poly));
    }
    fit();
    ink.play(d ? recipeForMotion(d) : null, false);
  };
  ink.destroy = function () {
    try { if (geom) geom.destroy(true); } catch (e) {}
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
  const poly = sampleDesign({ kind: "roundrect", x: 0, y: 0, w: 200, h: 100, r: 12 });
  const rib = buildRibbon(poly);
  const n = poly.pts.length;
  if (!rib || rib.positions.length !== (n + 1) * 4) throw new Error("ink ribbon verts");
  const last = n * 4;
  if (rib.positions[0] !== rib.positions[last] || rib.positions[1] !== rib.positions[last + 1]) throw new Error("ink ribbon close");
  if (rib.uvs[last] < 0.99) throw new Error("ink ribbon uv");
  for (let i = 0; i < rib.normals.length; i++) if (rib.normals[i] !== rib.normals[i]) throw new Error("ink ribbon normal");
  const wipe = { dash: "2000 2000", keys: [{ t: 0, offset: 2000 }, { t: 1, offset: 0 }] };
  const rev = { dash: "2000 2000", keys: [{ t: 0, offset: 0 }, { t: 1, offset: 2000 }] };
  const open = revealSpan(wipe, 0), shut = revealSpan(wipe, 2000);
  if (!open || Math.abs(open[1] - 1) > 1e-6 || !shut || Math.abs(shut[1]) > 1e-6) throw new Error("ink reveal");
  const rShut = revealSpan(rev, 0), rOpen = revealSpan(rev, 2000);
  if (!rShut || Math.abs(rShut[0] - 1) > 1e-6) throw new Error("ink reveal rev shut");
  if (!rOpen || Math.abs(rOpen[0]) > 1e-6 || Math.abs(rOpen[1] - 1) > 1e-6) throw new Error("ink reveal rev open");
  if (!chromaGhost({ fx: [{ id: "chroma", px: 2, n: 1 }] })) throw new Error("ink chroma ghost");
  if (chromaGhost({ fx: [{ id: "chroma", px: 6 }] })) throw new Error("ink chroma solid");
})();
