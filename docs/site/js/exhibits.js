// The home page's exhibits: each one is a real Lens surface (a frame from live/app/, the same
// components the app ships) shown at its true size and scaled to fit, loaded when it comes near the
// screen. The magic right-click exhibit lays the real magic window over a real Lens Browser and
// steps through what it can do; the visitor can right-click the page instead. Nothing autoplays with
// reduced motion, and anything that advances by itself stops for good once the visitor takes over.
import { reducedMotion, isLight } from "./site.js";
import { appUrl } from "./desk.js";

const preset = () => (isLight() ? "alabaster-daylight" : "obsidian");
const near = (el, f, margin = "400px") => new IntersectionObserver(([e], ob) => { if (e.isIntersecting) { ob.disconnect(); f(el); } }, { rootMargin: margin }).observe(el);

/** A stage holds frames at design size (data-w × data-h) and scales them to its width. */
function stage(el) {
  const W = +el.dataset.w, H = +el.dataset.h;
  const inner = document.createElement("div");
  inner.className = "xstage-in";
  inner.style.width = `${W}px`; inner.style.height = `${H}px`;
  inner.append(...el.childNodes);
  el.append(inner);
  const fit = () => { const k = el.clientWidth / W; inner.style.transform = `scale(${k})`; el.style.height = `${Math.round(H * k)}px`; el._k = k; };
  new ResizeObserver(fit).observe(el);
  fit();
  return { W, H, inner };
}
/** Mounts the real surface in a holder. Returns the frame. */
function mount(holder, src = holder.dataset.xf) {
  let f = holder.querySelector("iframe");
  if (!f) {
    f = document.createElement("iframe");
    f.title = holder.getAttribute("aria-label") ?? "Lens (live)";
    f.tabIndex = holder.getAttribute("aria-hidden") === "true" ? -1 : 0;
    holder.append(f);
  }
  if (holder._src !== src) { holder._src = src; holder.classList.remove("is-ready"); f.src = appUrl(src, preset()); }
  return f;
}
const frames = new Map(); // contentWindow → holder
addEventListener("message", (e) => {
  if (e.origin !== location.origin || e.data?.lens !== "win") return;
  const holder = [...document.querySelectorAll(".xf")].find((h) => h.querySelector("iframe")?.contentWindow === e.source);
  if (!holder) return;
  if (e.data.a === "ready") { holder.classList.add("is-ready"); holder.dispatchEvent(new CustomEvent("xf-ready")); }
  else holder.dispatchEvent(new CustomEvent("xf-msg", { detail: e.data }));
});
void frames;

/** Tabs that pick a step; optionally advance by themselves until the visitor takes over. */
function steps(box, onStep, { auto = 0 } = {}) {
  const tabs = [...box.querySelectorAll(".xstep")];
  let i = 0, timer = 0, taken = false, seen = false, hover = false;
  const go = (n, user = false) => {
    i = (n + tabs.length) % tabs.length;
    tabs.forEach((t, k) => { t.setAttribute("aria-selected", String(k === i)); t.tabIndex = k === i ? 0 : -1; });
    if (user) { taken = true; clearInterval(timer); tabs[i].focus({ preventScroll: true }); }
    onStep(tabs[i].dataset.step, i);
  };
  const run = () => { clearInterval(timer); if (auto && !taken && seen && !hover && !reducedMotion()) timer = setInterval(() => go(i + 1), auto); };
  tabs.forEach((t, k) => t.addEventListener("click", () => go(k, true)));
  box.addEventListener("keydown", (e) => { const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (d && e.target.closest(".xstep")) { e.preventDefault(); go(i + d, true); } });
  const ex = box.closest("[data-exhibit]") ?? box;
  ex.addEventListener("pointerenter", () => { hover = true; clearInterval(timer); });
  ex.addEventListener("pointerleave", () => { hover = false; run(); });
  ex.addEventListener("focusin", () => { hover = true; clearInterval(timer); });
  ex.addEventListener("focusout", () => { hover = false; run(); });
  new IntersectionObserver(([e]) => { seen = e.isIntersecting; run(); }, { threshold: 0.35 }).observe(ex);
  return { go, take: () => { taken = true; clearInterval(timer); }, get index() { return i; } };
}

