// Interactive demos on try.html. Each one uses real Lens code where it can:
//   theme lab  → src/themes (packs registry + the .lenstheme importer/exporter)
//   sand       → src/playground scenes
//   command    → the offline intent engine (a tested port of src-tauri/src/ai/intent.rs)
// Approvals and voice are faithful mock-ups of the Lens cards; nothing here touches your system.
import { reducedMotion, isLight } from "./site.js";
import { parse } from "./intent.js";

const SITE = new URL("../", import.meta.url);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const packsP = fetch(new URL("data/packs.json", SITE)).then((r) => r.json());

// ---------------------------------------------------------------------------------- theme lab
export async function initThemeLab(el) {
  const [packs, T] = await Promise.all([packsP, import(new URL("live/themes/themes.js", SITE).href)]);
  const mini = el.querySelector(".mini");
  const grid = el.querySelector(".pack-grid");
  const sw = el.querySelector(".swatches");
  const out = el.querySelector("[data-out]");
  const state = { pack: packs[0], accent: packs[0].accent, radius: packs[0].radius, glass: 0.96, dither: 35, grain: 20 };
  grid.innerHTML = packs.map((p) => `<button type="button" data-id="${p.id}" aria-pressed="false"><i style="background:${p.base ?? "#09090b"};box-shadow:inset -7px 0 0 ${p.accent}"></i>${esc(p.label)}</button>`).join("");
  const ACCENTS = ["#FAFAFA", "#60A5FA", "#818CF8", "#CBA6F7", "#F472B6", "#FB7185", "#FE8019", "#FCEE0A", "#A7C080", "#2AA198", "#33CCFF", "#111113"];
  sw.innerHTML = ACCENTS.map((a) => `<button type="button" data-accent="${a}" aria-label="Accent ${a}" aria-pressed="false" style="background:${a}"></button>`).join("");
  const range = (name) => el.querySelector(`input[name="${name}"]`);
  const apply = () => {
    const p = state.pack, light = p.scheme === "light";
    const s = mini.style;
    s.setProperty("--m-base", p.base ?? "#09090b");
    s.setProperty("--m-elev", p.elevated ?? "#141417");
    s.setProperty("--m-fg", light ? "#18181b" : "#fafafa");
    s.setProperty("--m-fg2", light ? "#52525b" : "#a1a1aa");
    s.setProperty("--m-line", light ? "rgb(0 0 0 / 0.12)" : "rgb(255 255 255 / 0.1)");
    s.setProperty("--m-accent", state.accent);
    s.setProperty("--m-radius", `${state.radius}px`);
    s.setProperty("--m-glass", String(state.glass));
    mini.dataset.density = String(state.dither / 100);
    mini.dataset.cell = String(2 + Math.round(state.grain / 25));
    mini.style.setProperty("--dither-ink", light ? "rgb(0 0 0 / 0.14)" : "rgb(255 255 255 / 0.16)");
    mini.querySelector("canvas.dither-canvas")?.remove();
    import("./site.js").then((m) => m.ditherAll());
    grid.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === p.id)));
    sw.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.accent.toUpperCase() === state.accent.toUpperCase())));
    el.querySelector("[data-pack-desc]").textContent = p.description;
    for (const [k, v] of [["radius", `${state.radius} px`], ["glass", `${Math.round(state.glass * 100)} %`], ["dither", `${state.dither}`], ["grain", `${state.grain}`]]) el.querySelector(`[data-v="${k}"]`).textContent = v;
  };
  grid.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-id]");
    if (!b) return;
    const p = packs.find((x) => x.id === b.dataset.id);
    Object.assign(state, { pack: p, accent: p.accent, radius: p.radius });
    range("radius").value = p.radius;
    apply();
  });
  sw.addEventListener("click", (e) => { const b = e.target.closest("button[data-accent]"); if (b) { state.accent = b.dataset.accent; apply(); } });
  el.querySelector("input[type=color]").addEventListener("input", (e) => { state.accent = e.target.value.toUpperCase(); apply(); });
  range("radius").addEventListener("input", (e) => { state.radius = +e.target.value; apply(); });
  range("glass").addEventListener("input", (e) => { state.glass = +e.target.value / 100; apply(); });
  range("dither").addEventListener("input", (e) => { state.dither = +e.target.value; apply(); });
  range("grain").addEventListener("input", (e) => { state.grain = +e.target.value; apply(); });

  el.querySelector("[data-export]").addEventListener("click", () => {
    const name = (el.querySelector("input[name=themename]").value || `${state.pack.label} remix`).slice(0, 40);
    const config = {
      theme: { preset: state.pack.id, accentMode: "custom", customAccent: state.accent.toUpperCase(), glassOpacity: state.glass, blurPx: 20, borderRadius: state.radius, accentTintStrength: 0, customCss: "", fontFamily: "rounded-arial", uiScale: 100 },
      iconStyle: { theme: "obsidian-squircle", shape: "squircle" },
      windowControls: { style: state.pack.controlStyle, order: "green-yellow-red", position: "top-right", frameStyle: state.pack.frameStyle, frameBorderEnabled: true },
      folderStyle: { theme: "accent", globalExplorerOverride: false },
      dock: { pinnedFolders: [] },
    };
    const file = T.exportLensTheme(config, name);
    // Check it with the same importer Lens runs before offering the download.
    let ok = false;
    try { const back = T.importLensTheme(config, JSON.parse(JSON.stringify(file))); ok = back.theme.preset === file.theme.preset && back.theme.customAccent === file.theme.customAccent; } catch (err) { out.textContent = `Lens would reject this file: ${err.message}`; return; }
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${name.replace(/[^\w -]/g, "").trim() || "theme"}.lenstheme` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    out.textContent = ok ? `Saved ${a.download}. It passed Lens's own import check. In Lens: Settings › Theme & Look › Saved & shared themes › Import. (Dither and grain are a website preview; they are not in .lenstheme yet.)` : "Saved, but the round-trip check didn't match.";
  });
  apply();
}

