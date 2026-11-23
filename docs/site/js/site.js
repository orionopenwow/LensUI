// Shared behaviour for every page: the header (glass once you scroll, the sliding nav indicator, the
// appearance popover for mode, accent, pack and motion, the Download button that appears once the
// hero's scrolls away, the mobile sheet), #hash highlighting and the Lens Guide orb. Preferences live in localStorage under "lens-site" (read before first paint by the
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

// ---- the appearance popover (header, right) ------------------------------------------------------
const ICON = {
  light: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  dark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>`,
  auto: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>`,
};
const HUES = [["rainbow", "Rainbow", "conic-gradient(#ff5f6d,#ff9f43,#ffd43b,#3ddc97,#38bdf8,#818cf8,#c084fc,#ff5f6d)"], ["iris", "Iris", "#818cf8"], ["sky", "Sky", "#38bdf8"], ["mint", "Mint", "#34d399"], ["sun", "Sun", "#fbbf24"], ["coral", "Coral", "#fb923c"], ["rose", "Rose", "#fb7185"]];
let notch, pill, panel, packs = null, lastFocus = null;

function buildNotch() {
  notch = document.createElement("div");
  notch.className = "appear";
  notch.innerHTML = `
  <button class="appear-btn" type="button" aria-expanded="false" aria-controls="appear-panel" aria-haspopup="dialog"><span class="mi"></span><span class="adot" aria-hidden="true"></span></button>
  <div class="appear-panel" id="appear-panel" role="dialog" aria-label="Site appearance" hidden>
    <div class="row"><span class="label" id="n-mode">Mode</span><div class="seg" role="group" aria-labelledby="n-mode" data-k="mode">${["dark", "light", "auto"].map((m) => `<button type="button" data-v="${m}">${ICON[m]}${m === "auto" ? "System" : m[0].toUpperCase() + m.slice(1)}</button>`).join("")}</div></div>
    <div class="row"><span class="label" id="n-acc">Accent</span><div class="hues" role="group" aria-labelledby="n-acc">${HUES.map(([id, label, bg]) => `<button type="button" data-hue="${id}" aria-label="${label}" style="background:${bg}"></button>`).join("")}</div>
      <label class="sr" for="n-pack">Match a Lens pack</label><select id="n-pack"><option value="">Match a Lens pack…</option></select></div>
    <div class="row"><span class="label" id="n-mo">Motion</span><div class="seg" role="group" aria-labelledby="n-mo" data-k="motion"><button type="button" data-v="auto">System</button><button type="button" data-v="full">On</button><button type="button" data-v="reduce">Reduced</button></div></div>
    <div class="foot"><a href="${new URL("index.html#themes", SITE).href}" data-lab>Theme lab ↓</a><button type="button" data-reset>Reset</button></div>
  </div>`;
  (document.getElementById("theme-slot") ?? document.body).append(notch);
  pill = notch.querySelector(".appear-btn");
  panel = notch.querySelector(".appear-panel");
  pill.addEventListener("click", () => (panel.hidden ? open() : close()));
  panel.addEventListener("click", (e) => {
    const s = e.target.closest("[data-k] button[data-v]");
    if (s) {
      const k = s.parentElement.dataset.k;
      set(k === "mode" && prefs.accent === "pack" ? { mode: s.dataset.v, accent: "rainbow", pack: null } : { [k]: s.dataset.v });
    }
    const h = e.target.closest("button[data-hue]");
    if (h) set({ accent: h.dataset.hue, pack: null });
    if (e.target.closest("[data-reset]")) { prefs = {}; save(prefs); apply(); }
    if (e.target.closest("[data-lab]")) close(false);
  });
  panel.querySelector("#n-pack").addEventListener("change", async (e) => {
    const id = e.target.value;
    if (!id) return;
    const p = (await getPacks()).find((x) => x.id === id);
    if (p) set({ accent: "pack", pack: { id: p.id, label: p.label, scheme: p.scheme, vars: packVars(p) } });
  });
  notch.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) { e.preventDefault(); close(); }
    if (e.key === "Tab" && !panel.hidden) {
      const f = [pill, ...panel.querySelectorAll("button, select, a[href]")].filter((x) => x.offsetParent !== null);
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
    }
  });
  document.addEventListener("pointerdown", (e) => { if (!panel.hidden && !notch.contains(e.target)) close(false); });
}
async function getPacks() {
  packs ??= await fetch(new URL("data/packs.json", SITE)).then((r) => r.json()).catch(() => []);
  return packs;
}
async function open() {
  lastFocus = document.activeElement;
  panel.hidden = false;
  notch.classList.add("open");
  pill.setAttribute("aria-expanded", "true");
  const sel = panel.querySelector("#n-pack");
  if (sel.options.length < 2) {
    const ps = await getPacks();
    sel.insertAdjacentHTML("beforeend", ps.map((p) => `<option value="${p.id}">${p.label}${p.scheme === "light" ? " (light)" : ""}</option>`).join(""));
    renderNotch();
  }
  panel.querySelector('[data-k="mode"] [aria-pressed="true"]')?.focus();
}
function close(restore = true) {
  if (panel.hidden) return;
  panel.hidden = true;
  notch.classList.remove("open");
  pill.setAttribute("aria-expanded", "false");
  if (restore) (lastFocus && notch.contains(lastFocus) ? lastFocus : pill).focus?.();
}
function renderNotch() {
  if (!notch) return;
  const mode = prefs.mode || "dark";
  const shown = prefs.accent === "pack" ? root.dataset.scheme : mode;
  const acc = prefs.accent === "pack" ? prefs.pack?.label ?? "pack" : HUES.find(([id]) => id === (prefs.accent || "rainbow"))?.[1] ?? "Rainbow";
  pill.querySelector(".mi").innerHTML = ICON[shown] ?? ICON.auto;
  pill.setAttribute("aria-label", `Site appearance: ${shown === "auto" ? "system" : shown}, ${acc}`);
  panel.querySelectorAll("[data-k]").forEach((g) => g.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === (prefs[g.dataset.k] || ({ mode: "dark" }[g.dataset.k] ?? "auto"))))));
  panel.querySelectorAll("button[data-hue]").forEach((b) => b.setAttribute("aria-pressed", String(prefs.accent !== "pack" && b.dataset.hue === (prefs.accent || "rainbow"))));
  panel.querySelector("#n-pack").value = prefs.accent === "pack" ? prefs.pack?.id ?? "" : "";
}
buildNotch();
apply();

