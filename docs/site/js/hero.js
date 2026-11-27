// The hero demo desk with its guided tours (js/showcases.js), fullscreen, and the rail of dock styles.
// Off for now (tools/site/pages.mjs HERO_DESK): js/home.js loads this only when the page has the desk.
import { reducedMotion } from "./site.js";
import { createDesk, getPacks, iconUrl, APPS, OVERS } from "./desk.js";
import { createShowcases } from "./showcases.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const $ = (s, r = document) => r.querySelector(s);
const detectOS = window.lensSite?.detectOS;

// ---- the hero desk ----------------------------------------------------------------------------
const host = $("#desk-host");
const desk = createDesk(host, { fitViewport: true, label: "Lens desktop demo", layout: [["browser", 0.03, 0.03], ["notes", 0.58, 0.03]] });
// The demo plays by itself, slowly: each part shows its feature in three steps, then hands over to the
// next (js/showcases.js). Pointing at it or focusing it holds the step, Pause stops it, and using the desk
// yourself stops it until Play. Tabs below jump to a part. Reduced motion: the first step, still.
const scTabs = $("#sc-tabs");
const scbar = $("#sc-bar");
const capN = scbar.querySelector(".sc-n"), capT = scbar.querySelector(".sc-t"), dots = scbar.querySelector(".sc-dots");
const playBtn = scbar.querySelector("[data-play]");
const shows = createShowcases(desk, {
  onChange(st) {
    scTabs.querySelectorAll("[role=tab]").forEach((t, k) => {
      const on = st.showcase?.id === t.dataset.sc;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on || (!st.showcase && k === 0) ? 0 : -1;
    });
    playBtn.setAttribute("aria-pressed", String(st.paused));
    playBtn.querySelector(".lbl").textContent = st.paused ? "Play" : "Pause";
    if (!st.showcase) { dots.innerHTML = ""; return; }
    capN.textContent = st.showcase.title;
    const t = st.busy && !st.step ? "" : st.cap;
    if (t && capT.textContent !== t) {
      if (reducedMotion()) capT.textContent = t;
      else { capT.style.opacity = "0"; clearTimeout(capT._t); capT._t = setTimeout(() => { capT.textContent = t; capT.style.opacity = ""; }, 220); }
    }
    dots.innerHTML = Array.from({ length: st.total }, (_, k) => `<i class="${k === st.index ? "on" : ""}"></i>`).join("");
  },
});
playBtn.addEventListener("click", () => (shows.paused ? shows.play() : shows.pause()));
// Each tour's tab carries an icon drawn like Lens's own app icons (DESIGN.md §3.7, src/icons/lensApps.ts):
// a bold white glyph (stroke 2.5 on a 24 px grid, round caps) on the plain #18181B tile with one 10 %
// hairline, no gradient, glow or tint. One idea each, distinct at 22 px. Lens Browser keeps the Lens
// logo (media/icons/lens-browser.svg, the same flat tile the app draws).
const SC_GLYPH = {
  // A window above the dock.
  docks: "<path d='M7 4h10a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM5.5 15h13a2.5 2.5 0 0 1 0 5h-13a2.5 2.5 0 0 1 0-5z'/>",
  // A mouse with its right button marked.
  magic: "<path d='M12 3a6 6 0 0 1 6 6v6a6 6 0 0 1-12 0V9a6 6 0 0 1 6-6zM12 3v6h6'/>",
  // One look, light and dark: a circle, half filled.
  themes: "<path d='M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z'/><path d='M12 3a9 9 0 0 1 0 18z' fill='#FAFAFA'/>",
  // The agent's pointer with a spark.
  agent: "<path d='M5 5l5.5 14 2.2-6.3L19 10.5zM18.5 2.5v4M16.5 4.5h4'/>",
};
const scTile = (glyph) =>
  "<svg viewBox='0 0 64 64' width='22' height='22' aria-hidden='true' focusable='false'>" +
  "<rect x='2' y='2' width='60' height='60' rx='15' fill='#18181B'/><rect x='2.5' y='2.5' width='59' height='59' rx='14.5' fill='none' stroke='white' stroke-opacity='.1'/>" +
  `<g transform='translate(12.5 12.5) scale(1.625)' fill='none' stroke='#FAFAFA' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'>${glyph}</g></svg>`;
const scIcon = (id) =>
  SC_GLYPH[id]
    ? `<span class="sc-ic" aria-hidden="true">${scTile(SC_GLYPH[id])}</span>`
    : `<span class="sc-ic" aria-hidden="true"><img src="${iconUrl(id === "browser" ? "lens-browser" : "lens-command")}" alt="" width="22" height="22"></span>`;
