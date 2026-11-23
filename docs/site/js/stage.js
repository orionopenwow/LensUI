// The home-page stage: a small live desktop under the headline.
//   Dock pane   the real ambient backdrop of the chosen pack (src/playground/ambient) behind the
//               real Lens dock (an iframe running DockSurface on a mocked backend). The pills pick
//               the dock style, the theme (every Lens pack plus the Claude Code collection), the
//               backdrop scene, and run "Ask" / "Voice" through the offline intent engine.
//   Other panes the strip of chips swaps in one feature at a time: live demos (theme lab, Lens
//               Command, approvals, the Apps catalogue) or short clips recorded from the real UI.
// Only one pane is active; each is built the first time it's chosen. Nothing touches your system.
import { reducedMotion, isLight } from "./site.js";
import { getPacks } from "./demos.js";
import { parse } from "./intent.js";
import { createPresence } from "./presence.js";

const SITE = new URL("../", import.meta.url);
const root = document.documentElement;
const stage = document.getElementById("stage");
const screen = stage.querySelector(".stage-screen");
const toasts = stage.querySelector(".toasts");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---- toasts on the stage --------------------------------------------------------------------
export function toast(title, detail = "", kind = "ok") {
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<span class="dot ${kind}" aria-hidden="true"></span><div><strong>${esc(title)}</strong>${detail ? `<span>${esc(detail)}</span>` : ""}</div>`;
  toasts.prepend(t);
  while (toasts.children.length > 3) toasts.lastChild.remove();
  setTimeout(() => t.classList.add("out"), 4200);
  setTimeout(() => t.remove(), 4700);
}

// ---- the dock pane ----------------------------------------------------------------------------
let packs = [], current = null, pg = null, playground = null, frameReady = false;
const frame = stage.querySelector(".pane-dock iframe");
const backdrop = stage.querySelector(".backdrop");
const send = (m) => frame.contentWindow?.postMessage(m, location.origin);
const pending = [];
const post = (m) => (frameReady ? send(m) : pending.push(m));
addEventListener("message", (e) => {
  if (e.source !== frame.contentWindow || e.data?.lens !== "ready" || frameReady) return;
  frameReady = true;
  stage.classList.add("dock-live");
  pending.splice(0).forEach(send);
});
frame.addEventListener("load", () => send({ lens: "ping" }));

function applyPack(id, { fromUser = false, quiet = false } = {}) {
  const p = packs.find((x) => x.id === id) ?? packs[0];
  if (!p) return;
  current = p;
  themeSel.value = p.id;
  // The stage wears the pack: its base colour behind the dock, and the backdrop repainted in it.
  const base = p.base ?? "#09090b";
  stage.style.setProperty("--stage-bg", base);
  stage.dataset.scheme = p.scheme;
  root.dataset.preset = p.collection ? "" : p.id; // the ambient backdrop picks its scene from this
  playground?.setPalette(pg.packPalette({ base, accent: p.accent, scheme: p.scheme }));
  post({ lens: "pack", pack: { id: p.id, label: p.label, base, accent: p.accent, radius: p.radius, scheme: p.scheme, frameStyle: p.frameStyle, controlStyle: p.controlStyle } });
  if (fromUser) stage.dataset.userPack = "1";
  if (shapeSel.value !== (p.shapeStyle ?? "classic")) setShape(p.shapeStyle ?? "classic", true);
  if (!quiet) toast(`Theme: ${p.label}`, p.collection ? `${p.collection} collection · palette by ${p.source?.author ?? "the community"}` : p.description);
}

const styleSel = stage.querySelector("select[data-style]");
const themeSel = stage.querySelector("select[data-theme]");
const sceneSel = stage.querySelector("select[data-scene]");
const shapeSel = stage.querySelector("select[data-shape]");
const SHAPE_LABEL = { classic: "Classic", expressive: "Expressive", dotmatrix: "Dot Matrix" };
function setShape(v, quiet = false) {
  shapeSel.value = v;
  post({ lens: "config", patch: { theme: { shapeStyle: v } } });
  if (!quiet) toast(`Shape: ${SHAPE_LABEL[v]}`, v === "classic" ? "The default look." : "A style layer on top of any theme · in beta (#32)", v === "classic" ? "ok" : "warn");
}
function setStyle(v, quiet = false) {
  styleSel.value = v;
  post({ lens: "config", patch: { dock: { style: v } } });
  if (!quiet) toast(`Dock style: ${styleSel.selectedOptions[0].textContent}`, v === "islands" ? "Separate islands for apps and status · in beta (#32)" : "Same apps, same physics.", v === "islands" ? "warn" : "ok");
}

async function initDock() {
  frame.src = frame.dataset.src;
  packs = await getPacks();
  const core = packs.filter((p) => !p.collection), community = packs.filter((p) => p.collection);
  themeSel.innerHTML = `<optgroup label="Lens packs">${core.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join("")}</optgroup>` +
    (community.length ? `<optgroup label="${esc(community[0].collection)} collection (in beta)">${community.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join("")}</optgroup>` : "");
  // Backdrop: the real Playground runner with the ambient "theme backdrop" scene.
  pg = await import(new URL("live/playground/playground.js", SITE).href);
  sceneSel.innerHTML = pg.scenes.map((s) => `<option value="${s.id}">${s.id === "ambient" ? "Theme backdrop" : esc(s.name)}</option>`).join("");
  const follow = () => { if (!stage.dataset.userPack) applyPack(isLight() ? "alabaster-daylight" : "obsidian", { quiet: true }); };
  const start = isLight() ? packs.find((p) => p.id === "alabaster-daylight") : packs.find((p) => p.id === "obsidian");
  playground = pg.mount(backdrop, { scene: "ambient", fps: 24, seed: 5, still: reducedMotion(), ripples: false, options: { motion: "lively" }, palette: pg.packPalette({ base: start?.base ?? "#09090b", accent: start?.accent ?? "#fafafa", scheme: start?.scheme ?? "dark" }) });
  follow();
  addEventListener("site-theme", () => { follow(); playground?.setStill(reducedMotion() || !stageVisible || active !== "dock"); });
  styleSel.addEventListener("change", () => setStyle(styleSel.value));
  shapeSel.addEventListener("change", () => setShape(shapeSel.value));
  themeSel.addEventListener("change", () => applyPack(themeSel.value, { fromUser: true }));
  sceneSel.addEventListener("change", () => {
    playground.setScene(sceneSel.value);
    if (sceneSel.value === "ambient") playground.setOption("motion", "lively");
    if (current) playground.setPalette(pg.packPalette({ base: current.base ?? "#09090b", accent: current.accent, scheme: current.scheme }));
    playground.setStill(reducedMotion());
    toast(`Backdrop: ${sceneSel.selectedOptions[0].textContent}`, sceneSel.value === "sand" ? "Drag on the stage to paint." : "A Playground scene in your theme's colours.");
  });
  stage.querySelector("[data-search]")?.addEventListener("click", () => { send({ lens: "search" }); frame.focus(); });
  fit();
}

// The dock renders at desktop width; on narrow screens the frame scales down like a screenshot.
function fit() {
  const w = screen.clientWidth, s = Math.min(1, w / 640);
  Object.assign(frame.style, s < 1 ? { width: "640px", maxWidth: "none", transform: `scale(${s})`, transformOrigin: "left bottom" } : { width: "", maxWidth: "", transform: "", transformOrigin: "" });
}
addEventListener("resize", fit);

// ---- Ask and Voice: the offline intent engine, acting on the stage where it can ---------------
function act(text, via) {
  const i = parse(text);
  if (!i) return toast("Not a desktop command", "With AI turned on, Lens would hand this to your local model or Claude.", "warn");
  if (i.action === "set_theme_pack" && packs.some((p) => p.id === i.args.id)) { applyPack(i.args.id, { fromUser: true, quiet: true }); return toast(i.summary, `${via} · done on the stage`); }
  if (i.action === "set_color_mode") { applyPack(i.args.mode === "light" ? "alabaster-daylight" : "obsidian", { fromUser: true, quiet: true }); return toast(i.summary, `${via} · done on the stage`); }
  const asks = i.action === "close_app" || i.action === "create_note";
  toast(i.summary, `${via} · ${asks ? "would ask first" : "simulated here"} · ${i.action}`, asks ? "warn" : "ok");
}
// ---- "Lens at work": the orb shows each step of an Ask request, or a short demo script ----------
const presence = createPresence(stage);
const askForm = stage.querySelector("form[data-askform]");
const askInput = askForm.elements.q;
const pill = (el) => el.closest(".pill") ?? el;
const toDock = () => { if (active !== "dock") return select("dock"); };
const snapZone = document.createElement("div");
snapZone.className = "snap-zone";
snapZone.innerHTML = "<span>Window · left half</span>";
stage.querySelector(".pane-dock")?.append(snapZone);
function snap(slot) {
  snapZone.classList.toggle("right", slot === "right");
  snapZone.firstChild.textContent = `Window · ${slot === "right" ? "right" : "left"} half`;
  snapZone.classList.add("on");
  setTimeout(() => snapZone.classList.remove("on"), 1800);
}
/** One clause of a request ("go dark", "slim dock") → one visible step, or null. */
function stepFor(clause) {
  const c = clause.toLowerCase();
  const st = [...styleSel.options].find((o) => new RegExp(`\\b${o.textContent.toLowerCase()}\\b`).test(c) && /\b(dock|style)\b/.test(c));
  if (st) return { say: `Switching to the ${st.textContent.toLowerCase()} dock`, prep: toDock, target: () => pill(styleSel), act: () => setStyle(st.value, true) };
  if (/\b(apps? ?store|lens apps)\b/.test(c)) return { say: "Opening the Apps store", target: () => document.getElementById("chip-apps"), act: () => select("apps") };
  const i = parse(clause);
  if (!i) return null;
  if (i.action === "set_theme_pack" && packs.some((p) => p.id === i.args.id)) {
    const p = packs.find((x) => x.id === i.args.id);
    return { say: `Switching to ${p.label}`, prep: toDock, target: () => pill(themeSel), act: () => applyPack(p.id, { fromUser: true, quiet: true }) };
  }
  if (i.action === "set_color_mode") return { say: `Turning on ${i.args.mode} mode`, prep: toDock, target: () => pill(themeSel), act: () => applyPack(i.args.mode === "light" ? "alabaster-daylight" : "obsidian", { fromUser: true, quiet: true }) };
  if (i.action === "snap_window") return { say: `Tiling the window ${i.args.slot === "right" ? "right" : "left"}`, prep: toDock, target: () => snapZone, act: () => { snap(i.args.slot); toast(i.summary, "Simulated here: the stage has no real windows.", "warn"); } };
  const asks = i.action === "close_app" || i.action === "create_note";
  return { say: i.summary, target: () => pill(askInput), act: () => toast(i.summary, `${asks ? "would ask first" : "simulated here"} · ${i.action}`, asks ? "warn" : "ok") };
}
function script(text) {
  return text.split(/\s*(?:,|;|\band then\b|\bthen\b|\band\b)\s*/i).filter(Boolean).map(stepFor).filter(Boolean);
}
askForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const v = askInput.value.trim();
  if (!v) return;
  askInput.value = "";
  const steps = script(v);
  if (steps.length) presence.run(steps); else act(v, "Ask");
});
// "Watch Lens do it": short scripts, typed visibly into Ask first. The last one shows an outside
// app (Claude Desktop, over MCP) driving Lens, which is always named on screen.
const DEMOS = [
  { text: "tile left and go dark" },
  { text: "switch to Nord and slim dock" },
  { text: "open the Apps store", driver: "Claude Desktop" },
];
let di = 0;
stage.querySelector("[data-watch]")?.addEventListener("click", () => {
  const d = DEMOS[di++ % DEMOS.length];
  presence.run([{ say: "Reading the request", target: () => askInput, type: d.text, pause: 200 }, ...script(d.text)], { driver: d.driver });
});
const PHRASES = ["Lens, apply nord", "Lens, dark mode", "Lens, snap left", "Lens, volume thirty", "Lens, theme catppuccin", "Lens, light mode", "Lens, timer five minutes"];
let vi = 0;
stage.querySelector("[data-voice]").addEventListener("click", async (e) => {
  const b = e.currentTarget;
  if (b.disabled) return;
  b.disabled = true;
  const phrase = PHRASES[vi++ % PHRASES.length];
  toast("Listening…", `“${phrase}”`, "warn");
  await new Promise((r) => setTimeout(r, reducedMotion() ? 200 : 900));
  act(phrase.replace(/thirty/, "30").replace(/five minutes/, "5 minutes"), "Voice (text demo)");
  b.disabled = false;
});

// ---- other panes -----------------------------------------------------------------------------
const CLIP = { windows: "focus-borders", voice: "voice", browser: "browser-agent", snip: "snip", shelf: "right-click", music: "music", guide: "guide" };
const built = new Set(["dock"]);
async function buildPane(id, pane) {
  if (CLIP[id]) {
    const c = CLIP[id];
    pane.querySelector(".pane-body").innerHTML = `<video muted loop playsinline preload="none" poster="${new URL(`media/${c}.webp`, SITE)}" src="${new URL(`media/${c}.mp4`, SITE)}" aria-label="${esc(pane.dataset.title)}"></video>${reducedMotion() ? `<button class="btn small play" type="button">Play</button>` : ""}`;
    pane.querySelector(".play")?.addEventListener("click", (e) => { pane.querySelector("video").play(); e.currentTarget.remove(); });
    return;
  }
  const mod = await import("./demos.js");
  if (id === "themes") await mod.themes(pane);
  else if (id === "command") await mod.command(pane);
  else if (id === "ai") mod.approvals(pane);
  else if (id === "apps") await apps(pane);
}

async function apps(pane) {
  const cat = await fetch(new URL("data/apps.json", SITE)).then((r) => r.json());
  const grid = pane.querySelector(".apps-grid"), filt = pane.querySelector("[data-cat]");
  const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const cats = ["all", ...new Set(cat.apps.map((a) => a.category))];
  filt.innerHTML = cats.map((c, i) => `<button type="button" data-v="${c}" aria-pressed="${i === 0}">${c === "all" ? "All" : c[0].toUpperCase() + c.slice(1)}</button>`).join("");
  const render = (c) => {
    grid.innerHTML = cat.apps.filter((a) => c === "all" || a.category === c).slice(0, 12).map((a) => `<div class="app">
      <span class="mono-ic" style="--h:${hue(a.name)}" aria-hidden="true">${esc(a.name[0])}</span>
      <div><strong>${esc(a.name)}</strong><span>${esc(a.pitch ?? "")}</span><span class="meta">${a.openSource ? "open source" : "free"}${a.license ? ` · ${esc(a.license)}` : ""}</span></div>
      <button class="btn small" type="button" data-install="${esc(a.name)}">Get</button></div>`).join("");
  };
  filt.addEventListener("click", (e) => { const b = e.target.closest("button[data-v]"); if (!b) return; filt.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); render(b.dataset.v); });
  grid.addEventListener("click", (e) => { const b = e.target.closest("[data-install]"); if (b) toast(`Get ${b.dataset.install}`, "In Lens this downloads the official release and asks before installing. Simulated here."); });
  render("all");
}

// ---- chips: one active pane, arrow keys move ------------------------------------------------
const chips = [...document.querySelectorAll("#chips [role=tab]")];
let active = "dock", stageVisible = true;
async function select(id, focus = false) {
  const chip = chips.find((c) => c.dataset.pane === id);
  chips.forEach((c) => { const on = c === chip; c.setAttribute("aria-selected", String(on)); c.tabIndex = on ? 0 : -1; });
  if (focus) chip.focus();
  screen.setAttribute("aria-labelledby", chip.id);
  stage.querySelectorAll(".pane").forEach((p) => { p.hidden = p.dataset.pane !== id; p.querySelector("video")?.pause(); });
  stage.classList.toggle("on-dock", id === "dock");
  if (id !== active) toasts.replaceChildren();
  active = id;
  const pane = stage.querySelector(`.pane[data-pane="${id}"]`);
  if (!built.has(id)) { built.add(id); await buildPane(id, pane).catch((err) => { pane.querySelector(".pane-body").insertAdjacentHTML("beforeend", `<p class="note">This demo didn't load (${esc(err.message)}).</p>`); }); }
  const v = pane.querySelector("video");
  if (v && !reducedMotion()) v.play().catch(() => {});
  playground?.setStill(reducedMotion() || id !== "dock" || !stageVisible);
}
chips.forEach((c, i) => {
  c.addEventListener("click", () => select(c.dataset.pane));
  c.addEventListener("keydown", (e) => {
    const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (k) { e.preventDefault(); select(chips[(i + k + chips.length) % chips.length].dataset.pane, true); }
    if (e.key === "Home") { e.preventDefault(); select(chips[0].dataset.pane, true); }
    if (e.key === "End") { e.preventDefault(); select(chips.at(-1).dataset.pane, true); }
  });
});

