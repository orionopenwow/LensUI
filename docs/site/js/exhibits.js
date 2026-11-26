// The home page's exhibits: each one is a real Lens surface (a frame from live/app/, the same
// components the app ships) shown at its true size and scaled to fit, loaded when it comes near the
// screen. Each plays three steps slowly, on repeat (see loop): it holds while pointed at or focused, has
// a Pause button, and stays still with reduced motion. The magic right-click exhibit lays the real magic
// window over a real Lens Browser; the visitor can right-click the page instead.
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

/**
 * The calm loop under an exhibit: three steps, each held ~5 s, on repeat. It waits until the exhibit is
 * on screen, holds while the pointer or focus is inside, and stops on Pause (or for good once the visitor
 * takes over, e.g. by right-clicking). With reduced motion it shows step one, still.
 */
export const STEP_MS = 5200;
function loop(ex, n, onStep, caps = []) {
  const cap = ex.querySelector(".xcap"), dots = [...ex.querySelectorAll(".xdots i")], pause = ex.querySelector("[data-xpause]");
  let i = 0, timer = 0, seen = false, held = false, paused = false, taken = false;
  const show = (k) => {
    i = (k + n) % n;
    dots.forEach((d, j) => d.classList.toggle("on", j === i));
    if (cap && caps[i] != null) {
      if (reducedMotion()) cap.textContent = caps[i];
      else { cap.classList.add("is-fade"); setTimeout(() => { cap.textContent = caps[i]; cap.classList.remove("is-fade"); }, 260); }
    }
    onStep(i);
  };
  const run = () => { clearTimeout(timer); if (seen && !held && !paused && !taken && !reducedMotion()) timer = setTimeout(() => { show(i + 1); run(); }, STEP_MS); };
  const hold = (on) => { held = on; run(); };
  ex.addEventListener("pointerenter", () => hold(true));
  ex.addEventListener("pointerleave", () => hold(false));
  ex.addEventListener("focusin", () => hold(true));
  ex.addEventListener("focusout", (e) => { if (!ex.contains(e.relatedTarget)) hold(false); });
  pause?.addEventListener("click", () => {
    paused = !paused; taken = false;
    pause.setAttribute("aria-pressed", String(paused));
    const sr = pause.querySelector(".sr"); if (sr) sr.textContent = sr.textContent.replace(/^(Pause|Play)/, paused ? "Play" : "Pause");
    run();
  });
  new IntersectionObserver(([e]) => { seen = e.isIntersecting; run(); }, { threshold: 0.35 }).observe(ex);
  show(0);
  return { show, take: () => { taken = true; clearTimeout(timer); }, get index() { return i; }, get playing() { return seen && !held && !paused && !taken && !reducedMotion(); } };
}
const data = (ex) => { try { return JSON.parse(ex.querySelector(".xdata")?.textContent ?? "[]"); } catch { return []; } };

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
  const st3 = data(ex);
  const ctl = loop(ex, st3.length || 3, (k) => { const id = st3[k]?.[0] ?? "link"; show(id, AT[id]); }, st3.map((x) => x[1]));
  // The visitor's own right-click: the frame says what was under the pointer, the real window opens there.
  target.addEventListener("xf-msg", (e) => {
    const m = e.detail;
    if (m.a !== "magic") return;
    ctl.take();
    const c = ex.querySelector(".xcap"); if (c) c.textContent = "Your right-click: the menu knows what's under the pointer. Press Pause, then Play, to restart the loop.";
    mount(menuHolder, `magic.html?scene=${m.kind || "window"}&drag=0&magic=0`);
    place(m.x + 4, m.y + 4);
    spotlight(m.x, m.y);
    menu.hidden = false;
  });
}

// ---- agentic desktop: Claude Code's dinner plan in Lens Browser, and the real card for the risky step ---
function agent(ex) {
  ex.querySelectorAll(".xstage").forEach((st) => stage(st));
  const browserH = ex.querySelector(".ag-browser"), card = ex.querySelector(".ag-card"), cardH = card.querySelector(".xf");
  const plan = [...ex.querySelectorAll(".ag-plan li")];
  const mark = (done, now) => plan.forEach((li, k) => { li.classList.toggle("is-done", done.includes(k)); li.classList.toggle("is-now", now.includes(k)); });
  mount(cardH);
  const STEPS = [
    ["dinner-plan", false, [], [0, 1], "Claude Code asks for dinner. Lens Browser searches and picks a place: reading runs on its own."],
    ["dinner", false, [0, 1], [2], "Booking has a $25 no-show fee, so step 3 stops in the AI panel and waits for you."],
    ["dinner", true, [0, 1], [2, 3, 4], "The real “Needs your OK” card: the form it will submit, what each step may do, and Deny or hold to Book."],
  ];
  loop(ex, 3, (k) => {
    const [scene, showCard, done, now] = STEPS[k];
    mount(browserH, `browser.html?scene=${scene}`);
    mark(done, now);
    card.hidden = !showCard;
    if (showCard && !reducedMotion()) card.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 360, easing: "cubic-bezier(.2,.8,.2,1)" });
  }, STEPS.map((x) => x[4]));
}

// ---- Lens Browser: the real BrowserSurface, three of its states --------------------------------------
function browser(ex) {
  stage(ex.querySelector(".xstage"));
  const holder = ex.querySelector(".xf");
  const st3 = data(ex);
  loop(ex, st3.length || 3, (k) => mount(holder, `browser.html?scene=${st3[k]?.[0] ?? "home"}`), st3.map((x) => x[1]));
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