scTabs.innerHTML = shows.list.map((s, k) => `<button type="button" role="tab" aria-selected="false" tabindex="${k ? -1 : 0}" data-sc="${s.id}" aria-label="${esc(s.title)}: ${esc(s.line)}">${scIcon(s.id)}<span class="sc-tx"><b>${esc(s.title)}</b><span>${esc(s.line)}</span></span></button>`).join("");
scTabs.addEventListener("click", (e) => {
  const t = e.target.closest("[data-sc]");
  if (!t) return;
  if (shows.current?.id === t.dataset.sc && !shows.paused) return;
  shows.start(t.dataset.sc, { user: true });
});
scTabs.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  const all = [...scTabs.querySelectorAll("[role=tab]")], k = all.indexOf(document.activeElement);
  if (k < 0) return;
  e.preventDefault();
  const n = all[(k + (e.key === "ArrowRight" ? 1 : all.length - 1)) % all.length];
  n.focus(); n.click();
});
// The desk's background chatter (toasts, now-playing ticks) stays quiet; the demo is the only motion.
desk.setQuiet(true);
const deep = decodeURIComponent(location.hash).match(/^#tour\/(.+)$/);
shows.start(deep ? deep[1] : shows.list[0].id);

// Old scene names (the Guide, #scene/… links) map to the nearest tour.
const SCENE_TO_TOUR = { everyday: "docks", tiling: "docks", settings: "docks", desktop: "docks", "magic-right-click": "magic", snip: "magic", claude: "agent", approvals: "agent", ade: "agent", "browser-ai": "browser", docks: "docks", themes: "themes" };
// Music, Cleaner, Lens Apps and the core apps are sections further down now, not hero tours: their
// old links open that app on the desk.
const SCENE_TO_APP = { music: "music", cleaner: "cleaner", apps: "store", core: "monitor", "core-apps": "monitor" };
/** Scroll so the tabs sit just under the header and the step bar is on screen. */
function bringIntoView() {
  const head = document.getElementById("bar")?.offsetHeight ?? 60;
  const top = scTabs.getBoundingClientRect().top, bottom = scbar.getBoundingClientRect().bottom;
  if (top >= head && bottom <= innerHeight) return;
  scrollTo({ top: scrollY + top - head - 8, behavior: reducedMotion() ? "auto" : "smooth" });
}
export function playScene(id) {
  bringIntoView();
  if (SCENE_TO_APP[id]) { shows.pause(); return desk.open(SCENE_TO_APP[id]); }
  return shows.start(SCENE_TO_TOUR[id] ?? (shows.list.some((s) => s.id === id) ? id : "docks"), { user: true });
}
const legacy = decodeURIComponent(location.hash).match(/^#scene\/(.+)$/);
if (legacy) playScene(legacy[1]);
addEventListener("hashchange", () => {
  const h = decodeURIComponent(location.hash);
  const m = h.match(/^#(?:tour|scene)\/(.+)$/);
  if (m) playScene(m[1]);
});
// A small compatibility surface for the Guide and the checks: "scenes" never autoplay any more.
const scenes = { get playing() { return shows.playing; }, play: () => shows.play(), pause: () => shows.pause(), stop: () => shows.pause(), go: (i) => shows.start(shows.list[i]?.id ?? "docks", { user: true }), goId: playScene, get current() { return shows.current; } };
window.lensSite = { ...(window.lensSite ?? {}), desk, scenes, shows, playScene, detectOS, APPS, OVERS };
addEventListener("lens-play-scene", (e) => playScene(e.detail));
document.querySelectorAll("[data-play-scene]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); playScene(b.dataset.playScene); }));


// ---- fullscreen ---------------------------------------------------------------------------------
const fsBtn = $("[data-fs]");
const stage = $("#stage");
async function enterFs() {
  stage.parentElement.style.minHeight = `${stage.offsetHeight}px`;
  stage.classList.add("is-full"); document.body.classList.add("stage-full");
  desk.setFull(true);
  fsBtn.setAttribute("aria-pressed", "true"); fsBtn.querySelector(".lbl").textContent = "Exit fullscreen";
  try { if (stage.requestFullscreen && !document.fullscreenElement) await stage.requestFullscreen({ navigationUI: "hide" }); } catch { /* overlay */ }
  desk.root.focus({ preventScroll: true });
}
async function exitFs() {
  stage.classList.remove("is-full"); document.body.classList.remove("stage-full");
  stage.parentElement.style.minHeight = "";
  desk.setFull(false);
  fsBtn.setAttribute("aria-pressed", "false"); fsBtn.querySelector(".lbl").textContent = "Fullscreen";
  if (document.fullscreenElement) try { await document.exitFullscreen(); } catch { /* */ }
}
fsBtn.addEventListener("click", () => (stage.classList.contains("is-full") ? exitFs() : enterFs()));
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && stage.classList.contains("is-full")) exitFs(); });
addEventListener("keydown", (e) => { if (e.key === "Escape" && stage.classList.contains("is-full") && document.activeElement?.closest?.(".lx-cmd, .lx-fly, .lx-menu, .lx-magic, .lx-approve, .gw") == null) exitFs(); });

// ---- the dock rail: every dock style, live, sized from the dock's real width -------------------------
const DOCKS = [
  ["floating", "Floating", "A glass pill that floats above your windows.", {}],
  ["slim", "Slim", "The same dock, thinner and quieter.", {}],
  ["taskbar", "Taskbar", "Full width, like Windows, with Lens physics.", {}],
  ["studio", "Studio", "Labels and room to breathe, for big screens.", {}],
  ["minimal", "Minimal", "Just the icons. Nothing else.", {}],
  ["split", "Split", "Apps on one side, status on the other.", {}],
  ["islands", "Islands", "Grouped pills, Linux-rice style.", {}],
  ["unified", "Unified", "One floating pill: apps, tray, bell and the clock.", {}],
  ["islands", "Expressive", "Islands with soft, bold shapes and its own pack.", { shape: "expressive", pack: "lens-expressive" }],
  ["islands", "Dot Matrix", "Islands drawn in dots, with its own pack.", { shape: "dotmatrix", pack: "lens-dot-matrix" }],
];
const rail = $("#dock-rail");
const railInfo = $("#dock-info");
rail.innerHTML = DOCKS.map(([style, name, , o], i) => `<button type="button" role="radio" class="dr" aria-checked="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-i="${i}"><span class="dr-frame"><iframe data-src="live/dock/index.html?mini=1&amp;style=${style}${o.shape ? `&amp;shape=${o.shape}` : ""}${o.pack ? `&amp;pack=${o.pack}` : ""}&amp;mag=off" title="${esc(name)} dock" tabindex="-1" aria-hidden="true"></iframe></span><span class="dr-name">${esc(name)}</span></button>`).join("");
const tiles = [...rail.querySelectorAll(".dr")];
const FW = 760, FH = 120, SCALE = 0.62;
tiles.forEach((t) => { const f = t.querySelector("iframe"); f.style.width = `${FW}px`; f.style.height = `${FH}px`; f.style.transform = `scale(${SCALE})`; });
addEventListener("message", (e) => {
  const t = tiles.find((x) => x.querySelector("iframe").contentWindow === e.source);
  if (!t || e.data?.lens !== "size") return;
  const { w, h, l, t: top } = e.data;
  const fr = t.querySelector(".dr-frame");
  // Crop the frame to the dock: the tile is exactly the dock's measured size, scaled, plus a margin.
  fr.style.width = `${Math.ceil((w + 16) * SCALE)}px`;
  fr.style.height = `${Math.ceil((h + 16) * SCALE)}px`;
  const f = t.querySelector("iframe");
  f.style.left = `${-(l - 8) * SCALE}px`;
  f.style.top = `${-(top - 8) * SCALE}px`;
  t.classList.add("measured");
});
function pickDock(i, { focus = false, apply = true } = {}) {
  tiles.forEach((t, k) => { t.setAttribute("aria-checked", String(k === i)); t.tabIndex = k === i ? 0 : -1; });
  if (focus) tiles[i].focus();
  const [style, name, line, o] = DOCKS[i];
  railInfo.innerHTML = `<b>${esc(name)}</b> <span>${esc(line)}</span>`;
  if (!apply) return;
  if (window.lensSite?.shows) window.lensSite.shows.pause();
  desk.dockStyle(style, o.shape ?? "classic");
  if (o.pack) getPacks().then((ps) => desk.setPack(ps.find((p) => p.id === o.pack)));
}
rail.addEventListener("click", (e) => { const t = e.target.closest(".dr"); if (t) pickDock(+t.dataset.i); });
rail.addEventListener("keydown", (e) => {
  const i = tiles.findIndex((t) => t.getAttribute("aria-checked") === "true");
  const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (d) { e.preventDefault(); pickDock((i + d + tiles.length) % tiles.length, { focus: true }); }
  if (e.key === "Home") { e.preventDefault(); pickDock(0, { focus: true }); }
  if (e.key === "End") { e.preventDefault(); pickDock(tiles.length - 1, { focus: true }); }
});
$("[data-rail-prev]")?.addEventListener("click", () => rail.scrollBy({ left: -rail.clientWidth * 0.8, behavior: "smooth" }));
$("[data-rail-next]")?.addEventListener("click", () => rail.scrollBy({ left: rail.clientWidth * 0.8, behavior: "smooth" }));
pickDock(0, { apply: false });
// Load the rail's docks one at a time once it's on screen (not while the hero demo is all you see).
new IntersectionObserver(([e], ob) => {
  if (!e.isIntersecting) return;
  ob.disconnect();
  const q = tiles.map((t) => t.querySelector("iframe"));
  const next = () => { const f = q.shift(); if (!f) return; f.addEventListener("load", () => setTimeout(next, 200), { once: true }); f.src = f.dataset.src; };
  next();
}, { rootMargin: "0px", threshold: 0.2 }).observe(rail);


/** Opens a real app on the hero desk (Lens Apps' Get, the small apps' pictures). */
export function openApp(app) { shows.pause(); bringIntoView(); return desk.open(app); }