// ---- header: glass once scrolled, sliding nav indicator, Download on scroll, mobile sheet --------
const bar = document.getElementById("bar");
const nav = document.getElementById("site-nav");
const onScroll = () => bar?.classList.toggle("scrolled", scrollY > 8);
addEventListener("scroll", onScroll, { passive: true });
onScroll();
const ind = nav?.querySelector(".nav-ind");
const placeInd = (a, instant = false) => {
  if (!ind) return;
  if (!a) { ind.style.opacity = "0"; return; }
  const r = a.getBoundingClientRect(), n = nav.getBoundingClientRect();
  if (instant) ind.style.transition = "none";
  ind.style.opacity = "1";
  ind.style.transform = `translateX(${r.left - n.left}px)`;
  ind.style.width = `${r.width}px`;
  if (instant) { void ind.offsetWidth; ind.style.transition = ""; }
};
const current = () => nav?.querySelector('a[aria-current="page"]');
if (nav) {
  requestAnimationFrame(() => placeInd(current(), true));
  nav.addEventListener("pointerover", (e) => { const a = e.target.closest("a"); if (a && matchMedia("(min-width: 861px)").matches) placeInd(a); });
  nav.addEventListener("pointerleave", () => placeInd(current()));
  nav.addEventListener("focusin", (e) => { if (e.target.matches("a:focus-visible")) placeInd(e.target); });
  nav.addEventListener("focusout", () => placeInd(current()));
  addEventListener("resize", () => placeInd(current(), true));
  document.fonts?.ready.then(() => placeInd(current(), true));
}
// The header's Download shows once the hero's own button has scrolled away (always, on other pages).
const heroDl = document.querySelector(".hero [data-dl]");
if (heroDl) new IntersectionObserver(([e]) => document.body.classList.toggle("show-bar-dl", !e.isIntersecting), { rootMargin: "-60px 0px 0px 0px" }).observe(heroDl);
else document.body.classList.add("show-bar-dl");
const menuBtn = document.getElementById("menu-btn");
const setMenu = (o) => { nav.classList.toggle("open", o); menuBtn.setAttribute("aria-expanded", String(o)); document.body.classList.toggle("menu-open", o); };
menuBtn?.addEventListener("click", () => setMenu(!nav.classList.contains("open")));
nav?.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
addEventListener("keydown", (e) => { if (e.key === "Escape" && nav?.classList.contains("open")) { setMenu(false); menuBtn.focus(); } });

// ---- highlight a section reached by #hash (the Guide's "Show me") ------------------------------
export function flash(id) {
  if (id.startsWith("scene/") || id.startsWith("tour/")) return true; // js/home.js opens the tour
  if (id === "features" && document.getElementById("sc-tabs")) {
    // The tours above the hero desk are the feature index.
    const tabs = document.getElementById("sc-tabs"), head = document.getElementById("bar")?.offsetHeight ?? 60;
    scrollTo({ top: scrollY + tabs.getBoundingClientRect().top - head - 8, behavior: reducedMotion() ? "auto" : "smooth" });
    tabs.querySelector("[role=tab]")?.focus({ preventScroll: true });
    return true;
  }
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  return true;
}
if (location.hash) setTimeout(() => flash(decodeURIComponent(location.hash.slice(1))), 300);
addEventListener("hashchange", () => { if (location.hash === "#features") flash("features"); });

// ---- Guide, loaded on first use ----------------------------------------------------------------
let guide;
async function openGuide(q) { guide ??= await import(new URL("./guide.js", import.meta.url).href); guide.open(q); }
document.getElementById("guide-orb")?.addEventListener("click", () => (guide?.isOpen?.() ? guide.close() : openGuide()));
document.addEventListener("click", (e) => { const a = e.target.closest("[data-ask]"); if (a) { e.preventDefault(); openGuide(a.dataset.ask); } });
addEventListener("keydown", (e) => {
  if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement?.tagName ?? "") && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openGuide(); }
});