// ---------------------------------------------------------------------------------- sand / playground
export async function initSand(el) {
  const stage = el.querySelector(".sand-stage");
  const r = document.documentElement;
  const palette = () => {
    const light = isLight();
    const cs = getComputedStyle(stage);
    r.dataset.scheme = light ? "light" : "dark";
    r.style.setProperty("--lens-pack-base", cs.backgroundColor);
    r.style.setProperty("--lens-pack-elevated", light ? "#ffffff" : "#1a1a1f");
    r.style.setProperty("--lens-fg", light ? "#18181b" : "#fafafa");
    r.style.setProperty("--lens-accent", el.dataset.accent || "#7AA2F7");
  };
  palette();
  const { mount, scenes } = await import(new URL("live/playground/playground.js", SITE).href);
  const m = mount(stage, { scene: "sand", fps: 60, still: false, seed: 11 });
  const still = el.querySelector("[data-still]");
  const setStill = (on) => { m.setStill(on); still.setAttribute("aria-pressed", String(on)); still.textContent = on ? "Calm: on" : "Calm: off"; };
  if (reducedMotion()) setStill(true);
  still.addEventListener("click", () => setStill(still.getAttribute("aria-pressed") !== "true"));
  const sceneSel = el.querySelector("select[data-scene]");
  sceneSel.innerHTML = scenes.map((s) => `<option value="${s.id}">${esc(s.name)}${s.interactive ? "" : " (ambient)"}</option>`).join("");
  const mats = el.querySelector("[data-mats]");
  sceneSel.addEventListener("change", () => { m.setScene(sceneSel.value); mats.hidden = sceneSel.value !== "sand"; if (still.getAttribute("aria-pressed") === "true") m.setStill(true); });
  mats.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-mat]");
    if (!b) return;
    mats.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    m.setOption("material", b.dataset.mat);
  });
  el.querySelector("[data-clear]").addEventListener("click", () => m.runner.reset());
  addEventListener("site-theme", () => { palette(); m.refreshPalette(); });
  // Keyboard path: arrows move a brush, Space paints.
  let kx = 0.5, ky = 0.2, down = false;
  stage.addEventListener("keydown", (e) => {
    const step = 0.03, R = stage.getBoundingClientRect();
    const k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (k) { kx = Math.min(1, Math.max(0, kx + k[0])); ky = Math.min(1, Math.max(0, ky + k[1])); e.preventDefault(); }
    if (e.key === " ") { down = true; e.preventDefault(); }
    m.push({ kind: down && e.key === " " ? "down" : "move", x: kx * R.width, y: ky * R.height, button: 0, buttons: down ? 1 : 0, delta: 0, alt: false });
  });
  stage.addEventListener("keyup", (e) => { if (e.key === " ") { down = false; const R = stage.getBoundingClientRect(); m.push({ kind: "up", x: kx * R.width, y: ky * R.height, button: 0, buttons: 0, delta: 0, alt: false }); } });
}

