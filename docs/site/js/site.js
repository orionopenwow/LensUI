// Shared behaviour for every page: the notch (theme mode, accent, density, text size, motion),
// the mobile menu, feature tiles that preview a clip on hover or tap, #hash highlighting and the
// Guide button. Preferences live in localStorage under "lens-site" (read before first paint by the
// inline script in each page's <head>, see tools/site/lib/layout.mjs).
const root = document.documentElement;
const KEY = "lens-site";
const SITE = new URL("../", import.meta.url);
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; } };
const save = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} };
let prefs = load();

export const isLight = () => root.dataset.scheme === "light";
export const reducedMotion = () => root.dataset.motion === "reduce" || (root.dataset.motion !== "full" && matchMedia("(prefers-reduced-motion: reduce)").matches);

// ---- colour maths for "Match a Lens pack" -----------------------------------------------------
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** Moves `c` towards white (dark schemes) or black (light) until it reads at `min`:1 on every background. */
function readable(c, bgs, light, min = 4.5) {
  const end = light ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0; t <= 1.0001; t += 0.05) { const x = mix(c, end, t); if (bgs.every((b) => ratio(x, b) >= min)) return toHex(x); }
  return toHex(end);
}
export function packVars(p) {
  const light = p.scheme === "light";
  const bg = hex(p.base ?? "#09090b");
  const card = hex(p.elevated ?? "#141417");
  const sunk = mix(bg, [0, 0, 0], light ? 0.03 : 0.25);
  const bgs = [bg, card, sunk];
  return {
    "--pack-bg": toHex(bg),
    "--pack-card": toHex(card),
    "--pack-sunk": toHex(sunk),
    "--pack-hue": p.accent,
    "--pack-link": readable(hex(p.accent), bgs, light),
    "--fg-2": readable(hex(light ? "#45454d" : "#b6b6bf"), bgs, light, 6),
    "--fg-3": readable(hex(light ? "#5f5f68" : "#8e8e98"), bgs, light, 4.6),
  };
}

// ---- apply preferences -----------------------------------------------------------------------
const PACK_KEYS = ["--pack-bg", "--pack-card", "--pack-sunk", "--pack-hue", "--pack-link", "--fg-2", "--fg-3"];
function apply() {
  const sys = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  const mode = prefs.mode || "dark"; // dark by default; Auto follows the system
  PACK_KEYS.forEach((k) => root.style.removeProperty(k));
  let scheme = mode === "auto" ? sys : mode;
  if (prefs.accent === "pack" && prefs.pack) {
    scheme = prefs.pack.scheme;
    for (const [k, v] of Object.entries(prefs.pack.vars)) root.style.setProperty(k, v);
  }
  root.dataset.scheme = scheme;
  root.dataset.accent = prefs.accent || "rainbow";
  root.dataset.density = prefs.density || "comfortable";
  root.style.setProperty("--text-scale", String(prefs.size || 1));
  if (prefs.motion && prefs.motion !== "auto") root.dataset.motion = prefs.motion; else delete root.dataset.motion;
  renderNotch();
  window.dispatchEvent(new CustomEvent("site-theme"));
}
function set(patch) { prefs = { ...prefs, ...patch }; save(prefs); apply(); }
matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => { if (prefs.mode === "auto") apply(); });

// ---- the notch ---------------------------------------------------------------------------------
const ICON = {
  light: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  dark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>`,
  auto: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>`,
};
const HUES = [["rainbow", "Rainbow", "conic-gradient(#ff5f6d,#ff9f43,#ffd43b,#3ddc97,#38bdf8,#818cf8,#c084fc,#ff5f6d)"], ["iris", "Iris", "#818cf8"], ["sky", "Sky", "#38bdf8"], ["mint", "Mint", "#34d399"], ["sun", "Sun", "#fbbf24"], ["coral", "Coral", "#fb923c"], ["rose", "Rose", "#fb7185"]];
let notch, pill, panel, packs = null, pinned = false, lastFocus = null;

