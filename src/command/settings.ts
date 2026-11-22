// Lens Command preferences. Stored as `config.command` once the integrator adds the section
// (docs/COMMAND.md); until then the defaults below apply.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Mode } from "./parse";

export type CommandProvider = "default" | "script" | "local" | "claude";
export type AutoSource = "selection" | "clipboard" | "window" | "page";

export interface CommandSettings {
  enabled: boolean;
  hotkey: string;
  defaultMode: Mode;
  /** Context offered automatically as chips. Nothing is sent until you press Enter. */
  autoAttach: AutoSource[];
  density: "comfortable" | "compact";
  position: "center" | "top";
  /** Column width in px (480–880). */
  width: number;
  /** Provider override per command id (e.g. { fix: "claude" }). */
  providers: Record<string, CommandProvider>;
  /** Keep the thread when the window closes (in memory only). */
  keepThread: boolean;
  showShelfDrawer: boolean;
}

export const DEFAULT_COMMAND_SETTINGS: CommandSettings = {
  enabled: false,
  hotkey: "Ctrl+Alt+Space",
  defaultMode: "ask",
  autoAttach: ["selection"],
  density: "comfortable",
  position: "center",
  width: 640,
  providers: {},
  keepThread: true,
  showShelfDrawer: false,
};

export function normaliseCommandSettings(raw: unknown): CommandSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<CommandSettings>;
  const d = DEFAULT_COMMAND_SETTINGS;
  const width = Number(r.width);
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : d.enabled,
    hotkey: typeof r.hotkey === "string" && r.hotkey.trim() ? r.hotkey : d.hotkey,
    defaultMode: (["ask", "do", "shelf", "clipboard", "actions"] as Mode[]).includes(r.defaultMode as Mode) ? (r.defaultMode as Mode) : d.defaultMode,
    autoAttach: Array.isArray(r.autoAttach)
      ? (r.autoAttach.filter((s) => ["selection", "clipboard", "window", "page"].includes(s)) as AutoSource[])
      : d.autoAttach,
    density: r.density === "compact" ? "compact" : "comfortable",
    position: r.position === "top" ? "top" : "center",
    width: Number.isFinite(width) ? Math.min(880, Math.max(480, Math.round(width / 8) * 8)) : d.width,
    providers: r.providers && typeof r.providers === "object" ? { ...r.providers } : {},
    keepThread: typeof r.keepThread === "boolean" ? r.keepThread : d.keepThread,
    showShelfDrawer: typeof r.showShelfDrawer === "boolean" ? r.showShelfDrawer : d.showShelfDrawer,
  };
}

/** Reads `config.command` and follows config changes. */
export function useCommandSettings(): CommandSettings {
  const [s, setS] = useState<CommandSettings>(DEFAULT_COMMAND_SETTINGS);
  useEffect(() => {
    let alive = true;
    const load = () =>
      invoke<Record<string, unknown> | null>("get_config")
        .then((c) => alive && setS(normaliseCommandSettings(c?.command)))
        .catch(() => {});
    load();
    const un = listen("lens://config-updated", load);
    return () => {
      alive = false;
      un.then((u) => u()).catch(() => {});
    };
  }, []);
  return s;
}
