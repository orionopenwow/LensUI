// The Theme lab: the same Lens desk as the hero, wearing whichever theme you point at. Hover a
// theme to preview it, click to keep it, drag an accent onto the desk, Shuffle (or press T), or
// search all 89 themes. Every pack is a real Lens pack (src/themes) with its own animated backdrop.
import { reducedMotion } from "./site.js";
import { createDesk, getPacks } from "./desk.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const PICKS = ["obsidian", "alabaster-daylight", "living-sky", "gruvbox-warm", "everforest-dark", "rose-pine", "lens-expressive"];
// Accents to pick, by name. null = the theme's own accent.
export const ACCENTS = [["#FAFAFA", "Snow"], ["#818CF8", "Iris"], ["#38BDF8", "Sky"], ["#34D399", "Mint"], ["#FBBF24", "Amber"], ["#FB923C", "Tangerine"], ["#FB7185", "Coral"], ["#C084FC", "Violet"]];
const CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
/** Dark or light ink for a check mark on a colour. */
const ink = (h) => { const n = parseInt(h.slice(1, 7), 16); const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#09090b" : "#fafafa"; };
const base = (p) => p.base ?? (p.scheme === "light" ? "#f4f4f5" : "#09090b");
/** A swatch that looks like the theme: its backdrop, a mini top bar and a dock in its colours. */
export const swatch = (p) => `<span class="tsw" style="--b:${base(p)};--a:${p.accent};--r:${Math.min(10, p.radius ?? 8)}px" aria-hidden="true"><i class="tb"></i><i class="w"></i><i class="dk"><b></b><b></b><b></b></i></span>`;

export async function init(section) {
  const packs = await getPacks();
  const host = section.querySelector("#lab-desk");
  const desk = createDesk(host, { label: "Theme lab desktop", layout: [["browser", 0.03, 0.05], ["music", 0.45, 0.38]], accentLayer: true });
  // The music window starts active, so its focus border and the dock's focused mark show the accent.
  { const w = desk.byApp("music"); if (w) desk.focus(w.id); }
  const picker = section.querySelector(".lab-picks");
  const picks = PICKS.map((id) => packs.find((p) => p.id === id)).filter(Boolean);
  picker.innerHTML = picks.map((p) => `<button type="button" class="tp" data-pack="${p.id}" aria-pressed="false">${swatch(p)}<span>${esc(p.label)}</span></button>`).join("");
  const out = section.querySelector(".lab-now");
  const mark = () => {
    const c = desk.committed?.p?.id;
    picker.querySelectorAll(".tp").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.pack === c)));
    const acc = desk.committed?.acc ?? null;
    out.textContent = desk.committed ? `${desk.committed.p.label}${acc ? ` · ${nameOf(acc)} accent` : ""}` : "";
    markAcc();
  };
  const byId = (id) => packs.find((p) => p.id === id);
  let accEl = null, accNow = null;
  const nameOf = (a) => ACCENTS.find(([h]) => h === String(a).toUpperCase())?.[1] ?? String(a).toUpperCase();
  const own = () => (desk.committed?.p ?? byId("obsidian")).accent ?? "#fafafa";
  desk.setPack(byId("tokyo-night"));
  mark();
  // Hover previews, click keeps, leaving the picker puts the kept theme back.
  let hoverT = 0;
  picker.addEventListener("pointerover", (e) => { const b = e.target.closest(".tp"); if (!b || e.pointerType === "touch") return; clearTimeout(hoverT); hoverT = setTimeout(() => desk.setPack(byId(b.dataset.pack), { preview: true }), 60); });
  picker.addEventListener("pointerleave", () => { clearTimeout(hoverT); if (desk.pack?.id !== desk.committed?.p.id) desk.revert(); });
  picker.addEventListener("click", (e) => { const b = e.target.closest(".tp"); if (!b) return; clearTimeout(hoverT); desk.setPack(byId(b.dataset.pack)); mark(); });
  picker.addEventListener("focusin", (e) => { const b = e.target.closest(".tp"); if (b && e.target.matches(":focus-visible")) desk.setPack(byId(b.dataset.pack), { preview: true }); });
  picker.addEventListener("focusout", (e) => { if (!picker.contains(e.relatedTarget)) desk.revert(); });

  // All themes: a searchable grid popover.
  const allBtn = section.querySelector("[data-all]"), pop = section.querySelector(".lab-pop");
  const grid = pop.querySelector(".grid"), q = pop.querySelector("input");
  const renderAll = () => {
    const s = q.value.trim().toLowerCase();
    grid.innerHTML = packs.filter((p) => !s || p.label.toLowerCase().includes(s) || (p.collection ?? "").toLowerCase().includes(s)).map((p) => `<button type="button" class="tp" data-pack="${p.id}">${swatch(p)}<span>${esc(p.label)}</span></button>`).join("") || `<p>No theme called “${esc(s)}”.</p>`;
  };
  const openAll = (on) => { pop.hidden = !on; allBtn.setAttribute("aria-expanded", String(on)); if (on) { renderAll(); q.focus(); } else { desk.revert(); allBtn.focus(); } };
  allBtn.addEventListener("click", () => openAll(pop.hidden));
  q.addEventListener("input", renderAll);
  grid.addEventListener("pointerover", (e) => { const b = e.target.closest(".tp"); if (b) desk.setPack(byId(b.dataset.pack), { preview: true }); });
  grid.addEventListener("pointerleave", () => desk.revert());
  grid.addEventListener("click", (e) => { const b = e.target.closest(".tp"); if (!b) return; desk.setPack(byId(b.dataset.pack)); mark(); pop.hidden = true; allBtn.setAttribute("aria-expanded", "false"); });
  pop.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); openAll(false); } });
  document.addEventListener("pointerdown", (e) => { if (!pop.hidden && !pop.contains(e.target) && e.target !== allBtn) { pop.hidden = true; allBtn.setAttribute("aria-expanded", "false"); } });

  // Accents: a radio group of named colours (plus the theme's own). Click one, use the arrow keys, or
  // drag one onto the desk. The desk takes it everywhere Lens shows the accent (css/lab-accent.css).
  accEl = section.querySelector(".lab-acc"); accNow = section.querySelector(".lab-acc-now");
  accEl.setAttribute("role", "radiogroup");
  accEl.innerHTML = `<button type="button" role="radio" class="auto" data-acc="" aria-label="Theme's own accent" style="--c:${own()};--on:${ink(own())}">${CHECK}</button>`
    + ACCENTS.map(([h, n]) => `<button type="button" role="radio" data-acc="${h}" aria-label="${n}" style="--c:${h};--on:${ink(h)}">${CHECK}</button>`).join("");
  function markAcc() {
    if (!accEl) return;
    const cur = desk.committed?.acc ? String(desk.committed.acc).toUpperCase() : "";
    const o = own(), auto = accEl.querySelector(".auto");
    auto.style.setProperty("--c", o); auto.style.setProperty("--on", ink(o));
    accEl.querySelectorAll("[data-acc]").forEach((b) => { const on = b.dataset.acc === cur; b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1; });
    const shown = cur || o;
    accNow.innerHTML = `<i style="--c:${esc(shown)};background:${esc(shown)}"></i><b>${cur ? esc(nameOf(cur)) : "Theme’s own"}</b><code>${esc(String(shown).toUpperCase())}</code>`;
  }
  const setAcc = (a, at) => {
    desk.setPack(desk.committed?.p ?? byId("obsidian"), { acc: a || null });
    desk.wash(a || own(), at);
    mark();
  };
  accEl.addEventListener("keydown", (e) => {
    const bs = [...accEl.querySelectorAll("[data-acc]")], i = bs.indexOf(document.activeElement);
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (i < 0 || !d) return;
    e.preventDefault();
    const b = bs[(i + d + bs.length) % bs.length];
    b.focus(); setAcc(b.dataset.acc);
  });
  const drop = Object.assign(document.createElement("div"), { className: "lab-drop" });
  drop.setAttribute("aria-hidden", "true");
  host.append(drop);
  let drag = null;
  accEl.addEventListener("pointerdown", (e) => {
    const b = e.target.closest("[data-acc]");
    if (!b || e.button !== 0) return;
    drag = { b, x: e.clientX, y: e.clientY, ghost: null, id: e.pointerId, moved: false };
    b.setPointerCapture(e.pointerId);
  });
  accEl.addEventListener("pointermove", (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    const c = drag.b.dataset.acc || own();
    if (!drag.ghost) {
      drag.moved = true;
      drag.ghost = Object.assign(document.createElement("div"), { className: "acc-ghost" });
      drag.ghost.style.background = c;
      document.body.append(drag.ghost);
      document.documentElement.classList.add("acc-dragging");
      host.style.setProperty("--drop", c);
      drop.innerHTML = `<span><i></i>Drop to paint the desk ${esc(drag.b.dataset.acc ? nameOf(c) : "in the theme's own accent")}</span>`;
      host.classList.add("drop-armed");
    }
    drag.ghost.style.transform = `translate3d(${e.clientX - 15}px, ${e.clientY - 15}px, 0)`;
    const r = host.getBoundingClientRect();
    host.classList.toggle("drop-ok", e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom);
  });
  const endDrag = (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag; drag = null;
    host.classList.remove("drop-ok", "drop-armed");
    document.documentElement.classList.remove("acc-dragging");
    d.ghost?.remove();
    if (!d.moved) return setAcc(d.b.dataset.acc);
    const r = host.getBoundingClientRect();
    if (e.type === "pointerup" && e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom) {
      setAcc(d.b.dataset.acc, desk.toDesk(e));
      if (!reducedMotion()) { const s = document.createElement("span"); s.className = "acc-splash"; s.style.cssText = `left:${e.clientX - r.left}px;top:${e.clientY - r.top}px;background:${d.b.dataset.acc || own()}`; host.append(s); setTimeout(() => s.remove(), 700); }
    }
  };
  accEl.addEventListener("pointerup", endDrag);
  accEl.addEventListener("pointercancel", endDrag);
  markAcc();

  // Shuffle, and T while the lab is in view.
  const shuffle = async () => { await desk.shuffle(); mark(); };
  section.querySelector("[data-shuffle]").addEventListener("click", shuffle);
  let inView = false;
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; }, { threshold: 0.4 }).observe(section);
  addEventListener("keydown", (e) => { if (inView && e.key.toLowerCase() === "t" && !e.ctrlKey && !e.metaKey && !e.altKey && !/input|textarea|select/i.test(document.activeElement?.tagName ?? "") && !document.activeElement?.isContentEditable && !document.activeElement?.closest?.(".lx")) { e.preventDefault(); shuffle(); } });
  desk.on("theme", ({ preview }) => { if (!preview) mark(); });

  // Download the kept theme as a .lenstheme that passes Lens's own import check.
  section.querySelector("[data-export]")?.addEventListener("click", async () => {
    const T = await import(new URL("../live/themes/themes.js", import.meta.url).href);
    const p = desk.committed?.p ?? byId("obsidian"), a = (desk.committed?.acc ?? p.accent).toUpperCase(), name = `${p.label} remix`;
    const config = { theme: { preset: p.id, accentMode: "custom", customAccent: a, glassOpacity: 0.96, blurPx: 20, borderRadius: p.radius ?? 8, accentTintStrength: 0, customCss: "", fontFamily: "rounded-arial", uiScale: 100 }, iconStyle: { theme: "obsidian-squircle", shape: "squircle" }, windowControls: { style: p.controlStyle, order: "green-yellow-red", position: "top-right", frameStyle: p.frameStyle, frameBorderEnabled: true }, folderStyle: { theme: "accent", globalExplorerOverride: false }, dock: { pinnedFolders: [] } };
    const file = T.exportLensTheme(config, name);
    try { T.importLensTheme(config, JSON.parse(JSON.stringify(file))); } catch (err) { out.textContent = `Lens would reject this: ${err.message}`; return; }
    const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" })), download: `${name}.lenstheme` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    out.textContent = `Saved ${link.download}. It passed Lens's own import check.`;
  });
  window.lensSite = { ...(window.lensSite ?? {}), lab: desk };
}