function buildNotch() {
  notch = document.createElement("div");
  notch.className = "notch";
  notch.innerHTML = `
  <button class="notch-pill" type="button" aria-expanded="false" aria-controls="notch-panel"><span class="mi"></span><span class="adot" aria-hidden="true"></span><span class="lbl"></span></button>
  <div class="notch-panel" id="notch-panel" role="dialog" aria-label="Site appearance">
    <div class="row"><span class="meta" id="n-mode">Mode</span><div class="seg" role="group" aria-labelledby="n-mode" data-k="mode">${["light", "dark", "auto"].map((m) => `<button type="button" data-v="${m}">${m === "auto" ? "Auto" : m[0].toUpperCase() + m.slice(1)}</button>`).join("")}</div></div>
    <div class="row"><span class="meta" id="n-acc">Accent</span><div class="hues" role="group" aria-labelledby="n-acc">${HUES.map(([id, label, bg]) => `<button type="button" data-hue="${id}" aria-label="${label}" style="background:${bg}"></button>`).join("")}</div>
      <label class="sr" for="n-pack">Match a Lens pack</label><select id="n-pack"><option value="">Match a Lens pack…</option></select></div>
    <div class="row"><span class="meta">Display</span>
      <div class="two"><div class="seg" role="group" aria-label="Density" data-k="density"><button type="button" data-v="comfortable">Comfortable</button><button type="button" data-v="compact">Compact</button></div>
      <div class="stepper" role="group" aria-label="Text size"><button type="button" data-size="-1" aria-label="Smaller text">−</button><span class="meta" data-size-out>100%</span><button type="button" data-size="1" aria-label="Larger text">+</button></div></div>
      <div class="seg" role="group" aria-label="Motion" data-k="motion"><button type="button" data-v="auto">Motion: system</button><button type="button" data-v="full">On</button><button type="button" data-v="reduce">Reduced</button></div>
    </div>
    <div class="foot"><span class="meta">Saved in this browser</span><button type="button" data-reset>Reset</button></div>
  </div>`;
  document.body.append(notch);
  pill = notch.querySelector(".notch-pill");
  panel = notch.querySelector(".notch-panel");
  pill.addEventListener("click", () => (notch.classList.contains("open") && pinned ? close() : open(true)));
  notch.addEventListener("mouseenter", () => { if (!pinned && matchMedia("(hover: hover)").matches) open(false); });
  notch.addEventListener("mouseleave", () => { if (!pinned) close(false); });
  panel.addEventListener("click", (e) => {
    const s = e.target.closest("[data-k] button[data-v]");
    if (s) {
      const k = s.parentElement.dataset.k;
      set(k === "mode" && prefs.accent === "pack" ? { mode: s.dataset.v, accent: "rainbow", pack: null } : { [k]: s.dataset.v });
    }
    const h = e.target.closest("button[data-hue]");
    if (h) set({ accent: h.dataset.hue, pack: null });
    const z = e.target.closest("button[data-size]");
    if (z) { const steps = [0.875, 0.9375, 1, 1.0625, 1.125, 1.25]; const i = Math.max(0, Math.min(steps.length - 1, steps.indexOf(prefs.size || 1) + Number(z.dataset.size))); set({ size: steps[i] }); }
    if (e.target.closest("[data-reset]")) { prefs = {}; save(prefs); apply(); }
  });
  panel.querySelector("#n-pack").addEventListener("change", async (e) => {
    const id = e.target.value;
    if (!id) return;
    const p = (await getPacks()).find((x) => x.id === id);
    if (p) set({ accent: "pack", pack: { id: p.id, label: p.label, scheme: p.scheme, vars: packVars(p) } });
  });
  notch.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && notch.classList.contains("open")) { e.preventDefault(); close(); pill.focus(); }
    if (e.key === "Tab" && notch.classList.contains("open")) {
      const f = [...notch.querySelectorAll("button, select")].filter((x) => x.offsetParent !== null);
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
    }
  });
  document.addEventListener("pointerdown", (e) => { if (pinned && !notch.contains(e.target)) close(false); });
}
async function getPacks() {
  packs ??= await fetch(new URL("data/packs.json", SITE)).then((r) => r.json()).catch(() => []);
  return packs;
}
async function open(pin) {
  pinned = pin;
  if (pin) lastFocus = document.activeElement;
  notch.classList.add("open");
  pill.setAttribute("aria-expanded", "true");
  const sel = panel.querySelector("#n-pack");
  if (sel.options.length < 2) {
    const ps = await getPacks();
    sel.insertAdjacentHTML("beforeend", ps.map((p) => `<option value="${p.id}">${p.label}${p.scheme === "light" ? " (light)" : ""}</option>`).join(""));
    renderNotch();
  }
  if (pin) panel.querySelector('[data-k="mode"] [aria-pressed="true"]')?.focus();
}
function close(restore = true) {
  notch.classList.remove("open");
  pill.setAttribute("aria-expanded", "false");
  pinned = false;
  if (restore && lastFocus && notch.contains(document.activeElement)) lastFocus.focus?.();
}
function renderNotch() {
  if (!notch) return;
  const mode = prefs.mode || "dark";
  const shown = prefs.accent === "pack" ? root.dataset.scheme : mode;
  const acc = prefs.accent === "pack" ? prefs.pack?.label ?? "pack" : prefs.accent || "rainbow";
  pill.querySelector(".mi").innerHTML = ICON[shown] ?? ICON.auto;
  const lbl = prefs.accent === "pack" ? acc : `${mode} · ${acc}`;
  pill.querySelector(".lbl").textContent = lbl;
  // The accessible name starts with the visible text (WCAG 2.5.3, label in name).
  pill.setAttribute("aria-label", `${lbl}: site appearance. Change`);
  panel.querySelectorAll("[data-k]").forEach((g) => g.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === (prefs[g.dataset.k] || ({ density: "comfortable", mode: "dark" }[g.dataset.k] ?? "auto"))))));
  panel.querySelectorAll("button[data-hue]").forEach((b) => b.setAttribute("aria-pressed", String(prefs.accent !== "pack" && b.dataset.hue === (prefs.accent || "rainbow"))));
  panel.querySelector("#n-pack").value = prefs.accent === "pack" ? prefs.pack?.id ?? "" : "";
  panel.querySelector("[data-size-out]").textContent = `${Math.round((prefs.size || 1) * 100)}%`;
}
buildNotch();
apply();