// ---------------------------------------------------------------------------------- approvals
const VARIANTS = {
  delete: {
    source: "mail.example.com", dot: "bad", q: "Delete 2,315 emails older than 30 days?",
    body: `<dl><dt>Includes</dt><dd>1,904 newsletters · 411 alerts</dd><dt>Keeping</dt><dd>3 threads: flight, lease, tax receipt</dd><dt>Recovery</dt><dd>Goes to Bin · restorable for 30 days</dd></dl>`,
    verb: "Delete 2,315", side: `<span class="meta">Review all 2,315</span>`, done: "Moved 2,315 emails to the Bin. Undo is available for 30 days.",
  },
  payment: {
    source: "airline.example", dot: "ok", q: "Pay the $84 fare difference?",
    body: `<p class="why">Flight 1357 was cancelled. Flight 1359 leaves tomorrow at 10:40 and still fits your trip.</p><div class="big">$84.00 <span class="meta">Amex ··1007 · charged now</span></div><div class="warn-line">⚠ Non-refundable once ticketed</div>`,
    verb: "Pay $84.00", note: "In Lens, payments are blocked unless you switch a task to “Ask first”. Lens never types card numbers.", done: "In the real app this is where the site's own checkout would complete, with the card the site already has saved.",
  },
  send: {
    source: "messages.example", dot: "ok", q: "Send this to Maya?",
    body: `<div class="msg"><span class="meta">TO</span> <strong>Maya · Messages</strong><br>We're inside now, rain's coming. Saturday 2:00 is still on.</div>`,
    verb: "Send", deny: "Don't send", done: "Sent, exactly as shown. Nothing is ever sent in your name without this card.",
  },
  click: {
    source: "booking.example", dot: "bad", q: "Book a table for 4 on Friday?",
    body: `<div class="form"><strong>Complete your reservation</strong><div style="color:#52525b;font-size:12px">Fri 20:00 · 4 people</div><span class="fake-in">Sam W.</span><span class="fake-in">sam@…</span><span class="fake-in">··· 4821</span><br><span class="target">Complete reservation</span></div><div class="cap meta">☐ I'll click this · captured 3s ago · Show tab ↗</div><dl><dt>Seating</dt><dd>Window (requested)</dd><dt>Cancellation</dt><dd>Free until 24 h before</dd></dl>`,
    verb: "Book", done: "Clicked “Complete reservation”, the element shown above, and nothing else.",
  },
};
export function initApprovals(el) {
  const host = el.querySelector("[data-card]");
  const tabs = el.querySelector("[data-variants]");
  let timer = null;
  const render = (id) => {
    const v = VARIANTS[id];
    host.innerHTML = `<div class="approval" role="group" aria-label="Needs your OK">
      <div class="ah"><span>✳ Needs your OK</span><span class="meta"><span class="dot ${v.dot}"></span>${v.source}</span></div>
      <p class="q">${v.q}</p>${v.body}${v.note ? `<p class="why" style="font-size:13px">${v.note}</p>` : ""}
      <div class="af">${v.side ?? "<span></span>"}<div class="btns"><button class="btn small" type="button" data-deny>${v.deny ?? "Deny"} <kbd>Esc</kbd></button><button class="btn small primary hold" type="button" data-ok aria-describedby="hold-help"><span class="fill"></span><span>${v.verb}</span> <kbd>hold ⏎</kbd></button></div></div>
      <div class="result" aria-live="polite" hidden></div></div>`;
    const ok = host.querySelector("[data-ok]"), res = host.querySelector(".result");
    const finish = (text) => { res.hidden = false; res.textContent = text; host.querySelectorAll("button").forEach((b) => (b.disabled = true)); };
    const start = () => { if (ok.disabled) return; ok.classList.add("holding"); timer = setTimeout(() => finish(`Approved. ${v.done}`), reducedMotion() ? 600 : 900); };
    const stop = () => { ok.classList.remove("holding"); clearTimeout(timer); };
    ok.addEventListener("pointerdown", start); ok.addEventListener("pointerup", stop); ok.addEventListener("pointerleave", stop);
    ok.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); start(); } });
    ok.addEventListener("keyup", (e) => { if (e.key === "Enter" || e.key === " ") stop(); });
    host.querySelector("[data-deny]").addEventListener("click", () => finish("Denied. Nothing happened, and the task stops here."));
    host.querySelector(".approval").addEventListener("keydown", (e) => { if (e.key === "Escape") host.querySelector("[data-deny]")?.click(); });
  };
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-v]");
    if (!b) return;
    tabs.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    render(b.dataset.v);
  });
  el.querySelector("[data-reset]")?.addEventListener("click", () => render(tabs.querySelector("[aria-pressed=true]").dataset.v));
  render("delete");
}

