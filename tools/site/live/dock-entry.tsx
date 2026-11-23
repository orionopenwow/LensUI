// Live Dock for the website: the real Lens DockSurface (src/surfaces/DockSurface.tsx) with the
// parity harness's mocked Tauri backend. The host page talks to it with postMessage:
//   { lens: "config", patch: { dock?: {...}, theme?: {...} } }   merge into config and re-apply
//   { lens: "search" }                                          open search inside the Dock
// Nothing here touches a real system: launches, menus and search results are simulated.
import React from "react";
import ReactDOM from "react-dom/client";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import { DockSurface } from "../../../src/surfaces/DockSurface";

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
  } else if (m.lens === "ping") {
    window.parent?.postMessage({ lens: "ready" }, "*");
  } else if (m.lens === "search") {
    W.__lensEmit("lens://dock-search-open", true);
  }
});

// Fixed sample config for the site: a few recognisable apps, floating dock, no top bar.
const start = W.__lensConfig();
W.__lensSetConfig(
  merge(start, {
    dock: { autoHide: "never", magnification: "subtle", launchAnimation: "bounce", style: "floating", showLabels: false },
    topBar: { enabled: false },
  })
);

ReactDOM.createRoot(document.getElementById("root")!).render(<DockSurface />);
window.parent?.postMessage({ lens: "ready" }, "*");
