/**
 * Backdrop Lab looks. Each look is an original GLSL function `look(p, uv)` returning
 * (t, glow, shade): t indexes the gradient, glow adds light in the brightest stop's colour, shade
 * multiplies. Mode controls arrive as uP.x..uP.w ("a".."d" in state.params).
 */

export type ModeId =
  | "mesh"
  | "bands"
  | "curtains"
  | "plasma"
  | "rays"
  | "caustics"
  | "marble"
  | "cells"
  | "glass"
  | "bokeh"
  | "eclipse"
  | "horizon"
  | "prism"
  | "smoke"
  | "edgeglow"
  | "kaleido"
  | "beam"
  | "halftone"
  | "window"
  | "sea"
  | "shards"
  | "pixelscape"
  | "tunnel"
  | "streaks"
  | "tiles"
  | "planet"
  | "nebula"
  | "photoglass"
  | "photomap";

export type Family = "Soft" | "Light" | "Pattern" | "Nature" | "Glass" | "Photo";
export const FAMILIES: Family[] = ["Soft", "Light", "Nature", "Pattern", "Glass", "Photo"];

export interface ModeParam {
  key: "a" | "b" | "c" | "d";
  label: string;
  min: number;
  max: number;
  default: number;
  step: number;
}

export interface ModeHandle {
  id: string;
  label: string;
  default: { x: number; y: number };
}

export interface ModeDef {
  id: ModeId;
  name: string;
  family: Family;
  blurb: string;
  params: ModeParam[];
  handles: ModeHandle[];
  /** Uses the picked image (photo looks). */
  image?: boolean;
  /** Beam-style handle set: centre + direction, with a softness ring around the centre. */
  ring?: boolean;
  glsl: string;
}

const P = (key: ModeParam["key"], label: string, min: number, max: number, def: number, step = 0.01): ModeParam => ({
  key,
  label,
  min,
  max,
  default: def,
  step,
});
const H = (id: string, label: string, x: number, y: number): ModeHandle => ({ id, label, default: { x, y } });

