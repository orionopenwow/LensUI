// Live Dock for the website: the real Lens DockSurface (src/surfaces/DockSurface.tsx) with the
// parity harness's mocked Tauri backend. The host page talks to it with postMessage:
//   { lens: "config", patch: { dock?: {...}, theme?: {...} } }   merge into config and re-apply
//   { lens: "search" }                                          open search inside the Dock
// Nothing here touches a real system: launches, menus and search results are simulated.
import React from "react";
import ReactDOM from "react-dom/client";
// "@lens-src" is the dock source chosen by build-live.mjs (this checkout or the dock-styles branch).
import "@lens-src/styles/tokens.css";
import "@lens-src/styles/global.css";
import { DockSurface } from "@lens-src/surfaces/DockSurface";
import { packById, registerCustomPack } from "@lens-src/themes/packs";

const W = globalThis as any;

function merge(a: any, b: any): any {
  if (!b || typeof b !== "object" || Array.isArray(b)) return b;
  const out = { ...(a ?? {}) };
  for (const k of Object.keys(b)) out[k] = merge(a?.[k], b[k]);
  return out;
}

window.addEventListener("message", (e) => {
  if (e.source !== window.parent) return;
  const m = e.data;
  if (!m || typeof m !== "object") return;
  if (m.lens === "config" && m.patch && typeof m.patch === "object") {
    const next = merge(W.__lensConfig(), m.patch);
    W.__lensSetConfig(next);
    W.__lensEmit("lens://config-updated", next);
  } else if (m.lens === "pack" && m.pack && typeof m.pack === "object") {
    // A pack the app build may not ship yet (e.g. the Claude Code collection): register it as a
    // custom pack through Lens's own validator, then apply it like any other.
    const p = m.pack;
    const id = packById(p.id) ? p.id : registerCustomPack({ id: p.id, label: p.label, base: p.base, accent: p.accent, radius: p.radius, scheme: p.scheme, frameStyle: p.frameStyle, controlStyle: p.controlStyle })?.id;
    if (!id) return;
    const next = merge(W.__lensConfig(), { theme: { preset: id, customAccent: p.accent, accentMode: "custom", borderRadius: p.radius }, ...(m.dockStyle ? { dock: { style: m.dockStyle } } : {}) });
    W.__lensSetConfig(next);
    W.__lensEmit("lens://config-updated", next);
  } else if (m.lens === "ping") {
    window.parent?.postMessage({ lens: "ready" }, "*");
  } else if (m.lens === "search") {
    W.__lensEmit("lens://dock-search-open", true);
  }
});

// Fixed sample config for the site: a few recognisable apps, no top bar. Query parameters set the
// starting look (used by the "All docks" thumbnails): ?style=islands&shape=dotmatrix&pack=…
const q = new URLSearchParams(location.search);
const start = W.__lensConfig();
const pack0 = q.get("pack") && packById(q.get("pack"));
W.__lensSetConfig(
  merge(start, {
    dock: { autoHide: "never", magnification: q.get("mag") || "subtle", launchAnimation: "bounce", style: q.get("style") || "floating", showLabels: false },
    topBar: { enabled: false },
    theme: { ...(q.get("shape") ? { shapeStyle: q.get("shape") } : {}), ...(pack0 ? { preset: pack0.id, customAccent: pack0.accent, accentMode: "custom", borderRadius: pack0.radius } : {}) },
  })
);

ReactDOM.createRoot(document.getElementById("root")!).render(<DockSurface />);
window.parent?.postMessage({ lens: "ready" }, "*");
