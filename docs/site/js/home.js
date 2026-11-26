// The home page: the hero desk with its guided tours and dock rail, and the Theme lab desk. Desks come
// from js/desk.js (the app's real surfaces), tours from js/showcases.js, and the sections' exhibits
// from js/exhibits.js. Nothing touches your system.
import { reducedMotion } from "./site.js";
import { createDesk, getPacks, iconUrl, APPS, OVERS } from "./desk.js";
import { createShowcases } from "./showcases.js";

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
// Each tour's tab carries the icon of the thing it shows (the shared icon set; two drawn glyphs).
const SC_SVG = {
  docks: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="15" width="18" height="5" rx="2.5"/><path d="M7 17.5h.01M10.5 17.5h.01M14 17.5h.01M17.5 17.5h.01"/><rect x="5" y="4" width="14" height="8" rx="2"/></svg>`,
  themes: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2z"/><path d="M7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01"/></svg>`,
  magic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>`,
  agent: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16h5"/></svg>`,
};
const SC_IMG = { browser: "lens-browser" };
const scIcon = (id) => SC_SVG[id] ? `<span class="sc-ic g" aria-hidden="true">${SC_SVG[id]}</span>` : `<span class="sc-ic" aria-hidden="true"><img src="${iconUrl(SC_IMG[id] ?? "lens-command")}" alt="" width="28" height="28"></span>`;
scTabs.innerHTML = shows.list.map((s, k) => `<button type="button" role="tab" aria-selected="false" tabindex="${k ? -1 : 0}" data-sc="${s.id}">${scIcon(s.id)}<span class="sc-tx"><b>${esc(s.title)}</b><span>${esc(s.line)}</span></span></button>`).join("");
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
window.lensSite = { desk, scenes, shows, playScene, detectOS, APPS, OVERS };
addEventListener("lens-play-scene", (e) => playScene(e.detail));
document.querySelectorAll("[data-play-scene]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); playScene(b.dataset.playScene); }));

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
// Load the rail's docks one at a time once it's near the screen.
new IntersectionObserver(([e], ob) => {
  if (!e.isIntersecting) return;
  ob.disconnect();
  const q = tiles.map((t) => t.querySelector("iframe"));
  const next = () => { const f = q.shift(); if (!f) return; f.addEventListener("load", () => setTimeout(next, 200), { once: true }); f.src = f.dataset.src; };
  next();
}, { rootMargin: "300px" }).observe(rail);

// ---- the rest loads when it comes near ------------------------------------------------------------
const lazy = (sel, f) => { const el = $(sel); if (!el) return; new IntersectionObserver(([e], ob) => { if (e.isIntersecting) { ob.disconnect(); f(el); } }, { rootMargin: "500px" }).observe(el); };
lazy("#themes", (el) => import("./themelab.js").then((m) => m.init(el)));
import("./exhibits.js").then((m) => m.init());
// "Get" opens the real Lens Apps on the desk; a core app's picture opens that app there.
document.querySelectorAll("[data-get]").forEach((b) => b.addEventListener("click", () => playScene("apps")));
document.querySelectorAll("[data-open-app]").forEach((b) => b.addEventListener("click", () => { shows.pause(); bringIntoView(); desk.open(b.dataset.openApp); }));

