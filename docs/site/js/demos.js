// The live windows on the home page. Each starts only when it scrolls near the screen.
//   dock      the real Lens DockSurface (iframe, mocked backend)
//   themes    the real pack registry and .lenstheme exporter/importer (src/themes)
//   command   the offline intent engine (tested port of src-tauri/src/ai/intent.rs)
//   approvals a faithful mock-up of the Needs your OK card
//   sand      the real Falling Sand Playground scene
// Nothing here touches the visitor's system.
import { reducedMotion, isLight } from "./site.js";

const SITE = new URL("../", import.meta.url);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
let packsP;
const getPacks = () => (packsP ??= fetch(new URL("data/packs.json", SITE)).then((r) => r.json()));

// ---------------------------------------------------------------------------------------- dock
async function dock(win) {
  const frame = win.querySelector("iframe");
  const status = win.querySelector("[data-status]");
  let ready = false, picked = false;
  const queue = [];
  const send = (m) => frame.contentWindow?.postMessage(m, location.origin);
  const patch = (p) => (ready ? send({ lens: "config", patch: p }) : queue.push({ lens: "config", patch: p }));
  addEventListener("message", (e) => {
    if (e.source !== frame.contentWindow || e.data?.lens !== "ready" || ready) return;
    ready = true;
    win.querySelector(".fallback")?.setAttribute("hidden", "");
    status.textContent = "live";
    queue.splice(0).forEach(send);
  });
  frame.addEventListener("load", () => send({ lens: "ping" }));
  frame.src = frame.dataset.src;
  const packs = await getPacks();
  const style = win.querySelector("select[data-style]");
  const pack = win.querySelector("select[data-pack]");
  pack.innerHTML = packs.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join("");
  style.addEventListener("change", () => patch({ dock: { style: style.value } }));
  const applyPack = () => {
    const p = packs.find((x) => x.id === pack.value);
    patch({ theme: { preset: p.id, customAccent: p.accent, accentMode: "custom", borderRadius: p.radius } });
  };
  pack.addEventListener("change", () => { picked = true; applyPack(); });
  // Until the visitor picks a pack here, match the site: its Lens pack if one is chosen in the
  // notch, else Obsidian when dark and Alabaster Daylight when light.
  const follow = () => {
    if (picked) return;
    let site = null;
    try { site = JSON.parse(localStorage.getItem("lens-site") || "{}")?.pack?.id ?? null; } catch {}
    pack.value = document.documentElement.dataset.accent === "pack" && site ? site : isLight() ? "alabaster-daylight" : "obsidian";
    applyPack();
  };
  addEventListener("site-theme", follow);
  follow();
  win.querySelector("[data-search]").addEventListener("click", () => { send({ lens: "search" }); frame.focus(); });
  // Narrow screens: render at desktop width and scale down, like a screenshot.
  const screen = win.querySelector(".dock-screen");
  const fit = () => {
    const s = Math.min(1, screen.clientWidth / 600);
    Object.assign(frame.style, s < 1 ? { width: "600px", maxWidth: "none", transform: `scale(${s})`, transformOrigin: "left bottom" } : { width: "", maxWidth: "", transform: "", transformOrigin: "" });
    screen.style.height = s < 1 ? `${Math.round(250 * s) + 8}px` : "";
  };
  addEventListener("resize", fit);
  fit();
  setTimeout(() => { if (!ready) status.textContent = "preview image"; }, 9000);
}

