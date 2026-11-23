// The hero stage: a living mini desktop (js/desk.js) on the real ambient backdrop of the chosen
// pack, with the real Lens dock on top (an iframe running DockSurface on a mocked backend).
// The pills pick the dock style, the shape and the theme, and open super search inside the dock.
// "⤢ Fullscreen" fills the screen; "▶ Take the tour" loads js/tour.js on demand.
// The other exhibits (Themes, Ask Lens, Apps) and the Also-in-Lens chips load from js/exhibits.js
// when they scroll near. Nothing here touches the visitor's system.
import { reducedMotion, isLight } from "./site.js";
import { getPacks } from "./demos.js";
import { createDesk } from "./desk.js";

const SITE = new URL("../", import.meta.url);
const root = document.documentElement;
const stage = document.getElementById("stage");
const screen = stage.querySelector(".stage-screen");
const live = stage.querySelector(".toasts");
const frame = screen.querySelector("iframe");
const styleSel = stage.querySelector("select[data-style]");
const themeSel = stage.querySelector("select[data-theme]");
const shapeSel = stage.querySelector("select[data-shape]");
const searchBtn = stage.querySelector("[data-search]");
const fsBtn = stage.querySelector("[data-fs]");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---- the desk under the dock ------------------------------------------------------------------
const backdrop = document.createElement("div");
backdrop.className = "backdrop";
backdrop.setAttribute("aria-hidden", "true");
const desk = createDesk(screen, { layout: "hero", backdrop, label: "Demo desktop" });
screen.prepend(desk.el);

/** A notification on the desk, and the same words for screen readers. */
export function toast(title, detail = "", kind = "ok") {
  desk.notify({ icon: kind === "warn" ? "lens-command" : "lens-settings", app: "Lens", title, body: detail });
  live.textContent = `${title}. ${detail}`;
}

// ---- the dock frame ---------------------------------------------------------------------------
let packs = [], current = null, pg = null, playground = null, frameReady = false, drawerOpen = false;
const send = (m) => frame.contentWindow?.postMessage(m, location.origin);
const pending = [];
const post = (m) => (frameReady ? send(m) : pending.push(m));
let scale = 1;
const BASE_H = 150;
/** The frame's height in on-screen pixels: room for the dock (and its tooltips), or the whole desk while search is open. */
function sizeFrame() {
  const H = screen.clientHeight;
  const want = drawerOpen ? H - 30 : Math.min(BASE_H, H);
  frame.style.height = `${Math.round(want / scale)}px`;
  try { frame.contentDocument?.documentElement.style.setProperty("--site-list-h", `${Math.max(96, Math.min(240, want / scale - 250))}px`); } catch { /* not ready */ }
}
addEventListener("message", (e) => {
  if (e.source !== frame.contentWindow) return;
  if (e.data?.lens === "ready" && !frameReady) {
    frameReady = true;
    stage.classList.add("dock-live");
    pending.splice(0).forEach(send);
  } else if (e.data?.lens === "drawer") {
    drawerOpen = !!e.data.open;
    searchBtn.setAttribute("aria-expanded", String(drawerOpen));
    searchBtn.textContent = drawerOpen ? "Close search" : "Search in the dock";
    stage.classList.toggle("searching", drawerOpen);
    sizeFrame();
  }
});
frame.addEventListener("load", () => send({ lens: "ping" }));

/** Opens (or closes) super search inside the dock; `q` is typed into it. */
function search(open = true, q, { focus = true } = {}) {
  if (open) sizeFrameFor(true);
  post({ lens: "search", open, focus, ...(q != null ? { q } : {}) });
  if (open && focus) setTimeout(() => frame.contentWindow?.focus(), 60);
}
const sizeFrameFor = (open) => { drawerOpen = open; sizeFrame(); };

// The dock renders at desktop width; on narrow screens the frame scales down like a screenshot.
function fit() {
  const w = screen.clientWidth;
  scale = Math.min(1, w / 640);
  Object.assign(frame.style, scale < 1 ? { width: "640px", maxWidth: "none", transform: `scale(${scale})`, transformOrigin: "left bottom" } : { width: "", maxWidth: "", transform: "", transformOrigin: "" });
  stage.style.setProperty("--dock-space", `${Math.round(96 * scale)}px`);
  sizeFrame();
}
addEventListener("resize", fit);