// Pause the backdrop when the stage is off-screen or the tab is hidden.
new IntersectionObserver(([e]) => {
  stageVisible = e.isIntersecting;
  playground?.setStill(reducedMotion() || active !== "dock" || !stageVisible || document.hidden);
}).observe(stage);
document.addEventListener("visibilitychange", () => playground?.setStill(reducedMotion() || active !== "dock" || !stageVisible || document.hidden));

// "#themes", "#voice"… (from the Guide's Show me, or a link) open that pane.
const show = (id) => {
  if (!chips.some((c) => c.dataset.pane === id)) return;
  select(id);
  stage.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
  stage.classList.remove("flash"); void stage.offsetWidth; stage.classList.add("flash");
};
addEventListener("site-show", (e) => show(e.detail));
addEventListener("hashchange", () => show(decodeURIComponent(location.hash.slice(1))));

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
// Scale each thumbnail's 640 px dock render to the tile's width.
const fitThumbs = () => thumbs.forEach((t) => t.style.setProperty("--thumb-scale", String(Math.min(0.9, t.clientWidth / 640))));
addEventListener("resize", fitThumbs);
fitThumbs();
if (thumbs.length) new IntersectionObserver(([e], o) => { if (e.isIntersecting) { loadThumbs(); o.disconnect(); } }, { rootMargin: "200px" }).observe(thumbs[0].parentElement);
thumbs.forEach((t) => t.addEventListener("click", () => {
  if (t.dataset.pack) applyPack(t.dataset.pack, { fromUser: true, quiet: true });
  setShape(t.dataset.shape ?? (t.dataset.pack ? shapeSel.value : "classic"), true);
  setStyle(t.dataset.style, true);
  select("dock");
  stage.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
  toast(`${t.querySelector(".thumb-label").textContent.trim()} dock`, "Now on the stage. Hover it, click an app, open search.");
}));

