// The home page: the Dock widget (the real top bar and dock, live, with style, edge and accent
// pickers), the Theme lab desk, and (when it's on) the hero desk in js/hero.js. Desks come from
// js/desk.js (the app's real surfaces), and the sections' exhibits
// from js/exhibits.js. Nothing touches your system.
import { reducedMotion } from "./site.js";
import { createDesk, getPacks, APPS, OVERS } from "./desk.js";
import { ACCENTS } from "./themelab.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const $ = (s, r = document) => r.querySelector(s);

// ---- OS-aware download buttons ----------------------------------------------------------------
export function detectOS(ua = navigator.userAgent, platform = navigator.userAgentData?.platform ?? navigator.platform ?? "") {
  const s = `${ua} ${platform}`;
  if (/Windows/i.test(s)) return "windows";
  if (/Mac|iPhone|iPad/i.test(s)) return "mac";
  if (/Linux|X11|CrOS|Android/i.test(s)) return "linux";
  return "other";
}
const os = detectOS();
document.documentElement.dataset.os = os;
document.querySelectorAll(".hero [data-dl]").forEach((a) => {
  const lbl = a.querySelector(".lbl") ?? a;
  if (os === "windows") lbl.textContent = "Download for Windows";
  else if (os === "mac" || os === "linux") { lbl.textContent = "Get Lens for Windows"; a.querySelector(".hint")?.replaceChildren(`${os === "mac" ? "macOS" : "Linux"} is on the roadmap`); a.href = a.href.replace(/download\.html.*$/, "download.html#platforms"); }
});

// ---- clips below the hero: they play only when asked (click, or hover with a mouse) ------------
{
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  const playing = new Set();
  const stop = (f) => { const v = f.querySelector("video"); v.pause(); f.classList.remove("is-playing"); playing.delete(f); f.querySelector(".clip-play").setAttribute("aria-label", f.querySelector(".clip-play").getAttribute("aria-label").replace(/^Pause/, "Play")); };
  const play = (f) => { const v = f.querySelector("video"); v.play().then(() => { f.classList.add("is-playing"); playing.add(f); f.querySelector(".clip-play").setAttribute("aria-label", f.querySelector(".clip-play").getAttribute("aria-label").replace(/^Play/, "Pause")); }).catch(() => {}); };
  document.querySelectorAll("[data-clip]").forEach((f) => {
    let pinned = false;
    f.querySelector(".clip-play").addEventListener("click", () => { if (playing.has(f)) { pinned = false; stop(f); } else { pinned = true; play(f); } });
    f.querySelector("video").addEventListener("click", () => { if (playing.has(f)) { pinned = false; stop(f); } else { pinned = true; play(f); } });
    f.addEventListener("pointerenter", () => { if (fine.matches && !reducedMotion() && !playing.has(f)) play(f); });
    f.addEventListener("pointerleave", () => { if (!pinned && playing.has(f)) stop(f); });
  });
  // Clips that scroll away stop, so nothing keeps running unseen.
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (!e.isIntersecting && playing.has(e.target)) stop(e.target); }), { threshold: 0.1 });
  document.querySelectorAll("[data-clip]").forEach((f) => io.observe(f));
}

window.lensSite = { ...(window.lensSite ?? {}), detectOS, APPS, OVERS };

