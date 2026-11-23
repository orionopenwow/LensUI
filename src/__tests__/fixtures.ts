// Shared sample data for the frontend unit tests (bun test). Not bundled into the app.
import type { LensConfig } from "../types/lens";

export function sampleConfig(): LensConfig {
  return {
    theme: {
      preset: "obsidian", accentMode: "custom", customAccent: "#FAFAFA", glassOpacity: 0.96, blurPx: 20,
      borderRadius: 8, accentTintStrength: 0, customCss: "", fontFamily: "rounded-arial", uiScale: 100, surfaceHex: "",
    },
    dock: {
      groundedMarginBottom: 0, iconSize: 40, hoverScale: 1.24, hoverLift: 8, autoHide: "never", showTopBar: true,
      pinnedApps: [], pinnedFolders: [],
    },
    topBar: { enabled: true, autoHide: "overlap", revealDelayMs: 100, hideDelayMs: 350, height: 34, floating: false, showMediaControls: true },
    func: {
      hideNativeTaskbar: true, runOnStartup: true, paletteHotkey: "Alt+Space", widgetsHotkey: "Alt+W", gamingPause: true,
      middleClickNewInstance: true,
    },
    windowControls: {
      enabled: true, style: "traffic-classic", order: "yellow-green-red", position: "top-right",
      frameBorderEnabled: true, frameStyle: "obsidian-hairline", excludedProcesses: [],
    },
    iconStyle: { theme: "obsidian-squircle", shape: "squircle" },
    folderStyle: { theme: "accent", globalExplorerOverride: false },
    sessions: [],
    activeSessionId: "",
    widgets: { enabledWidgets: [], notes: "" },
    styledFolders: [],
  } as unknown as LensConfig;
}