// ---- mobile menu -------------------------------------------------------------------------------
const menuBtn = document.getElementById("menu-btn");
const nav = document.getElementById("site-nav");
menuBtn?.addEventListener("click", () => { const o = nav.classList.toggle("open"); menuBtn.setAttribute("aria-expanded", String(o)); });

// ---- feature tiles: a short clip on hover or tap (never on its own) ----------------------------
document.querySelectorAll(".tile[data-clip]").forEach((tile) => {
  const peek = tile.querySelector(".peek");
  const btn = tile.querySelector(".peek-btn");
  let v = null;
  const play = () => {
    if (!v) {
      v = Object.assign(document.createElement("video"), { muted: true, loop: true, playsInline: true, src: new URL(`media/${tile.dataset.clip}.mp4`, SITE).href });
      v.setAttribute("aria-hidden", "true");
      v.poster = peek.querySelector("img").src;
      peek.replaceChildren(v);
    }
    v.play().catch(() => {});
    btn?.setAttribute("aria-pressed", "true");
  };
  const stop = () => { v?.pause(); btn?.setAttribute("aria-pressed", "false"); };
  tile.addEventListener("mouseenter", () => { if (!reducedMotion()) play(); });
  tile.addEventListener("mouseleave", stop);
  btn?.addEventListener("click", () => (v && !v.paused ? stop() : play()));
});

// ---- highlight a section reached by #hash (the Guide's "Show me") ------------------------------
export function flash(id) {
  const el = document.getElementById(id);
  // Not an element: maybe a stage pane ("#themes", "#voice"…); js/stage.js handles those.
  if (!el) { window.dispatchEvent(new CustomEvent("site-show", { detail: id })); return true; }
  el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  return true;
}
if (location.hash) setTimeout(() => flash(decodeURIComponent(location.hash.slice(1))), 300);

// ---- Guide, loaded on first use ----------------------------------------------------------------
let guide;
async function openGuide(q) { guide ??= await import(new URL("./guide.js", import.meta.url).href); guide.open(q); }
document.getElementById("guide-fab")?.addEventListener("click", () => openGuide());
document.addEventListener("click", (e) => { const a = e.target.closest("[data-ask]"); if (a) { e.preventDefault(); openGuide(a.dataset.ask); } });
addEventListener("keydown", (e) => {
  if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement?.tagName ?? "") && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openGuide(); }
});