// ---------------------------------------------------------------------------------- theme lab
const ACCENTS = ["#FAFAFA", "#818CF8", "#38BDF8", "#34D399", "#FBBF24", "#FB923C", "#FB7185", "#C084FC", "#111113"];
async function themes(win) {
  const [packs, T] = await Promise.all([getPacks(), import(new URL("live/themes/themes.js", SITE).href)]);
  const mini = win.querySelector(".mini");
  const sel = win.querySelector("select[data-pack]");
  const sw = win.querySelector(".swatches");
  const out = win.querySelector("[data-out]");
  sel.innerHTML = packs.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join("");
  sel.value = "catppuccin-mocha";
  const first = packs.find((p) => p.id === sel.value) ?? packs[0];
  const state = { pack: first, accent: first.accent, radius: first.radius, glass: 0.96 };
  sw.innerHTML = ACCENTS.map((a) => `<button type="button" data-accent="${a}" aria-label="Accent ${a}" style="background:${a}"></button>`).join("");
  const radius = win.querySelector("input[name=radius]"), glass = win.querySelector("input[name=glass]");
  const render = () => {
    const p = state.pack, light = p.scheme === "light", s = mini.style;
    s.setProperty("--m-base", p.base ?? "#09090b");
    s.setProperty("--m-elev", p.elevated ?? "#141417");
    s.setProperty("--m-fg", light ? "#18181b" : "#fafafa");
    s.setProperty("--m-fg2", light ? "#52525b" : "#a1a1aa");
    s.setProperty("--m-line", light ? "rgb(0 0 0 / 0.12)" : "rgb(255 255 255 / 0.1)");
    s.setProperty("--m-accent", state.accent);
    s.setProperty("--m-radius", `${state.radius}px`);
    s.setProperty("--m-glass", String(state.glass));
    sw.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.accent.toUpperCase() === state.accent.toUpperCase())));
    win.querySelector('[data-v="radius"]').textContent = `${state.radius} px`;
    win.querySelector('[data-v="glass"]').textContent = `${Math.round(state.glass * 100)}%`;
  };
  sel.addEventListener("change", () => { const p = packs.find((x) => x.id === sel.value); Object.assign(state, { pack: p, accent: p.accent, radius: p.radius }); radius.value = p.radius; render(); });
  sw.addEventListener("click", (e) => { const b = e.target.closest("button[data-accent]"); if (b) { state.accent = b.dataset.accent; render(); } });
  radius.addEventListener("input", () => { state.radius = +radius.value; render(); });
  glass.addEventListener("input", () => { state.glass = +glass.value / 100; render(); });
  win.querySelector("[data-export]").addEventListener("click", () => {
    const name = `${state.pack.label} remix`;
    const config = {
      theme: { preset: state.pack.id, accentMode: "custom", customAccent: state.accent.toUpperCase(), glassOpacity: state.glass, blurPx: 20, borderRadius: state.radius, accentTintStrength: 0, customCss: "", fontFamily: "rounded-arial", uiScale: 100 },
      iconStyle: { theme: "obsidian-squircle", shape: "squircle" },
      windowControls: { style: state.pack.controlStyle, order: "green-yellow-red", position: "top-right", frameStyle: state.pack.frameStyle, frameBorderEnabled: true },
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
  render();
}

// ------------------------------------------------------------------------------------ command
const ASKS = { close_app: true, create_note: true };
const DOES = {
  open_app: (a) => `Starts ${a.name}, or brings it forward.`, switch_app: (a) => `Brings ${a.name} to the front.`,
  close_app: () => "Closes it after you confirm.", set_color_mode: (a) => `Switches to ${a.mode} mode.`,
  set_theme_pack: (a) => `Applies the ${a.id} pack everywhere.`, snap_window: (a) => `Snaps the focused window: ${a.slot}.`,
  arrange_windows: (a) => `Tiles your windows (${a.layout}).`, show_desktop: () => "Minimises everything.",
  set_focus_mode: () => "Hides distractions and silences notifications.", set_dnd: (a) => (a.enabled ? "Turns on Do Not Disturb." : "Turns Do Not Disturb off."),
  set_volume: (a) => `Volume to ${a.level}%.`, change_volume: (a) => `Volume ${a.delta > 0 ? "up" : "down"}.`, set_mute: (a) => (a.muted ? "Mutes sound." : "Unmutes sound."),
  set_brightness: (a) => `Brightness to ${a.level}%.`, change_brightness: (a) => `Brightness ${a.delta > 0 ? "up" : "down"}.`, set_night_light: () => "Changes night light.",
  switch_workspace: (a) => `Goes to workspace ${a.target}.`, search_files: (a) => `Searches your files for “${a.query}”.`,
  start_timer: () => "Starts a timer with a notification at the end.", calculate: () => "Answers inline.", convert: () => "Answers inline.",
  open_settings_page: (a) => `Opens the “${a.page}” settings page.`, create_note: () => "Saves a note after you confirm.",
};
async function command(win) {
  const { parse } = await import("./intent.js");
  const input = win.querySelector("input"), out = win.querySelector(".cmd-out");
  const run = (text) => {
    if (!text.trim()) { out.innerHTML = `<p class="meta">Type a request or pick one.</p>`; return; }
    const t0 = performance.now(), i = parse(text), ms = (performance.now() - t0).toFixed(2);
    out.innerHTML = i
      ? `<div class="cmd-card"><div class="act"><span class="dot ${ASKS[i.action] ? "warn" : "ok"}"></span>${ASKS[i.action] ? "asks first" : "runs now"} · ${i.action} · ${ms} ms</div><div class="sum">${esc(i.summary)}</div><p>${esc((DOES[i.action] ?? (() => ""))(i.args))}</p></div>`
      : `<div class="cmd-card"><div class="act"><span class="dot"></span>not a command · ${ms} ms</div><div class="sum">Goes to your AI helper, if you've turned it on</div><p>Local model first. Claude only if your privacy setting allows it, and you see what's sent.</p></div>`;
  };
  input.addEventListener("input", () => run(input.value));
  win.querySelector(".chips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { input.value = b.textContent; run(b.textContent); } });
  run("");
}

// ---------------------------------------------------------------------------------- approvals
const CARDS = {
  delete: { src: "mail.example.com", dot: "bad", q: "Delete 2,315 emails older than 30 days?", body: `<dl><dt>Includes</dt><dd>1,904 newsletters · 411 alerts</dd><dt>Keeping</dt><dd>3 threads: flight, lease, tax</dd><dt>Recovery</dt><dd>Goes to Bin · 30 days</dd></dl>`, verb: "Delete 2,315", done: "Moved to the Bin. Undo for 30 days." },
  payment: { src: "airline.example", dot: "ok", q: "Pay the $84 fare difference?", body: `<div class="big">$84.00 <span class="meta">Amex ··1007</span></div><div class="warn-line">⚠ Non-refundable once ticketed</div><p class="why">Payments are blocked unless you allow them for a task. Lens never types card numbers.</p>`, verb: "Pay $84.00", done: "In Lens the site's own checkout finishes here, with the card it already has." },
  send: { src: "messages.example", dot: "ok", q: "Send this to Maya?", body: `<div class="msg"><span class="meta">TO</span> <strong>Maya</strong><br>Rain's coming, we're inside. Saturday 2:00 is still on.</div>`, verb: "Send", deny: "Don't send", done: "Sent exactly as shown." },
  click: { src: "booking.example", dot: "bad", q: "Book a table for 4 on Friday?", body: `<div class="form"><strong>Complete your reservation</strong><br><span class="fi">Sam W.</span><span class="fi">sam@…</span><br><span class="target">Complete reservation</span></div><div class="cap meta">I'll click this · captured 3s ago</div>`, verb: "Book", done: "Clicked the outlined button, and nothing else." },
};
function approvals(win) {
  const host = win.querySelector("[data-card]"), tabs = win.querySelector("[data-variants]");
  let timer;
  const render = (id) => {
    const v = CARDS[id];
    host.innerHTML = `<div class="approval" role="group" aria-label="Needs your OK"><div class="ah"><span>Needs your OK</span><span class="meta"><span class="dot ${v.dot}"></span>${v.src}</span></div><p class="q">${v.q}</p>${v.body}
      <div class="af"><div class="btns"><button class="btn small" type="button" data-deny>${v.deny ?? "Deny"} <kbd>Esc</kbd></button><button class="btn small primary hold" type="button" data-ok><span class="fill"></span><span>${v.verb}</span> <kbd>hold</kbd></button></div></div>
      <div class="result" aria-live="polite" hidden></div></div>`;
    const ok = host.querySelector("[data-ok]"), res = host.querySelector(".result");
    const finish = (t) => { res.hidden = false; res.textContent = t; host.querySelectorAll("button").forEach((b) => (b.disabled = true)); setTimeout(() => render(id), 4000); };
    const start = () => { if (ok.disabled) return; ok.classList.add("holding"); timer = setTimeout(() => finish(`Approved. ${v.done}`), reducedMotion() ? 600 : 900); };
    const stop = () => { ok.classList.remove("holding"); clearTimeout(timer); };
    ok.addEventListener("pointerdown", start); ok.addEventListener("pointerup", stop); ok.addEventListener("pointerleave", stop);
    ok.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); start(); } });
    ok.addEventListener("keyup", (e) => { if (e.key === "Enter" || e.key === " ") stop(); });
    host.querySelector("[data-deny]").addEventListener("click", () => finish("Denied. Nothing happened."));
    host.querySelector(".approval").addEventListener("keydown", (e) => { if (e.key === "Escape") host.querySelector("[data-deny]")?.click(); });
  };
  tabs.addEventListener("click", (e) => { const b = e.target.closest("button[data-v]"); if (!b) return; tabs.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); render(b.dataset.v); });
  render("delete");
}

