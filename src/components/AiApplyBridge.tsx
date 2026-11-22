import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import type { LensConfig } from "../types/lens";
import { applyThemePack, packById } from "../themes/packs";
import { onAiApply } from "../ai/client";

interface Props {
  config: LensConfig | null;
  updateConfig: (next: LensConfig) => Promise<void> | void;
}

/** Control Center tab for each settings page an AI action may open. */
const SETTINGS_TABS: Record<string, string> = {
  theme: "theme",
  cursor: "theme",
  dock: "dock",
  topbar: "dock",
  wallpaper: "sessions",
  workspaces: "sessions",
  tiling: "sessions",
  plugins: "sessions",
  windows: "system",
  notifications: "system",
  home: "system",
  ai: "ai",
  agents: "agents",
};

/**
 * Invisible helper mounted once (in the Dock, which is always running), next to McpBridge.
 * Lens Intelligence's UI-layer actions arrive as `lens://ai/apply` (docs/AI.md "Apply bridge"):
 * colour mode, accent, focus mode, settings pages, timers, show desktop and "note saved".
 * Each one only reached this point after the user approved it where approval is required.
 */
export function AiApplyBridge({ config, updateConfig }: Props) {
  const cfgRef = useRef(config);
  cfgRef.current = config;
  const updRef = useRef(updateConfig);
  updRef.current = updateConfig;

  useEffect(() => {
    const timers: number[] = [];
    const notify = (title: string, body: string) =>
      invoke("push_notification_cmd", { title, body, appName: "Lens", category: "ai" }).catch(() => {});

    const un = onAiApply(({ tool, args }) => {
      const cfg = cfgRef.current;
      switch (tool) {
        case "set_color_mode": {
          if (!cfg) return;
          const isLight = packById(cfg.theme.preset)?.scheme === "light";
          const mode = String(args.mode ?? "toggle");
          const wantLight = mode === "light" ? true : mode === "dark" ? false : !isLight;
          if (wantLight === isLight) return;
          updRef.current(applyThemePack(cfg, wantLight ? "alabaster-daylight" : "obsidian"));
          return;
        }
        case "set_accent": {
          const color = String(args.color ?? "");
          if (!cfg || !/^#[0-9a-f]{6}$/i.test(color)) return;
          updRef.current({ ...cfg, theme: { ...cfg.theme, accentMode: "custom", customAccent: color } });
          return;
        }
        case "set_focus_mode": {
          // Focus mode = Do Not Disturb (pop-ups paused; the notification centre still collects).
          const enabled = typeof args.enabled === "boolean" ? args.enabled : true;
          invoke("set_dnd_cmd", { enabled }).catch(() => {});
          return;
        }
        case "open_settings_page": {
          const tab = SETTINGS_TABS[String(args.page ?? "home")] ?? "system";
          invoke("open_surface", { label: "settings" })
            .then(() => emit("lens://settings-tab", tab))
            .catch(() => {});
          return;
        }
        case "start_timer": {
          const seconds = Math.max(1, Math.min(24 * 3600, Number(args.seconds) || 0));
          const label = typeof args.label === "string" && args.label.trim() ? args.label.trim() : "Timer";
          if (!seconds) return;
          timers.push(window.setTimeout(() => notify(label, "Time's up."), seconds * 1000));
          notify("Timer started", `${label} · ${Math.round(seconds / 60) || 1} min`);
          return;
        }
        case "show_desktop":
          invoke("test_corner_action_cmd", { action: "show-desktop" }).catch(() => {});
          return;
        case "note_saved":
          notify("Note saved", typeof args.path === "string" ? args.path : "");
          return;
      }
    });
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      un.then((f) => f());
    };
  }, []);

  return null;
}
