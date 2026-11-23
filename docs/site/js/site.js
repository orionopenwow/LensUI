// Shared behaviour for every page: theme switch, mobile menu, the dither material, clips that
// play only while visible (and never on their own with reduced motion), and the Guide button.
const root = document.documentElement;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- theme: system → light → dark --------------------------------------------------------------
const THEMES = ["system", "light", "dark"];
function applyTheme(t) {
  if (t === "light" || t === "dark") root.dataset.theme = t;
  else delete root.dataset.theme;
  const b = document.getElementById("theme-btn");
  if (b) {
    b.setAttribute("aria-label", `Colour theme: ${t}. Change`);
    b.dataset.mode = t;
  }
  window.dispatchEvent(new CustomEvent("site-theme"));
}
applyTheme(store.get("lens-site-theme") || "system");
document.getElementById("theme-btn")?.addEventListener("click", () => {
  const cur = store.get("lens-site-theme") || "system";
  const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
  store.set("lens-site-theme", next === "system" ? null : next);
  applyTheme(next);
});
matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => window.dispatchEvent(new CustomEvent("site-theme")));
export const isLight = () => root.dataset.theme === "light" || (!root.dataset.theme && matchMedia("(prefers-color-scheme: light)").matches);

// ---- mobile menu -----------------------------------------------------------------------------
const menuBtn = document.getElementById("menu-btn");
const nav = document.getElementById("site-nav");
menuBtn?.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", String(open));
});

// ---- dither: ordered (Bayer 4x4) dots over a soft value field, drawn once per size -----------
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
function field(seed) {
  // A few slow waves make the soft, cloudy shapes of the reference halftones.
  const r = (n) => { const x = Math.sin(seed * 9301 + n * 49297) * 233280; return x - Math.floor(x); };
  const w = Array.from({ length: 5 }, (_, i) => ({ fx: 0.6 + r(i) * 2.2, fy: 0.6 + r(i + 7) * 2.2, p: r(i + 13) * 6.28, a: 0.5 + r(i + 21) }));
  return (u, v) => {
    let s = 0, n = 0;
    for (const k of w) { s += k.a * Math.sin((u * k.fx + v * k.fy) * 3.1 + k.p); n += k.a; }
    return 0.5 + 0.5 * (s / n);
  };
}
function drawDither(el) {
  let c = el.querySelector(":scope > canvas.dither-canvas");
  if (!c) { c = document.createElement("canvas"); c.className = "dither-canvas"; c.setAttribute("aria-hidden", "true"); el.prepend(c); }
  const cell = Number(el.dataset.cell || 3);
  const w = Math.max(1, Math.ceil(el.clientWidth / cell)), h = Math.max(1, Math.ceil(el.clientHeight / cell));
  if (c.width === w && c.height === h && c.dataset.ink === getComputedStyle(root).getPropertyValue("--dither-ink")) return;
  c.width = w; c.height = h; c.dataset.ink = getComputedStyle(root).getPropertyValue("--dither-ink");
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(w, h);
  const f = field(Number(el.dataset.seed || 3));
  const density = Number(el.dataset.density || 0.55);
  const probe = document.createElement("span"); probe.style.color = "var(--dither-ink)"; el.append(probe);
  const m = getComputedStyle(probe).color.match(/[\d.]+/g).map(Number); probe.remove();
  const [cr, cg, cb] = m, ca = Math.round((m[3] ?? 1) * 255);
  const fade = el.dataset.fade || "edges";
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // Push the soft field towards clouds and gaps, like a halftone.
    const span = Math.max(w, h) / 1.6;
    let v = Math.min(1, Math.max(0, (f(x / span, y / span) - 0.5) * 2.4 + 0.5)) * density * 1.25;
    if (fade === "edges") v *= Math.min(1, 0.25 + Math.abs(x / w - 0.5) * 1.6 + Math.abs(y / h - 0.5) * 0.9);
    if (fade === "bottom") v *= 1 - y / h;
    if (v > BAYER[(y & 3) * 4 + (x & 3)]) { const i = (y * w + x) * 4; img.data[i] = cr; img.data[i + 1] = cg; img.data[i + 2] = cb; img.data[i + 3] = ca; }
  }
  ctx.putImageData(img, 0, 0);
}
export function ditherAll() { document.querySelectorAll(".dither").forEach(drawDither); }
let rt;
addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(ditherAll, 150); });
addEventListener("site-theme", () => requestAnimationFrame(ditherAll));
ditherAll();

// ---- clips: lazy video, only while visible, a play/pause control, reduced motion = poster -------
function wireClip(fig) {
  const v = fig.querySelector("video");
  if (!v) return;
  const btn = fig.querySelector(".play");
  let userPaused = reducedMotion();
  const label = () => btn && (btn.setAttribute("aria-label", v.paused ? "Play clip" : "Pause clip"), (btn.textContent = v.paused ? "Play" : "Pause"));
  const load = () => { if (!v.src && v.dataset.src) { v.src = v.dataset.src; v.load(); } };
  btn?.addEventListener("click", () => {
    load();
    if (v.paused) { userPaused = false; v.play().catch(() => {}); } else { userPaused = true; v.pause(); }
  });
  v.addEventListener("play", label); v.addEventListener("pause", label); label();
  new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { load(); if (!userPaused) v.play().catch(() => {}); }
    else if (!v.paused) v.pause();
  }), { rootMargin: "120px" }).observe(fig);
}
document.querySelectorAll("figure.clip").forEach(wireClip);
document.querySelectorAll("[data-clip-tabs]").forEach((tabs) => {
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-show]");
    if (!b) return;
    tabs.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    const scope = tabs.parentElement;
    scope.querySelectorAll("figure.clip").forEach((f) => { const on = f.dataset.id === b.dataset.show; f.hidden = !on; const v = f.querySelector("video"); if (!on) v?.pause(); });
  });
});

// ---- highlight a section reached by #hash (used by the Guide's "Show me") --------------------
export function flash(id) {
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  return true;
}
if (location.hash) setTimeout(() => flash(decodeURIComponent(location.hash.slice(1))), 250);

// ---- Guide: loaded on first use --------------------------------------------------------------
const fab = document.getElementById("guide-fab");
let guide;
async function openGuide(q) {
  guide ??= await import(new URL("./guide.js", import.meta.url).href);
  guide.open(q);
}
fab?.addEventListener("click", () => openGuide());
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-ask]");
  if (a) { e.preventDefault(); openGuide(a.dataset.ask); }
});
addEventListener("keydown", (e) => {
  if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement?.tagName ?? "") && !e.metaKey && !e.ctrlKey) {
    e.preventDefault(); openGuide();
  }
});