// ---- theme, style, shape ----------------------------------------------------------------------
function applyPack(id, { fromUser = false, quiet = false } = {}) {
  const p = packs.find((x) => x.id === id) ?? packs[0];
  if (!p) return;
  current = p;
  themeSel.value = p.id;
  const base = p.base ?? (p.scheme === "light" ? "#f4f4f5" : "#09090b");
  stage.style.setProperty("--stage-bg", base);
  stage.dataset.scheme = p.scheme;
  root.dataset.preset = p.collection ? "" : p.id; // the ambient backdrop picks its scene from this
  desk.setPack(p);
  playground?.setPalette(pg.packPalette({ base, accent: p.accent, scheme: p.scheme }));
  post({ lens: "pack", pack: { id: p.id, label: p.label, base, accent: p.accent, radius: p.radius, scheme: p.scheme, frameStyle: p.frameStyle, controlStyle: p.controlStyle } });
  if (fromUser) stage.dataset.userPack = "1";
  if (shapeSel.value !== (p.shapeStyle ?? "classic")) setShape(p.shapeStyle ?? "classic", true);
  if (!quiet) toast(`Theme: ${p.label}`, p.collection ? `${p.collection} collection · palette by ${p.source?.author ?? "the community"}` : p.description ?? "");
}
const SHAPE_LABEL = { classic: "Classic", expressive: "Expressive", dotmatrix: "Dot Matrix" };
function setShape(v, quiet = false) {
  shapeSel.value = v;
  post({ lens: "config", patch: { theme: { shapeStyle: v } } });
  if (!quiet) toast(`Shape: ${SHAPE_LABEL[v]}`, v === "classic" ? "The default look." : "A style layer on top of any theme.");
}
function setStyle(v, quiet = false) {
  styleSel.value = v;
  post({ lens: "config", patch: { dock: { style: v } } });
  if (!quiet) toast(`Dock style: ${styleSel.selectedOptions[0].textContent}`, v === "islands" ? "Separate islands for apps and status." : "Same apps, same physics.");
}

let stageVisible = true;
const still = () => reducedMotion() || !stageVisible || document.hidden;
async function initDock() {
  frame.src = frame.dataset.src;
  fit();
  packs = await getPacks();
  const core = packs.filter((p) => !p.collection), community = packs.filter((p) => p.collection);
  themeSel.innerHTML = `<optgroup label="Lens packs">${core.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join("")}</optgroup>` +
    (community.length ? `<optgroup label="${esc(community[0].collection)} collection">${community.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join("")}</optgroup>` : "");
  const start = packs.find((p) => p.id === (isLight() ? "alabaster-daylight" : "obsidian"));
  if (start) desk.setPack(start);
  // Backdrop: the real Playground runner with the ambient "theme backdrop" scene.
  pg = await import(new URL("live/playground/playground.js", SITE).href);
  playground = pg.mount(backdrop, { scene: "ambient", fps: 24, seed: 5, still: still(), ripples: false, options: { motion: "lively" }, palette: pg.packPalette({ base: start?.base ?? "#09090b", accent: start?.accent ?? "#fafafa", scheme: start?.scheme ?? "dark" }) });
  const follow = () => { if (!stage.dataset.userPack) applyPack(isLight() ? "alabaster-daylight" : "obsidian", { quiet: true }); };
  follow();
  addEventListener("site-theme", () => { follow(); playground?.setStill(still()); });
  styleSel.addEventListener("change", () => setStyle(styleSel.value));
  shapeSel.addEventListener("change", () => setShape(shapeSel.value));
  themeSel.addEventListener("change", () => applyPack(themeSel.value, { fromUser: true }));
}
searchBtn.addEventListener("click", () => search(!drawerOpen));

// Pause the backdrop when the stage is off-screen or the tab is hidden.
new IntersectionObserver(([e]) => { stageVisible = e.isIntersecting; playground?.setStill(still()); }).observe(stage);
document.addEventListener("visibilitychange", () => playground?.setStill(still()));