// ---- magic right-click: the real magic window, off the thing it was opened on ------------------------
function magic(ex) {
  const st = stage(ex.querySelector(".xstage"));
  const target = ex.querySelector(".mx-target"), menu = ex.querySelector(".mx-menu"), menuHolder = menu.querySelector(".xf");
  // Right-click is the star here: the page dims and softens around the clicked spot and its menu.
  const dim = ex.querySelector(".mx-dim");
  const spotlight = (x, y) => { if (!dim) return; dim.style.setProperty("--x", `${Math.round(x)}px`); dim.style.setProperty("--y", `${Math.round(y)}px`); dim.hidden = false; };
  // Where each step's right-click lands on the page (design px), and which page it lands on.
  const AT = { link: [470, 150], summary: [470, 150], transcript: [520, 190], shelf: [360, 210], ask: [430, 170], approval: [430, 170] };
  const PAGE = { transcript: "browser.html?scene=transcript" };
  const place = (x, y) => { const mx = Math.max(8, Math.min(x, st.W - 368)), my = Math.max(8, Math.min(y, st.H - 448)); menu.style.transform = `translate3d(${mx}px, ${my}px, 0)`; };
  const show = (scene, at) => {
    mount(target, PAGE[scene] ?? "browser.html?scene=frame");
    mount(menuHolder, `magic.html?scene=${scene}&drag=0&magic=0`);
    place(...at);
    spotlight(...at);
    menu.hidden = false;
    if (!reducedMotion()) menu.animate([{ opacity: 0, transform: `${menu.style.transform} scale(.96)` }, { opacity: 1, transform: menu.style.transform }], { duration: 160, easing: "cubic-bezier(.2,.8,.2,1)" });
  };
  const ctl = steps(ex.querySelector(".xsteps"), (id) => show(id, AT[id]), { auto: 5200 });
  // The visitor's own right-click: the frame says what was under the pointer, the real window opens there.
  target.addEventListener("xf-msg", (e) => {
    const m = e.detail;
    if (m.a !== "magic") return;
    ctl.take();
    ex.querySelectorAll(".xstep").forEach((t) => t.setAttribute("aria-selected", "false"));
    mount(menuHolder, `magic.html?scene=${m.kind || "window"}&drag=0&magic=0`);
    place(m.x + 4, m.y + 4);
    spotlight(m.x, m.y);
    menu.hidden = false;
  });
  show("link", AT.link);
}

// ---- bring your own agent: the real “Needs your OK” card --------------------------------------------
function agent(ex) {
  ex.querySelectorAll(".xstage").forEach((st) => stage(st));
  ex.querySelectorAll(".xf").forEach((h) => mount(h));
}

// ---- Lens Browser: the real BrowserSurface, a few of its states --------------------------------------
function browser(ex) {
  stage(ex.querySelector(".xstage"));
  const holder = ex.querySelector(".xf");
  steps(ex.querySelector(".xsteps"), (id) => mount(holder, `browser.html?scene=${id}`));
  mount(holder);
}

const KINDS = { magic, agent, browser };
export function init() {
  document.querySelectorAll("[data-exhibit]").forEach((ex) => near(ex, () => KINDS[ex.dataset.exhibit]?.(ex)));
  // The site's own light/dark switch re-themes the exhibits.
  new MutationObserver(() => document.querySelectorAll(".xf iframe").forEach((f) => { const h = f.parentElement; const src = h._src; if (src) { h._src = null; mount(h, src); } })).observe(document.documentElement, { attributes: true, attributeFilter: ["data-scheme"] });

  // Core apps: all nine at once; a highlight moves through them until the visitor points at one.
  document.querySelectorAll("[data-cycle]").forEach((grid) => {
    const items = [...grid.children];
    let i = -1, timer = 0, seen = false, held = false;
    const mark = (n) => { i = n; items.forEach((el, k) => el.classList.toggle("is-on", k === i)); };
    const run = () => { clearInterval(timer); if (seen && !held && !reducedMotion()) timer = setInterval(() => mark((i + 1) % items.length), 2600); };
    grid.addEventListener("pointerenter", () => { held = true; clearInterval(timer); mark(-1); });
    grid.addEventListener("pointerleave", () => { held = false; run(); });
    grid.addEventListener("focusin", () => { held = true; clearInterval(timer); mark(-1); });
    grid.addEventListener("focusout", () => { held = false; run(); });
    new IntersectionObserver(([e]) => { seen = e.isIntersecting; if (seen && i < 0 && !held && !reducedMotion()) mark(0); run(); }, { threshold: 0.3 }).observe(grid);
  });
}
