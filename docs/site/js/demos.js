// Live demos the home-page stage swaps in (js/stage.js), each built on Lens's own code:
//   themes    the real pack registry and .lenstheme exporter/importer (src/themes)
//   command   the offline intent engine (tested port of src-tauri/src/ai/intent.rs)
//   approvals a faithful mock-up of the Needs your OK card
// Nothing here touches the visitor's system.
import { reducedMotion } from "./site.js";

const SITE = new URL("../", import.meta.url);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
let packsP;
export const getPacks = () => (packsP ??= fetch(new URL("data/packs.json", SITE)).then((r) => r.json()));

// ---------------------------------------------------------------------------------- theme lab
const ACCENTS = ["#FAFAFA", "#818CF8", "#38BDF8", "#34D399", "#FBBF24", "#FB923C", "#FB7185", "#C084FC", "#111113"];
export async function themes(win) {
  const [packs, T] = await Promise.all([getPacks(), import(new URL("live/themes/themes.js", SITE).href)]);
  const mini = win.querySelector(".mini");
  const sel = win.querySelector("select[data-pack]");
  const sw = win.querySelector(".swatches");
  const out = win.querySelector("[data-out]");
  sel.innerHTML = packs.filter((p) => !p.collection).map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join("");
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
export async function command(win) {
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
  win.querySelector(".chips-s").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { input.value = b.textContent; run(b.textContent); } });
  run("");
}

// ---------------------------------------------------------------------------------- approvals
const CARDS = {
  delete: { src: "mail.example.com", dot: "bad", q: "Delete 2,315 emails older than 30 days?", body: `<dl><dt>Includes</dt><dd>1,904 newsletters · 411 alerts</dd><dt>Keeping</dt><dd>3 threads: flight, lease, tax</dd><dt>Recovery</dt><dd>Goes to Bin · 30 days</dd></dl>`, verb: "Delete 2,315", done: "Moved to the Bin. Undo for 30 days." },
  payment: { src: "airline.example", dot: "ok", q: "Pay the $84 fare difference?", body: `<div class="big">$84.00 <span class="meta">Amex ··1007</span></div><div class="warn-line">⚠ Non-refundable once ticketed</div><p class="why">Payments are blocked unless you allow them for a task. Lens never types card numbers.</p>`, verb: "Pay $84.00", done: "In Lens the site's own checkout finishes here, with the card it already has." },
  send: { src: "messages.example", dot: "ok", q: "Send this to Maya?", body: `<div class="msg"><span class="meta">TO</span> <strong>Maya</strong><br>Rain's coming, we're inside. Saturday 2:00 is still on.</div>`, verb: "Send", deny: "Don't send", done: "Sent exactly as shown." },
  click: { src: "booking.example", dot: "bad", q: "Book a table for 4 on Friday?", body: `<div class="form"><strong>Complete your reservation</strong><br><span class="fi">Sam W.</span><span class="fi">sam@…</span><br><span class="target">Complete reservation</span></div><div class="cap meta">I'll click this · captured 3s ago</div>`, verb: "Book", done: "Clicked the outlined button, and nothing else." },
};
export function approvals(win) {
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

