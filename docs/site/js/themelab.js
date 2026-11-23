// The Theme lab: the same Lens desk as the hero, wearing whichever theme you point at. Hover a
// theme to preview it, click to keep it, drag an accent onto the desk, Shuffle (or press T), or
// search all 89 themes. Every pack is a real Lens pack (src/themes) with its own animated backdrop.
import { reducedMotion } from "./site.js";
import { createDesk, getPacks } from "./desk.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const PICKS = ["obsidian", "living-sky", "nord-frost", "catppuccin-mocha", "tokyo-night", "gruvbox-warm", "rose-pine", "hyprland-neon", "dracula-glass", "everforest-dark", "alabaster-daylight", "lens-expressive", "cc-koi-mosaic"];
const ACCENTS = ["#FAFAFA", "#818CF8", "#38BDF8", "#34D399", "#FBBF24", "#FB923C", "#FB7185", "#C084FC"];
const base = (p) => p.base ?? (p.scheme === "light" ? "#f4f4f5" : "#09090b");
/** A swatch that looks like the theme: its backdrop, a mini top bar and a dock in its colours. */
export const swatch = (p) => `<span class="tsw" style="--b:${base(p)};--a:${p.accent};--r:${Math.min(10, p.radius ?? 8)}px" aria-hidden="true"><i class="tb"></i><i class="w"></i><i class="dk"><b></b><b></b><b></b></i></span>`;

export async function init(section) {
  const packs = await getPacks();
  const host = section.querySelector("#lab-desk");
  const desk = createDesk(host, { label: "Theme lab desktop", layout: [["browser", 0.1, 0.07], ["files", 0.56, 0.06], ["music", 0.6, 0.6]], notify: false });
  const picker = section.querySelector(".lab-picks");
  const picks = PICKS.map((id) => packs.find((p) => p.id === id)).filter(Boolean);
  picker.innerHTML = picks.map((p) => `<button type="button" class="tp" data-pack="${p.id}" aria-pressed="false">${swatch(p)}<span>${esc(p.label)}</span></button>`).join("");
  const out = section.querySelector(".lab-now");
  const mark = () => {
    const c = desk.committed?.p?.id;
    picker.querySelectorAll(".tp").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.pack === c)));
    out.textContent = desk.committed ? `${desk.committed.p.label}${desk.committed.acc ? ` · accent ${desk.committed.acc}` : ""}` : "";
  };
  const byId = (id) => packs.find((p) => p.id === id);
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

  // Accents: click, or drag one onto the desk.
  const acc = section.querySelector(".lab-acc");
  acc.innerHTML = ACCENTS.map((a) => `<button type="button" data-acc="${a}" aria-label="Accent ${a}" style="--c:${a}"></button>`).join("");
  const setAcc = (a) => { desk.setPack(desk.committed?.p ?? byId("obsidian"), { acc: a }); mark(); };
  let drag = null;
  acc.addEventListener("pointerdown", (e) => {
    const b = e.target.closest("[data-acc]");
    if (!b || e.button !== 0) return;
    drag = { b, x: e.clientX, y: e.clientY, ghost: null, id: e.pointerId, moved: false };
    b.setPointerCapture(e.pointerId);
  });
  acc.addEventListener("pointermove", (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    if (!drag.ghost) { drag.moved = true; drag.ghost = Object.assign(document.createElement("div"), { className: "acc-ghost" }); drag.ghost.style.background = drag.b.dataset.acc; document.body.append(drag.ghost); }
    drag.ghost.style.transform = `translate3d(${e.clientX - 14}px, ${e.clientY - 14}px, 0)`;
    const over = host.contains(document.elementFromPoint(e.clientX, e.clientY));
    host.classList.toggle("drop-ok", over);
  });
  const endDrag = (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag; drag = null;
    host.classList.remove("drop-ok");
    d.ghost?.remove();
    if (!d.moved) return setAcc(d.b.dataset.acc);
    const r = host.getBoundingClientRect();
    if (e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom) {
      setAcc(d.b.dataset.acc);
      if (!reducedMotion()) { const s = document.createElement("span"); s.className = "acc-splash"; s.style.cssText = `left:${e.clientX - r.left}px;top:${e.clientY - r.top}px;background:${d.b.dataset.acc}`; host.append(s); setTimeout(() => s.remove(), 700); }
    }
  };
  acc.addEventListener("pointerup", endDrag);
  acc.addEventListener("pointercancel", endDrag);

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
