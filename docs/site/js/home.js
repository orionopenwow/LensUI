// The home page: the hero desk with its scene reel and dock rail, the Theme lab desk, the
// bring-your-own-agent panel, the open-source apps and the feature chips. Desks come from js/desk.js,
// scenes from js/scenes.js, the actions both use from js/actions.js. Nothing touches your system.
import { reducedMotion } from "./site.js";
import { createDesk, getPacks, iconUrl } from "./desk.js";
import { createScenes, SCENES } from "./scenes.js";

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
document.querySelectorAll("[data-dl]").forEach((a) => {
  const lbl = a.querySelector(".lbl") ?? a;
  if (os === "windows") lbl.textContent = "Download for Windows";
  else if (os === "mac" || os === "linux") { lbl.textContent = "Get Lens for Windows"; a.querySelector(".hint")?.replaceChildren(`${os === "mac" ? "macOS" : "Linux"} is on the roadmap`); a.href = a.href.replace(/download\.html.*$/, "download.html#platforms"); }
});

// ---- the hero desk ----------------------------------------------------------------------------
const host = $("#desk-host");
const desk = createDesk(host, { label: "Lens desktop demo", layout: [["browser", 0.03, 0.06], ["notes", 0.56, 0.08]] });
const bar = $("#scenes");
const cap = $("#scene-cap");
const chip = $("#driving");
let interacted = false;
const scenes = createScenes(desk, {
  onScene(i, sc) {
    cap.innerHTML = `<b>${esc(sc.title)}</b><span>${esc(sc.line)}</span>`;
    bar.querySelectorAll("[data-scene]").forEach((b, k) => { b.setAttribute("aria-current", k === i ? "true" : "false"); if (k === i) b.scrollIntoView({ block: "nearest", inline: "center", behavior: "auto" }); });
    const prog = bar.querySelector(".sb-prog i");
    if (prog) { prog.style.animation = "none"; void prog.offsetWidth; prog.style.animation = scenes.playing && !reducedMotion() ? "sb-prog 11s linear" : "none"; }
    history.replaceState(null, "", `#scene/${sc.id}`);
  },
  onState(p) { bar.querySelector("[data-play]").textContent = p ? "❚❚" : "▶"; bar.querySelector("[data-play]").setAttribute("aria-label", p ? "Pause the scenes" : "Play the scenes"); bar.classList.toggle("is-playing", p); },
});
bar.querySelector(".sb-list").innerHTML = SCENES.map((s, i) => `<button type="button" data-scene="${i}" aria-current="false"><i aria-hidden="true"></i>${esc(s.title)}</button>`).join("");
bar.addEventListener("click", (e) => {
  const s = e.target.closest("[data-scene]");
  if (s) { handover(false); scenes.go(+s.dataset.scene); return; }
  if (e.target.closest("[data-play]")) { scenes.playing ? scenes.pause() : (chip.hidden = true, scenes.play()); }
  if (e.target.closest("[data-prev]")) scenes.prev();
  if (e.target.closest("[data-next]")) scenes.next();
});
bar.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); handover(false); e.key === "ArrowRight" ? scenes.next() : scenes.prev(); bar.querySelector('[aria-current="true"]')?.focus(); }
});
/** The visitor took over: stop the reel and show "You're driving". Autoplay resumes only on request. */
function handover(show = true) {
  if (!scenes.playing && interacted) return;
  interacted = true;
  scenes.pause();
  chip.hidden = !show;
}
desk.on("user", () => handover(true));
desk.root.addEventListener("pointerdown", (e) => { if (e.isTrusted) handover(true); }, true);
desk.root.addEventListener("keydown", (e) => { if (e.isTrusted) handover(true); }, true);
chip.querySelector("button").addEventListener("click", () => { chip.hidden = true; scenes.play(); });

// Start the reel once the desk is on screen (not with reduced motion, and not after the visitor has played).
let started = false;
new IntersectionObserver(([e]) => {
  if (!e.isIntersecting) { if (scenes.playing) scenes.pause(), (started = "paused"); return; }
  if (started === "paused" && !interacted) { scenes.play(); started = true; return; }
  if (started) return;
  started = true;
  const deep = decodeURIComponent(location.hash).match(/^#scene\/(.+)$/);
  if (deep) { scenes.goId(deep[1]); return; }
  if (!reducedMotion()) setTimeout(() => { if (!interacted) scenes.play(); }, 1500);
  else scenes.go(0);
}, { threshold: 0.35 }).observe(host);
addEventListener("hashchange", () => { const m = decodeURIComponent(location.hash).match(/^#scene\/(.+)$/); if (m && scenes.current?.id !== m[1]) { handover(false); scenes.goId(m[1]); host.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" }); } });
export function playScene(id) { handover(false); host.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" }); return scenes.goId(id); }
window.lensSite = { desk, scenes, playScene, detectOS };
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
addEventListener("keydown", (e) => { if (e.key === "Escape" && stage.classList.contains("is-full") && !document.fullscreenElement && document.activeElement?.closest?.(".lx-cmd, .lx-fly, .lx-menu, .lx-magic, .lx-approve") == null) exitFs(); });

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
  handover(false);
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
lazy("#apps", () => import("./getflow.js").then((m) => m.init()));

// Feature chips jump to their scene in the hero desk.
document.querySelectorAll(".feat-chips [data-scene-id]").forEach((b) => b.addEventListener("click", () => playScene(b.dataset.sceneId)));

// BYO agent tabs.
const tabs = $("#byo-tabs");
tabs?.addEventListener("click", (e) => {
  const t = e.target.closest("[role=tab]");
  if (!t) return;
  tabs.querySelectorAll("[role=tab]").forEach((x) => { const on = x === t; x.setAttribute("aria-selected", String(on)); x.tabIndex = on ? 0 : -1; document.getElementById(x.getAttribute("aria-controls")).hidden = !on; });
});
tabs?.addEventListener("keydown", (e) => {
  const ts = [...tabs.querySelectorAll("[role=tab]")], i = ts.indexOf(document.activeElement);
  const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
  if (d && i >= 0) { e.preventDefault(); const n = ts[(i + d + ts.length) % ts.length]; n.focus(); n.click(); }
});
void iconUrl;
