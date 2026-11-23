/**
 * Shared GLSL for Backdrop Lab looks. Written for Lens (docs/BACKDROP_LAB.md §Engine).
 *
 * Loop safety: every look is a function of `uPhase` (0..2π over one loop) and only uses integer
 * multiples of it, or circular paths through noise space of radius `uOrbit`. So the frame at the
 * end of a loop is the frame at its start, whatever the speed, and nothing ever "jumps".
 */

export const LOOK_HEADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uRes;
uniform vec2 uOrigin;
uniform vec2 uWorld;
uniform float uPhase;
uniform float uOrbit;
uniform float uSpd;
// Whole number of cycles per loop for phase-driven motion (0 = still), from the speed slider.
uniform float uKs;
uniform float uScale;
uniform float uSoft;
uniform float uWarp;
uniform uint uSeed;
uniform vec4 uP;
uniform vec2 uH0;
uniform vec2 uH1;
uniform vec3 uCursor;
uniform float uPulse;
uniform sampler2D uLut;
uniform sampler2D uImage;
uniform float uHasImage;
out vec4 outColor;

const float TAU = 6.28318530718;
const float PI = 3.14159265359;
vec3 gImage = vec3(0.0);
float gImageMix = 0.0;

// Integer hash: a few rounds of multiply / xor-shift on two lanes, salted with the seed.
uint hashu(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 22695477u + uSeed * 2654435761u;
  v.y += v.x * 1664525u;
  v ^= (v >> 16u);
  v.x += v.y * 1103515245u;
  v.y += v.x * 22695477u;
  v ^= (v >> 15u);
  return v.x ^ (v.y * 2246822519u);
}
float hash(vec2 c) { return float(hashu(uvec2(ivec2(floor(c)) + 65536))) / 4294967295.0; }
vec2 hash2(vec2 c) { return vec2(hash(c), hash(c + vec2(19.0, 47.0))); }

vec2 gradAt(ivec2 c) {
  float a = float(hashu(uvec2(c + 65536))) * (TAU / 4294967295.0);
  return vec2(cos(a), sin(a));
}

// Quintic-faded gradient noise, optionally periodic along x with an integer period (cells).
float gnoiseP(vec2 p, int period) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  ivec2 c = ivec2(i);
  int x0 = c.x;
  int x1 = c.x + 1;
  if (period > 0) {
    x0 = ((x0 % period) + period) % period;
    x1 = ((x1 % period) + period) % period;
  }
  float a = dot(gradAt(ivec2(x0, c.y)), f);
  float b = dot(gradAt(ivec2(x1, c.y)), f - vec2(1.0, 0.0));
  float d = dot(gradAt(ivec2(x0, c.y + 1)), f - vec2(0.0, 1.0));
  float e = dot(gradAt(ivec2(x1, c.y + 1)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(d, e, u.x), u.y) * 1.42;
}
float gnoise(vec2 p) { return gnoiseP(p, 0); }

const mat2 ROT = mat2(0.80, -0.60, 0.60, 0.80);
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * gnoise(p); p = ROT * p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
float fbm3(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * gnoise(p); p = ROT * p * 2.07 + 9.3; a *= 0.5; }
  return s;
}

// Circular path through noise space: returns to its start every loop.
vec2 orbit(float k, float ph) { return uOrbit * vec2(cos(uPhase * k + ph), sin(uPhase * k + ph)); }
// Loop-safe oscillator in [-1, 1] (k must be a whole number).
float osc(float k, float ph) { return sin(uPhase * k + ph); }

vec2 warpq(vec2 q) {
  vec2 o = orbit(1.0, 0.0);
  return q + uWarp * 1.7 * vec2(fbm3(q * 1.2 + o + 3.1), fbm3(q * 1.2 - o.yx + 8.7));
}

// Handle (0..1 of the canvas, y down) to look space (aspect-correct, centred, y up).
vec2 hpos(vec2 h) {
  vec2 w = h * uWorld - 0.5 * uWorld;
  return vec2(w.x, -w.y) / uWorld.y;
}
float softw() { return mix(0.006, 0.32, uSoft); }

// Cells: x = nearest distance, y = second nearest, z = id of the nearest cell.
vec3 voro(vec2 p, float jitter) {
  vec2 i = floor(p);
  vec2 f = p - i;
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 h = hash2(i + g);
      vec2 o = 0.5 + jitter * 0.45 * sin(uPhase * 1.0 + TAU * h) * min(1.0, uSpd * 4.0) + (h - 0.5) * jitter * 0.6;
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = hash(i + g + 3.7); }
      else if (d < d2) d2 = d;
    }
  return vec3(sqrt(d1), sqrt(d2), id);
}

