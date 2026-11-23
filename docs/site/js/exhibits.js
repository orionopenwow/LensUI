// The home page's living exhibits below the hero, each a mini desktop (js/desk.js) with one clear action:
//   Themes    pick a pack (or an accent): the desktop restyles on its moving theme backdrop
//   Ask Lens  type or pick a request: the orb (js/presence.js) does it on the desktop, step by step
//   Apps      press Get: the simulated Lens Apps flow, and the app lands in the dock
// Plus the Also-in-Lens chips. Loaded by js/stage.js when these sections scroll near.
import { reducedMotion } from "./site.js";
import { getPacks } from "./demos.js";
import { createDesk } from "./desk.js";
import { createPresence } from "./presence.js";

const SITE = new URL("../", import.meta.url);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, reducedMotion() ? Math.min(ms, 60) : ms));
const baseOf = (p) => p.base ?? (p.scheme === "light" ? "#f4f4f5" : "#09090b");

export async function init() {
  const packs = await getPacks();
  themes(packs);
  ai(packs);
  apps();
  also();
}

// ---- Themes: the whole desktop restyles, on the real theme backdrop ------------------------------
async function themes(packs) {
  const ex = document.getElementById("ex-themes");
  if (!ex) return;
  const host = ex.querySelector(".ex-screen");
  const bd = document.createElement("div");
  bd.className = "backdrop";
  bd.setAttribute("aria-hidden", "true");
  const desk = createDesk(host, { layout: "themes", backdrop: bd, dock: ["lens-browser", "explorer", "vscodium", "spotify", "obsidian", "discord", "figma", "lens-apps", "lens-settings"], label: "Demo desktop wearing the chosen theme" });
  const out = ex.querySelector("[data-out]");
  const all = ex.querySelector("[data-allpacks]");
  const state = { pack: packs.find((p) => p.id === "obsidian") ?? packs[0], accent: null };
  let pg = null, play = null, visible = false;
  const still = () => reducedMotion() || !visible || document.hidden;
  const render = (announce = true) => {
    const p = state.pack, accent = state.accent ?? p.accent;
    desk.setPack(p, accent);
    document.documentElement.dataset.preset = p.collection ? "" : p.id;
    play?.setPalette(pg.packPalette({ base: baseOf(p), accent, scheme: p.scheme }));
    ex.querySelectorAll("[data-pick]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.pick === p.id)));
    ex.querySelectorAll("[data-accent]").forEach((b) => b.setAttribute("aria-pressed", String(!!state.accent && b.dataset.accent.toUpperCase() === state.accent.toUpperCase())));
    if (announce) {
      out.textContent = `${p.label}${p.collection ? ` · palette by ${p.source?.author ?? "the community"}` : ""} · live UI · simulated system`;
      desk.notify({ icon: "lens-settings", app: "Lens", title: `Theme: ${p.label}`, body: p.description ?? `${p.collection} collection` });
    }
  };
  ex.querySelector(".picks").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pick]");
    if (!b) return;
    state.pack = packs.find((p) => p.id === b.dataset.pick);
    state.accent = null;
    all.value = "";
    render();
  });
  all.addEventListener("change", () => { const p = packs.find((x) => x.id === all.value); if (p) { state.pack = p; state.accent = null; render(); } });
  ex.querySelector(".swatches").addEventListener("click", (e) => { const b = e.target.closest("[data-accent]"); if (b) { state.accent = b.dataset.accent; render(false); out.textContent = `Accent ${b.dataset.accent} on ${state.pack.label}`; } });
  ex.querySelector("[data-export]").addEventListener("click", async () => {
    const T = await import(new URL("live/themes/themes.js", SITE).href);
    const p = state.pack, name = `${p.label} remix`, accent = (state.accent ?? p.accent).toUpperCase();
    const config = {
      theme: { preset: p.id, accentMode: "custom", customAccent: accent, glassOpacity: 0.96, blurPx: 20, borderRadius: p.radius ?? 8, accentTintStrength: 0, customCss: "", fontFamily: "rounded-arial", uiScale: 100 },
      iconStyle: { theme: "obsidian-squircle", shape: "squircle" },
      windowControls: { style: p.controlStyle, order: "green-yellow-red", position: "top-right", frameStyle: p.frameStyle, frameBorderEnabled: true },
      folderStyle: { theme: "accent", globalExplorerOverride: false },
      dock: { pinnedFolders: [] },
    };
    const file = T.exportLensTheme(config, name);
    try { T.importLensTheme(config, JSON.parse(JSON.stringify(file))); } catch (err) { out.textContent = `Lens would reject this: ${err.message}`; return; }
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" })), download: `${name}.lenstheme` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    out.textContent = `Saved ${a.download}. It passed Lens's own import check.`;
  });
  render(false);
  new IntersectionObserver(async ([e]) => {
    visible = e.isIntersecting;
    if (visible && !pg) {
      pg = await import(new URL("live/playground/playground.js", SITE).href);
      const p = state.pack;
      play = pg.mount(bd, { scene: "ambient", fps: 24, seed: 11, still: still(), ripples: false, options: { motion: "lively" }, palette: pg.packPalette({ base: baseOf(p), accent: state.accent ?? p.accent, scheme: p.scheme }) });
    }
    play?.setStill(still());
  }).observe(ex);
  document.addEventListener("visibilitychange", () => play?.setStill(still()));
}