// --------------------------------------------------------------------------------------- sand
async function sand(win) {
  const stage = win.querySelector(".sand-stage");
  const r = document.documentElement;
  const palette = () => {
    const cs = getComputedStyle(stage), light = isLight();
    r.style.setProperty("--lens-pack-base", cs.backgroundColor);
    r.style.setProperty("--lens-pack-elevated", light ? "#ffffff" : "#1a1a1f");
    r.style.setProperty("--lens-fg", light ? "#18181b" : "#fafafa");
    r.style.setProperty("--lens-accent", getComputedStyle(r).getPropertyValue("--hue").trim() || "#818cf8");
  };
  palette();
  const { mount } = await import(new URL("live/playground/playground.js", SITE).href);
  const m = mount(stage, { scene: "sand", fps: 60, seed: 11, still: reducedMotion() });
  const mats = win.querySelector("[data-mats]");
  mats.addEventListener("click", (e) => { const b = e.target.closest("button[data-mat]"); if (!b) return; mats.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); m.setOption("material", b.dataset.mat); });
  win.querySelector("[data-clear]").addEventListener("click", () => m.runner.reset());
  addEventListener("site-theme", () => { palette(); m.refreshPalette(); m.setStill(reducedMotion()); });
  // Keyboard: arrows move the brush, Space paints.
  let kx = 0.5, ky = 0.2, down = false;
  const push = (kind) => { const R = stage.getBoundingClientRect(); m.push({ kind, x: kx * R.width, y: ky * R.height, button: 0, buttons: down ? 1 : 0, delta: 0, alt: false }); };
  stage.addEventListener("keydown", (e) => {
    const k = { ArrowLeft: [-0.03, 0], ArrowRight: [0.03, 0], ArrowUp: [0, -0.03], ArrowDown: [0, 0.03] }[e.key];
    if (k) { kx = Math.min(1, Math.max(0, kx + k[0])); ky = Math.min(1, Math.max(0, ky + k[1])); e.preventDefault(); push("move"); }
    if (e.key === " ") { e.preventDefault(); if (!down) { down = true; push("down"); } }
  });
  stage.addEventListener("keyup", (e) => { if (e.key === " ") { down = false; push("up"); } });
}

const INIT = { dock, themes, command, approvals, sand };
const io = new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return;
  io.unobserve(e.target);
  Promise.resolve(INIT[e.target.dataset.demo]?.(e.target)).catch((err) => {
    const n = document.createElement("p");
    n.className = "note";
    n.textContent = `This demo didn't load (${err.message}).`;
    e.target.append(n);
  });
}), { rootMargin: "200px" });
document.querySelectorAll("[data-demo]").forEach((w) => io.observe(w));