// ---- fullscreen: the Fullscreen API, or a fixed overlay where it isn't available ---------------
const isFull = () => stage.classList.contains("is-full");
async function enterFs() {
  if (isFull()) return;
  stage.parentElement.style.minHeight = `${stage.offsetHeight}px`; // hold its place, so nothing below moves
  stage.classList.add("is-full");
  document.body.classList.add("stage-full");
  fsBtn.setAttribute("aria-pressed", "true");
  try { if (stage.requestFullscreen && !document.fullscreenElement) await stage.requestFullscreen({ navigationUI: "hide" }); } catch { /* the overlay is enough */ }
  fit();
  stage.querySelector("[data-fs-exit]").focus({ preventScroll: true });
}
async function exitFs() {
  if (!isFull()) return;
  stage.classList.remove("is-full");
  stage.parentElement.style.minHeight = "";
  document.body.classList.remove("stage-full");
  fsBtn.setAttribute("aria-pressed", "false");
  if (document.fullscreenElement) try { await document.exitFullscreen(); } catch { /* already out */ }
  fit();
  fsBtn.focus({ preventScroll: true });
}
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && isFull()) exitFs(); });
fsBtn.addEventListener("click", () => (isFull() ? exitFs() : enterFs()));
stage.querySelector("[data-fs-exit]").addEventListener("click", exitFs);
// Esc: close search first, then the tour (tour.js listens itself), then fullscreen.
addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (drawerOpen) { search(false); e.preventDefault(); return; }
  if (tour?.running()) return;
  if (isFull()) { e.preventDefault(); exitFs(); }
});

// ---- the tour, loaded on demand ----------------------------------------------------------------
let tour = null;
const api = {
  stage, screen, desk, frame, post, search, toast, applyPack, setStyle, setShape, enterFs, exitFs, isFull,
  get packs() { return packs; }, get playground() { return playground; }, get pg() { return pg; }, get drawerOpen() { return drawerOpen; },
  frameDoc: () => { try { return frame.contentDocument; } catch { return null; } },
};
async function startTour(opts = {}) {
  const m = await import("./tour.js");
  tour ??= m.createTour(api);
  if (drawerOpen) search(false);
  tour.start(opts);
}
stage.querySelectorAll("[data-tour]").forEach((b) => b.addEventListener("click", () => startTour({ fullscreen: isFull() })));
// index.html#tour starts the tour in fullscreen (the overlay, if the browser wants a click first).
if (location.hash === "#tour") addEventListener("load", () => setTimeout(() => startTour({ fullscreen: true }), 600));

// ---- "#voice", "#browser"… from the Guide's Show me: the matching exhibit or chip -----------------
const SHOW = { dock: "stage", command: "ai", ai: "ai", themes: "themes", apps: "apps" };
addEventListener("site-show", (e) => {
  const id = e.detail;
  const target = SHOW[id] ?? (document.getElementById(`also-${id}`) ? `also-${id}` : null);
  if (!target) return;
  const el = document.getElementById(target);
  el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
  if (target.startsWith("also-")) el.click();
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
});

// ---- the "All docks" strip: each thumbnail is the real dock, loaded one at a time when in view ----
const thumbs = [...document.querySelectorAll(".dock-thumb")];
let thumbQueue = null;
function loadThumbs() {
  if (thumbQueue) return;
  thumbQueue = thumbs.map((t) => t.querySelector("iframe"));
  const next = () => {
    const f = thumbQueue.shift();
    if (!f) return;
    f.addEventListener("load", () => setTimeout(next, 250), { once: true });
    f.src = f.dataset.src;
  };
  ("requestIdleCallback" in window ? requestIdleCallback : setTimeout)(next);
}
const fitThumbs = () => thumbs.forEach((t) => t.style.setProperty("--thumb-scale", String(Math.min(0.9, t.clientWidth / 640))));
addEventListener("resize", fitThumbs);
fitThumbs();
if (thumbs.length) new IntersectionObserver(([e], o) => { if (e.isIntersecting) { loadThumbs(); o.disconnect(); } }, { rootMargin: "200px" }).observe(thumbs[0].parentElement);
thumbs.forEach((t) => t.addEventListener("click", () => {
  if (t.dataset.pack) applyPack(t.dataset.pack, { fromUser: true, quiet: true });
  setShape(t.dataset.shape ?? (t.dataset.pack ? shapeSel.value : "classic"), true);
  setStyle(t.dataset.style, true);
  stage.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
  toast(`${t.querySelector(".thumb-label").textContent.trim()} dock`, "Now on the stage. Hover it, click an app, open search.");
}));

// ---- the other exhibits load when they come near --------------------------------------------------
const later = document.querySelectorAll("#themes, #ai, #apps, #also");
let exhibits = null;
const io = new IntersectionObserver((es) => {
  if (!es.some((e) => e.isIntersecting)) return;
  io.disconnect();
  exhibits ??= import("./exhibits.js").then((m) => m.init({ toast }));
}, { rootMargin: "400px" });
later.forEach((s) => io.observe(s));

initDock();