// ---- Ask Lens: the orb does it on the desktop ----------------------------------------------------
async function ai(packs) {
  const ex = document.getElementById("ex-ai");
  if (!ex) return;
  const DOCK = ["lens-browser", "explorer", "vscodium", "spotify", "obsidian", "discord", "terminal", "lens-settings"];
  const desk = createDesk(ex.querySelector(".ex-screen"), { layout: "ai", dock: DOCK, label: "Demo desktop that Lens operates" });
  const dark = packs.find((p) => p.id === "obsidian"), light = packs.find((p) => p.id === "alabaster-daylight");
  let pack = packs.find((p) => p.id === "tokyo-night") ?? dark;
  desk.setPack(pack);
  const presence = createPresence(ex);
  const form = ex.querySelector("form[data-askform]"), input = form.elements.q;
  const { parse } = await import("./intent.js");
  const dockIcon = (id) => desk.el.querySelector(`.dk[data-app="${id}"]`);
  const bar = (id) => desk.win(id)?.querySelector(".dw-bar") ?? desk.win(id);
  const APP = { browser: "lens-browser", "lens browser": "lens-browser", code: "vscodium", vscodium: "vscodium", editor: "vscodium", music: "spotify", spotify: "spotify", notes: "obsidian", obsidian: "obsidian", "launch plan": "obsidian", discord: "discord", chat: "discord", files: "explorer", explorer: "explorer", downloads: "explorer", terminal: "terminal" };
  const WIN = { "lens-browser": "browser", vscodium: "code", spotify: "music", obsidian: "notes", discord: "chat", explorer: "files" };
  const appIn = (c) => Object.keys(APP).sort((a, b) => b.length - a.length).find((k) => c.includes(k));
  const setPack = (p) => { pack = p; desk.setPack(p); };

  function approve(name, win) {
    // "Needs your OK": closing an app could lose work, so Lens asks first.
    return new Promise((res) => {
      const card = document.createElement("div");
      card.className = "ex-approval approval";
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-label", "Needs your OK");
      card.innerHTML = `<div class="ah"><span>Needs your OK</span><span class="meta"><span class="dot warn"></span>Lens</span></div><p class="q">Close ${esc(name)}?</p><p class="why">It has an unsent message draft. You can reopen it from the dock.</p>
        <div class="af"><div class="btns"><button class="btn small" type="button" data-no>Keep it open <kbd>Esc</kbd></button><button class="btn small primary" type="button" data-yes>Close ${esc(name)}</button></div></div>`;
      ex.querySelector(".ex-screen").append(card);
      const done = (ok) => { card.remove(); res(ok); };
      card.querySelector("[data-yes]").addEventListener("click", () => { if (win) desk.minimize(win); desk.notify({ icon: "lens-command", app: "Lens", title: `Closed ${name}`, body: "You approved it. Reopen it from the dock." }); done(true); });
      card.querySelector("[data-no]").addEventListener("click", () => done(false));
      card.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); done(false); } });
      card.querySelector("[data-yes]").focus({ preventScroll: true });
    });
  }

  /** One clause → one visible step for the orb. */
  function stepFor(clause) {
    const c = clause.toLowerCase().replace(/^lens,?\s*/, "");
    const slot = /\bright\b/.test(c) ? "right" : "left";
    if (/\b(tile|snap)\b/.test(c)) return { say: `Tiling the window ${slot}`, target: () => bar(desk.area.querySelector(".dw.active")?.dataset.win ?? "browser"), act: () => desk.tile(slot) };
    if (/\b(dark|light)( mode)?\b/.test(c) && !/\b(theme|switch to)\b/.test(c)) {
      const p = /light/.test(c) ? light : dark;
      return { say: `Turning on ${p.scheme} mode`, target: () => desk.el.querySelector(".desk-top .mode"), act: () => setPack(p) };
    }
    if (/\b(close|quit)\b/.test(c)) {
      const k = appIn(c), id = APP[k] ?? "discord", name = { discord: "Discord", spotify: "Spotify", vscodium: "VSCodium", obsidian: "Obsidian", "lens-browser": "Lens Browser", explorer: "File Explorer", terminal: "Terminal" }[id];
      return { say: `Asking before closing ${name}`, target: () => dockIcon(id), act: () => approve(name, WIN[id]), pause: 200 };
    }
    if (/\b(music|play|song)\b/.test(c)) return { say: "Playing music", target: () => dockIcon("spotify"), act: () => { desk.bounce("spotify"); desk.open("music", [72, 4, 26, 34]); desk.win("music")?.querySelector(".w-music")?.classList.remove("stopped"); desk.notify({ icon: "spotify", app: "Now Playing", title: "Midnight Drive", body: "Neon Coast" }); } };
    const pk = packs.find((p) => c.includes(p.label.toLowerCase()) || c.includes(p.label.toLowerCase().split(" ")[0]) && /\b(theme|switch|apply)\b/.test(c));
    if (pk && /\b(theme|switch|apply|use)\b/.test(c)) return { say: `Switching to ${pk.label}`, target: () => desk.el.querySelector(".desk-top .mode"), act: () => setPack(pk) };
    if (/\b(open|show|find|start|launch)\b/.test(c)) {
      const k = appIn(c);
      if (k) {
        const id = APP[k], w = WIN[id];
        return { say: `Opening ${k === "launch plan" ? "your launch plan" : k}`, target: () => dockIcon(id), act: () => { desk.bounce(id); if (w) desk.open(w, [26, 10, 46, 70]); } };
      }
    }
    const i = parse(c);
    if (!i) return null;
    if (i.action === "set_color_mode") return { say: `Turning on ${i.args.mode} mode`, target: () => desk.el.querySelector(".desk-top .mode"), act: () => setPack(i.args.mode === "light" ? light : dark) };
    if (i.action === "set_theme_pack") { const p = packs.find((x) => x.id === i.args.id); if (p) return { say: `Switching to ${p.label}`, target: () => desk.el.querySelector(".desk-top .mode"), act: () => setPack(p) }; }
    if (i.action === "snap_window") return { say: `Tiling the window ${i.args.slot}`, target: () => bar(desk.area.querySelector(".dw.active")?.dataset.win ?? "browser"), act: () => desk.tile(i.args.slot) };
    return { say: i.summary, target: () => desk.el.querySelector(".desk-top .clock"), act: () => desk.notify({ icon: "lens-command", app: "Lens", title: i.summary, body: "Simulated here: this desktop is a picture." }) };
  }
  const script = (text) => text.split(/\s*(?:,|;|\band then\b|\bthen\b|\band\b)\s*/i).filter(Boolean).map(stepFor).filter(Boolean);
  let running = false;
  async function run(text, typed = false) {
    if (running) presence.stop();
    const steps = script(text);
    if (!steps.length) {
      desk.notify({ icon: "lens-command", app: "Lens", title: "Not a desktop command", body: "With AI turned on, Lens hands this to your local model or Claude." });
      return;
    }
    running = true;
    desk.setQuiet(true);
    desk.el.querySelectorAll(".dn").forEach((n) => n.remove());
    desk.reset();
    // Start from Tokyo Night when the request would otherwise change nothing you could see.
    if ((/\bdark\b/.test(text) && pack === dark) || (/\blight\b/.test(text) && pack === light)) setPack(packs.find((p) => p.id === "tokyo-night") ?? dark);
    await presence.run([...(typed ? [{ say: "Reading the request", target: () => input, type: text, pause: 150 }] : []), ...steps]);
    running = false;
    setTimeout(() => { if (!running) desk.setQuiet(false); }, 6000);
  }
  form.addEventListener("submit", (e) => { e.preventDefault(); const v = input.value.trim(); if (!v) return; input.value = ""; run(v); });
  ex.querySelector(".sugg").addEventListener("click", (e) => { const b = e.target.closest("[data-try]"); if (b) run(b.dataset.try, true); });
}