// Built-in stand-in picture for the photo looks when no image is chosen.
vec3 imageAt(vec2 uv) {
  if (uHasImage > 0.5) return texture(uImage, vec2(uv.x, uv.y)).rgb;
  float a = fbm3(uv * 2.2 + 4.0);
  float b = fbm3(uv * 3.1 - 2.0);
  return clamp(vec3(0.35 + 0.5 * a, 0.3 + 0.45 * b, 0.55 + 0.4 * (a - b)), 0.0, 1.0);
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

export const LOOK_MAIN = /* glsl */ `
void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) + uOrigin;
  vec2 uv = px / uWorld;
  vec2 p = (px - 0.5 * uWorld) / uWorld.y;
  p.y = -p.y;
  if (uCursor.z > 0.0) {
    vec2 d = p - hpos(uCursor.xy);
    float f = exp(-dot(d, d) * 14.0) * uCursor.z;
    p -= d * f * 0.32;
  }
  vec3 L = look(p, uv);
  float t = clamp(L.x, 0.0, 1.0);
  vec3 col = texture(uLut, vec2(t * 0.996 + 0.002, 0.5)).rgb * L.z;
  vec3 gc = texture(uLut, vec2(0.985, 0.5)).rgb;
  col += max(L.y, 0.0) * (gc * 0.85 + 0.15) * (1.0 + uPulse * 0.6);
  col = mix(col, gImage, gImageMix);
  outColor = vec4(col, 1.0);
}
`;

/** Full-screen triangle from gl_VertexID. */
export const FULLSCREEN_VS = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * Finishing pass: crossfade snapshot, layer blend + mask, chromatic edge, bloom, grade, filmic
 * tone, vignette, grain and dither. Runs at canvas resolution on the look textures.
 */
export const FINISH_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uA;
uniform sampler2D uB;
uniform sampler2D uS;
uniform vec2 uRes;
uniform float uFade;
uniform int uLayer;
uniform int uMask;
uniform float uAmt;
uniform float uBright;
uniform float uContrast;
uniform float uSat;
uniform float uExpo;
uniform int uTone;
uniform float uGrain;
uniform int uGrainStyle;
uniform float uVig;
uniform int uDither;
uniform float uAberr;
uniform float uBloom;
uniform float uFrame;
uniform int uDebug;
out vec4 outColor;

float h12(vec2 p) {
  uvec2 v = uvec2(ivec2(p) + 65536);
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u;
  return float(v.x) / 4294967295.0;
}
float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
vec3 blendOp(vec3 a, vec3 b, int mode) {
  if (mode == 2) return 1.0 - (1.0 - a) * (1.0 - b);
  if (mode == 3) return mix(2.0 * a * b, 1.0 - 2.0 * (1.0 - a) * (1.0 - b), step(0.5, a));
  if (mode == 4) return mix(2.0 * a * b + a * a * (1.0 - 2.0 * b), sqrt(max(a, 0.0)) * (2.0 * b - 1.0) + 2.0 * a * (1.0 - b), step(0.5, b));
  return b;
}
vec3 filmic(vec3 x) {
  // ACES filmic approximation (Narkowicz 2015, a public rational fit).
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 col;
  if (uAberr > 0.0) {
    vec2 d = (uv - 0.5) * uAberr * 0.012;
    col = vec3(texture(uA, uv + d).r, texture(uA, uv).g, texture(uA, uv - d).b);
  } else {
    col = texture(uA, uv).rgb;
  }
  // Test builds: flag any NaN / infinity from a look in magenta (tools/parity/backdrop).
  if (uDebug == 1) {
    vec3 raw = texture(uA, uv).rgb;
    if (any(isnan(raw)) || any(isinf(raw))) { outColor = vec4(1.0, 0.0, 1.0, 1.0); return; }
  }
  if (uLayer > 0) {
    vec3 b = texture(uB, uv).rgb;
    float m = 1.0;
    if (uMask == 1) m = 1.0 - smoothstep(0.12, 0.78, length((uv - 0.5) * vec2(uRes.x / uRes.y, 1.0)));
    else if (uMask == 2) m = smoothstep(0.0, 1.0, uv.y);
    else if (uMask == 3) {
      vec2 q = uv * 3.0;
      vec2 i = floor(q); vec2 f = fract(q); f = f * f * (3.0 - 2.0 * f);
      float n = mix(mix(h12(i), h12(i + vec2(1, 0)), f.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), f.x), f.y);
      m = smoothstep(0.3, 0.7, n);
    }
    col = mix(col, blendOp(col, b, uLayer), uAmt * m);
  }
  if (uBloom > 0.0) {
    vec3 acc = vec3(0.0);
    float r = 0.018 * (0.5 + uBloom);
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5236 + 0.3;
      vec2 o = vec2(cos(a), sin(a)) * r * (float(i % 3) + 1.0) / 2.0;
      vec3 c = texture(uA, uv + o * vec2(uRes.y / uRes.x, 1.0)).rgb;
      acc += max(c - 0.55, 0.0);
    }
    col += acc / 12.0 * uBloom * 2.2;
  }
  col *= exp2(uExpo);
  if (uTone == 1) col = filmic(col * 1.1);
  col *= uBright;
  col = (col - 0.5) * uContrast + 0.5;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  if (uVig > 0.0) {
    float d = length((uv - 0.5) * vec2(1.0, uRes.y / uRes.x) * 1.5);
    col *= 1.0 - uVig * smoothstep(0.25, 1.05, d);
  }
  if (uFade < 1.0) col = mix(texture(uS, uv).rgb, col, smoothstep(0.0, 1.0, uFade));
  if (uGrain > 0.0) {
    vec2 fc = gl_FragCoord.xy;
    float g;
    if (uGrainStyle == 1) {
      g = 0.6 * h12(fc + uFrame * 7.0) + 0.4 * h12(floor(fc / 2.0) + uFrame * 13.0);
      g = (g - 0.5) * (1.4 - abs(l - 0.5));
    } else if (uGrainStyle == 2) {
      g = 0.5 * h12(fc) + 0.5 * h12(floor(fc / vec2(3.0, 1.0)) + 91.0) - 0.5;
    } else {
      g = h12(fc + uFrame * 7.0) - 0.5;
    }
    col += g * uGrain * 2.0;
  }
  if (uDither == 1) {
    // Interleaved-gradient noise: blue-noise-like spectrum, no texture needed.
    float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy + uFrame * 5.588238, vec2(0.06711056, 0.00583715))));
    col += (n - 0.5) / 255.0 * 1.5;
  } else if (uDither == 2) {
    col += (bayer4(gl_FragCoord.xy) - 0.5) / 255.0 * 2.0;
  }
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