// ---------------------------------------------------------------------------------- command
const RISK = { close_app: "Asks first", create_note: "Asks first" };
const DOES = {
  open_app: (a) => `Starts ${a.name}, or brings it forward if it's running.`,
  switch_app: (a) => `Brings ${a.name} to the front.`,
  close_app: (a) => (a.name === "focused" ? "Closes the window you're in, after you confirm." : `Closes ${a.name}, after you confirm.`),
  set_color_mode: (a) => `Switches Lens and Windows apps to ${a.mode} mode.`,
  set_theme_pack: (a) => `Applies the ${a.id} theme pack to every surface.`,
  snap_window: (a) => `Snaps the focused window: ${a.slot}.`,
  arrange_windows: (a) => `Tiles your open windows (${a.layout}).`,
  show_desktop: () => "Minimises everything; say it again to bring it back.",
  set_focus_mode: () => "Focus mode: hides distractions and silences notifications.",
  set_dnd: (a) => (a.enabled ? `Turns on Do Not Disturb${a.minutes ? ` for ${a.minutes} min` : ""}.` : "Turns Do Not Disturb off."),
  set_volume: (a) => `Sets the volume to ${a.level}%.`,
  change_volume: (a) => `Volume ${a.delta > 0 ? "up" : "down"} 10%.`,
  set_mute: (a) => (a.muted ? "Mutes sound." : "Unmutes sound."),
  set_brightness: (a) => `Sets brightness to ${a.level}%.`,
  change_brightness: (a) => `Brightness ${a.delta > 0 ? "up" : "down"} 10%.`,
  set_night_light: () => "Changes Windows night light.",
  switch_workspace: (a) => `Goes to workspace ${a.target}.`,
  search_files: (a) => `Searches your files for “${a.query}”.`,
  start_timer: (a) => `Starts a timer${a.label ? ` (${a.label})` : ""}; a notification fires when it ends.`,
  calculate: () => "Shows the answer inline. Enter copies it.",
  convert: () => "Shows the conversion inline. Enter copies it.",
  open_settings_page: (a) => `Opens the ${a.page.startsWith("ms-") ? "Windows" : "Lens"} settings page “${a.page}”.`,
  create_note: (a) => `Saves a note: “${a.text}”.`,
};
export function initCommand(el) {
  const input = el.querySelector("input");
  const out = el.querySelector(".cmd-out");
  const run = (text) => {
    const t0 = performance.now();
    const i = parse(text);
    const ms = (performance.now() - t0).toFixed(2);
    if (!text.trim()) { out.innerHTML = `<p class="meta">Type a request, or pick one above.</p>`; return; }
    if (!i) {
      out.innerHTML = `<div class="cmd-card"><div class="act">not a desktop command · ${ms} ms</div><div class="sum">Lens would hand this to your AI helper</div><p style="margin:0;color:var(--fg-2)">AI is off until you turn it on. When it's on, your local model answers first. Claude only gets the question if your privacy setting allows it, and you see what's sent.</p></div>`;
      return;
    }
    const risk = RISK[i.action] ?? "Runs straight away";
    out.innerHTML = `<div class="cmd-card"><div class="act">${i.action} · confidence ${i.confidence.toFixed(2)} · parsed in ${ms} ms · <span class="dot ${RISK[i.action] ? "warn" : "ok"}"></span>${risk}</div>
      <div class="sum">${esc(i.summary)}</div><p style="margin:0;color:var(--fg-2)">${esc((DOES[i.action] ?? (() => ""))(i.args))}</p>
      <pre><code>${esc(JSON.stringify({ action: i.action, args: i.args }, null, 2))}</code></pre></div>`;
  };
  input.addEventListener("input", () => run(input.value));
  el.querySelector(".chips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { input.value = b.textContent; run(b.textContent); input.focus(); } });
  run("");
}

// ---------------------------------------------------------------------------------- voice
const PHRASES = ["Lens, minimise this", "Lens, dark mode", "Lens, move this window to workspace two", "Lens, volume thirty", "Lens, add this to the shelf", "Lens, theme catppuccin"];
const VOICE_EXTRA = {
  "lens, minimise this": { action: "minimize_window", summary: "Minimise · the focused window", undo: true },
  "lens, add this to the shelf": { action: "shelf_add", summary: "Add the selection to the Shelf", undo: true },
  "lens, move this window to workspace two": { action: "move_window_to_workspace", summary: "Move this window to workspace 2", undo: true },
  "lens, volume thirty": { action: "set_volume", summary: "Set volume to 30%", undo: true },
};
export function initVoice(el) {
  const hud = el.querySelector(".voice-hud");
  const said = el.querySelector(".said");
  const res = el.querySelector("[data-result]");
  const mic = el.querySelector(".mic");
  el.querySelector(".chips").innerHTML = PHRASES.map((p) => `<button type="button">${esc(p)}</button>`).join("");
  let busy = false;
  const recognise = (text) => {
    const k = text.toLowerCase().replace(/[.!?]+$/, "").trim();
    const extra = VOICE_EXTRA[k];
    const i = extra ?? parse(text);
    if (!i) { res.innerHTML = `<span class="dot warn"></span>Didn't catch a command. Say “Lens, help” for the list.`; return; }
    res.innerHTML = `<span class="pill"><span class="dot ok"></span>${esc(i.summary)}</span>${extra?.undo || i.action?.startsWith("set_") ? ` <button class="btn small" type="button" data-undo>Undo <kbd>Ctrl Z</kbd></button>` : ""}`;
    res.querySelector("[data-undo]")?.addEventListener("click", () => (res.innerHTML = `<span class="meta">Undone.</span>`));
  };
  const simulate = async (text) => {
    if (busy) return;
    busy = true;
    hud.classList.add("listening"); mic.setAttribute("aria-pressed", "true"); res.textContent = "";
    const words = text.split(" ");
    for (let n = 1; n <= words.length; n++) { said.textContent = `“${words.slice(0, n).join(" ")}”`; await new Promise((r) => setTimeout(r, reducedMotion() ? 0 : 170)); }
    hud.classList.remove("listening"); mic.setAttribute("aria-pressed", "false");
    recognise(text);
    busy = false;
  };
  el.querySelector(".chips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) simulate(b.textContent); });
  el.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); const v = e.target.elements.say.value.trim(); if (v) simulate(v); });
  // Optional real mic: the browser's own speech service, only after a click, clearly labelled.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const real = el.querySelector("[data-real-mic]");
  if (!SR) { real.disabled = true; real.textContent = "Your browser has no speech recognition"; }
  real.addEventListener("click", () => {
    if (!SR || busy) return;
    const r = new SR();
    r.lang = "en-US"; r.interimResults = true;
    busy = true; hud.classList.add("listening"); mic.setAttribute("aria-pressed", "true"); res.textContent = "";
    r.onresult = (ev) => { const t = [...ev.results].map((x) => x[0].transcript).join(" "); said.textContent = `“${t}”`; if (ev.results[ev.results.length - 1].isFinal) recognise(t); };
    r.onend = r.onerror = () => { busy = false; hud.classList.remove("listening"); mic.setAttribute("aria-pressed", "false"); };
    r.start();
  });
  mic.addEventListener("click", () => simulate(PHRASES[Math.floor(Math.random() * PHRASES.length)]));
}
