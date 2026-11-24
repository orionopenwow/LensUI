// Runs first in every demo-window frame: makes the page transparent (Lens windows are frameless and
// draw their own chrome), and bridges the pointer to the desk so the real surface's own title bar
// drags, focuses and maximises the demo window. Theme changes arrive as {lens:"pack"} and go through
// the app's own pack registry, exactly like the live dock.
import { packById, registerCustomPack } from "../../../../src/themes/packs";

const W = globalThis as any;
const q = new URLSearchParams(location.search);
const st = document.createElement("style");
st.textContent = `html,body{background:transparent!important;margin:0;height:100%;overflow:hidden}#root{height:100%}:root{color-scheme:normal!important}${q.get("fit") === "content" ? "html,body,#root{height:auto}" : ""}`;
document.head.append(st);
document.documentElement.dataset.lensSurface = q.get("surface") || q.get("app") || "1";

const up = (m: any) => { try { window.parent?.postMessage(m, location.origin); } catch { /* no host */ } };
const INTERACTIVE = "button,a,input,textarea,select,[role=button],[role=tab],[role=slider],[contenteditable],[data-no-drag]";
function isDragSpot(e: PointerEvent) {
  const t = e.target as HTMLElement | null;
  if (!t || !t.closest) return false;
  if (t.closest(INTERACTIVE)) return false;
  if (t.hasAttribute("data-tauri-drag-region")) return true;
  // Surfaces whose header is their drag strip in the app (the OS hit-tests it there).
  return q.get("drag") !== "0" && e.clientY < 40;
}
let drag: number | null = null;
addEventListener("pointerdown", (e) => {
  up({ lens: "win", a: "focus" });
  if (e.button !== 0 || !isDragSpot(e)) return;
  drag = e.pointerId;
  try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* released */ }
  up({ lens: "win", a: "drag-start", sx: e.screenX, sy: e.screenY, cx: e.clientX, cy: e.clientY });
}, true);
let hov = 0;
addEventListener("pointermove", (e) => {
  if (drag === e.pointerId) return up({ lens: "win", a: "drag-move", sx: e.screenX, sy: e.screenY });
  // The desk's dock sits over the bottom of the desk; it needs to know when the pointer nears it.
  if (!hov) hov = requestAnimationFrame(() => { hov = 0; up({ lens: "win", a: "hover", x: e.clientX, y: e.clientY }); });
}, true);
const end = (e: PointerEvent) => { if (drag === e.pointerId) { drag = null; up({ lens: "win", a: "drag-end" }); } };
addEventListener("pointerup", end, true);
addEventListener("pointercancel", end, true);
addEventListener("dblclick", (e) => { if (isDragSpot(e as PointerEvent)) up({ lens: "win", a: "max" }); }, true);
addEventListener("keydown", (e) => {
  if (e.ctrlKey && (e.code === "Space" || e.key === " ")) { e.preventDefault(); up({ lens: "win", a: "command" }); }
  else if (e.key === "Escape" && q.get("esc") === "1") up({ lens: "win", a: "hide" });
}, true);
// Right-click anywhere in a real surface asks the desk for the real magic menu, with what was under
// the pointer (selected text, a link, an image, or the window itself).
addEventListener("contextmenu", (e) => {
  if (q.get("magic") === "0") return;
  const t = e.target as HTMLElement;
  if (t.closest?.("input,textarea,[contenteditable]")) return;
  e.preventDefault();
  const sel = String(getSelection?.() ?? "").trim();
  const kind = sel ? "selection" : t.closest?.("a[href]") ? "link" : t.closest?.("img,video,canvas") ? "image" : "window";
  up({ lens: "win", a: "magic", kind, x: e.clientX, y: e.clientY });
}, true);

function merge(a: any, b: any): any {
  if (!b || typeof b !== "object" || Array.isArray(b)) return b;
  const out = { ...(a ?? {}) };
  for (const k of Object.keys(b)) out[k] = merge(a?.[k], b[k]);
  return out;
}
let lastPack: any = null, again = 0;
function applyPack(p: any) {
  if (!p || !W.__lensConfig) return;
  const id = packById(p.id) ? p.id : registerCustomPack({ id: p.id, label: p.label, base: p.base, accent: p.accent, radius: p.radius, scheme: p.scheme, frameStyle: p.frameStyle, controlStyle: p.controlStyle })?.id;
  if (!id) return;
  const next = merge(W.__lensConfig(), { theme: { preset: id, customAccent: p.accent, accentMode: "custom", borderRadius: p.radius } });
  W.__lensSetConfig(next);
  W.__lensEmit?.("lens://config-updated", next);
}
addEventListener("message", (e) => {
  if (e.source !== window.parent) return;
  const m = e.data;
  if (!m || typeof m !== "object") return;
  if (m.lens === "pack" && m.pack) {
    lastPack = m.pack;
    applyPack(m.pack);
    // A surface that is still mounting hasn't subscribed to config changes yet: say it once more.
    clearTimeout(again); again = window.setTimeout(() => applyPack(lastPack), 350);
  } else if (m.lens === "config" && m.patch) {
    const next = merge(W.__lensConfig(), m.patch);
    W.__lensSetConfig(next);
    W.__lensEmit?.("lens://config-updated", next);
  } else if (m.lens === "emit" && typeof m.event === "string") W.__lensEmit?.(m.event, m.payload);
});
// Tell the desk when the real surface has painted (it swaps the loading shimmer for the frame).
const ready = () => up({ lens: "win", a: "ready", marker: document.getElementById("root")?.firstElementChild?.className ?? "" });
const mo = new MutationObserver(() => { if (document.getElementById("root")?.firstElementChild) { mo.disconnect(); requestAnimationFrame(ready); } });
addEventListener("DOMContentLoaded", () => { const r = document.getElementById("root"); if (r?.firstElementChild) ready(); else if (r) mo.observe(r, { childList: true }); });
