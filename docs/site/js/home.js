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
// The desk is the visitor's: nothing plays on its own. Tabs below it start a guided tour that moves
// one step at a time, only when the visitor presses Next (or does the highlighted thing).
const scTabs = $("#sc-tabs");
const scbar = $("#sc-bar");
const capN = scbar.querySelector(".sc-n"), capT = scbar.querySelector(".sc-t"), dots = scbar.querySelector(".sc-dots");
const FREE = { n: "Free play", t: "Every window here is the real Lens app on sample data. Drag, snap, right-click, open apps from the dock. Or pick a tour and go step by step." };
const btn = (k) => scbar.querySelector(`[data-${k}]`);
const shows = createShowcases(desk, {
  onChange(st) {
    scTabs.querySelectorAll("[role=tab]").forEach((t) => {
      const on = st.showcase?.id === t.dataset.sc;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on || (!st.showcase && t === scTabs.firstElementChild) ? 0 : -1;
    });
    if (!st.showcase) {
      capN.textContent = FREE.n; capT.textContent = FREE.t; dots.innerHTML = "";
      ["back", "next", "reset", "exit"].forEach((k) => (btn(k).disabled = true));
      scbar.classList.remove("is-touring");
      if (location.hash.startsWith("#tour/")) history.replaceState(null, "", location.pathname + location.search);
      return;
    }
    scbar.classList.add("is-touring");
    capN.textContent = `${st.showcase.title} · ${st.index + 1} of ${st.total}`;
    capT.textContent = st.busy && !st.step ? "Setting up…" : st.step?.cap ?? "";
    dots.innerHTML = Array.from({ length: st.total }, (_, k) => `<i class="${k < st.index ? "was" : k === st.index ? "on" : ""}"></i>`).join("");
    btn("back").disabled = st.busy || st.index === 0;
    btn("next").disabled = st.busy || st.done;
    btn("next").querySelector("span").textContent = st.done ? "Done" : "Next";
    btn("reset").disabled = st.busy;
    btn("exit").disabled = false;
    history.replaceState(null, "", `#tour/${st.showcase.id}`);
  },
});
// Each tour's tab carries the icon of the thing it shows (the shared icon set; two drawn glyphs).
const SC_SVG = {
  magic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>`,
  agent: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16h5"/></svg>`,
};
const SC_IMG = { desktop: "brand/lens-logo-small.svg", browser: "lens-browser", apps: "lens-apps", music: "lens-music", cleaner: "lens-cleaner", core: "lens-monitor", settings: "lens-settings" };
const scIcon = (id) => SC_SVG[id] ? `<span class="sc-ic g" aria-hidden="true">${SC_SVG[id]}</span>` : `<span class="sc-ic" aria-hidden="true"><img src="${iconUrl(SC_IMG[id] ?? "lens-command")}" alt="" width="28" height="28"></span>`;
scTabs.innerHTML = shows.list.map((s, k) => `<button type="button" role="tab" aria-selected="false" tabindex="${k ? -1 : 0}" data-sc="${s.id}">${scIcon(s.id)}<span class="sc-tx"><b>${esc(s.title)}</b><span>${esc(s.line)}</span></span></button>`).join("");
scTabs.addEventListener("click", (e) => {
  const t = e.target.closest("[data-sc]");
  if (!t) return;
  if (shows.current?.id === t.dataset.sc) return;
  // Bring the whole desk and its step bar into view, so each step's caption sits under what it points at.
  bringIntoView();
  shows.start(t.dataset.sc);
});
scTabs.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  const all = [...scTabs.querySelectorAll("[role=tab]")], k = all.indexOf(document.activeElement);
  if (k < 0) return;
  e.preventDefault();
  const n = all[(k + (e.key === "ArrowRight" ? 1 : all.length - 1)) % all.length];
  n.focus(); n.click();
});
scbar.addEventListener("click", (e) => {
  if (e.target.closest("[data-next]")) shows.next();
  else if (e.target.closest("[data-back]")) shows.back();
  else if (e.target.closest("[data-reset]")) shows.reset();
  else if (e.target.closest("[data-exit]")) shows.exit();
});
// Arrow keys step the tour while the desk or its bar has focus; Esc leaves it.
addEventListener("keydown", (e) => {
  if (!shows.current) return;
  const inDesk = host.contains(document.activeElement) || scbar.contains(document.activeElement) || document.activeElement === document.body;
  if (!inDesk || document.activeElement?.closest?.("input, textarea, [contenteditable=true], .lx-cmd")) return;
  if (e.key === "ArrowRight") { e.preventDefault(); shows.next(); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); shows.back(); }
  else if (e.key === "Escape" && !document.activeElement?.closest?.(".lx-approve, .lx-magic, .gw")) shows.exit();
});
// The desk's background chatter (toasts, now-playing ticks) stays quiet so nothing moves by itself.
desk.setQuiet(true);
const deep = decodeURIComponent(location.hash).match(/^#tour\/(.+)$/);
if (deep) shows.start(deep[1]);

// Old scene names (the Guide, #scene/… links) map to the nearest tour.
const SCENE_TO_TOUR = { everyday: "desktop", tiling: "desktop", "core-apps": "core", settings: "settings", "magic-right-click": "magic", snip: "magic", claude: "agent", approvals: "agent", ade: "agent", "browser-ai": "browser", apps: "apps", music: "music", cleaner: "cleaner" };
/** Scroll so the tabs sit just under the header and the step bar is on screen. */
function bringIntoView() {
  const head = document.getElementById("bar")?.offsetHeight ?? 60;
  const top = scTabs.getBoundingClientRect().top, bottom = scbar.getBoundingClientRect().bottom;
  if (top >= head && bottom <= innerHeight) return;
  scrollTo({ top: scrollY + top - head - 8, behavior: reducedMotion() ? "auto" : "smooth" });
}
export function playScene(id) {
  bringIntoView();
  return shows.start(SCENE_TO_TOUR[id] ?? (shows.list.some((s) => s.id === id) ? id : "desktop"));
}
const legacy = decodeURIComponent(location.hash).match(/^#scene\/(.+)$/);
if (legacy) playScene(legacy[1]);
addEventListener("hashchange", () => {
  const h = decodeURIComponent(location.hash);
  const m = h.match(/^#(?:tour|scene)\/(.+)$/);
  if (m) playScene(m[1]);
});
// A small compatibility surface for the Guide and the checks: "scenes" never autoplay any more.
const scenes = { get playing() { return false; }, play: () => playScene("desktop"), pause() {}, stop: () => shows.exit(), go: (i) => shows.start(shows.list[i]?.id ?? "desktop"), goId: playScene, get current() { return shows.current; } };
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
  if (window.lensSite?.shows?.current) window.lensSite.shows.exit();
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
document.querySelectorAll("[data-open-app]").forEach((b) => b.addEventListener("click", () => { if (shows.current) shows.exit(); bringIntoView(); desk.open(b.dataset.openApp); }));