// ---- Apps: press Get, watch the flow, the app lands in the dock -----------------------------------
const STAGES = ["Finding package", "Downloading", "Verifying", "Installing", "Done"];
async function getFlow(b, onDone) {
  if (b.dataset.busy) return;
  if (b.classList.contains("done")) { b.textContent = "Get"; b.classList.remove("done"); b.removeAttribute("aria-label"); return; }
  b.dataset.busy = "1";
  b.classList.add("busy");
  for (const [i, st] of STAGES.entries()) {
    if (st === "Downloading") {
      for (let pct = 0; pct <= 100; pct += 20) { b.textContent = `${st} ${pct}%`; b.style.setProperty("--p", `${pct}%`); await sleep(160); }
    } else { b.textContent = st; await sleep(380); }
    b.style.setProperty("--p", `${Math.round(((i + 1) / STAGES.length) * 100)}%`);
  }
  b.classList.remove("busy");
  b.classList.add("done");
  b.textContent = "Open";
  b.setAttribute("aria-label", `Open ${b.dataset.get} (simulated)`);
  delete b.dataset.busy;
  onDone?.();
}
async function apps() {
  const ex = document.getElementById("ex-apps");
  const media = await fetch(new URL("data/app-media.json", SITE)).then((r) => r.json()).catch(() => ({}));
  const desk = ex ? createDesk(ex.querySelector(".ex-screen"), { layout: "apps", dock: ["lens-browser", "explorer", "vscodium", "spotify", "lens-apps", "lens-settings"], label: "Demo desktop for Lens Apps" }) : null;
  desk?.setPack({ scheme: "dark", base: "#0f1117", accent: "#818CF8", radius: 10 });
  const landed = (id) => {
    const a = media[id];
    if (!desk || !a) return;
    const src = a.files?.icon ? `media/apps/${a.files.icon}` : "lens-apps";
    const dk = desk.addToDock(id, new URL(src.includes("/") ? src : `media/icons/${src}.svg`, SITE).href);
    desk.bounce(id);
    dk?.classList.add("on");
    desk.notify({ icon: src, app: "Lens Apps", title: `${a.name} is installed`, body: "Official release, checked. Pinned to your dock." });
  };
  if (ex) {
    const ORDER = ["artcraft", "concat", "degenview", "krita", "blender", "obs-studio", "ollama", "excalidraw"];
    const store = document.createElement("div");
    store.className = "ex-store";
    store.innerHTML = `<div class="dw-bar"><img src="${new URL("media/icons/lens-apps.svg", SITE)}" alt="" width="14" height="14"><span>Lens Apps</span><i></i><i></i><i></i></div>
      <div class="st-search" aria-hidden="true">Search free and open-source apps</div>
      <ul>${ORDER.filter((id) => media[id]).map((id) => { const a = media[id]; return `<li><img src="media/apps/${a.files?.icon ?? ""}" alt="" width="30" height="30" loading="lazy"><div><strong>${esc(a.name)}</strong><span>${esc(a.pitch ?? "")}</span><span class="meta">${esc(a.license)}${id === "degenview" ? " · charts and paper trading only" : ""}</span></div><button class="get-pill" type="button" data-get="${esc(a.name)}" data-id="${id}">Get</button></li>`; }).join("")}</ul>`;
    ex.querySelector(".ex-screen").append(store);
  }
  document.querySelectorAll("[data-get]").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.id ?? Object.keys(media).find((k) => media[k].name === b.dataset.get);
    getFlow(b, () => landed(id));
  }));
}

// ---- Also in Lens: one chip at a time ------------------------------------------------------------
function also() {
  const box = document.querySelector(".also-chips"), line = document.querySelector(".also-line");
  if (!box) return;
  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-also]");
    if (!b) return;
    box.querySelectorAll("[data-also]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    line.textContent = b.dataset.line;
  });
}
