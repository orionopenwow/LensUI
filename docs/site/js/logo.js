// The animated hero logo. The page first shows the static logo (an <img>, so LCP is unaffected).
// After the page is idle, this adds two layers on top of it:
//   1. a WebGL canvas inside the glass: the nebula texture (brand/nebula.webp) slowly rotating
//      (one turn in ~80 s), warped by a flowing field whose strength eases in and out over ~15 s,
//      and drifting ±15° in hue over ~20 s;
//   2. the still parts as inline SVG (brand/lens-logo-overlay.svg): bezel, vignette, stars (a few
//      twinkle in CSS) and the glass glare, which leans gently towards the pointer on hover.
// Hovering speeds the nebula up a little. It pauses off-screen and in hidden tabs, and never starts
// with reduced motion (system setting or the notch). No WebGL → the static logo stays.
import { reducedMotion } from "./site.js";

const SITE = new URL("../", import.meta.url);

const VERT = `attribute vec2 p; varying vec2 v; void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `precision mediump float;
varying vec2 v;
uniform sampler2D tex;
uniform float t;      // seconds of animation time (speed already applied)
uniform float warp;   // 0..1 eased warp strength
uniform float hue;    // radians
const float GLASS = 400.0 / 512.0; // the canvas covers the glass; the texture covers the full logo
vec3 hueRotate(vec3 c, float a) {
  const mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
  const mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
  vec3 y = toYIQ * c;
  float h = atan(y.z, y.y) + a, ch = length(y.yz);
  return toRGB * vec3(y.x, ch * cos(h), ch * sin(h));
}
void main() {
  vec2 q = (v - 0.5) * GLASS;                    // texture space, centred
  float a = t * 6.2831853 / 80.0;                // slow rotation (one turn in 80 s)
  q = mat2(cos(a), -sin(a), sin(a), cos(a)) * q;
  // A soft flow field: layered sines drifting at different speeds (cheap domain warping).
  vec2 w = vec2(sin(q.y * 9.0 + t * 0.37) + 0.6 * sin(q.x * 13.0 - t * 0.29 + 1.7),
                cos(q.x * 8.0 - t * 0.31) + 0.6 * cos(q.y * 12.0 + t * 0.41 + 0.9));
  q += w * mix(0.018, 0.034, warp);
  vec3 c = texture2D(tex, q + 0.5).rgb;
  gl_FragColor = vec4(hueRotate(c, hue), 1.0);
}`;

let logoCount = 0;
export async function animateLogo(host) {
  if (host.dataset.animated) return;
  host.dataset.animated = "1";
  performance.mark("lens-logo-start");
  const [overlaySvg, img] = await Promise.all([
    fetch(new URL("brand/lens-logo-overlay.svg", SITE)).then((r) => r.text()),
    new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = new URL(host.dataset.nebula || "brand/nebula.webp", SITE).href; }),
  ]);
  const canvas = document.createElement("canvas");
  canvas.className = "logo-nebula";
  canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, powerPreference: "low-power", preserveDrawingBuffer: false });
  if (!gl) return;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
  const U = { t: gl.getUniformLocation(prog, "t"), warp: gl.getUniformLocation(prog, "warp"), hue: gl.getUniformLocation(prog, "hue") };

  // Each logo on the page gets its own ids (the hero and the Guide orb both animate).
  const n = ++logoCount;
  host.insertAdjacentHTML("beforeend", n === 1 ? overlaySvg : overlaySvg.replace(/lg-/g, `lg${n}-`));
  host.prepend(canvas);
  const overlay = host.querySelector(".logo-overlay");
  const glare = overlay.querySelector(n === 1 ? "#lg-glare" : `#lg${n}-glare`);

  const size = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const px = Math.round(canvas.clientWidth * dpr);
    if (canvas.width !== px) { canvas.width = canvas.height = px; gl.viewport(0, 0, px, px); }
  };
  new ResizeObserver(size).observe(canvas);
  size();

  // Time runs only while visible; hover eases the speed up to 1.6×.
  const base = Number(host.dataset.speed || 1);
  let t = 0, speed = base, target = base, last = 0, raf = 0, visible = true, cost = 0, frames = 0;
  const ease = (x) => 0.5 - 0.5 * Math.cos(x);
  const draw = (now) => {
    const t0 = performance.now();
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    speed += (target - speed) * Math.min(1, dt * 3);
    t += dt * speed;
    gl.uniform1f(U.t, t);
    gl.uniform1f(U.warp, ease((t * 6.2831853) / 15));
    gl.uniform1f(U.hue, Math.sin((t * 6.2831853) / 20) * 0.2618);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    cost += performance.now() - t0;
    frames++;
    raf = requestAnimationFrame(draw);
  };
  const running = () => raf !== 0;
  const start = () => { if (running() || !visible || document.hidden || reducedMotion()) return; last = 0; raf = requestAnimationFrame(draw); };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  // One frame even when not animating, so the canvas matches the poster underneath.
  gl.uniform1f(U.t, 0); gl.uniform1f(U.warp, 0); gl.uniform1f(U.hue, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  host.classList.add("is-live");

  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }).observe(host);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  addEventListener("site-theme", () => (reducedMotion() ? stop() : start()));
  host.addEventListener("pointerenter", () => { target = base * 1.6; });
  host.addEventListener("pointerleave", () => { target = base; glare?.setAttribute("cx", "0.3"); glare?.setAttribute("cy", "0.22"); });
  host.addEventListener("pointermove", (e) => {
    if (!glare || reducedMotion()) return;
    const r = host.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    glare.setAttribute("cx", (0.3 + (x - 0.3) * 0.25).toFixed(3));
    glare.setAttribute("cy", (0.22 + (y - 0.22) * 0.25).toFixed(3));
  });
  // For tools/site/check.mjs: average main-thread cost of one frame.
  host.logoStats = () => ({ frames, avgMs: frames ? cost / frames : 0, running: running() });
  start();
}

for (const host of document.querySelectorAll("[data-logo]")) {
  // With reduced motion the static logo stays; switching motion on in the notch starts it.
  const go = () => {
    if (reducedMotion()) { addEventListener("site-theme", function on() { if (!reducedMotion()) { removeEventListener("site-theme", on); animateLogo(host).catch(() => {}); } }); return; }
    animateLogo(host).catch(() => {});
  };
  const later = () => ("requestIdleCallback" in window ? requestIdleCallback(go, { timeout: 2500 }) : setTimeout(go, 1200));
  if (document.readyState === "complete") later(); else addEventListener("load", later, { once: true });
}
// (The nav logo is the only one on most pages; the hero has none, so one WebGL context per page.)
