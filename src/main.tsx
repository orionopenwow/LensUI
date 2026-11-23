import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import "./styles/tokens.css";
import "./styles/global.css";

// Each surface is its own window, so each window only downloads, parses and runs its own code.
// (The Dock no longer carries the Control Center, and so on.)
const surfaces: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  dock: lazy(() => import("./surfaces/DockSurface").then((m) => ({ default: m.DockSurface }))),
  topbar: lazy(() => import("./surfaces/TopBarSurface").then((m) => ({ default: m.TopBarSurface }))),
  settings: lazy(() =>
    import("./surfaces/ControlCenterSurface").then((m) => ({ default: m.ControlCenterSurface }))
  ),
  palette: lazy(() =>
    import("./surfaces/CommandPaletteSurface").then((m) => ({ default: m.CommandPaletteSurface }))
  ),
  widgets: lazy(() =>
    import("./surfaces/WidgetDrawerSurface").then((m) => ({ default: m.WidgetDrawerSurface }))
  ),
  quicksettings: lazy(() =>
    import("./surfaces/QuickSettingsSurface").then((m) => ({ default: m.QuickSettingsSurface }))
  ),
  notifications: lazy(() =>
    import("./surfaces/NotificationOverlaySurface").then((m) => ({
      default: m.NotificationOverlaySurface,
    }))
  ),
  launcher: lazy(() =>
    import("./surfaces/LauncherSurface").then((m) => ({ default: m.LauncherSurface }))
  ),
  overview: lazy(() =>
    import("./surfaces/OverviewSurface").then((m) => ({ default: m.OverviewSurface }))
  ),
  wallpaper: lazy(() =>
    import("./surfaces/WallpaperSurface").then((m) => ({ default: m.WallpaperSurface }))
  ),
  desktopfolder: lazy(() =>
    import("./surfaces/DesktopFolderSurface").then((m) => ({ default: m.DesktopFolderSurface }))
  ),
  // Pointer effects overlay (click-through; docs/CURSORS.md).
  cursorfx: lazy(() =>
    import("./surfaces/CursorFxSurface").then((m) => ({ default: m.CursorFxSurface }))
  ),
  // Lens Command and Lens Mini, the Edge Shelf tab and the selection bubble (docs/COMMAND.md).
  command: lazy(() => import("./command/CommandSurface").then((m) => ({ default: m.CommandSurface }))),
  edgeshelf: lazy(() =>
    import("./command/mini/EdgeShelfSurface").then((m) => ({ default: m.EdgeShelfSurface }))
  ),
  bubble: lazy(() => import("./command/mini/BubbleSurface").then((m) => ({ default: m.BubbleSurface }))),
  // Tester Hub: what's new, checklist, session log, redacted report (docs/TESTER_HUB.md).
  testerhub: lazy(() => import("./tester/TesterHubSurface").then((m) => ({ default: m.TesterHubSurface }))),
  // Full-size focus-dimming preview page (docs/WINDOW_STYLING.md).
  focusdim: lazy(() =>
    import("./surfaces/FocusDimSurface").then((m) => ({ default: m.FocusDimSurface }))
  ),
  voicehud: lazy(() => import("./surfaces/VoiceHudSurface").then((m) => ({ default: m.VoiceHudSurface }))),
  conversation: lazy(() =>
    import("./surfaces/ConversationSurface").then((m) => ({ default: m.ConversationSurface }))
  ),
};

const params = new URLSearchParams(window.location.search);

// Feed frontend errors into the Tester Hub session log (redacted, in memory only).
window.addEventListener("error", (e) => {
  invoke("tester_log_push", { level: "error", area: "ui", message: String(e.message) }).catch(() => {});
});
window.addEventListener("unhandledrejection", (e) => {
  invoke("tester_log_push", { level: "warn", area: "ui", message: String(e.reason) }).catch(() => {});
});
const Surface = surfaces[params.get("surface") || "dock"] ?? surfaces.dock;

// Rendered after <Surface/>, so its effect runs after the surface's own effects have issued their
// listen() calls. Windows built on first use wait for this before their opening command is replayed.
function ReadySignal() {
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      invoke("surface_ready_cmd", { label: params.get("surface") || "dock" }).catch(() => {});
    }, 50);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      <Surface />
      <ReadySignal />
    </Suspense>
  </React.StrictMode>
);
