import React, { Suspense, lazy } from "react";
import { CoachMarkLayer } from "./guide/CoachMarkLayer";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import "./styles/tokens.css";
import "./styles/global.css";
import { CrashProbe, QuietBoundary, SurfaceBoundary } from "./failsafe/SurfaceBoundary";
import { installGlobalHandlers } from "./failsafe/report";
import { FailsafeNotices } from "./failsafe/FailsafeNotices";

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
  // Lens Browser frame UI (docs/LENS_BROWSER.md).
  browser: lazy(() => import("./browser/BrowserSurface").then((m) => ({ default: m.BrowserSurface }))),
  // Lens Snip: selection overlay + studio, pins, recording frame (docs/SNIP.md).
  snip: lazy(() => import("./snip/SnipSurface").then((m) => ({ default: m.SnipSurface }))),
  // Magic right-click window at the pointer (docs/MAGIC.md).
  magic: lazy(() => import("./magic/MagicSurface").then((m) => ({ default: m.MagicSurface }))),
  // Tester Hub: what's new, checklist, session log, redacted report (docs/TESTER_HUB.md).
  testerhub: lazy(() => import("./tester/TesterHubSurface").then((m) => ({ default: m.TesterHubSurface }))),
  // Full-size focus-dimming preview page (docs/WINDOW_STYLING.md).
  focusdim: lazy(() =>
    import("./surfaces/FocusDimSurface").then((m) => ({ default: m.FocusDimSurface }))
  ),
  // Standalone "Needs your OK" window for AI-app requests (docs/CLAUDE_CONTROL.md §1–2).
  approval: lazy(() => import("./approval/ApprovalSurface").then((m) => ({ default: m.ApprovalSurface }))),
  // Now Playing (docs/MUSIC.md §2).
  nowplaying: lazy(() => import("./music/NowPlayingSurface").then((m) => ({ default: m.NowPlayingSurface }))),
  // Lens Apps window (docs/LENS_APPS.md §2).
  apps: lazy(() => import("./apps/AppsSurface").then((m) => ({ default: m.AppsSurface }))),
  cleaner: lazy(() => import("./cleaner/CleanerSurface").then((m) => ({ default: m.CleanerSurface }))),
  coreapp: lazy(() => import("./coreapps/CoreAppSurface").then((m) => ({ default: m.CoreAppSurface }))),
  presence: lazy(() => import("./presence/PresenceSurface").then((m) => ({ default: m.PresenceSurface }))),
  presencebar: lazy(() => import("./presence/PresenceBar").then((m) => ({ default: m.PresenceBarSurface }))),
  voicehud: lazy(() => import("./surfaces/VoiceHudSurface").then((m) => ({ default: m.VoiceHudSurface }))),
  // Lens Studio: Backdrop Lab (docs/BACKDROP_LAB.md).
  studio: lazy(() => import("./studio/StudioSurface").then((m) => ({ default: m.StudioSurface }))),
  conversation: lazy(() =>
    import("./surfaces/ConversationSurface").then((m) => ({ default: m.ConversationSurface }))
  ),
};

const params = new URLSearchParams(window.location.search);

// Uncaught errors and unhandled rejections go to the same reporter as surface crashes
// (docs/FAILSAFE.md §1): the session log and lens.log on this PC, rate-limited, never uploaded.
installGlobalHandlers();
const surfaceName = params.get("surface") || "dock";
const Surface = surfaces[surfaceName] ?? surfaces.dock;
// Smoothness probe (docs/SMOOTHNESS.md): idle until Tester Hub starts a check.
import("./smooth/probe").then((m) => m.installSmoothProbe(surfaceName)).catch(() => {});
// "Lens at work" in-app twin (docs/PRESENCE.md): not on the overlay windows themselves.
const PresenceTwin = lazy(() => import("./presence/PresenceTwin").then((m) => ({ default: m.PresenceTwin })));
const withTwin = !["presence", "presencebar"].includes(surfaceName);

// Rendered after <Surface/>, so its effect runs after the surface's own effects have issued their
// listen() calls. Windows built on first use wait for this before their opening command is replayed.
function ReadySignal() {
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      invoke("surface_ready_cmd", { label: surfaceName }).catch(() => {});
    }, 50);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}

// The always-on windows tell the backend they are still running. If the WebView behind one of
// them dies, the heartbeat stops and the backend reloads that window (docs/FAILSAFE.md §1).
const HEARTBEAT_SURFACES = ["dock", "topbar", "desktopfolder"];
if (HEARTBEAT_SURFACES.includes(surfaceName)) {
  window.setInterval(() => {
    invoke("surface_alive_cmd", { label: surfaceName }).catch(() => {});
  }, 5000);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* One boundary for every surface: a crash shows "This part of Lens hit a problem · Reload"
        (nothing at all for overlays), is reported, reloads once, and stops after three in a row. */}
    <SurfaceBoundary surface={surfaceName}>
      <Suspense fallback={null}>
        <Surface />
        <CrashProbe />
        {/* Inside the same Suspense, after the surface: see ReadySignal. */}
        <ReadySignal />
      </Suspense>
    </SurfaceBoundary>
    {/* Helpers beside the surface fail on their own; they never take the surface with them. */}
    <QuietBoundary name={`${surfaceName}-coach`}>
      <Suspense fallback={null}>
        {/* Guide "Show me" highlights work on every surface (docs/GUIDE.md §3). */}
        <CoachMarkLayer />
      </Suspense>
    </QuietBoundary>
    {withTwin ? (
      <QuietBoundary name={`${surfaceName}-twin`}>
        <Suspense fallback={null}>
          <PresenceTwin />
        </Suspense>
      </QuietBoundary>
    ) : null}
    {surfaceName === "dock" ? <FailsafeNotices /> : null}
  </React.StrictMode>
);
