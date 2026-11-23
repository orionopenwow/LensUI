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
import { APPS, MINI, ICON_BY_NAME, setRunning } from "@tauri-apps/api/core";

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
  } else if (m.lens === "windows" && Array.isArray(m.list)) {
    // The page's desk owns the windows: running dots, focus and minimised state follow it.
    W.__lensEmit("lens://windows-changed", setRunning(m.list));
  } else if (m.lens === "pin" && m.app) {
    const cur = W.__lensConfig();
    if (!cur.dock.pinnedApps.some((a: any) => a.id === m.app.id)) {
      const next = merge(cur, { dock: { pinnedApps: [...cur.dock.pinnedApps, { ...m.app, iconHint: null }] } });
      W.__lensSetConfig(next);
      W.__lensEmit("lens://config-updated", next);
    }
  } else if (m.lens === "ping") {
    window.parent?.postMessage({ lens: "ready" }, "*");
  } else if (m.lens === "search") {
    // Open (or close) search the way a person does: the dock's own magnifier button.
    const open = !!document.querySelector(".dock-launcher-drawer");
    const want = m.open ?? true;
    if (open !== want) (document.querySelector(".dock-search-mag-btn") as HTMLElement | null)?.click();
    if (want && typeof m.q === "string") setTimeout(() => typeIn(m.q, m.focus !== false), 120);
  }
});

/** Types into the dock's search field, one character at a time, as React sees real typing. */
function typeIn(q: string, focus = true) {
  const el = document.querySelector(".dock-search-glide-input, .dock-search-inline input") as HTMLInputElement | null;
  if (!el) return;
  if (focus) el.focus();
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  let i = 0;
  const next = () => {
    set.call(el, q.slice(0, ++i));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    if (i < q.length) setTimeout(next, 70);
  };
  set.call(el, "");
  el.dispatchEvent(new Event("input", { bubbles: true }));
  q ? next() : null;
}
// Demo-only: app rows in search show the app's icon (the mock has no icon extractor for search).
function decorate() {
  document.querySelectorAll(".dock-launcher-drawer .pal-result-row").forEach((row) => {
    const slot = row.querySelector(".pal-recent-icon");
    const name = row.querySelector(":scope > div > div > div:first-child")?.textContent?.trim().toLowerCase() ?? "";
    const src = (ICON_BY_NAME as Record<string, string>)[name];
    if (!slot || slot.querySelector("img") || !src) return;
    // Leave React's own nodes in place (hidden) so reconciliation never trips over them.
    slot.querySelectorAll("svg").forEach((g) => ((g as unknown as HTMLElement).style.display = "none"));
    const img = document.createElement("img");
    Object.assign(img, { src, alt: "" });
    img.style.cssText = "width:24px;height:24px;border-radius:6px";
    slot.append(img);
  });
}
// Tell the host page when the search drawer opens or closes, so it can give the frame room.
let drawerOpen = false, tallNow = false;
// "tall": anything that needs room above the dock (search, the context menu, window previews).
const TALL = ".dock-launcher-drawer:not(.is-closing), .dock-ctx-menu, .dock-hover-card";
new MutationObserver(() => {
  decorate();
  const now = !!document.querySelector(".dock-launcher-drawer:not(.is-closing)");
  if (now !== drawerOpen) { drawerOpen = now; window.parent?.postMessage({ lens: "drawer", open: now }, "*"); }
  const tl = !!document.querySelector(TALL);
  if (tl !== tallNow) { tallNow = tl; window.parent?.postMessage({ lens: "tall", on: tl }, "*"); }
}).observe(document.getElementById("root")!, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

// Fixed sample config for the site: a few recognisable apps, no top bar. Query parameters set the
// starting look (used by the "All docks" thumbnails): ?style=islands&shape=dotmatrix&pack=…
const q = new URLSearchParams(location.search);
const start = W.__lensConfig();
const pack0 = q.get("pack") && packById(q.get("pack"));
W.__lensSetConfig(
  merge(start, {
    dock: { autoHide: "never", magnification: q.get("mag") || "subtle", launchAnimation: "bounce", style: q.get("style") || "floating", showLabels: false, pinnedApps: (APPS as any[]).filter((a) => !q.get("mini") || (MINI as string[]).includes(a.id)).map(({ id, name, path }) => ({ id, name, path, iconHint: null })), ...(q.get("mini") ? { pinnedFolders: [] } : {}) },
    topBar: { enabled: false },
    theme: { ...(q.get("shape") ? { shapeStyle: q.get("shape") } : {}), ...(pack0 ? { preset: pack0.id, customAccent: pack0.accent, accentMode: "custom", borderRadius: pack0.radius } : {}) },
  })
);

ReactDOM.createRoot(document.getElementById("root")!).render(<DockSurface />);
window.parent?.postMessage({ lens: "ready" }, "*");

// The rail of dock styles sizes each tile from the dock's real width.
const report = () => { const p = document.querySelector(".dock-pill"); if (!p) return; const r = p.getBoundingClientRect(); window.parent?.postMessage({ lens: "size", w: Math.round(r.width), h: Math.round(r.height), l: Math.round(r.left), t: Math.round(r.top) }, "*"); };
new ResizeObserver(report).observe(document.body);
setInterval(report, 1500);