// ---- the one-click "Get" pill (the Lens Apps flow, simulated: nothing downloads) ---------------
const STAGES = ["Finding package", "Downloading", "Verifying", "Installing", "Done"];
document.querySelectorAll("[data-get]").forEach((b) => b.addEventListener("click", async () => {
  if (b.dataset.busy) return;
  if (b.textContent === "Open") { b.textContent = "Get"; b.classList.remove("done"); return; }
  b.dataset.busy = "1";
  b.classList.add("busy");
  for (const [i, st] of STAGES.entries()) {
    if (st === "Downloading") {
      for (let pct = 0; pct <= 100; pct += 20) { b.textContent = `${st} ${pct}%`; b.style.setProperty("--p", `${pct}%`); await new Promise((r) => setTimeout(r, reducedMotion() ? 0 : 180)); }
    } else { b.textContent = st; await new Promise((r) => setTimeout(r, reducedMotion() ? 0 : 450)); }
    b.style.setProperty("--p", `${Math.round(((i + 1) / STAGES.length) * 100)}%`);
  }
  b.classList.remove("busy");
  b.classList.add("done");
  b.textContent = "Open";
  b.setAttribute("aria-label", `Open ${b.dataset.get} (simulated)`);
  delete b.dataset.busy;
}));

initDock();
