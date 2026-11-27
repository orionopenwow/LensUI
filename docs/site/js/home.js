// The home page: the Dock widget (the real top bar and dock, live, with style, edge and accent
// pickers), the Theme lab desk, and (when it's on) the hero desk in js/hero.js. Desks come from
// js/desk.js (the app's real surfaces), and the sections' exhibits
// from js/exhibits.js. Nothing touches your system.
import { reducedMotion } from "./site.js";
import { createDesk, getPacks, APPS, OVERS } from "./desk.js";

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

// ---- the Dock widget: the real top bar and dock on a short strip of desktop ---------------------------
// Three steps, Style → Edge → Accent. The cards are drawn by tools/site/pages.mjs from the app's own
// DOCK_STYLES (src/dock/styles.ts) with its own DockStylePreview drawing, so a new style shows up here by
// itself. Picking one changes the real DockSurface in place, with its own transition, and the caption
// under the desk says in plain words what changed (crossfading in the direction of travel, DESIGN §5.3).
const cards = (sel) => [...document.querySelectorAll(`${sel} [role=radio]`)];
/** [style, name, line, { shape, pack }] for each style card, in the page's order. */
export const DOCKS = cards("#dw-styles").map((b) => [b.dataset.style, b.dataset.label, b.dataset.line, { ...(b.dataset.shape ? { shape: b.dataset.shape } : {}), ...(b.dataset.pack ? { pack: b.dataset.pack } : {}) }]);
const EDGES = cards("#dw-edges").map((b) => [b.dataset.edge, b.dataset.label, b.dataset.line]);
const ink = (h) => { const n = parseInt(h.slice(1, 7), 16); return (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150 ? "#09090b" : "#fafafa"; };
/**
 * A radio group of buttons with role=radio and a roving tabindex: arrow keys (and Home/End) move and
 * pick, as a radio group does. A `.dw-ind` in the group is the selection ring: it slides to the
 * picked option (transform only). pick(i, dir) is called on change, dir = +1 forward, -1 back.
 */
function radios(el, pick) {
  const all = () => [...el.querySelectorAll("[role=radio]")];
  const ind = el.querySelector(".dw-ind");
  const cur = () => all().findIndex((b) => b.getAttribute("aria-checked") === "true");
  const place = (instant = false) => {
    const b = all()[cur()];
    if (!ind || !b || !b.offsetWidth) return;
    if (instant) ind.style.transition = "none";
    Object.assign(ind.style, { width: `${b.offsetWidth}px`, height: `${b.offsetHeight}px`, transform: `translate3d(${b.offsetLeft}px, ${b.offsetTop}px, 0)` });
    ind.classList.add("is-on");
    if (instant) { void ind.offsetWidth; ind.style.transition = ""; }
  };
  const set = (i, { focus = false } = {}) => {
    all().forEach((b, k) => { b.setAttribute("aria-checked", String(k === i)); b.tabIndex = k === i ? 0 : -1; });
    place();
    const b = all()[i];
    if (focus) b?.focus({ preventScroll: true });
    // In the phone strip, bring the picked card into view without moving the page.
    if (b && el.scrollWidth > el.clientWidth + 1) { const l = b.offsetLeft - (el.clientWidth - b.offsetWidth) / 2; el.scrollTo({ left: l, behavior: reducedMotion() ? "auto" : "smooth" }); }
  };
  const go = (i, opts) => { const was = cur(); if (i === was) return; set(i, opts); pick(i, i > was ? 1 : -1); };
  el.addEventListener("click", (e) => { const b = e.target.closest("[role=radio]"); if (b) go(all().indexOf(b)); });
  el.addEventListener("keydown", (e) => {
    const bs = all(), i = cur();
    const n = e.key === "Home" ? 0 : e.key === "End" ? bs.length - 1 : { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key] != null ? (i + { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key] + bs.length) % bs.length : null;
    if (n == null) return;
    e.preventDefault();
    go(n, { focus: true });
  });
  // The pressed state shows for at least 90 ms, even on the quickest click (DESIGN §5.1).
  el.addEventListener("pointerdown", (e) => {
    const b = e.target.closest("[role=radio]"); if (!b) return;
    const t0 = performance.now(); b.classList.add("is-pressed");
    const up = () => { removeEventListener("pointerup", up); removeEventListener("pointercancel", up); setTimeout(() => b.classList.remove("is-pressed"), Math.max(0, 90 - (performance.now() - t0))); };
    addEventListener("pointerup", up); addEventListener("pointercancel", up);
  });
  new ResizeObserver(() => place(true)).observe(el);
  place(true);
  return { set, cur };
}
/** A line that crossfades to new text with a 6 px slide in the direction of travel (DESIGN §5.3). */
function crossfade(box, html, dir = 1) {
  box.querySelectorAll(".is-out").forEach((n) => n.remove());
  const old = box.querySelector(".dw-info-t");
  const nu = document.createElement("span");
  nu.className = "dw-info-t"; nu.innerHTML = html;
  if (!old || reducedMotion()) { box.replaceChildren(nu); return; }
  old.classList.add("is-out");
  box.append(nu);
  const gone = () => old.remove();
  old.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translate3d(${-6 * dir}px, 0, 0)` }], { duration: 120, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" }).finished.then(gone, gone);
  nu.animate([{ opacity: 0, transform: `translate3d(${6 * dir}px, 0, 0)` }, { opacity: 1, transform: "none" }], { duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
}
{
  const host = $("#dock-desk");
  if (host) {
    // A desk a little closer than the lab's, so the dock reads: 1360 design px wide, not 1600.
    const dock = createDesk(host, { label: "Lens top bar and dock, live", layout: [], ratio: 0.36, mobileRatio: 0.7, designW: 1360, accentLayer: true, hint: false, running: ["browser", "music", "notes"] });
    // A matte Lens backdrop over the theme's ambient scene: soft light in the accent and the Lens cloud's
    // hues, plus a faint horizon, so the dock has something to sit on (gradients only, no blur).
    dock.canvas.querySelector(".lx-bg")?.insertAdjacentHTML("beforeend", '<div class="dw-wall" aria-hidden="true"><i class="dw-wall-a"></i><i class="dw-wall-b"></i><i class="dw-wall-h"></i></div>');
    const w = $("#dockw"), info = $("#dock-info"), hint = $("#dw-style-hint"), accName = $("#dw-acc-name");
    let style = 0, edge = 0, acc = null, accLabel = "Theme's own", basePack = null, shownPack = null;
    const now = () => `<span class="dw-now">${esc(DOCKS[style][1])} · ${esc(EDGES[edge][1])}${acc ? ` · ${esc(accLabel)}` : ""}</span>`;
    const say = (html, dir) => crossfade(info, `${html} ${now()}`, dir);
    const packFor = async (id) => (await getPacks()).find((p) => p.id === id);
    const tint = () => { const c = acc || shownPack?.accent || basePack?.accent || "#fafafa"; w.style.setProperty("--dw-acc", c); w.style.setProperty("--dw-on", ink(c)); };
    const applyPack = async () => { const o = DOCKS[style][3]; const p = (o.pack && (await packFor(o.pack))) || basePack; shownPack = p; if (p) dock.setPack(p, { acc }); tint(); };
    const styleCards = radios($("#dw-styles"), (i, dir) => {
      style = i; const [st, name, line, o] = DOCKS[i];
      w.dataset.style = st;
      dock.dockStyle(st, o.shape ?? "classic"); applyPack();
      hint.textContent = line;
      say(`<b>${esc(name)}</b>. ${esc(line)}`, dir);
    });
    radios($("#dw-edges"), (i, dir) => {
      edge = i; dock.dockEdge(EDGES[i][0]);
      w.dataset.edge = EDGES[i][0];
      say(`Moved to the <b>${esc(EDGES[i][1].toLowerCase())}</b> edge. ${esc(EDGES[i][2])}`, dir);
    });
    radios($("#dw-acc"), (i, dir) => {
      const b = cards("#dw-acc")[i]; acc = b.dataset.acc || null; accLabel = b.dataset.name || "Theme's own";
      accName.textContent = accLabel;
      applyPack(); dock.wash(acc || basePack?.accent || "#fafafa");
      say(acc ? `<b>${esc(accLabel)}</b> accent. The dock's running marks and focus follow it.` : `The <b>theme's own</b> accent again.`, dir);
    });
    // The style hint under "Style" names what a card does while you point at it or focus it.
    const showHint = (b) => { hint.textContent = b ? b.dataset.line : DOCKS[styleCards.cur()]?.[2] ?? ""; };
    $("#dw-styles").addEventListener("pointerover", (e) => { const b = e.target.closest("[role=radio]"); if (b) showHint(b); });
    $("#dw-styles").addEventListener("pointerleave", () => showHint(document.activeElement?.closest?.("#dw-styles [role=radio]")));
    $("#dw-styles").addEventListener("focusin", (e) => showHint(e.target.closest("[role=radio]")));
    $("#dw-styles").addEventListener("focusout", () => showHint(null));
    packFor(isLightSite() ? "alabaster-daylight" : "obsidian").then((p) => { basePack = p; shownPack = p; dock.setPack(p); tint(); const a = $("#dw-acc .auto"); if (a && p) { a.style.setProperty("--c", p.accent); a.style.setProperty("--on", ink(p.accent)); } });
    w.dataset.style = DOCKS[0]?.[0] ?? "floating"; w.dataset.edge = "bottom";
    tint();
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