export const MODES: ModeDef[] = [
  {
    id: "mesh",
    name: "Mesh",
    family: "Soft",
    blurb: "Soft colour blobs on slow orbits, blended through a noise-warped field.",
    params: [P("a", "Blobs", 3, 8, 5, 1), P("b", "Blob size", 0.3, 2, 1), P("c", "Drift", 0, 1, 0.6)],
    handles: [],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  vec2 q = warpq(p * uScale * 0.6);
  int n = int(uP.x + 0.5);
  float sw = 1e-6, st = 0.5e-6;
  float r2 = mix(0.012, 0.22, uSoft) * uP.y * uP.y;
  for (int i = 0; i < 8; i++) {
    if (i >= n) break;
    float fi = float(i);
    vec2 h = hash2(vec2(fi, 3.0));
    float kx = 1.0 + float(i % 2);
    float ky = 1.0 + float(i % 3 == 2);
    vec2 c = (h - 0.5) * vec2(1.7, 1.0) * uScale * 0.6
      + uP.z * uSpd * 1.6 * vec2(cos(uPhase * kx + h.x * TAU), sin(uPhase * ky + h.y * TAU));
    vec2 d = q - c;
    float w = exp(-dot(d, d) / max(0.004, r2));
    sw += w;
    st += w * (fi / max(1.0, float(n - 1)));
  }
  return vec3(st / sw, 0.0, 1.0);
}`,
  },
  {
    id: "bands",
    name: "Bands",
    family: "Soft",
    blurb: "Wide parallel bands that ripple and roll across the frame.",
    params: [P("a", "Angle", 0, 180, 35, 1), P("b", "Bands", 0.3, 4, 1.2)],
    handles: [],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  vec2 q = warpq(p * uScale);
  float ang = uP.x * PI / 180.0;
  vec2 dir = vec2(cos(ang), sin(ang));
  float s = dot(q, dir) * uP.y + 0.6 * fbm3(q * 0.8 + orbit(1.0, 1.0));
  float t = 0.5 + 0.5 * sin(s * PI + uPhase * uKs);
  t = mix(smoothstep(0.3, 0.7, t), t, uSoft);
  return vec3(t, 0.0, 1.0);
}`,
  },
  {
    id: "curtains",
    name: "Curtains",
    family: "Nature",
    blurb: "Vertical luminous folds rising from a glowing floor, like light through drapes.",
    params: [P("a", "Folds", 0.5, 4, 1.6), P("b", "Height", -0.3, 0.6, 0.25), P("c", "Glow", 0, 1, 0.5)],
    handles: [],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  vec2 q = p * uScale;
  float x = q.x * uP.x * 2.6;
  float n = fbm3(vec2(x * 0.6, q.y * 0.25) + orbit(1.0, 0.0));
  float folds = 0.5 + 0.5 * sin(x * 3.0 + n * 4.0 * (0.4 + uWarp * 2.0) + uPhase * uKs);
  folds = pow(folds, mix(6.0, 1.2, uSoft));
  float v = pow(1.0 - smoothstep(-0.55, uP.y + 0.2, p.y), 1.4);
  float base = 0.12 + 0.18 * (0.5 - p.y);
  float t = clamp(base + folds * v * 0.8 + v * 0.1, 0.0, 1.0);
  return vec3(t, folds * v * uP.z * 0.35, 1.0);
}`,
  },
  {
    id: "plasma",
    name: "Plasma",
    family: "Soft",
    blurb: "Interfering sine fields: a liquid, retro lava-lamp shimmer.",
    params: [P("a", "Rings", 0.2, 3, 1)],
    handles: [],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  vec2 q = warpq(p * uScale * 1.6);
  float ph = uPhase * uKs;
  float v = sin(q.x * 2.1 + ph) + sin(q.y * 1.7 - ph * 2.0 + 1.3)
    + sin((q.x + q.y) * 1.3 + ph) + sin(length(q + orbit(1.0, 0.0)) * 3.0 * uP.x - ph);
  float t = 0.5 + 0.125 * v;
  t = mix(smoothstep(0.2, 0.8, t), t, uSoft);
  return vec3(t, 0.0, 1.0);
}`,
  },
  {
    id: "rays",
    name: "Rays",
    family: "Light",
    blurb: "Shafts of light fanning out from a point you place.",
    params: [P("a", "Rays", 2, 16, 7), P("b", "Reach", 0, 1, 0.55)],
    handles: [H("source", "Light source", 0.22, 0.08)],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  vec2 d = p - hpos(uH0);
  float r = length(d);
  float a = atan(d.y, d.x);
  float n = fbm3(vec2(cos(a), sin(a)) * uP.x + orbit(1.0, 0.0) * 0.6);
  float rays = pow(smoothstep(-0.1, 0.6, n), mix(3.0, 1.0, uSoft));
  float fall = exp(-r * mix(2.5, 0.6, uP.y));
  float t = clamp(0.1 + 0.8 * rays * fall + 0.12 * (1.0 - r), 0.0, 1.0);
  return vec3(t, rays * fall * 0.35 + exp(-r * 8.0) * 0.4, 1.0);
}`,
  },
  {
    id: "caustics",
    name: "Caustics",
    family: "Nature",
    blurb: "Bright netted light, like sun on the floor of a pool.",
    params: [P("a", "Brightness", 0.4, 1.6, 1)],
    handles: [],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  vec2 z = p * uScale * 2.0 + orbit(1.0, 0.0);
  float c = 0.0;
  float ph = uPhase * uKs;
  for (int i = 0; i < 4; i++) {
    float fi = float(i) + 1.0;
    z += vec2(sin(z.y * 1.3 + ph + fi), cos(z.x * 1.2 - ph + fi * 1.7)) * 0.45 * (0.6 + uWarp);
    c += 1.0 / (1.0 + mix(30.0, 8.0, uSoft) * abs(sin(z.x * 1.7) * sin(z.y * 1.9)));
  }
  c /= 4.0;
  float t = clamp(0.12 + c * 1.1 * uP.x, 0.0, 1.0);
  return vec3(t, pow(c, 3.0) * 0.6, 1.0);
}`,
  },
  {
    id: "marble",
    name: "Marble",
    family: "Pattern",
    blurb: "Veined stone: turbulence folded through stripes.",
    params: [P("a", "Veins", 0.5, 5, 2)],
    handles: [],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  vec2 q = warpq(p * uScale);
  float n = fbm(q * 1.3 + orbit(1.0, 0.0) * 0.5);
  float v = sin((q.x * uP.x + q.y * 0.4 + n * (3.0 + uWarp * 8.0)) * PI);
  float t = 0.5 + 0.5 * v;
  t = mix(pow(t, 5.0), t, uSoft);
  return vec3(t, 0.0, 1.0);
}`,
  },
  {
    id: "cells",
    name: "Cells",
    family: "Pattern",
    blurb: "Organic cells that breathe; edges can glow like leaded glass.",
    params: [P("a", "Wobble", 0, 1, 0.6), P("b", "Fill", 0, 1, 0.4), P("c", "Edge light", 0, 1, 0.3)],
    handles: [],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  vec2 q = warpq(p * uScale * 2.2);
  vec3 v = voro(q, uP.x);
  float edge = v.y - v.x;
  float t = mix(v.z, 1.0 - v.x, uP.y);
  float line = 1.0 - smoothstep(0.0, mix(0.02, 0.2, uSoft), edge);
  t = mix(t, 1.0, line * uP.z);
  return vec3(t, line * uP.z * 0.25, 1.0);
}`,
  },
  {
    id: "glass",
    name: "Ribbed glass",
    family: "Glass",
    blurb: "A soft field seen through fluted glass: each rib bends and catches light.",
    params: [P("a", "Ribs", 0.5, 4, 1.6), P("b", "Bend", 0, 1, 0.5)],
    handles: [],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  float x = p.x * uP.x * 5.0;
  float lensC = sin(fract(x) * PI - PI * 0.5);
  vec2 q = warpq((p + vec2(lensC * uP.y * 0.12, 0.0)) * uScale * 0.7);
  float f = 0.5 + 0.55 * fbm(q + orbit(1.0, 0.0));
  float hi = pow(max(0.0, cos((fract(x) - 0.2) * PI)), mix(40.0, 6.0, uSoft)) * 0.22;
  return vec3(f, hi, 0.9 + 0.1 * cos(fract(x) * TAU));
}`,
  },
  {
    id: "bokeh",
    name: "Bokeh",
    family: "Light",
    blurb: "Out-of-focus lights drifting in two depths.",
    params: [P("a", "Density", 0.05, 1, 0.45), P("b", "Size", 0.3, 1.5, 1)],
    handles: [],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  float t = 0.1 + 0.22 * (0.5 + 0.5 * fbm3(p * 0.8 + orbit(1.0, 0.0)));
  float glow = 0.0;
  vec2 q = p * uScale * 2.5;
  for (int layer = 0; layer < 2; layer++) {
    float fl = float(layer);
    vec2 g = q * (1.0 + fl * 0.6) + fl * 7.3;
    vec2 i = floor(g);
    for (int y = -1; y <= 1; y++)
      for (int x = -1; x <= 1; x++) {
        vec2 c = i + vec2(float(x), float(y));
        vec2 h = hash2(c + fl * 31.0);
        if (h.x > uP.x) continue;
        vec2 o = h + 0.35 * uSpd * vec2(cos(uPhase + h.y * TAU), sin(uPhase + h.x * TAU));
        float rad = mix(0.18, 0.45, hash(c + 5.0)) * uP.y;
        float d = length(g - c - o);
        float disc = 1.0 - smoothstep(rad - mix(0.01, rad * 0.8, uSoft), rad, d);
        float ring = smoothstep(rad - 0.06, rad, d) * disc;
        float val = disc * (0.35 + 0.65 * hash(c + 9.0)) * (layer == 0 ? 1.0 : 0.6);
        t = max(t, mix(t, 0.55 + 0.45 * hash(c + 2.0), val));
        glow += val * 0.1 + ring * 0.08;
      }
  }
  return vec3(t, glow, 1.0);
}`,
  },
  {
    id: "eclipse",
    name: "Eclipse",
    family: "Light",
    blurb: "A dark disc with a burning rim and a slow, flickering corona.",
    params: [P("a", "Size", 0.2, 1.5, 0.7), P("b", "Corona", 0, 1, 0.5)],
    handles: [H("centre", "Centre", 0.5, 0.46)],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  vec2 d = p - hpos(uH0);
  float r = length(d);
  float R = uP.x * 0.4;
  float a = atan(d.y, d.x);
  float n = fbm3(vec2(cos(a), sin(a)) * 2.5 + orbit(1.0, 0.0) + r * 2.0);
  float rim = exp(-abs(r - R) * mix(90.0, 12.0, uSoft));
  float corona = exp(-max(r - R, 0.0) * mix(9.0, 2.5, uP.y)) * (0.75 + 0.35 * n) * step(R, r);
  float inside = 1.0 - smoothstep(R - 0.004, R + 0.002, r);
  float t = mix(clamp(0.05 + corona * 0.85 + rim * 0.2, 0.0, 1.0), 0.02, inside);
  return vec3(t, rim * 0.6 + corona * 0.15, 1.0);
}`,
  },
  {
    id: "horizon",
    name: "Horizon glow",
    family: "Light",
    blurb: "A wide band of dawn light lying across the frame.",
    params: [P("a", "Width", 0.2, 6, 1.5), P("b", "Glow", 0, 1, 0.5)],
    handles: [H("horizon", "Horizon", 0.5, 0.62)],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  vec2 c = hpos(uH0);
  float y = p.y - c.y;
  float band = exp(-abs(y) * mix(40.0, 5.0, uSoft)) * exp(-abs(p.x - c.x) * uP.x * 0.6);
  float haze = 0.5 + 0.5 * fbm3(vec2(p.x * 1.5, y * 6.0) + orbit(1.0, 0.0));
  float sky = (1.0 - smoothstep(-0.6, 0.7, y)) * 0.42;
  float t = clamp(sky + band * 0.62 + haze * 0.12 * (0.3 + uWarp), 0.0, 1.0);
  return vec3(t, band * uP.y * 0.5, 1.0);
}`,
  },
  {
    id: "prism",
    name: "Prism band",
    family: "Light",
    blurb: "A ribbon that spreads the whole palette across it, like light through a prism.",
    params: [P("a", "Angle", 0, 180, 120, 1), P("b", "Width", 0.05, 1, 0.35)],
    handles: [],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  float ang = uP.x * PI / 180.0;
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 q = warpq(p * uScale * 0.7);
  float across = dot(q, nrm) + 0.15 * fbm3(vec2(dot(q, dir) * 1.2, 0.0) + orbit(1.0, 0.0));
  float w = uP.y * 0.5;
  float inBand = 1.0 - smoothstep(w, w + softw(), abs(across));
  float bg = 0.04 + 0.1 * (0.5 + 0.5 * dot(p, dir));
  float t = mix(bg, clamp(across / (2.0 * w) + 0.5, 0.0, 1.0), inBand);
  return vec3(t, inBand * 0.2 * exp(-abs(across) / max(w, 0.01)), 1.0);
}`,
  },
  {
    id: "smoke",
    name: "Smoke",
    family: "Soft",
    blurb: "Layered, self-warping turbulence: drifting ink or smoke.",
    params: [P("a", "Swirl", 0.2, 2, 1)],
    handles: [],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  vec2 q = p * uScale;
  vec2 o = orbit(1.0, 0.0);
  float k = 0.3 + uWarp;
  vec2 w1 = vec2(fbm(q + o), fbm(q + vec2(5.2, 1.3) - o));
  vec2 w2 = vec2(fbm(q + 3.0 * w1 * k + vec2(1.7, 9.2)), fbm(q + 3.0 * w1 * k + vec2(8.3, 2.8)));
  float f = fbm(q + 3.5 * w2 * uP.x);
  float t = clamp(0.5 + f * 0.9, 0.0, 1.0);
  t = mix(smoothstep(0.3, 0.7, t), t, uSoft);
  return vec3(t, 0.0, 1.0);
}`,
  },
  {
    id: "edgeglow",
    name: "Edge glow",
    family: "Light",
    blurb: "One bright line of horizon with a soft halo and a faint reflection.",
    params: [P("a", "Falloff", 0.2, 8, 2), P("b", "Line glow", 0, 1, 0.6)],
    handles: [H("line", "Horizon line", 0.52, 0.6)],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  vec2 c = hpos(uH0);
  float y = p.y - c.y;
  float dx = abs(p.x - c.x);
  float line = exp(-abs(y) * mix(160.0, 25.0, uSoft)) * exp(-dx * dx * uP.x * 2.0);
  float halo = exp(-abs(y) * 4.0) * exp(-dx * dx * uP.x * 0.6);
  float shimmer = 0.85 + 0.15 * gnoise(vec2(p.x * 6.0, 0.0) + orbit(1.0, 0.0) * 2.0);
  float floorRef = step(y, 0.0) * exp(y * 6.0) * exp(-dx * dx * uP.x) * 0.3;
  float t = clamp(0.06 + halo * 0.45 * shimmer + smoothstep(0.0, 0.8, y) * 0.12 + line * 0.6 + floorRef, 0.0, 1.0);
  return vec3(t, line * uP.y + halo * 0.1, 1.0);
}`,
  },
  {
    id: "kaleido",
    name: "Kaleido",
    family: "Pattern",
    blurb: "Mirrored segments around a centre, turning one segment per loop.",
    params: [P("a", "Segments", 3, 12, 6, 1), P("b", "Detail", 0.3, 3, 1)],
    handles: [H("centre", "Centre", 0.5, 0.5)],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  vec2 d = p - hpos(uH0);
  float n = floor(uP.x + 0.5);
  float seg = TAU / n;
  float a = atan(d.y, d.x) + uPhase * uKs / n;
  a = mod(a, seg);
  a = abs(a - seg * 0.5);
  float r = length(d);
  vec2 q = vec2(cos(a), sin(a)) * r * uScale * 2.0;
  float f = fbm(warpq(q) + orbit(1.0, 0.0) * 0.5);
  float t = 0.5 + 0.5 * sin(f * 5.0 * uP.y + r * 4.0);
  t = mix(smoothstep(0.25, 0.75, t), t, uSoft);
  return vec3(t, 0.0, 1.0);
}`,
  },
  {
    id: "beam",
    name: "Light beam",
    family: "Light",
    blurb: "A diagonal shaft of light. Drag its centre and direction; the ring sets its softness.",
    params: [P("a", "Width", 0.2, 3, 1), P("b", "Reach", 0, 1, 0.6)],
    handles: [H("centre", "Beam centre", 0.36, 0.42), H("aim", "Beam direction", 0.7, 0.66)],
    ring: true,
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  vec2 a = hpos(uH0);
  vec2 b = hpos(uH1);
  vec2 dir = normalize(b - a + vec2(1e-5, 0.0));
  vec2 d = p - a;
  float along = dot(d, dir);
  float across = dot(d, vec2(-dir.y, dir.x));
  float wdt = uP.x * (0.05 + softw());
  float beam = exp(-across * across / (wdt * wdt));
  float reach = exp(-max(-along, 0.0) * 1.2) * exp(-max(along, 0.0) * mix(3.0, 0.3, uP.y));
  float flick = 0.9 + 0.1 * fbm3(vec2(along * 2.0, across * 8.0) + orbit(1.0, 0.0));
  float base = 0.08 + 0.18 * (0.5 + 0.5 * fbm3(p * 0.9 + orbit(1.0, 2.0) * 0.5));
  float t = clamp(base + beam * reach * flick * 0.85, 0.0, 1.0);
  return vec3(t, beam * reach * 0.35 + exp(-length(d) * 9.0) * 0.2, 1.0);
}`,
  },
  {
    id: "halftone",
    name: "Halftone",
    family: "Pattern",
    blurb: "A glow printed as a dot screen: dots grow where the light is.",
    params: [P("a", "Dot grid", 0.3, 3, 1), P("b", "Spread", 0, 1, 0.5)],
    handles: [H("light", "Light", 0.82, 0.2)],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  float g = exp(-length(p - hpos(uH0)) * mix(2.5, 0.8, uP.y));
  g = clamp(g + 0.15 * fbm3(p * 1.2 + orbit(1.0, 0.0)), 0.0, 1.0);
  float grid = uP.x * 40.0;
  vec2 rc = mat2(0.7071, -0.7071, 0.7071, 0.7071) * (p * grid);
  vec2 f = fract(rc) - 0.5;
  float rad = sqrt(g) * 0.62;
  float aa = 1.5 * grid / uWorld.y;
  float dotm = 1.0 - smoothstep(rad - aa - uSoft * 0.15, rad + aa, length(f));
  float t = mix(0.06, 0.25 + 0.75 * g, dotm);
  return vec3(t, 0.0, 1.0);
}`,
  },
  {
    id: "window",
    name: "Window light",
    family: "Nature",
    blurb: "Sun through a window onto a wall, with frame shadows and swaying leaves. All procedural.",
    params: [P("a", "Slant", -1, 1, 0.35), P("b", "Window size", 0.4, 1.6, 1), P("c", "Leaves", 0, 1, 0.6)],
    handles: [H("patch", "Light patch", 0.56, 0.42)],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  vec2 c = hpos(uH0);
  vec2 q = p - c;
  q.x -= q.y * uP.x;
  vec2 hs = vec2(0.42, 0.32) * uP.y;
  float pen = softw() * 0.18 + 0.003;
  float inX = smoothstep(-hs.x - pen, -hs.x + pen, q.x) * (1.0 - smoothstep(hs.x - pen, hs.x + pen, q.x));
  float inY = smoothstep(-hs.y - pen, -hs.y + pen, q.y) * (1.0 - smoothstep(hs.y - pen, hs.y + pen, q.y));
  float lit = inX * inY;
  float bar = 0.012 * uP.y;
  float mull = (1.0 - smoothstep(bar - pen * 0.5, bar + pen, abs(q.x))) + (1.0 - smoothstep(bar - pen * 0.5, bar + pen, abs(q.y)));
  lit *= 1.0 - clamp(mull, 0.0, 1.0) * 0.92;
  float sway = osc(1.0, 0.0) * uSpd;
  vec2 lq = p - c - vec2(0.34, 0.26) * uP.y + vec2(sway * 0.05, sway * 0.02);
  float leaves = smoothstep(0.06, 0.2, fbm3(lq * 5.0 + 3.0 + vec2(0.0, sway * 0.3)) + 0.32 - length(lq) * 1.2);
  lit *= 1.0 - leaves * uP.z * 0.85;
  float wall = 0.26 + 0.12 * (0.5 - uv.y) + 0.025 * fbm3(p * 30.0);
  float t = clamp(wall + lit * 0.64, 0.0, 1.0);
  return vec3(t, lit * 0.12, 1.0);
}`,
  },
  {
    id: "sea",
    name: "Sea horizon",
    family: "Nature",
    blurb: "A sun or moon over water, with a shimmering path of light on the waves.",
    params: [P("a", "Sun height", -0.2, 1, 0.25), P("b", "Sun size", 0.2, 2, 1), P("c", "Glitter", 0, 1, 0.7)],
    handles: [H("sun", "Sun and horizon", 0.5, 0.56)],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  vec2 c = hpos(uH0);
  float y = p.y - c.y;
  vec2 sd = p - vec2(c.x, c.y + uP.x * 0.4);
  float sunR = 0.06 * uP.y + 0.02;
  float sun = 1.0 - smoothstep(sunR - 0.004 - uSoft * 0.02, sunR + 0.004, length(sd));
  float halo = exp(-length(sd) * 6.0);
  float t;
  float glow;
  if (y > 0.0) {
    t = max(0.55 - y * 0.55 + halo * 0.35, sun * 0.98);
    glow = sun * 0.4 + halo * 0.25;
  } else {
    float depth = -y + 0.002;
    vec2 w = vec2(p.x / depth * 0.35, 0.6 / depth);
    float waves = gnoise(vec2(w.x * 1.4, w.y * 2.0) + orbit(1.0, 0.0) * 3.0) * 0.5
      + gnoise(vec2(w.x * 3.1, w.y * 4.3) - orbit(2.0, 1.0) * 3.0) * 0.5;
    float col = exp(-abs(p.x - c.x) * mix(14.0, 3.0, uSoft) / (0.3 + depth * 3.0));
    float glint = smoothstep(0.15, 0.6, waves) * col;
    t = clamp(0.2 + 0.14 * exp(y * 3.0) + halo * 0.15 + glint * 0.7 * uP.z, 0.0, 1.0);
    glow = glint * 0.35 * uP.z;
  }
  return vec3(t, glow, 1.0);
}`,
  },
  {
    id: "shards",
    name: "Crystal",
    family: "Glass",
    blurb: "Faceted glass shards with bevelled edges, lit from a point you move.",
    params: [P("a", "Irregular", 0, 1, 0.8), P("b", "Facet tilt", 0, 1.5, 0.7)],
    handles: [H("light", "Light", 0.3, 0.25)],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  vec2 q = warpq(p * uScale * 1.6);
  vec3 v = voro(q, uP.x);
  float edge = v.y - v.x;
  float ang = v.z * TAU + osc(1.0, v.z * TAU) * 0.6 * uSpd;
  vec3 n = normalize(vec3(cos(ang) * uP.y, sin(ang) * uP.y, 1.0));
  vec3 ld = normalize(vec3(hpos(uH0) - p, 0.9));
  float diff = clamp(dot(n, ld), 0.0, 1.0);
  float bevel = 1.0 - smoothstep(0.0, mix(0.03, 0.14, uSoft), edge);
  float t = clamp(0.2 + v.z * 0.25 + diff * 0.55 + bevel * 0.15, 0.0, 1.0);
  return vec3(t, bevel * 0.25 * diff + pow(diff, 24.0) * 0.2, 1.0);
}`,
  },
  {
    id: "pixelscape",
    name: "Pixel landscape",
    family: "Nature",
    blurb: "Chunky 8-bit clouds drifting over little islands.",
    params: [P("a", "Pixel size", 0.3, 3, 1), P("b", "Colour steps", 3, 12, 6, 1)],
    handles: [],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  float px = uP.x * 0.018;
  vec2 bp = floor(p / px) * px + px * 0.5;
  float freq = 3.0 * uScale;
  float sh = uPhase / TAU * 16.0 * uKs;
  float cl = gnoiseP(vec2(bp.x * freq + sh, bp.y * freq * 2.2), 16) * 0.6
    + gnoiseP(vec2(bp.x * freq * 2.0 + sh * 2.0, bp.y * freq * 4.0 + 5.0), 32) * 0.4;
  float h = bp.y;
  float clouds = step(0.2 - h * 0.3, cl) * smoothstep(-0.18, 0.1, h);
  float rim = step(0.2 - h * 0.3, cl + 0.07) * (1.0 - clouds) * smoothstep(-0.18, 0.1, h);
  float isl = gnoiseP(vec2(bp.x * 1.6 + sh * 0.25, 2.0), 4);
  float land = step(h, -0.39 + max(isl - 0.05, 0.0) * 0.4) * step(-0.43, h);
  float sea = step(h, -0.36);
  float t = 0.5 + h * 0.4;
  t = mix(t, 0.3 + 0.04 * sin(bp.y * 90.0), sea);
  t = mix(t, 0.8, rim);
  t = mix(t, 0.96, clouds);
  t = mix(t, 0.07, land);
  float L = floor(uP.y + 0.5);
  t = floor(t * L + 0.5) / L;
  return vec3(t, 0.0, 1.0);
}`,
  },
  {
    id: "tunnel",
    name: "Light tunnel",
    family: "Light",
    blurb: "Rays of light converging on a far point, streaming past.",
    params: [P("a", "Rays", 2, 16, 8), P("b", "Streaks", 0, 1, 0.6)],
    handles: [H("vanish", "Vanishing point", 0.5, 0.42)],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  vec2 d = p - hpos(uH0);
  float r = length(d) + 1e-4;
  float a = atan(d.y, d.x);
  float rays = smoothstep(-0.05, 0.6, fbm3(vec2(cos(a), sin(a)) * uP.x + 3.0 + orbit(1.0, 0.0) * 0.3));
  rays = pow(rays, mix(2.5, 0.8, uSoft));
  float lane = floor((a / TAU + 0.5) * uP.x * 6.0);
  float z = 0.35 / r;
  float flow = fract(z * 0.5 + hash(vec2(lane, 1.0)) - uPhase / TAU * uKs);
  float streak = smoothstep(0.0, 0.12, flow) * (1.0 - smoothstep(0.3, 1.0, flow));
  float fade = smoothstep(0.01, 0.3, r) * (1.0 - 0.35 * r);
  float s = mix(1.0, 0.45 + 0.55 * streak, uP.y);
  float t = clamp(0.05 + rays * fade * s * 0.95, 0.0, 1.0);
  return vec3(t, rays * streak * fade * 0.35 * uP.y + exp(-r * 14.0) * 0.3, 1.0);
}`,
  },
  {
    id: "streaks",
    name: "Motion streaks",
    family: "Glass",
    blurb: "Diagonal speed lines; add Chromatic edge for colour fringes.",
    params: [P("a", "Angle", 0, 180, 28, 1), P("b", "Lanes", 0.2, 2, 0.8)],
    handles: [],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  float ang = uP.x * PI / 180.0;
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 nrm = vec2(-dir.y, dir.x);
  float s = dot(p, dir) * uScale;
  float u = dot(p, nrm) * uScale + 0.04 * fbm3(vec2(s * 0.5, 0.0) + orbit(1.0, 0.0));
  float lanes = uP.y * 60.0;
  float lane = floor(u * lanes);
  float h = hash(vec2(lane, 7.0));
  float seg = fract(s * (0.4 + h * 0.8) + h * 13.0 - uPhase / TAU * uKs * (1.0 + floor(h * 3.0)));
  float streak = smoothstep(0.0, 0.05, seg) * (1.0 - smoothstep(0.1 + 0.5 * uSoft, 0.9, seg));
  float across = 1.0 - abs(fract(u * lanes) - 0.5) * 2.0;
  streak *= smoothstep(0.0, 0.6, across) * step(0.35, h);
  float base = 0.1 + 0.15 * (0.5 + 0.5 * dot(p, nrm));
  float t = clamp(base + streak * (0.5 + 0.5 * h), 0.0, 1.0);
  return vec3(t, streak * 0.25, 1.0);
}`,
  },
  {
    id: "tiles",
    name: "Bevelled tiles",
    family: "Pattern",
    blurb: "A grid of raised tiles under a spotlight you drag around.",
    params: [P("a", "Tile size", 0.3, 2, 1), P("b", "Gap", 0, 1, 0.35), P("c", "Spot spread", 0, 1, 0.5)],
    handles: [H("spot", "Spotlight", 0.42, 0.38)],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  float size = uP.x * 0.22;
  vec2 q = p / size;
  vec2 id = floor(q);
  vec2 f = fract(q) - 0.5;
  float gap = uP.y * 0.12;
  float rnd = mix(0.02, 0.2, uSoft);
  vec2 a = abs(f) - (0.5 - gap - rnd);
  float sd = length(max(a, 0.0)) + min(max(a.x, a.y), 0.0) - rnd;
  float inside = 1.0 - smoothstep(-0.006, 0.006, sd);
  float bevelW = 0.12;
  float hgt = clamp(-sd / bevelW, 0.0, 1.0);
  hgt = hgt * hgt * (3.0 - 2.0 * hgt);
  float k = bevelW * size * uWorld.y * 0.9;
  vec3 n = normalize(vec3(-dFdx(hgt) * k, -dFdy(hgt) * k, 1.0));
  vec2 lp = hpos(uH0) + orbit(1.0, 0.0) * 0.08;
  vec3 lv = vec3(lp - p, 0.55);
  vec3 ld = normalize(lv);
  float diff = clamp(dot(n, ld), 0.0, 1.0);
  float spot = exp(-dot(lp - p, lp - p) * mix(6.0, 0.8, uP.z));
  float spec = pow(clamp(dot(reflect(-ld, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 30.0);
  float t = mix(0.02, 0.08 + 0.85 * diff * spot + hash(id) * 0.04, inside);
  return vec3(t, spec * spot * inside * 0.5, 1.0);
}`,
  },
  {
    id: "planet",
    name: "Planet arc",
    family: "Nature",
    blurb: "The glowing edge of a planet curving across a field of stars.",
    params: [P("a", "Planet size", 0.4, 2, 1), P("b", "Stars", 0, 1, 0.5)],
    handles: [H("edge", "Arc", 0.55, 0.55)],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  vec2 c0 = hpos(uH0);
  float R = uP.x * 1.6;
  vec2 cen = c0 + R * normalize(vec2(0.45, -1.0));
  float dd = length(p - cen) - R;
  float arc = exp(-abs(dd) * mix(220.0, 30.0, uSoft));
  float atmo = exp(-max(dd, 0.0) * 9.0) * step(0.0, dd);
  float planet = 1.0 - smoothstep(-0.003, 0.003, dd);
  float limb = exp(dd * 4.0);
  vec2 sg = p * 90.0 * uScale;
  float sh = hash(floor(sg));
  float star = step(1.0 - uP.y * 0.08, sh) * (1.0 - smoothstep(0.0, 0.35, length(fract(sg) - 0.5)))
    * (0.6 + 0.4 * osc(1.0, sh * TAU * 7.0));
  float t = clamp(0.03 + star * 0.7 * (1.0 - planet) + atmo * 0.45 + arc * 0.5 + planet * limb * 0.1, 0.0, 1.0);
  return vec3(t, arc * 0.6 + atmo * 0.12, 1.0);
}`,
  },
  {
    id: "nebula",
    name: "Lens nebula",
    family: "Nature",
    blurb: "Lens's own signature: a slow spiral of gas and stars around a bright core.",
    params: [P("a", "Twist", 0, 2, 0.8), P("b", "Glow", 0, 1, 0.6)],
    handles: [H("core", "Core", 0.5, 0.5)],
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  vec2 d = (p - hpos(uH0)) * uScale;
  float r = length(d);
  float tw = r * uP.x * 4.0;
  vec2 q = mat2(cos(tw), -sin(tw), sin(tw), cos(tw)) * d * 2.0;
  float f = fbm(warpq(q) + orbit(1.0, 0.0));
  float arms = 0.5 + 0.5 * sin(atan(q.y, q.x) * 2.0 + f * 3.0);
  float core = exp(-r * mix(9.0, 3.0, uSoft));
  float dens = clamp((0.5 + f) * arms * exp(-r * 1.8), 0.0, 1.0);
  vec2 sg = p * 120.0;
  float sh = hash(floor(sg));
  float star = step(0.992, sh) * (0.5 + 0.5 * osc(1.0, sh * 40.0)) * (1.0 - smoothstep(0.0, 0.4, length(fract(sg) - 0.5)));
  float t = clamp(0.04 + dens * 0.75 + core * 0.5 + star * 0.6, 0.0, 1.0);
  return vec3(t, core * 0.5 * uP.y + dens * 0.1, 1.0);
}`,
  },
  {
    id: "photoglass",
    name: "Glass over photo",
    family: "Photo",
    blurb: "Your picture behind fluted glass. Tint mixes in the gradient.",
    params: [P("a", "Ribs", 0.3, 4, 1.4), P("b", "Bend", 0, 1, 0.6), P("c", "Tint", 0, 1, 0.2)],
    handles: [],
    image: true,
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  float x = uv.x * uP.x * 14.0;
  float lensC = sin(fract(x) * PI - PI * 0.5);
  vec2 o = vec2(lensC * uP.y * 0.05 / max(1.0, uP.x), 0.0) + orbit(1.0, 0.0) * 0.004;
  vec3 img = imageAt(clamp(uv + o, 0.0, 1.0));
  gImage = img * (0.92 + 0.1 * cos(fract(x) * TAU));
  gImageMix = 1.0 - uP.z;
  float hi = pow(max(0.0, cos((fract(x) - 0.2) * PI)), mix(40.0, 6.0, uSoft)) * 0.15;
  return vec3(luma(img), hi, 1.0);
}`,
  },
  {
    id: "photomap",
    name: "Gradient-map photo",
    family: "Photo",
    blurb: "Your picture's light and shade, recoloured with the palette.",
    params: [P("a", "Contrast", 0.3, 3, 1.2)],
    handles: [],
    image: true,
    glsl: `
vec3 look(vec2 p, vec2 uv) {
  vec2 o = orbit(1.0, 0.0);
  vec2 q = uv + vec2(fbm3(uv * 3.0 + o), fbm3(uv * 3.0 + 5.0 - o)) * uWarp * 0.05;
  float l = luma(imageAt(clamp(q, 0.0, 1.0)));
  l = clamp((l - 0.5) * uP.x + 0.5, 0.0, 1.0);
  return vec3(l, 0.0, 1.0);
}`,
  },
];

const BY_ID = new Map(MODES.map((m) => [m.id, m]));

export function modeById(id: ModeId | string | null | undefined): ModeDef | undefined {
  return id ? BY_ID.get(id as ModeId) : undefined;
}