// ---- the Dock widget: the real top bar and dock in a short strip of desktop ---------------------------
// Pick a style, an edge or an accent and the real DockSurface changes in place, with its own transition.
export const DOCKS = [
  ["floating", "Floating", "A glass pill that floats above your windows.", {}],
  ["slim", "Slim", "The same dock, thinner and quieter.", {}],
  ["taskbar", "Taskbar", "Full width, like Windows, with Lens physics.", {}],
  ["studio", "Studio", "Labels and room to breathe, for big screens.", {}],
  ["minimal", "Minimal", "Just the icons. Nothing else.", {}],
  ["split", "Split", "Apps on one side, status on the other.", {}],
  ["islands", "Islands", "Grouped pills, Linux-rice style.", {}],
  ["islands", "Expressive", "Islands with soft, bold shapes and its own pack.", { shape: "expressive", pack: "lens-expressive" }],
  ["islands", "Dot Matrix", "Islands drawn in dots, with its own pack.", { shape: "dotmatrix", pack: "lens-dot-matrix" }],
];
const EDGES = [["bottom", "Bottom"], ["top", "Top"], ["left", "Left"], ["right", "Right"]];
const ink = (h) => { const n = parseInt(h.slice(1, 7), 16); return (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150 ? "#09090b" : "#fafafa"; };
/** A radio group with arrow keys: items are buttons with role=radio; pick(i) is called on change. */
function radios(el, pick) {
  const all = () => [...el.querySelectorAll("[role=radio]")];
  const set = (i, { focus = false } = {}) => { all().forEach((b, k) => { b.setAttribute("aria-checked", String(k === i)); b.tabIndex = k === i ? 0 : -1; }); if (focus) all()[i]?.focus(); };
  el.addEventListener("click", (e) => { const b = e.target.closest("[role=radio]"); if (!b) return; const i = all().indexOf(b); set(i); pick(i); });
  el.addEventListener("keydown", (e) => {
    const bs = all(), i = bs.findIndex((b) => b.getAttribute("aria-checked") === "true");
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const n = (i + d + bs.length) % bs.length; set(n, { focus: true }); pick(n);
  });
  return set;
}
{
  const host = $("#dock-desk");
  if (host) {
    const dock = createDesk(host, { label: "Lens top bar and dock, live", layout: [], ratio: 0.3, mobileRatio: 0.62, accentLayer: true, hint: false, running: ["browser", "music", "notes"] });
    const info = $("#dock-info");
    let style = 0, edge = 0, acc = null;
    const say = () => { const [, name, line] = DOCKS[style]; info.innerHTML = `<b>${esc(name)}</b> on the ${esc(EDGES[edge][1].toLowerCase())} edge${acc ? `, ${esc(ACCENTS.find(([h]) => h === acc)?.[1] ?? acc)} accent` : ""}. <span>${esc(line)}</span>`; };
    const packFor = async (id) => (await getPacks()).find((p) => p.id === id);
    let basePack = null;
    const applyPack = async () => { const o = DOCKS[style][3]; const p = (o.pack && (await packFor(o.pack))) || basePack; if (p) dock.setPack(p, { acc }); };
    radios($("#dw-styles"), (i) => { style = i; const [st, , , o] = DOCKS[i]; dock.dockStyle(st, o.shape ?? "classic"); applyPack(); say(); });
    radios($("#dw-edges"), (i) => { edge = i; dock.dockEdge(EDGES[i][0]); say(); });
    radios($("#dw-acc"), (i) => { const b = $("#dw-acc").querySelectorAll("[role=radio]")[i]; acc = b.dataset.acc || null; applyPack(); dock.wash(acc || basePack?.accent || "#fafafa"); say(); });
    packFor(isLightSite() ? "alabaster-daylight" : "obsidian").then((p) => { basePack = p; dock.setPack(p); const a = $("#dw-acc .auto"); if (a && p) { a.style.setProperty("--c", p.accent); a.style.setProperty("--on", ink(p.accent)); } });
    say();
    window.lensSite = { ...window.lensSite, dock, dockStyles: DOCKS };
  }
}
function isLightSite() { return document.documentElement.dataset.scheme === "light"; }

// ---- the hero desk (off for now; js/hero.js) ---------------------------------------------------------
let hero = null;
if ($("#desk-host")) hero = import("./hero.js");

// ---- the rest loads when it comes near ------------------------------------------------------------
const lazy = (sel, f) => { const el = $(sel); if (!el) return; new IntersectionObserver(([e], ob) => { if (e.isIntersecting) { ob.disconnect(); f(el); } }, { rootMargin: "500px" }).observe(el); };
let labDone;
const labReady = new Promise((r) => { labDone = r; });
lazy("#themes", (el) => import("./themelab.js").then((m) => m.init(el)).then(() => labDone(window.lensSite.lab)));
import("./exhibits.js").then((m) => m.init());
/** Opens a real app: on the hero desk when it's on, otherwise on the Theme lab's desk. */
async function openApp(app) {
  if (hero) { const m = await hero; return m.openApp(app); }
  document.getElementById("themes")?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
  const d = await labReady;
  return d.open(app);
}
const SCENE_TO_APP = { music: "music", cleaner: "cleaner", apps: "store", core: "monitor", "core-apps": "monitor" };
export function playScene(id) {
  if (hero) return hero.then((m) => m.playScene(id));
  return openApp(SCENE_TO_APP[id] ?? "browser");
}
window.lensSite = { ...window.lensSite, playScene, openApp, labReady };
addEventListener("lens-play-scene", (e) => playScene(e.detail));
document.querySelectorAll("[data-play-scene]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); playScene(b.dataset.playScene); }));
// "Get" opens the real Lens Apps on a desk; a core app's picture opens that app there.
document.querySelectorAll("[data-get]").forEach((b) => b.addEventListener("click", () => openApp("store")));
document.querySelectorAll("[data-open-app]").forEach((b) => b.addEventListener("click", () => openApp(b.dataset.openApp)));
